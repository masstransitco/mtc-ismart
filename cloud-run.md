# Cloud Run Architecture

## Overview

The MTC iSmart backend runs as an **all-in-one Cloud Run service** that orchestrates multiple processes using **supervisord**. This architecture consolidates the MQTT broker, SAIC gateway, data ingestion, and command API into a single deployable container.

## Service Components

The Cloud Run service (`mtc-backend`) runs four distinct programs managed by supervisord:

### 1. **Mosquitto MQTT Broker** (Priority 10)
- **Command**: `/usr/sbin/mosquitto -c /etc/mosquitto/mosquitto.conf`
- **Purpose**: Internal MQTT message broker for pub/sub communication
- **Port**: 1883 (internal only, not exposed externally)
- **Config**: `/etc/mosquitto/mosquitto.conf` (cloud-specific configuration)
- **ACL**: `/etc/mosquitto/acl` (access control list for MQTT topics)
- **Restart**: Automatic on failure

### 2. **SAIC Python MQTT Gateway** (Priority 20)
- **Command**: `/opt/saic-gateway/.venv/bin/python /opt/saic-gateway/src/main.py`
- **Purpose**: Connects to SAIC's EU API servers and publishes vehicle telemetry to MQTT
- **API Endpoint**: `https://gateway-mg-eu.soimt.com/api.app/v1/`
- **MQTT Topic**: `saic/<user>/vehicles/<vin>/<category>/<subcategory>`
- **Query Intervals**:
  - Active: 5 seconds
  - Sleep: 5 seconds
  - Inactive: 5 seconds
- **Credentials**: Requires `SAIC_USERNAME` and `SAIC_PWD` environment variables
- **Auto-relogin**: 5 second delay on authentication failures
- **Restart**: Automatic on failure with 10s start delay

### 3. **Ingest Service** (Priority 30)
- **Command**: `npx tsx server/ingest.ts`
- **Purpose**: Subscribes to MQTT topics and writes data to Supabase
- **MQTT Topics Subscribed**:
  - `saic/system@air.city/vehicles/+/drivetrain/#`
  - `saic/system@air.city/vehicles/+/location/#`
  - `saic/system@air.city/vehicles/+/climate/#`
  - `saic/system@air.city/vehicles/+/doors/#`
  - `saic/system@air.city/vehicles/+/lights/#`
  - `saic/system@air.city/vehicles/+/tyres/#`
  - `saic/system@air.city/vehicles/+/windows/#`
- **Cache Flush**: Every 5 seconds (writes aggregated data to database)
- **Telemetry Condition**: Only saves to `vehicle_telemetry` table when SoC or location data is present
- **Database**: Connects to Supabase using `SUPABASE_SERVICE_ROLE_KEY`
- **Restart**: Automatic on failure with 10s start delay

### 4. **Command API** (Priority 40)
- **Command**: `npx tsx server/command-api.ts`
- **Purpose**: HTTP API server for sending commands to vehicles
- **Port**: 8080 (exposed externally via Cloud Run)
- **MQTT**: Publishes commands to `saic/<user>/vehicles/<vin>/cmd/<command>` topics
- **Commands**: lock, unlock, climate control, charging control, find my car
- **Restart**: Automatic on failure with 10s start delay

## Data Flow

```
SAIC API Servers (EU)
         ↓
    SAIC Gateway (polls every 5s)
         ↓
    Mosquitto MQTT Broker
         ↓
    Ingest Service (subscribes)
         ↓
    Supabase Database
         ↓
    Next.js Frontend
```

Commands flow in reverse:
```
Next.js Frontend
         ↓
    Command API (HTTP)
         ↓
    Mosquitto MQTT Broker
         ↓
    SAIC Gateway (publishes to SAIC API)
         ↓
    Vehicle
```

## Deployment

### Build & Deploy
```bash
# Build the all-in-one Docker image
docker build -f docker/cloud-run/Dockerfile.all-in-one -t mtc-backend .

# Deploy to Cloud Run
gcloud run deploy mtc-backend \
  --image gcr.io/cityos-392102/mtc-backend \
  --region asia-east1 \
  --platform managed \
  --set-env-vars SAIC_USERNAME=<username>,SAIC_PWD=<password>,NEXT_PUBLIC_SUPABASE_URL=<url>,SUPABASE_SERVICE_ROLE_KEY=<key>
```

