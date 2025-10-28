# MTC iSmart - Google Cloud + Cloudflare Deployment

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCTION ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────┘

[Vercel - mtc.air.zone]
  - Next.js Dashboard
  - API Routes
  └─> Connects to ──────────────> [GCP Cloud Run - mqtt.air.zone]
                                    - Mosquitto MQTT Broker
                                    - SAIC Gateway
                                    - Ingestion Service
                                    └─> Cloudflare Tunnel (SSL)

[Supabase Cloud]
  - PostgreSQL Database
  - Real-time subscriptions
```

---

## Benefits of This Stack

✅ **Google Cloud Run**: Serverless containers, auto-scaling, pay-per-use
✅ **Cloudflare**: Free SSL, DDoS protection, fast DNS
✅ **No VPS maintenance**: Fully managed infrastructure
✅ **Cost-effective**: ~$5-10/month (likely less with free tier)

---

## Prerequisites

1. **Google Cloud Account** (with billing enabled)
2. **Cloudflare Account** (managing air.zone)
3. **gcloud CLI** installed
4. **cloudflared CLI** installed

---

## Part 1: Google Cloud Setup

### Install Google Cloud CLI

```bash
# macOS (if not installed)
brew install --cask google-cloud-sdk

# Login
gcloud auth login

# Set project (or create new one)
gcloud config set project mtc-ismart-prod

# Enable required APIs
gcloud services enable run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

### Create Artifact Registry

```bash
# Create Docker repository
gcloud artifacts repositories create mtc-containers \
  --repository-format=docker \
  --location=asia-east1 \
  --description="MTC iSmart containers"

# Configure Docker authentication
gcloud auth configure-docker asia-east1-docker.pkg.dev
```

---

## Part 2: Build and Deploy Containers

### Option A: All-in-One Container (Simpler)

Create a single container with Mosquitto + Gateway + Ingestion:

#### Create Dockerfile

**File**: `docker/cloud-run/Dockerfile.all-in-one`

```dockerfile
FROM ubuntu:24.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    mosquitto \
    mosquitto-clients \
    python3 \
    python3-pip \
    nodejs \
    npm \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Install Python gateway
RUN pip3 install saic-ismart-client-ng --break-system-packages

# Copy MQTT config
COPY docker/mosquitto/config/mosquitto-cloud.conf /etc/mosquitto/mosquitto.conf

# Copy gateway config
COPY .env.mg /app/.env

# Copy ingestion service
COPY server/ /app/server/
COPY package.json tsconfig.json /app/
WORKDIR /app
RUN npm install

# Supervisor config to run all services
COPY docker/cloud-run/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 1883 8883

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

#### Create Supervisor Config

**File**: `docker/cloud-run/supervisord.conf`

```ini
[supervisord]
nodaemon=true
user=root

[program:mosquitto]
command=/usr/sbin/mosquitto -c /etc/mosquitto/mosquitto.conf
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:gateway]
command=python3 -m saic_ismart_client_ng.mqtt_gateway
directory=/app
environment=HOME="/root"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:ingest]
command=npx tsx server/ingest.ts
directory=/app
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
```

#### Create Cloud Run Mosquitto Config

**File**: `docker/mosquitto/config/mosquitto-cloud.conf`

```conf
# Mosquitto configuration for Cloud Run

# Plain MQTT listener (internal)
listener 1883
allow_anonymous true

# TLS will be handled by Cloudflare Tunnel
# No need for TLS listener here

# Persistence
persistence true
persistence_location /mosquitto/data/

# Logging
log_dest stdout
log_type all
```

#### Build and Push

```bash
cd /Users/markau/mtc-ismart

# Set variables
PROJECT_ID=$(gcloud config get-value project)
REGION=asia-east1
REPO=mtc-containers
IMAGE=mtc-backend

# Build image
docker build -f docker/cloud-run/Dockerfile.all-in-one \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest .

# Push to Artifact Registry
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest
```

#### Deploy to Cloud Run

```bash
# Deploy service
gcloud run deploy mtc-backend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest \
  --platform=managed \
  --region=${REGION} \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --port=1883 \
  --min-instances=1 \
  --max-instances=3 \
  --set-env-vars="MQTT_URI=tcp://localhost:1883,\
SAIC_USER=system@air.city,\
SAIC_PASSWORD=ac202303,\
SAIC_REST_URI=https://gateway-mg-eu.soimt.com/api.app/v1/,\
SAIC_REGION=eu,\
NEXT_PUBLIC_SUPABASE_URL=https://sssyxnpanayqvamstind.supabase.co,\
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key"

