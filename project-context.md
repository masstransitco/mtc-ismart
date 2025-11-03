# MTC iSmart - Project Context

## Project Overview

A Next.js vehicle management system for monitoring and controlling MG iSmart electric vehicles via MQTT. The system integrates with the SAIC iSmart API through a Python gateway, stores telemetry in Supabase, and provides a real-time dashboard for fleet management.

**Repository**: https://github.com/masstransitco/mtc-ismart

---

## Architecture

### Technology Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **UI Framework**: shadcn/ui with Radix UI primitives, Tailwind CSS
- **Backend**: Express.js Command API (port 8080)
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Message Broker**: Eclipse Mosquitto MQTT
- **Vehicle Gateway**: SAIC Python MQTT Gateway
- **Real-time**: Supabase Realtime subscriptions

### System Components

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                 │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴────────────┐
         │                        │
         ▼                        ▼
┌──────────────────┐    ┌──────────────────┐
│  Vercel          │    │  Supabase DB     │
│  (Next.js App)   │◄───┤  (PostgreSQL)    │
│  - Dashboard     │    │  - Realtime      │
│  - API Proxy     │    └──────────────────┘
└────────┬─────────┘
         │ HTTPS
         ▼
┌────────────────────────────────────────────┐
│  Cloud Run (mtc-backend)                   │
│  ┌──────────────────────────────────────┐  │
│  │ Command API (port 8080)              │  │
│  │ - /api/vehicle/lock                  │  │
│  │ - /api/vehicle/climate               │  │
│  │ - /api/vehicle/find                  │  │
│  │ - /api/vehicle/charge                │  │
│  └───────────┬──────────────────────────┘  │
│              │ MQTT (localhost:1883)       │
│              ▼                              │
│  ┌──────────────────────────────────────┐  │
│  │ Mosquitto MQTT Broker                │  │
│  │ - ACL-based access control           │  │
│  └───────────┬──────────────────────────┘  │
│              │                              │
│         ┌────┴────┐                         │
│         │         │                         │
│         ▼         ▼                         │
│  ┌──────────┐ ┌─────────────┐              │
│  │ SAIC     │ │ Ingestion   │──────────────┼──► Supabase
│  │ Gateway  │ │ Service     │              │
│  └────┬─────┘ └─────────────┘              │
└───────┼─────────────────────────────────────┘
        │
        ▼
   MG iSmart API
```

### Command System Architecture

For detailed command system documentation, including:
- Lock/Unlock commands
- Find My Car feature
- Climate control
- Charge control
- MQTT topic structure
- Authentication flow
- Troubleshooting guide

**See**: [`command-system.md`](/Users/markau/mtc-ismart/command-system.md)

---

## Database Schema

### Key Tables

#### `vehicles`
Master list of vehicles
```sql
vin TEXT PRIMARY KEY
label TEXT                    -- Friendly name
model TEXT                    -- Vehicle model
year INTEGER                  -- Manufacturing year
plate_number TEXT             -- License plate
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### `vehicle_status`
Latest status snapshot (1 row per VIN)
```sql
vin TEXT PRIMARY KEY
soc NUMERIC(5,2)             -- State of Charge %
range_km NUMERIC             -- Estimated range
charging_state TEXT          -- Idle|Charging|Complete
lat, lon NUMERIC             -- GPS coordinates
doors_locked BOOLEAN
door_driver_open BOOLEAN
door_passenger_open BOOLEAN
door_rear_left_open BOOLEAN
door_rear_right_open BOOLEAN
bonnet_closed BOOLEAN
boot_locked BOOLEAN
interior_temp_c NUMERIC
remote_temperature INTEGER  -- Target AC temp
hvac_state TEXT
heated_seat_front_left_level INTEGER
heated_seat_front_right_level INTEGER
rear_window_defrost BOOLEAN
lights_main_beam BOOLEAN
lights_dipped_beam BOOLEAN
lights_side BOOLEAN
ignition BOOLEAN
odometer_km NUMERIC
updated_at TIMESTAMPTZ
```

#### `vehicle_telemetry`
Historical time-series data
```sql
id BIGSERIAL PRIMARY KEY
vin TEXT
ts TIMESTAMPTZ
event_type TEXT              -- charge|location|vehicle_state
soc NUMERIC(5,2)
range_km NUMERIC
charging_state TEXT
charge_power_kw NUMERIC
lat, lon NUMERIC
raw_payload JSONB
```

