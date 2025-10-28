# MTC iSmart - Google Cloud + Cloudflare Quick Start

## 🎯 Deploy in 20 Minutes

This guide will deploy your vehicle management system using:
- **Google Cloud Run** for MQTT backend (Docker containers)
- **Cloudflare** for DNS and SSL tunnel
- **Vercel** for Next.js dashboard
- **Domains**: `mtc.air.zone` (dashboard) and `mqtt.air.zone` (MQTT)

---

## ✅ Prerequisites (5 min setup)

### 1. Install Required CLIs

```bash
# Google Cloud CLI (if not installed)
brew install --cask google-cloud-sdk

# Cloudflare CLI
brew install cloudflare/cloudflare/cloudflared

# Docker (should already be installed)
# If not: brew install --cask docker
```

### 2. Authenticate

```bash
# Login to Google Cloud
gcloud auth login

# Login to Cloudflare
cloudflared tunnel login
```

### 3. Set Up GCP Project

```bash
# Create new project or use existing
gcloud projects create mtc-ismart-prod --name="MTC iSmart Production"

# Set as active project
gcloud config set project mtc-ismart-prod

# Enable billing (required for Cloud Run)
# Go to: https://console.cloud.google.com/billing

# Enable required APIs
gcloud services enable run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

---

## 🚀 Deployment Steps

### Step 1: Push Code to GitHub (2 min)

```bash
cd /Users/markau/mtc-ismart
git add -A
git commit -m "Ready for GCP deployment"
git push origin main
```

---

### Step 2: Deploy MQTT Backend to Google Cloud Run (5 min)

```bash
cd /Users/markau/mtc-ismart

# Export your Supabase service role key
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."  # Your actual key

# Run deployment script
./scripts/deploy-gcp.sh
```

**What this does:**
- ✅ Creates Artifact Registry repository
- ✅ Builds Docker image with Mosquitto + Gateway + Ingestion
- ✅ Deploys to Cloud Run (asia-east1 region)
- ✅ Configures with 2GB RAM, 2 vCPU, always-on (min 1 instance)

**Output:**
```
✅ Deployment complete!
Service URL: https://mtc-backend-xxx-xx.a.run.app
```

**Note the service URL** - you won't use it directly but good to have.

---

### Step 3: Set Up Cloudflare Tunnel (5 min)

Cloudflare Tunnel creates a secure connection from Cloud Run to your domain.

#### Create Tunnel

```bash
# Create tunnel
cloudflared tunnel create mtc-mqtt

# You'll see output like:
# Created tunnel mtc-mqtt with id abc123-def456-ghi789
# Credentials written to: /Users/markau/.cloudflared/abc123-def456-ghi789.json

# Save your tunnel ID
TUNNEL_ID=abc123-def456-ghi789  # Replace with your actual tunnel ID
```

#### Configure DNS

```bash
# Add DNS route
cloudflared tunnel route dns $TUNNEL_ID mqtt.air.zone
```

**Or manually in Cloudflare Dashboard:**
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select `air.zone` domain
3. Go to DNS → Records
4. Add record:
   - Type: `CNAME`
   - Name: `mqtt`
   - Target: `<tunnel-id>.cfargotunnel.com`
   - Proxy status: **Proxied** (orange cloud)

#### Get Cloud Run Service URL

```bash
# Get the internal URL that Cloudflare will connect to
gcloud run services describe mtc-backend \
  --region=asia-east1 \
  --format='value(status.url)'

# Example output: https://mtc-backend-abc123-xx.a.run.app
```

#### Create Tunnel Config

```bash
cat > ~/.cloudflared/config.yml << EOF
tunnel: ${TUNNEL_ID}
credentials-file: /Users/markau/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: mqtt.air.zone
    service: https://mtc-backend-abc123-xx.a.run.app  # Replace with your Cloud Run URL
    originRequest:
      noTLSVerify: false
      connectTimeout: 30s
  - service: http_status:404
EOF
```

#### Start Tunnel

```bash
# Test tunnel locally first
cloudflared tunnel run mtc-mqtt

# If it works, deploy it (keeps running in background)
cloudflared service install
```

**Alternative**: Run tunnel in Cloud Run as a sidecar (see DEPLOYMENT-GCP.md for advanced setup)

---

### Step 4: Deploy Dashboard to Vercel (3 min)

#### Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import repository: `masstransitco/mtc-ismart`
3. Configure:
   - Framework: Next.js (auto-detected)
   - Root Directory: `./`

4. Add Environment Variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://sssyxnpanayqvamstind.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyA8rDrxBzMRlgbA7BQ2DoY31gEXzZ4Ours
   MQTT_BROKER_URL=mqtt://mqtt.air.zone:1883
   SAIC_USER=system@air.city
   ```

5. Click **Deploy**

#### Add Custom Domain

1. In Vercel Dashboard → Your Project → Settings → Domains
2. Add domain: `mtc.air.zone`
3. Vercel will show DNS configuration

#### Configure Cloudflare DNS for Dashboard

In Cloudflare Dashboard (air.zone):

1. Go to DNS → Records
2. Add record:
   - Type: `CNAME`
   - Name: `mtc`
   - Target: `cname.vercel-dns.com`
   - Proxy status: **Proxied** (orange cloud)

---

### Step 5: Test Everything (2 min)

1. **Open dashboard**: https://mtc.air.zone