# Get service URL
gcloud run services describe mtc-backend --region=${REGION} --format='value(status.url)'
# Output: https://mtc-backend-xxx-xx.a.run.app
```

**Note**: Cloud Run provides HTTPS by default, but MQTT needs TCP. We'll use Cloudflare Tunnel for this.

---

### Option B: Separate Containers (More Scalable)

Deploy MQTT broker and gateway as separate services:

#### 1. MQTT Broker Container

**File**: `docker/cloud-run/Dockerfile.mqtt`

```dockerfile
FROM eclipse-mosquitto:2

COPY docker/mosquitto/config/mosquitto-cloud.conf /mosquitto/config/mosquitto.conf

EXPOSE 1883

CMD ["/usr/sbin/mosquitto", "-c", "/mosquitto/config/mosquitto.conf"]
```

Deploy:
```bash
gcloud run deploy mtc-mqtt \
  --source=. \
  --dockerfile=docker/cloud-run/Dockerfile.mqtt \
  --region=asia-east1 \
  --port=1883 \
  --min-instances=1
```

#### 2. Gateway Container

**File**: `docker/cloud-run/Dockerfile.gateway`

```dockerfile
FROM saicismartapi/saic-python-mqtt-gateway:latest

ENV MQTT_URI=tcp://mtc-mqtt:1883

CMD ["python", "./main.py"]
```

#### 3. Ingestion Container

**File**: `docker/cloud-run/Dockerfile.ingest`

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY server/ ./server/
COPY tsconfig.json ./

CMD ["npx", "tsx", "server/ingest.ts"]
```

---

## Part 3: Cloudflare Tunnel Setup

Cloudflare Tunnel creates a secure connection from Cloud Run to your domain without exposing public IPs.

### Install Cloudflared

```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Login
cloudflared tunnel login
```

### Create Tunnel

```bash
# Create tunnel
cloudflared tunnel create mtc-mqtt

# Note the Tunnel ID (e.g., abc123-def456-ghi789)
TUNNEL_ID=<your-tunnel-id>

# Create config file
cat > ~/.cloudflared/config.yml << EOF
tunnel: ${TUNNEL_ID}
credentials-file: /Users/markau/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: mqtt.air.zone
    service: tcp://localhost:1883
    originRequest:
      noTLSVerify: true
  - service: http_status:404
EOF
```

### Configure DNS

```bash
# Add CNAME record pointing to tunnel
cloudflared tunnel route dns mtc-mqtt mqtt.air.zone
```

**Or manually in Cloudflare Dashboard**:
- Type: `CNAME`
- Name: `mqtt`
- Target: `<tunnel-id>.cfargotunnel.com`
- Proxy status: Proxied (orange cloud)

### Run Tunnel

```bash
# Test locally first
cloudflared tunnel run mtc-mqtt

# Deploy tunnel to Cloud Run as sidecar
```

---

## Part 4: Cloud Run with Cloudflare Tunnel

### Create Combined Dockerfile with Tunnel

**File**: `docker/cloud-run/Dockerfile.complete`

```dockerfile
FROM ubuntu:24.04

# Install all dependencies
RUN apt-get update && apt-get install -y \
    mosquitto \
    python3-pip \
    nodejs \
    npm \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install cloudflared
RUN curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && \
    dpkg -i cloudflared.deb && \
    rm cloudflared.deb

# Install SAIC gateway
RUN pip3 install saic-ismart-client-ng --break-system-packages

# Copy application files
COPY . /app
WORKDIR /app

# Install Node dependencies
RUN npm install

# Copy configs
COPY docker/mosquitto/config/mosquitto-cloud.conf /etc/mosquitto/mosquitto.conf
COPY docker/cloud-run/supervisord-complete.conf /etc/supervisor/conf.d/supervisord.conf

EXPOSE 1883

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
```

**File**: `docker/cloud-run/supervisord-complete.conf`

```ini
[supervisord]
nodaemon=true

[program:cloudflared]
command=cloudflared tunnel --no-autoupdate run --token %(ENV_CLOUDFLARE_TUNNEL_TOKEN)s
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0

[program:mosquitto]
command=/usr/sbin/mosquitto -c /etc/mosquitto/mosquitto.conf
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0

[program:gateway]
command=python3 -m saic_ismart_client_ng.mqtt_gateway
environment=HOME="/root"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0

[program:ingest]
command=npx tsx server/ingest.ts
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
```

### Get Cloudflare Tunnel Token

```bash
cloudflared tunnel token mtc-mqtt
# Outputs: eyJhIjoiXXXXXXX...
```

### Deploy to Cloud Run with Tunnel