#### `vehicle_commands`
Command audit log
```sql
id BIGSERIAL PRIMARY KEY
vin TEXT
command_type TEXT            -- lock|unlock|climate|charge|find
command_payload JSONB
status TEXT                  -- pending|sent|failed
error_message TEXT
created_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
```

#### `vehicle_events`
Event log for all vehicle activities
```sql
id BIGSERIAL PRIMARY KEY
vin TEXT REFERENCES vehicles(vin)
event_type TEXT              -- command_sent|command_completed|command_failed|status_change|alert|system
event_category TEXT          -- lock|climate|charge|find|telemetry|door|location
event_title TEXT             -- Human-readable title
event_description TEXT       -- Detailed description
metadata JSONB               -- Additional event data
severity TEXT                -- info|success|warning|error
created_at TIMESTAMPTZ
created_by TEXT              -- user_id or 'system'
```
Indexes: `vin`, `created_at`, `event_type`, `event_category`, `vin+created_at`

Automatic triggers log:
- Command events (sent, completed, failed) from `vehicle_commands`
- Status changes (lock/unlock, climate, charging) from `vehicle_status`
- Door alerts when doors open

---

## MQTT Topics

### Status Topics (Published by Gateway)

```
saic/<user>/vehicles/<vin>/drivetrain/soc
saic/<user>/vehicles/<vin>/drivetrain/range
saic/<user>/vehicles/<vin>/drivetrain/charging
saic/<user>/vehicles/<vin>/location/latitude
saic/<user>/vehicles/<vin>/location/longitude
saic/<user>/vehicles/<vin>/doors/locked
saic/<user>/vehicles/<vin>/doors/driver
saic/<user>/vehicles/<vin>/doors/passenger
saic/<user>/vehicles/<vin>/doors/rearLeft
saic/<user>/vehicles/<vin>/doors/rearRight
saic/<user>/vehicles/<vin>/doors/bonnet
saic/<user>/vehicles/<vin>/doors/boot
saic/<user>/vehicles/<vin>/climate/interiorTemperature
saic/<user>/vehicles/<vin>/climate/remoteTemperature
saic/<user>/vehicles/<vin>/climate/remoteClimateState
saic/<user>/vehicles/<vin>/climate/heatedSeatsFrontLeftLevel
saic/<user>/vehicles/<vin>/climate/heatedSeatsFrontRightLevel
saic/<user>/vehicles/<vin>/climate/rearWindowDefrosterHeating
saic/<user>/vehicles/<vin>/lights/mainBeam
saic/<user>/vehicles/<vin>/lights/dippedBeam
saic/<user>/vehicles/<vin>/lights/side
```

### Command Topics (Subscribed by Gateway)

```
saic/<user>/vehicles/<vin>/doors/locked/set [true|false]
saic/<user>/vehicles/<vin>/climate/remoteClimateState/set [on|off|front|blowingonly]
saic/<user>/vehicles/<vin>/climate/remoteTemperature/set [17-33]
saic/<user>/vehicles/<vin>/location/findMyCar/set [activate|lights_only|horn_only|stop]
saic/<user>/vehicles/<vin>/charging/start/set
saic/<user>/vehicles/<vin>/charging/stop/set
```

---

## API Endpoints

### Command API (Express.js - Port 8080)

**Base URL**: https://mtc-backend.run.app

#### `POST /api/vehicle/lock`
Lock or unlock vehicle
```json
{
  "vin": "LSJWH4098PN070110",
  "locked": true
}
```

#### `POST /api/vehicle/find`
Find My Car (horn, lights, or both)
```json
{
  "vin": "LSJWH4098PN070110",
  "mode": "activate"  // activate|lights_only|horn_only|stop
}
```

#### `POST /api/vehicle/climate`
Control climate
```json
{
  "vin": "LSJWH4098PN070110",
  "action": "on",
  "temperature": 22
}
```
Actions: `on`, `off`, `front`, `blowingonly`

#### `POST /api/vehicle/charge`
Control charging
```json
{
  "vin": "LSJWH4098PN070110",
  "action": "start"
}
```
Actions: `start`, `stop`

---

## Deployment

### Production Setup

