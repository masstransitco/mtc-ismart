# Deployment Instructions - MQTT Connection Fix

## Problem Summary

The vehicle commands (lock/unlock, find, lights, horn) were unresponsive with MQTT connection timeout errors because:

1. **Architecture Issue**: Vercel serverless functions were trying to connect directly to MQTT broker via Cloudflare Tunnel
2. **Protocol Mismatch**: Cloudflare Tunnel routes HTTP/HTTPS traffic, not raw MQTT TCP connections
3. **Wrong Approach**: MQTT clients in serverless functions don't work well due to connection pooling and timeouts

## Solution Implemented

Created an HTTP API layer on the Cloud Run backend that:
- Accepts HTTP requests from Vercel
- Publishes commands to local MQTT broker (localhost:1883 within Cloud Run container)
- Routes through Cloudflare Tunnel using HTTPS

**New Architecture:**
```
Vercel App → HTTPS → Cloudflare Tunnel → Cloud Run HTTP API (port 8080) → MQTT Broker (localhost:1883) → SAIC Gateway
```

## Files Changed

### 1. Backend Changes (Cloud Run)

**New File: `server/command-api.ts`**
- Express HTTP server listening on port 8080
- Endpoints: `/api/vehicle/lock`, `/api/vehicle/climate`, `/api/vehicle/find`, `/api/vehicle/charge`
- Connects to local MQTT broker at `mqtt://localhost:1883`
- Logs commands to Supabase database

**Modified: `docker/cloud-run/supervisord.conf`**
- Added `[program:command-api]` to run the HTTP API server
- Priority 40 (starts after MQTT, gateway, and ingestion)

**Modified: `docker/cloud-run/Dockerfile.all-in-one`**
- Exposed port 8080 in addition to 1883
- Cloud Run will route HTTP traffic to port 8080

**Modified: `package.json`**
- Added `express` and `@types/express` dependencies

### 2. Frontend Changes (Vercel)

**Modified: All API routes in `app/api/vehicle/`**
- `lock/route.ts` - Now forwards to Cloud Run HTTP API
- `climate/route.ts` - Now forwards to Cloud Run HTTP API
- `find/route.ts` - Now forwards to Cloud Run HTTP API
- `charge/route.ts` - Now forwards to Cloud Run HTTP API

Removed MQTT client logic, replaced with simple fetch() calls to backend.

**Modified: `.env.local`**
- Removed `MQTT_BROKER_URL`, `MQTT_USER`, `MQTT_PASSWORD`
- Added `BACKEND_API_URL=https://mqtt.air.zone`

## Deployment Steps

### Step 1: Authenticate with Google Cloud

```bash
gcloud auth login
gcloud config set project cityos-392102
```

### Step 2: Build and Push Docker Image

```bash
cd /Users/markau/mtc-ismart

# Build using Cloud Build
gcloud builds submit --config cloudbuild.yaml --project=cityos-392102

# This will create:
# - asia-east1-docker.pkg.dev/cityos-392102/mtc-containers/mtc-backend:latest
# - asia-east1-docker.pkg.dev/cityos-392102/mtc-containers/mtc-backend:<BUILD_ID>
```

### Step 3: Deploy to Cloud Run

```bash
# Deploy the new image
gcloud run deploy mtc-backend \
  --image=asia-east1-docker.pkg.dev/cityos-392102/mtc-containers/mtc-backend:latest \
  --platform=managed \
  --region=asia-east1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --port=8080 \
  --min-instances=1 \
  --max-instances=3 \
  --timeout=3600 \
  --no-cpu-throttling \
  --set-env-vars="MQTT_URI=tcp://localhost:1883,SAIC_USER=system@air.city,SAIC_PASSWORD=ac202303,SAIC_REST_URI=https://gateway-mg-eu.soimt.com/api.app/v1/,SAIC_REGION=eu,SAIC_TENANT_ID=459771,NEXT_PUBLIC_SUPABASE_URL=https://sssyxnpanayqvamstind.supabase.co,SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY>,MQTT_BROKER_URL=mqtt://localhost:1883,NODE_ENV=production,PORT=8080"
```

**Note**: Replace `<YOUR_SERVICE_ROLE_KEY>` with the actual key from `.env.local`

### Step 4: Update Vercel Environment Variables