2. **Check vehicles appear** (may take 30-60 seconds for first data)

3. **Test MQTT connection**:
   ```bash
   # Install mosquitto clients if needed
   brew install mosquitto

   # Test connection
   mosquitto_sub -h mqtt.air.zone -p 1883 -t 'saic/#' -v -C 5
   ```

4. **Test a command**:
   - Click "Lock" or "Climate" button in dashboard
   - Should see command execute within a few seconds

---

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Users                                                        │
│   ↓                                                          │
│ https://mtc.air.zone (Vercel)                              │
│   ↓                                                          │
│ Cloudflare CDN + SSL                                        │
│   ↓                                                          │
│ Next.js Dashboard                                           │
│   ├─> API Routes send MQTT commands                        │
│   └─> mqtt://mqtt.air.zone:1883                            │
│       ↓                                                      │
│   Cloudflare Tunnel                                         │
│       ↓                                                      │
│   Google Cloud Run (asia-east1)                            │
│     ┌────────────────────────────────────────┐             │
│     │ Supervisor managing 3 processes:        │             │
│     │  1. Mosquitto MQTT Broker              │             │
│     │  2. SAIC Gateway → MG iSmart API       │             │
│     │  3. Ingestion Service → Supabase       │             │
│     └────────────────────────────────────────┘             │
│       ↓                                                      │
│   Supabase PostgreSQL (cloud)                              │
│     ├─> Stores vehicle data                                │
│     └─> Real-time updates to dashboard                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 💰 Cost Breakdown

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Vercel | Hobby | **Free** |
| Cloud Run | 2GB RAM, always-on | $12-15 |
| Artifact Registry | Storage | $0.10 |
| Supabase | Free tier | **Free** |
| Cloudflare | DNS + Tunnel | **Free** |
| **Total** | | **~$12-15/month** |

**With Cloud Run free tier credits:**
- You get 2M requests/month free
- 360,000 GB-seconds/month free
- **Actual cost could be $5-10/month or less**

---

## 🔧 Management Commands

### View Logs

```bash
# Real-time Cloud Run logs
gcloud run logs tail mtc-backend --region=asia-east1

# Filter for specific service
gcloud run logs tail mtc-backend --region=asia-east1 | grep gateway

# Or in Console
# https://console.cloud.google.com/run/detail/asia-east1/mtc-backend/logs
```

### Restart Service

```bash
# Force redeploy (restarts all containers)
gcloud run services update mtc-backend --region=asia-east1

# Or just update with latest image
./scripts/deploy-gcp.sh
```

### Check Tunnel Status

```bash
# List tunnels
cloudflared tunnel list

# Check tunnel info
cloudflared tunnel info mtc-mqtt

# Restart tunnel
cloudflared service uninstall
cloudflared service install
```

### Monitor in Console

**Google Cloud Console:**
- Cloud Run: https://console.cloud.google.com/run
- Logs: Click service → Logs tab
- Metrics: Click service → Metrics tab

**Cloudflare Dashboard:**
- Tunnels: https://dash.cloudflare.com → Zero Trust → Access → Tunnels
- DNS: https://dash.cloudflare.com → air.zone → DNS

---

## 🐛 Troubleshooting

### Vehicles not appearing

1. **Check Cloud Run is running:**
   ```bash
   gcloud run services describe mtc-backend --region=asia-east1
   ```

2. **Check logs:**
   ```bash
   gcloud run logs tail mtc-backend --region=asia-east1
   ```

3. **Check if services started:**
   ```bash
   # Look for these in logs:
   # "Started mosquitto"
   # "Started gateway"
   # "Started ingest"
   ```

### MQTT connection fails

1. **Test Cloudflare tunnel:**
   ```bash
   telnet mqtt.air.zone 1883
   ```

2. **Check tunnel is running:**
   ```bash
   cloudflared tunnel info mtc-mqtt
   ps aux | grep cloudflared
   ```

3. **Check DNS:**
   ```bash
   dig mqtt.air.zone
   # Should show CNAME to xxx.cfargotunnel.com
   ```

### Commands not working

1. **Check Vercel env vars:**
   - MQTT_BROKER_URL should be `mqtt://mqtt.air.zone:1883`

2. **Check gateway logs:**
   ```bash
   gcloud run logs tail mtc-backend --region=asia-east1 | grep "command\|doors\|climate"
   ```

### Build fails

1. **Check Docker is running:**
   ```bash
   docker ps
   ```

2. **Clear Docker cache:**
   ```bash
   docker system prune -a
   ```

3. **Try manual build:**
   ```bash
   docker build -f docker/cloud-run/Dockerfile.all-in-one -t test .
   ```

---

## 🎓 Next Steps

- [ ] Set up monitoring alerts in Google Cloud Console
- [ ] Configure auto-scaling rules
- [ ] Set up Cloud Armor for DDoS protection
- [ ] Add authentication to Vercel app
- [ ] Set up automated backups
- [ ] Configure CI/CD with Cloud Build

---

## 📚 Additional Resources

- **Full Documentation**: [DEPLOYMENT-GCP.md](./DEPLOYMENT-GCP.md)
- **Cloud Run Docs**: https://cloud.google.com/run/docs
- **Cloudflare Tunnel Docs**: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **Vercel Docs**: https://vercel.com/docs

---

**You're all set! Your system is now running on Google Cloud! 🎉**

Access your dashboard at: **https://mtc.air.zone**