#### Cloud Run (Backend)
- **Service**: mtc-backend
- **Region**: asia-east1 (Hong Kong)
- **URL**: https://mtc-backend.run.app
- **Container**: Ubuntu 24.04 with Supervisor
- **Services**:
  1. Mosquitto MQTT Broker (localhost:1883)
  2. SAIC Python Gateway
  3. Node.js Ingestion Service
  4. Express.js Command API (port 8080)
- **Resources**: 2GB RAM, 2 vCPU, min-instances=1

#### Vercel (Frontend)
- **URL**: https://mtc.air.zone
- **Region**: Hong Kong (hkg1)
- **Deployment**: Automatic from GitHub main branch
- **Project ID**: prj_045WS68YL0dtiPIGHtc5U7XhD95Q
- **Project Name**: mtc-ismart
- **Build Command**: `npm run build`
- **Output Directory**: `.next`

#### Supabase
- **URL**: https://sssyxnpanayqvamstind.supabase.co
- **Database**: PostgreSQL with Realtime
- **Connection**: Pooler URL for direct access

### Environment Variables

#### Command API (Cloud Run)
```bash
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=mtc_app
MQTT_PASSWORD=
SAIC_USER=system@air.city
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
PORT=8080
```

#### SAIC Gateway (Cloud Run)
```bash
MQTT_URI=tcp://localhost:1883
MQTT_USER=mg_gateway
MQTT_PASSWORD=
SAIC_USER=system@air.city
SAIC_PASSWORD=ac202303
SAIC_REST_URI=https://gateway-mg-eu.soimt.com/api.app/v1/
ACTIVE_QUERY_INTERVAL=5
SLEEP_QUERY_INTERVAL=5
INACTIVE_QUERY_INTERVAL=5
```

#### Ingestion Service (Cloud Run)
```bash
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=mtc_ingest
MQTT_PASSWORD=
SAIC_USER=system@air.city
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

#### Frontend (Vercel)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSyA8rDrxBzMRlgbA7BQ2DoY31gEXzZ4Ours
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=fac8d0a4b514e481e907fa98
BACKEND_API_URL=https://mtc-backend-880316754524.asia-east1.run.app
```

**Important**: When adding environment variables to Vercel, use `printf` instead of `echo` to avoid trailing newlines:
```bash
# ❌ Wrong - adds newline character
echo "value" | vercel env add VAR_NAME production

# ✅ Correct - no newline
printf "value" | vercel env add VAR_NAME production
```

Trailing newlines in environment variables will cause runtime errors, especially for values like Map IDs and API keys.

---

## Key Features

### Implemented & Working

- ✅ **Lock/Unlock**: Remote door lock control
- ✅ **Find My Car**: Horn and lights activation (4 modes)
- ✅ **Climate Control**: Remote HVAC management with temperature control
- ✅ **Charge Control**: Start/stop charging
- ✅ **Real-time Dashboard**: Live vehicle status updates
- ✅ **Location Services**: Google Maps reverse geocoding
- ✅ **Door Status**: Individual door/bonnet/boot monitoring
- ✅ **Light Status**: Main beam, dipped beam, side lights
- ✅ **Seat Heating**: Front left/right heated seat levels
- ✅ **Command Logging**: Full audit trail in database
- ✅ **MQTT ACL Security**: User-based access control
- ✅ **Multi-vehicle Support**: Manage multiple vehicles
- ✅ **Interactive Map View**: Google Maps with vehicle markers and real-time locations
- ✅ **Event Logs**: Comprehensive event tracking with filtering and real-time updates
- ✅ **Dark Mode**: Full dark mode support across all views

### Dashboard Features

#### Cars View
- Real-time vehicle data with Supabase subscriptions
- Battery status, range, temperature display
- Door/lock security alerts
- Light indicators
- Climate control status with target temperature
- Location display with street address
- Control buttons for lock, climate, find, charge
- Timestamp formatting with relative time
- License plate display as primary identifier

#### Map View
- Google Maps integration with vector tiles
- 3D map with tilt (45°) and rotation controls
- Interactive vehicle markers color-coded by battery level:
  - Green: SOC ≥ 80%
  - Yellow: SOC ≥ 50%
  - Orange: SOC ≥ 20%
  - Red: SOC < 20%
