# MTC iSmart - Quick Deployment Guide

## 🎯 Goal
Deploy your vehicle management system to production with Vercel (frontend) + VPS (MQTT backend).

---

## 📋 Prerequisites Checklist

- [ ] GitHub account with repository access
- [ ] Vercel account (free tier)
- [ ] VPS or cloud server (DigitalOcean, AWS, etc.)
- [ ] Domain name (optional, recommended)
- [ ] Supabase project (already set up)

---

## 🚀 Deployment Steps (30 minutes)

### Step 1: Push Code to GitHub (2 mins)

```bash
cd /Users/markau/mtc-ismart
git add -A
git commit -m "Ready for production deployment"
git push origin main
```

---

### Step 2: Deploy to Vercel (5 mins)

1. **Go to [vercel.com](https://vercel.com) and login**

2. **Click "Add New Project"**

3. **Import GitHub repository**: `masstransitco/mtc-ismart`

4. **Configure Project**:
   - Framework: Next.js (auto-detected)
   - Root Directory: `./`
   - Build Command: `npm run build`
   - Output Directory: `.next`

5. **Add Environment Variables** (click "Environment Variables"):
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://sssyxnpanayqvamstind.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyA8rDrxBzMRlgbA7BQ2DoY31gEXzZ4Ours
   MQTT_BROKER_URL=mqtt://localhost:1883
   SAIC_USER=system@air.city
   ```

   ⚠️ **Note**: `MQTT_BROKER_URL` will be updated later with your VPS URL

6. **Click "Deploy"** and wait (~3 minutes)

7. **Your app is live!** 🎉
   - URL: `https://mtc-ismart.vercel.app`
   - Custom domain: Configure in Vercel → Domains

---

### Step 3: Set Up VPS (15 mins)

#### Option A: DigitalOcean (Recommended)

1. **Create Droplet**:
   - Go to [digitalocean.com](https://digitalocean.com)
   - Create → Droplets
   - Image: Ubuntu 24.04 LTS
   - Plan: Basic ($6/month, 1GB RAM)
   - Region: Singapore or Hong Kong
   - Authentication: SSH Key (recommended)
   - Hostname: `mqtt.masstransit.hk`

2. **Note your Droplet IP**: e.g., `143.198.123.45`

3. **Configure DNS** (if using domain):
   ```
   Type: A Record
   Name: mqtt
   Value: <your-droplet-ip>
   TTL: 3600
   ```

#### Option B: Railway (Easier, $5/month)

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Select your repository
4. Add service for Docker
5. Railway provides domain with SSL automatically

---

### Step 4: Deploy MQTT Backend to VPS (8 mins)

**Using the automated script**:

```bash
cd /Users/markau/mtc-ismart

# Deploy to your VPS
./scripts/deploy-vps.sh root@<your-vps-ip>

# Example:
./scripts/deploy-vps.sh root@143.198.123.45
```

**Manual deployment** (if script fails):

```bash
# 1. Copy files to VPS
scp -r docker-compose.yml docker/ .env.mg server/ package.json root@<vps-ip>:/opt/mtc-ismart/

# 2. SSH into VPS
ssh root@<vps-ip>

# 3. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 4. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 5. Start services
cd /opt/mtc-ismart
docker-compose up -d
npm install
npm install -g pm2
pm2 start server/ingest.ts --name mtc-ingest --interpreter tsx
pm2 save
pm2 startup
```

---

### Step 5: Update Vercel with VPS URL (2 mins)

1. **Go to Vercel Dashboard** → Your Project → Settings → Environment Variables

2. **Update MQTT_BROKER_URL**:

   **If using domain**:
   ```
   MQTT_BROKER_URL=mqtt://mqtt.yourdomain.com:1883
   ```

   **If using IP only**:
   ```
   MQTT_BROKER_URL=mqtt://143.198.123.45:1883
   ```

3. **Redeploy** (Deployments → Three dots → Redeploy)

---

### Step 6: Test Everything (3 mins)

1. **Open your Vercel app**: `https://mtc-ismart.vercel.app`

2. **Check if vehicles appear** (should show within 30 seconds)

3. **Test a command**:
   - Click "Lock" or "Climate" button
   - Monitor VPS logs:
     ```bash
     ssh root@<vps-ip>
     docker logs -f mtc-ismart-gateway
     ```

4. **Verify real-time updates** work

---

## ✅ Deployment Complete!

Your system is now live:
- **Dashboard**: `https://mtc-ismart.vercel.app`
- **MQTT Backend**: Running on your VPS
- **Database**: Supabase (cloud)
- **Real-time**: Working via Supabase Realtime

---

## 🔒 Optional: Enable SSL/TLS for MQTT (Recommended)

### Install Certbot and Get Certificate

```bash
ssh root@<vps-ip>

# Install Certbot
apt install certbot -y

# Generate certificate (requires domain)
certbot certonly --standalone -d mqtt.yourdomain.com

# Certificates saved to:
# /etc/letsencrypt/live/mqtt.yourdomain.com/
```

### Update Mosquitto Config

```bash
cd /opt/mtc-ismart
nano docker/mosquitto/config/mosquitto.conf
```

Add TLS listener:
```conf
listener 8883
certfile /mosquitto/config/certs/fullchain.pem
keyfile /mosquitto/config/certs/privkey.pem

listener 1883
allow_anonymous true
```

### Update docker-compose.yml

```yaml
mosquitto:
  volumes:
    - /etc/letsencrypt/live/mqtt.yourdomain.com:/mosquitto/config/certs:ro
  ports:
    - "1883:1883"
    - "8883:8883"
```

### Restart and Update Vercel

```bash
docker-compose restart
```

In Vercel, update `MQTT_BROKER_URL`:
```
MQTT_BROKER_URL=mqtts://mqtt.yourdomain.com:8883
```

---

## 📊 Monitoring

### Check VPS Services

```bash
ssh root@<vps-ip>

# Docker status
docker ps

# View logs
docker logs -f mtc-mqtt-broker
docker logs -f mtc-ismart-gateway
pm2 logs mtc-ingest

# Restart services
docker-compose restart
pm2 restart mtc-ingest
```

### Check Vercel

```bash
# View deployment logs
vercel logs

# Or in dashboard: Deployments → Your deployment → Function Logs
```

---

## 🐛 Troubleshooting

### Vehicles not appearing in dashboard

1. Check VPS is running: `docker ps`
2. Check gateway logs: `docker logs mtc-ismart-gateway`
3. Check ingestion logs: `pm2 logs mtc-ingest`
4. Verify Supabase connection in Vercel env vars

### Commands not working

1. Check MQTT broker is accessible: `telnet <vps-ip> 1883`
2. Check gateway is processing commands: `docker logs -f mtc-ismart-gateway`
3. Verify MQTT_BROKER_URL in Vercel points to VPS

### Build failing on Vercel

1. Check build logs in Vercel dashboard
2. Verify all environment variables are set
3. Try deploying again (sometimes transient issues)

---

## 💰 Cost Summary

| Service | Cost |
|---------|------|
| Vercel | **Free** |
| VPS (DO Basic) | $6/month |
| Supabase | **Free** |
| Domain (optional) | ~$12/year |
| **Total** | **$6/month** |

---

## 🎓 Next Steps

- [ ] Add custom domain to Vercel
- [ ] Set up SSL/TLS for MQTT
- [ ] Configure Supabase authentication
- [ ] Set up monitoring alerts
- [ ] Add backup automation

---

Need help? Check the full [DEPLOYMENT.md](./DEPLOYMENT.md) guide.
