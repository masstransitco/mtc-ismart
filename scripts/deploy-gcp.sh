#!/bin/bash
# Deploy MTC iSmart to Google Cloud Run
# Usage: ./scripts/deploy-gcp.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 MTC iSmart - Google Cloud Run Deployment${NC}"
echo "=============================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI not found. Please install it first:${NC}"
    echo "   brew install --cask google-cloud-sdk"
    exit 1
fi

# Get configuration
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ No GCP project selected. Run:${NC}"
    echo "   gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

REGION=${REGION:-asia-east1}
REPO=${REPO:-mtc-containers}
IMAGE=${IMAGE:-mtc-backend}
SERVICE_NAME=mtc-backend

echo -e "${GREEN}📋 Configuration:${NC}"
echo "   Project: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Repository: $REPO"
echo "   Image: $IMAGE"
echo ""

# Check for required environment variables
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${YELLOW}⚠️  SUPABASE_SERVICE_ROLE_KEY not set${NC}"
    echo "   Set it with: export SUPABASE_SERVICE_ROLE_KEY=your_key"
    exit 1
fi

# Create repository if it doesn't exist
echo -e "${GREEN}📦 Checking Artifact Registry...${NC}"
if ! gcloud artifacts repositories describe $REPO --location=$REGION &>/dev/null; then
    echo "   Creating repository..."
    gcloud artifacts repositories create $REPO \
        --repository-format=docker \
        --location=$REGION \
        --description="MTC iSmart containers"
fi

# Configure Docker authentication
echo -e "${GREEN}🔐 Configuring Docker authentication...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build image
echo -e "${GREEN}🏗️  Building Docker image...${NC}"
docker build -f docker/cloud-run/Dockerfile.all-in-one \
    -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest \
    -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:$(date +%Y%m%d-%H%M%S) \
    .

# Push image
echo -e "${GREEN}⬆️  Pushing to Artifact Registry...${NC}"
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest

# Deploy to Cloud Run
echo -e "${GREEN}🌐 Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest \
    --platform=managed \
    --region=$REGION \
    --allow-unauthenticated \
    --memory=2Gi \
    --cpu=2 \
    --port=1883 \
    --min-instances=1 \
    --max-instances=3 \
    --timeout=3600 \
    --no-cpu-throttling \
    --set-env-vars="MQTT_URI=tcp://localhost:1883,\
SAIC_USER=system@air.city,\
SAIC_PASSWORD=ac202303,\
SAIC_REST_URI=https://gateway-mg-eu.soimt.com/api.app/v1/,\
SAIC_REGION=eu,\
SAIC_TENANT_ID=459771,\
NEXT_PUBLIC_SUPABASE_URL=https://sssyxnpanayqvamstind.supabase.co,\
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY},\
MQTT_BROKER_URL=mqtt://localhost:1883,\
NODE_ENV=production"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Service URL: $SERVICE_URL"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo "   1. Set up Cloudflare Tunnel:"
echo "      cloudflared tunnel create mtc-mqtt"
echo "      cloudflared tunnel route dns mtc-mqtt mqtt.air.zone"
echo ""
echo "   2. Update Vercel environment variable:"
echo "      MQTT_BROKER_URL=mqtt://mqtt.air.zone:1883"
echo ""
echo "   3. Configure Vercel domain:"
echo "      Add mtc.air.zone in Vercel Dashboard"
echo ""
echo "   4. View logs:"
echo "      gcloud run logs tail $SERVICE_NAME --region=$REGION"
echo ""