- Click markers to view vehicle details (battery, range, temperature, lock status)
- Auto-centering and zoom based on vehicle locations
- Pan, zoom, tilt, and rotate gestures enabled
- Full dark mode support with theme-responsive map tiles
- License plate displayed in InfoWindow popups

#### Logs View
- Real-time event log viewer with Supabase subscriptions
- Event categories: command, status_change, alert, system
- Event types: lock, climate, charge, find, telemetry, door, location
- Severity levels: info, success, warning, error
- Filter by vehicle, category, and severity
- Rich metadata display for each event
- Relative timestamps (e.g., "5m ago") and absolute timestamps
- Automatic event logging via database triggers:
  - Command events (sent, completed, failed)
  - Status changes (lock/unlock, climate, charging)
  - Door open alerts

### UI/UX Features
- Tabbed navigation: Cars, Map, Logs
- Responsive design (mobile, tablet, desktop)
- Dark mode with automatic theme detection
- Smooth transitions and animations
- Real-time updates across all views

---

## Development Workflow

### Starting the System Locally

```bash
# 1. Start MQTT broker and gateway
docker-compose up -d

# 2. Start ingestion service
npm run ingest

# 3. Start Next.js dev server
npm run dev

# 4. Open dashboard
open http://localhost:3000
```

### Monitoring

```bash
# View MQTT messages
docker exec mtc-mqtt-broker mosquitto_sub -t 'saic/#' -v

# View gateway logs
docker logs mtc-ismart-gateway --tail 50 -f

# View ingestion logs
tail -f /tmp/ingest.log

# Check database
psql "$POSTGRES_URL_NON_POOLING" -c "SELECT vin, doors_locked, soc, updated_at FROM vehicle_status;"
```

### Deployment

```bash
# Deploy to Cloud Run
gcloud builds submit --config cloudbuild.yaml
gcloud run deploy mtc-backend \
  --image=asia-east1-docker.pkg.dev/cityos-392102/mtc-containers/mtc-backend:latest \
  --region=asia-east1

# Deploy to Vercel (automatic)
git push origin main
```

---

## Key Files

### Backend
- `server/command-api.ts` - Express.js command API server
- `server/mqtt-client.ts` - MQTT connection management
- `server/ingest.ts` - MQTT to Supabase ingestion service

### Frontend
- `components/main-dashboard.tsx` - Main dashboard with tabbed navigation
- `components/vehicle-dashboard.tsx` - Original vehicle dashboard (legacy)
- `components/vehicle-cards-view.tsx` - Vehicle cards for Cars tab
- `components/map-view.tsx` - Google Maps view with vehicle markers
- `components/logs-view.tsx` - Event logs viewer with filtering
- `components/vehicle/` - Vehicle card subcomponents
- `hooks/use-vehicle.ts` - Real-time vehicle data hooks
- `hooks/use-vehicle-events.ts` - Real-time event logs hooks
- `lib/supabase.ts` - Supabase client configuration
- `lib/geocoding.ts` - Google Maps reverse geocoding

### Configuration
- `docker/cloud-run/Dockerfile.all-in-one` - Production container
- `docker/cloud-run/supervisord.conf` - Process management
- `docker/mosquitto/config/mosquitto-cloud.conf` - MQTT broker config
- `docker/mosquitto/config/acl` - MQTT access control list
- `cloudbuild.yaml` - Google Cloud Build configuration

### Database
- `supabase/migrations/001_vehicle_schema.sql` - Base schema
- `supabase/migrations/002_fix_rls_anon.sql` - RLS policies
- `supabase/migrations/003_add_door_columns.sql` - Door status
- `supabase/migrations/004_add_light_columns.sql` - Light indicators
- `supabase/migrations/005_add_climate_columns.sql` - Climate control
- `supabase/migrations/006_add_plate_number.sql` - License plates
- `supabase/migrations/007_add_vehicle_pin.sql` - Vehicle PIN storage
- `supabase/migrations/008_update_vehicle_models.sql` - Vehicle models
- `supabase/migrations/009_add_vehicle_events.sql` - Event logging system

---

## Security

### MQTT ACL

Access control configured for three users:

**mg_gateway** (SAIC Gateway):
- Read/write access to all vehicle topics
- Subscribes to command topics
- Publishes status updates

**mtc_app** (Command API):
- Write access to command topics
- Read access to status topics
- Cannot modify other data