### Environment Variables Required
- `SAIC_USERNAME`: SAIC account username for gateway authentication
- `SAIC_PWD`: SAIC account password
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key for database access

### Current Deployment
- **Service**: `mtc-backend`
- **Region**: `asia-east1`
- **Project**: `cityos-392102` (Project Number: 880316754524)
- **URL**: `https://mtc-backend-880316754524.asia-east1.run.app`
- **Latest Revision**: Check with `gcloud run services describe mtc-backend --region=asia-east1`

## Monitoring & Debugging

### Check Service Status
```bash
gcloud run services describe mtc-backend --region=asia-east1
```

### View Logs
```bash
# All logs
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mtc-backend"' --limit=100 --region=asia-east1

# Gateway logs only
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mtc-backend" AND textPayload=~"gateway"' --limit=50 --region=asia-east1

# Ingest logs only
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mtc-backend" AND textPayload=~"Ingest"' --limit=50 --region=asia-east1
```

### Restart Service
```bash
# Force new revision deployment (restarts all processes)
gcloud run services update-traffic mtc-backend --to-latest --region=asia-east1
```

### Health Check
The container includes a health check that verifies Mosquitto is running:
```bash
mosquitto_sub -t '$SYS/#' -C 1 -i healthcheck -W 3
```

## Common Issues

### Telemetry Stops Flowing
**Symptoms**: Commands work, but no new location/battery data in database

**Possible Causes**:
1. SAIC Gateway authentication expired (check for "login" or "auth" errors in logs)
2. MQTT connection dropped between components
3. Ingest service crashed or lost subscriptions
4. SAIC API rate limiting or service degradation

**Resolution**:
1. Check logs for all components
2. Restart the service to re-establish connections
3. Verify SAIC credentials are still valid
4. Check SAIC API status (EU region)

### Commands Not Working
**Symptoms**: Lock/unlock/climate commands fail or timeout

**Possible Causes**:
1. Command API crashed
2. MQTT broker down
3. SAIC Gateway connection lost
4. Invalid SAIC credentials

**Resolution**:
1. Check command-api logs for errors
2. Verify MQTT broker is running (health check)
3. Restart service
4. Validate credentials

### High Memory/CPU Usage
**Symptoms**: Service restarts frequently, slow responses

**Possible Causes**:
1. Too many MQTT messages (high frequency polling)
2. Memory leak in Node.js services
3. Database connection pool exhaustion

**Resolution**:
1. Increase Cloud Run memory allocation
2. Adjust query intervals in gateway config
3. Implement connection pooling limits
4. Monitor with Cloud Run metrics

## Architecture Benefits

### Advantages
- **Single deployment unit**: Simplified CI/CD pipeline
- **Internal MQTT**: No need for external MQTT broker service
- **Automatic restarts**: Supervisord manages process lifecycle
- **Consolidated logs**: All components log to stdout/stderr
- **Cost-effective**: Single Cloud Run service vs. multiple services

### Trade-offs
- **Coupled components**: All processes restart together during deployment
- **Shared resources**: CPU/memory shared across all processes
- **Debugging complexity**: Multiple processes in one container
- **Scaling limitations**: Can't scale components independently

## Future Improvements

### Potential Enhancements
1. **Separate services**: Split into microservices for independent scaling
2. **External MQTT**: Use managed MQTT service (Cloud IoT Core alternative)
3. **Circuit breakers**: Add resilience patterns for SAIC API failures
4. **Metrics export**: Add Prometheus/OpenTelemetry instrumentation
5. **Dead letter queue**: Handle failed message processing
6. **Backup gateway**: Fallback to different SAIC region on failure
7. **Rate limiting**: Protect against API quota exhaustion

### Monitoring Additions
1. Alert when telemetry gap exceeds 5 minutes
2. Dashboard for MQTT message rates
3. SAIC API response time tracking
4. Database write success rate
5. Gateway authentication status

## References

- **Dockerfile**: `/docker/cloud-run/Dockerfile.all-in-one`
- **Supervisord Config**: `/docker/cloud-run/supervisord.conf`
- **Ingest Service**: `/server/ingest.ts`
- **Command API**: `/server/command-api.ts`
- **MQTT Config**: `/docker/mosquitto/config/mosquitto-cloud.conf`
- **SAIC Gateway**: External repo `saic-python-mqtt-gateway`