Go to Vercel Dashboard → mtc-ismart project → Settings → Environment Variables

Add/Update:
- `BACKEND_API_URL` = `https://mqtt.air.zone` (Production & Preview)
- `SAIC_USER` = `system@air.city` (Production & Preview)

### Step 5: Redeploy Vercel App

```bash
# Push changes to trigger automatic deployment
git add -A
git commit -m "Fix MQTT connection - use HTTP API proxy on Cloud Run"
git push origin main

# Or manual deployment
npx vercel deploy --prod
```

### Step 6: Verify Deployment

```bash
# 1. Check Cloud Run logs
gcloud run logs tail mtc-backend --region=asia-east1

# You should see:
# - [mosquitto] mosquitto version ...
# - [gateway] Connected to MQTT broker
# - [ingest] Connected to MQTT
# - [Command API] Server running on port 8080

# 2. Test health endpoint
curl https://mqtt.air.zone/health

# Should return: {"status":"ok","service":"mtc-command-api"}

# 3. Test command from Vercel dashboard
# Open https://mtc.air.zone
# Click Lock/Unlock button
# Should work without MQTT timeout errors
```

## Testing Locally (Optional)

To test the new architecture locally before deploying:

```bash
# Terminal 1 - Run local dev server
cd /Users/markau/mtc-ismart
npm run dev

# Terminal 2 - Test command
curl -X POST http://localhost:3000/api/vehicle/lock \
  -H "Content-Type: application/json" \
  -d '{"vin":"LSJWH4098PN070110","locked":true}'

# This will forward to https://mqtt.air.zone/api/vehicle/lock
```

## Rollback Plan

If deployment fails:

```bash
# Find previous working build
gcloud builds list --limit=10

# Deploy previous image
gcloud run deploy mtc-backend \
  --image=asia-east1-docker.pkg.dev/cityos-392102/mtc-containers/mtc-backend:<PREVIOUS_BUILD_ID> \
  --region=asia-east1
```

## Expected Results

After deployment:
- ✅ Vehicle commands respond quickly (< 5 seconds)
- ✅ No MQTT timeout errors in console
- ✅ Lock/unlock buttons work
- ✅ Find My Car (lights/horn) works
- ✅ Climate control works
- ✅ All commands logged to `vehicle_commands` table

## Monitoring

```bash
# Watch Cloud Run logs for command API
gcloud run logs tail mtc-backend --region=asia-east1 | grep "Command API"

# Watch for MQTT publishes
gcloud run logs tail mtc-backend --region=asia-east1 | grep "MQTT"

# Check database for command logs
psql "$POSTGRES_URL_NON_POOLING" -c "SELECT * FROM vehicle_commands ORDER BY created_at DESC LIMIT 10;"
```

## Architecture Diagram

**Before (Broken):**
```
Vercel API Route → Cloudflare Tunnel (HTTP) → ❌ MQTT TCP (protocol mismatch)
```

**After (Fixed):**
```
Vercel API Route
  ↓ (HTTPS POST)
Cloudflare Tunnel (mqtt.air.zone)
  ↓ (HTTPS)
Cloud Run HTTP API (port 8080)
  ↓ (MQTT TCP localhost:1883)
Mosquitto Broker
  ↓ (MQTT topics)
SAIC Python Gateway
  ↓ (MG iSmart API)
Vehicle
```

## Cost Impact

Minimal cost increase:
- Cloud Run HTTP API adds ~10-20MB RAM usage
- Additional requests go through same infrastructure
- Estimate: +$0.50/month or less

## Security Notes

1. **No authentication on HTTP API** - Currently relies on Cloud Run being behind Cloudflare
2. **Consider adding**: API key or JWT validation on Cloud Run endpoints
3. **MQTT is local** - Only accessible within Cloud Run container (secure)
4. **Environment variables** - Stored encrypted in Cloud Run and Vercel

## Next Steps (Future Improvements)

1. Add retry logic for failed commands
2. Implement command result polling (check if vehicle actually locked)
3. Add rate limiting on HTTP API
4. Set up monitoring alerts for command failures
5. Add authentication to HTTP API endpoints
6. Consider using Cloud Run service-to-service authentication

---

**Created**: 2025-10-30
**Author**: Claude Code
**Status**: Ready for deployment