**mtc_ingest** (Ingestion Service):
- Read-only access to all topics
- Writes to database, not MQTT

### Authentication Flow

1. **Command API → MQTT**: Uses `mtc_app` credentials (no password, local broker)
2. **MQTT → Gateway**: Local broker, no TLS needed (localhost)
3. **Gateway → SAIC API**: Uses account credentials (PIN configured at API level)
4. **SAIC API → Vehicle**: Cellular connection with encrypted communication

**Important**: No PIN is included in MQTT payload. PINs are configured at the SAIC API account level.

---

## Troubleshooting

### Commands Not Working

1. Check Command API logs for MQTT publish confirmation
2. Verify gateway logs show command received
3. Ensure `SAIC_USER` matches in both command-api and gateway
4. Check ACL permissions in `/docker/mosquitto/config/acl`
5. Verify command logged in `vehicle_commands` table

### No Data in Dashboard

1. Check if gateway is polling vehicles
2. Verify ingestion service is running
3. Query database directly for vehicle_status
4. Check Supabase Realtime is enabled
5. Verify RLS policies allow anonymous read

### MQTT Connection Issues

1. Check broker is running in Cloud Run logs
2. Verify ACL allows user to publish/subscribe
3. Test locally with `mosquitto_pub` and `mosquitto_sub`

### Vercel Deployment Issues

#### Map Not Rendering in Production
**Symptom**: Google Maps shows blank or doesn't load custom styling
**Cause**: Environment variable has trailing newline character
**Solution**:
```bash
# Remove the variable
vercel env rm NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID production --yes

# Re-add without newline using printf
printf "fac8d0a4b514e481e907fa98" | vercel env add NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID production

# Verify the value
vercel env pull .env.vercel.production
cat .env.vercel.production | grep MAP_ID
```

#### Build Fails with "Invalid Version" Error
**Symptom**: `npm install` fails with version validation error
**Cause**: Corrupted `package-lock.json` file
**Solution**:
```bash
# Remove package-lock.json (it's gitignored)
rm package-lock.json

# Trigger new deployment
git commit --allow-empty -m "Trigger rebuild"
git push origin main
```

#### Environment Variables Not Taking Effect
**Symptom**: Changes to env vars don't appear in production
**Solution**:
1. Environment variables are only loaded at build time for `NEXT_PUBLIC_*` variables
2. After changing env vars, trigger a new deployment:
   ```bash
   git commit --allow-empty -m "Rebuild with new env vars"
   git push origin main
   ```
3. Verify deployment status: `vercel ls`

### Managing Vercel Environment Variables

```bash
# List all environment variables
vercel env ls

# Add a new variable (use printf to avoid newlines!)
printf "your-value" | vercel env add VAR_NAME production

# Remove a variable
vercel env rm VAR_NAME production --yes

# Pull environment variables to local file
vercel env pull .env.vercel.production

# Check deployment status
vercel ls

# Inspect a specific deployment
vercel inspect <deployment-url>
```

For detailed troubleshooting, see [`command-system.md`](/Users/markau/mtc-ismart/command-system.md)

---

## Resources

- **Command System Documentation**: [command-system.md](command-system.md)
- **SAIC Gateway**: https://github.com/SAIC-iSmart-API/saic-python-mqtt-gateway
- **Supabase Docs**: https://supabase.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Mosquitto Docs**: https://mosquitto.org/man/mosquitto-conf-5.html
- **shadcn/ui**: https://ui.shadcn.com

---

## Project Status

**Started**: October 2025
**Status**: Production-ready and operational

### Verified Working (2025-11-03)
- Lock/Unlock commands
- Find My Car (all 4 modes)
- Climate control
- Charge control
- Real-time dashboard updates
- MQTT message routing
- Database ingestion
- Multi-vehicle support
- Interactive map view with real-time vehicle locations
- Event logging system with automatic triggers
- Dark mode across all views
- Tabbed navigation (Cars, Map, Logs)

### Recent Updates (2025-11-03)
- Added Google Maps integration with vector tiles and 3D controls
- Implemented event logging system with database triggers
- Added Logs view with filtering and real-time updates
- Implemented full dark mode support
- Added tabbed navigation UI
- Vehicle markers color-coded by battery level
- License plate displayed as primary identifier

---

*Last Updated: 2025-11-03*
