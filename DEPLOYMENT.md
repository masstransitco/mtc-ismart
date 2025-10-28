# MTC iSmart Production Deployment Guide

## Architecture

This system uses a **hybrid deployment**:

- **Vercel**: Next.js frontend + API routes (serverless)
- **VPS**: MQTT Broker + SAIC Gateway + Ingestion Service (Docker)
- **Supabase**: PostgreSQL database (cloud-hosted)

---

## Part 1: Deploy Next.js App to Vercel

### Prerequisites
- Vercel account (free)
- GitHub repository with code pushed

### Steps

#### 1. Push Code to GitHub

```bash
cd /Users/markau/mtc-ismart
git add -A
git commit -m "Prepare for Vercel deployment"
git push origin main
```

#### 2. Connect to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository: `masstransitco/mtc-ismart`
4. Framework Preset: **Next.js** (auto-detected)
5. Root Directory: `./` (leave as default)

#### 3. Configure Environment Variables

In Vercel Project Settings → Environment Variables, add:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://sssyxnpanayqvamstind.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc... (your anon key)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... (your service role key)

# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyA8rDrxBzMRlgbA7BQ2DoY31gEXzZ4Ours

# MQTT Broker (points to your VPS)
MQTT_BROKER_URL=mqtts://mqtt.yourdomain.com:8883

# SAIC Gateway User
SAIC_USER=system@air.city
```

**Important**: Set all variables for **Production**, **Preview**, and **Development** environments.

#### 4. Deploy

Click **Deploy** and wait for build to complete (~2-3 minutes).

Your app will be available at: `https://mtc-ismart.vercel.app`

#### 5. Add Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your domain: `ismart.masstransit.hk`
3. Configure DNS:
   - Type: `CNAME`
   - Name: `ismart` (or `@` for root)
   - Value: `cname.vercel-dns.com`

---

## Part 2: Deploy MQTT Backend to VPS

### Option A: DigitalOcean Droplet (Recommended)

#### 1. Create Droplet

- **Image**: Ubuntu 24.04 LTS
- **Plan**: Basic - $6/month (1GB RAM, 1 vCPU)
- **Datacenter**: Singapore (closest to Hong Kong)
- **Hostname**: `mqtt.masstransit.hk`

#### 2. Initial Server Setup

```bash
# SSH into your droplet
ssh root@your-droplet-ip

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Create app directory
mkdir -p /opt/mtc-ismart
cd /opt/mtc-ismart
```

#### 3. Copy Files to VPS

From your local machine:

```bash
# Copy docker-compose and configs
scp -r docker-compose.yml docker/ .env.mg root@your-droplet-ip:/opt/mtc-ismart/

# Copy ingestion service
scp -r server/ package.json tsconfig.json root@your-droplet-ip:/opt/mtc-ismart/
```

#### 4. Configure Environment

On the VPS:

```bash
cd /opt/mtc-ismart

# Edit .env.mg - update MQTT_URI to use public hostname
nano .env.mg
```

Update:
```bash
MQTT_URI=tcp://mosquitto:1883  # Internal Docker network (no change needed)
```

#### 5. Set Up SSL/TLS for MQTT

```bash
# Install Certbot
apt install certbot -y

# Generate certificate
certbot certonly --standalone -d mqtt.masstransit.hk

# Certificates will be at:
# /etc/letsencrypt/live/mqtt.masstransit.hk/fullchain.pem
# /etc/letsencrypt/live/mqtt.masstransit.hk/privkey.pem
```

Update `docker/mosquitto/config/mosquitto.conf`:

```conf
# Add TLS listener
listener 8883
certfile /mosquitto/config/certs/fullchain.pem
keyfile /mosquitto/config/certs/privkey.pem
cafile /mosquitto/config/certs/chain.pem

# Keep local listener for gateway
listener 1883
allow_anonymous true
```

Update `docker-compose.yml` to mount certificates:

```yaml
mosquitto:
  volumes:
    - ./docker/mosquitto/config/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
    - /etc/letsencrypt/live/mqtt.masstransit.hk:/mosquitto/config/certs:ro
  ports:
    - "1883:1883"
    - "8883:8883"  # TLS port
```

#### 6. Start Services

```bash
cd /opt/mtc-ismart

# Start MQTT broker and gateway
docker-compose up -d

# Check status
docker ps

# View logs
docker logs mtc-mqtt-broker
docker logs mtc-ismart-gateway
```

