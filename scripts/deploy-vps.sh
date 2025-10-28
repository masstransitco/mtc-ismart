#!/bin/bash
# VPS Deployment Script for MTC iSmart MQTT Backend
# Usage: ./scripts/deploy-vps.sh <vps-ip-or-hostname>

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <vps-ip-or-hostname>"
  echo "Example: $0 root@mqtt.masstransit.hk"
  exit 1
fi

VPS_HOST=$1
DEPLOY_DIR="/opt/mtc-ismart"

echo "🚀 Deploying MTC iSmart MQTT Backend to $VPS_HOST"
echo "================================================"

# Step 1: Create directory structure on VPS
echo "📁 Creating deployment directory..."
ssh $VPS_HOST "mkdir -p $DEPLOY_DIR/docker/mosquitto/config"

# Step 2: Copy Docker files
echo "🐳 Copying Docker configuration..."
scp docker-compose.yml $VPS_HOST:$DEPLOY_DIR/
scp -r docker/ $VPS_HOST:$DEPLOY_DIR/

# Step 3: Copy environment files
echo "⚙️  Copying environment configuration..."
scp .env.mg $VPS_HOST:$DEPLOY_DIR/

# Step 4: Copy ingestion service
echo "📦 Copying ingestion service..."
scp -r server/ package.json package-lock.json tsconfig.json $VPS_HOST:$DEPLOY_DIR/

# Step 5: Copy Supabase connection files
echo "🗄️  Copying database configuration..."
scp .env.local $VPS_HOST:$DEPLOY_DIR/.env.production

# Step 6: Install and start services
echo "🔧 Installing dependencies on VPS..."
ssh $VPS_HOST << 'ENDSSH'
cd /opt/mtc-ismart

# Install Node.js if not present
if ! command -v node &> /dev/null; then
  echo "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sh get-docker.sh
  apt install docker-compose-plugin -y
fi

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
fi

# Install project dependencies
echo "Installing Node modules..."
npm install

# Stop existing services
echo "Stopping existing services..."
docker-compose down 2>/dev/null || true
pm2 delete mtc-ingest 2>/dev/null || true

# Start Docker services
echo "Starting MQTT broker and gateway..."
docker-compose up -d

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

# Start ingestion service with PM2
echo "Starting ingestion service..."
pm2 start server/ingest.ts --name mtc-ingest --interpreter tsx --env production

# Save PM2 configuration
pm2 save

# Set up PM2 to start on boot (only once)
pm2 startup || true

echo "✅ Services started successfully!"
echo ""
echo "Check status with:"
echo "  docker ps"
echo "  pm2 status"
echo ""
echo "View logs with:"
echo "  docker logs -f mtc-mqtt-broker"
echo "  docker logs -f mtc-ismart-gateway"
echo "  pm2 logs mtc-ingest"
ENDSSH

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Configure SSL/TLS for MQTT (see DEPLOYMENT.md)"
echo "2. Update Vercel environment variable MQTT_BROKER_URL"
echo "3. Test connection from Vercel app"