```bash
# Set tunnel token as secret
echo -n "your-tunnel-token" | gcloud secrets create cloudflare-tunnel-token --data-file=-

# Deploy with secret
gcloud run deploy mtc-backend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/mtc-backend:latest \
  --region=${REGION} \
  --memory=2Gi \
  --cpu=2 \
  --min-instances=1 \
  --update-secrets=CLOUDFLARE_TUNNEL_TOKEN=cloudflare-tunnel-token:latest \
  --set-env-vars="..." # All your env vars
```

---

## Part 5: Configure Vercel for mtc.air.zone

### Update Vercel Project

1. **Go to Vercel Dashboard** → Your project → Settings

2. **Domains**:
   - Add domain: `mtc.air.zone`

3. **Configure Cloudflare DNS**:
   ```
   Type: CNAME
   Name: mtc
   Target: cname.vercel-dns.com
   Proxy: Proxied (orange cloud)
   ```

4. **Update Environment Variables**:
   ```env
   MQTT_BROKER_URL=mqtt://mqtt.air.zone:1883
   # Or if using secure tunnel:
   MQTT_BROKER_URL=mqtts://mqtt.air.zone:8883
   ```

5. **Redeploy** to pick up new domain and env vars

---

## Part 6: Automated Deployment Script

**File**: `scripts/deploy-gcp.sh`

```bash
#!/bin/bash
set -e

# Configuration
PROJECT_ID=$(gcloud config get-value project)
REGION=asia-east1
REPO=mtc-containers
IMAGE=mtc-backend

echo "🚀 Deploying MTC iSmart to Google Cloud Run"
echo "============================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"

# Build image
echo "📦 Building Docker image..."
docker build -f docker/cloud-run/Dockerfile.all-in-one \
  -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest .

# Push image
echo "⬆️  Pushing to Artifact Registry..."
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest

# Deploy to Cloud Run
echo "🌐 Deploying to Cloud Run..."
gcloud run deploy mtc-backend \
  --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest \
  --platform=managed \
  --region=${REGION} \
  --memory=2Gi \
  --cpu=2 \
  --port=1883 \
  --min-instances=1 \
  --max-instances=3 \
  --timeout=3600 \
  --set-env-vars="MQTT_URI=tcp://localhost:1883,\
SAIC_USER=system@air.city,\
SAIC_PASSWORD=ac202303,\
SAIC_REST_URI=https://gateway-mg-eu.soimt.com/api.app/v1/,\
SAIC_REGION=eu,\
NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL},\
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY},\
MQTT_BROKER_URL=mqtt://localhost:1883"

echo "✅ Deployment complete!"
echo ""
echo "Service URL:"
gcloud run services describe mtc-backend --region=${REGION} --format='value(status.url)'
```

---

## Cost Estimate

| Service | Usage | Cost |
|---------|-------|------|
| Cloud Run | 2 GB RAM, 2 vCPU, always-on | ~$15/month |
| Artifact Registry | Storage | ~$0.10/month |
| Vercel | Hobby plan | Free |
| Supabase | Free tier | Free |
| Cloudflare | DNS + Tunnel | Free |
| **Total** | | **~$15/month** |

With Cloud Run free tier:
- 2 million requests/month free
- 360,000 GB-seconds/month free
- Could be **$5-10/month** or less

---

## Monitoring & Logs

### View Cloud Run Logs

```bash
# Real-time logs
gcloud run logs tail mtc-backend --region=asia-east1

# Filter by service
gcloud run logs read mtc-backend \
  --region=asia-east1 \
  --format="value(textPayload)" \
  --filter="resource.labels.service_name=mtc-backend"
```

### View in Console

1. Go to [Cloud Run Console](https://console.cloud.google.com/run)
2. Click on `mtc-backend` service
3. Click "Logs" tab
4. Filter: `resource.labels.service_name="mtc-backend"`

---

## Troubleshooting

### MQTT Connection Fails

```bash
# Test connection
telnet mqtt.air.zone 1883

# Check Cloud Run is running
gcloud run services describe mtc-backend --region=asia-east1

# Check Cloudflare tunnel
cloudflared tunnel info mtc-mqtt
```

### Gateway Not Updating Vehicles

```bash
# Check logs
gcloud run logs tail mtc-backend --region=asia-east1 | grep gateway

# Restart service
gcloud run services update mtc-backend --region=asia-east1
```

---

## Next Steps

1. Set up monitoring alerts in Google Cloud Console
2. Configure log-based metrics
3. Set up Cloud Run custom domains with SSL
4. Implement CI/CD with Cloud Build
5. Add Cloud Armor for DDoS protection

---

**Your system is now fully cloud-native! 🎉**