#### 7. Set Up Ingestion Service

```bash
cd /opt/mtc-ismart

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install dependencies
npm install

# Create environment file for ingestion
cat > .env.production << EOF
NEXT_PUBLIC_SUPABASE_URL=https://sssyxnpanayqvamstind.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
MQTT_BROKER_URL=mqtt://localhost:1883
SAIC_USER=system@air.city
EOF

# Install PM2 for process management
npm install -g pm2

# Start ingestion service
pm2 start server/ingest.ts --name mtc-ingest --interpreter tsx

# Save PM2 config
pm2 save

# Set up auto-start on boot
pm2 startup
```

#### 8. Configure Firewall

```bash
# Allow SSH
ufw allow 22/tcp

# Allow MQTT (plain - only from localhost/docker)
# ufw allow from 172.16.0.0/12 to any port 1883

# Allow MQTT over TLS (public)
ufw allow 8883/tcp

# Enable firewall
ufw enable
```

#### 9. DNS Configuration

Add DNS records for your domain:

```
Type: A
Name: mqtt
Value: your-droplet-ip
TTL: 3600
```

---

### Option B: Railway (Easier Alternative)

Railway supports Docker deployments with automatic SSL:

1. Go to [railway.app](https://railway.app)
2. Create new project
3. Deploy from GitHub
4. Add environment variables
5. Railway auto-generates domain with SSL

**Note**: Ingestion service would need to be a separate service.

---

### Option C: Fly.io (Docker-Native)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Create app for MQTT broker
cd /opt/mtc-ismart
fly launch --name mtc-mqtt-broker

# Deploy
fly deploy
```

---

## Part 3: Update Vercel Environment

After VPS is running, update Vercel env vars:

```bash
MQTT_BROKER_URL=mqtts://mqtt.masstransit.hk:8883
```

Redeploy Vercel app to pick up changes.

---

## Part 4: Testing

### Test MQTT Connection

From your local machine:

```bash
# Test TLS connection
mosquitto_sub -h mqtt.masstransit.hk -p 8883 -t 'saic/#' -v --capath /etc/ssl/certs/
```

### Test Vercel App

1. Open `https://mtc-ismart.vercel.app`
2. Vehicles should appear with real-time data
3. Test lock/unlock command
4. Monitor VPS logs: `docker logs -f mtc-ismart-gateway`

---

## Monitoring & Maintenance

### View Logs

```bash
# On VPS
docker logs -f mtc-mqtt-broker
docker logs -f mtc-ismart-gateway
pm2 logs mtc-ingest

# On Vercel
vercel logs
```

### Restart Services

```bash
# Restart Docker services
docker-compose restart

# Restart ingestion
pm2 restart mtc-ingest

# Redeploy Vercel (from GitHub)
git push origin main  # Auto-deploys on Vercel
```

### SSL Certificate Renewal

Certbot auto-renews, but you can manually renew:

```bash
certbot renew
docker-compose restart mosquitto
```

---

## Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Hobby | Free |
| DigitalOcean Droplet | Basic | $6/month |
| Supabase | Free Tier | Free |
| Domain | .com/.hk | $10-15/year |
| **Total** | | **~$6/month** |

---

## Troubleshooting

### MQTT Connection Issues

Check if port is open:
```bash
telnet mqtt.masstransit.hk 8883
```

### Gateway Not Updating Vehicles

```bash
# Check gateway logs
docker logs mtc-ismart-gateway --tail 100

# Restart gateway
docker-compose restart mg-ismart-gateway
```

### Vercel Build Fails

- Check build logs in Vercel dashboard
- Ensure all environment variables are set
- Verify `package.json` dependencies

---

## Security Checklist

- [ ] Change default MQTT passwords in `.env.mg`
- [ ] Enable Supabase RLS policies for production
- [ ] Add authentication to Next.js app
- [ ] Set up firewall rules on VPS
- [ ] Enable MQTT ACLs (access control)
- [ ] Rotate API keys regularly
- [ ] Enable 2FA on Vercel and DO accounts

---

## Backup Strategy

### Database
Supabase auto-backups (7-day retention on free tier)

### VPS
```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
tar -czf /backup/mtc-ismart-$DATE.tar.gz /opt/mtc-ismart
```

---

**Deployment Complete!** Your MTC iSmart system is now running in production. 🎉
