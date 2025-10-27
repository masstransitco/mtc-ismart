# MTC iSmart - Project Context

## Project Overview

A Next.js vehicle management system for monitoring and controlling MG iSmart electric vehicles via MQTT. The system integrates with the SAIC iSmart API through a Python gateway, stores telemetry in Supabase, and provides a real-time dashboard for fleet management.

**Repository**: https://github.com/masstransitco/mtc-ismart

---

## Architecture

### Technology Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **UI Framework**: shadcn/ui with Radix UI primitives, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Message Broker**: Eclipse Mosquitto MQTT
- **Vehicle Gateway**: SAIC Python MQTT Gateway (Docker)
- **Real-time**: Supabase Realtime subscriptions

### System Components

```
┌─────────────────┐
│  Next.js App    │ ← User Interface (Browser)
│  (Dashboard)    │
└────────┬────────┘
         │
    ┌────┴─────┐
    │          │
    ▼          ▼
┌─────────┐ ┌──────────────┐
│ API     │ │ Supabase DB  │
│ Routes  │ │ (PostgreSQL) │
└────┬────┘ └──────▲───────┘
     │             │
     │      ┌──────┴────────┐
     │      │ Ingestion     │
     │      │ Service       │
     │      └──────▲────────┘
     │             │
     ▼             │
┌─────────────────┴─┐
│ MQTT Broker       │
│ (Mosquitto)       │
└─────────▲─────────┘
          │
    ┌─────┴──────┐
    │ SAIC       │
    │ Gateway    │ ← Connects to MG iSmart API
    └────────────┘
```

---

## Implementation Status

### ✅ Completed Features

#### 1. Database Schema (Supabase)
- **Tables Created**:
  - `vehicles` - Master list of vehicles
  - `vehicle_status` - Latest status snapshot (1 row per VIN)
  - `vehicle_telemetry` - Historical time-series data
  - `vehicle_commands` - Audit log of sent commands
- **RLS Policies**: Configured for anonymous read access, service role write
- **Functions**: `upsert_vehicle_status()` for efficient updates
- **Indexes**: Optimized for queries on VIN, timestamp, event type

#### 2. MQTT Infrastructure
- **Mosquitto Broker**: Running on localhost:1883 (development mode)
- **Configuration**:
  - Development config without TLS (`mosquitto-dev.conf`)
  - Anonymous access enabled for initial testing
  - Production config available (`mosquitto.conf`) with TLS support
- **SAIC Gateway**:
  - ✅ Connected to MG iSmart API
  - ✅ Authenticated with credentials: system@air.city
  - ✅ Polling 5 vehicles (VINs: LSJWH4098PN070110, LSJWH409XPN070089, etc.)
  - ✅ Publishing vehicle data to MQTT topics

#### 3. Next.js Application
- **API Routes**:
  - `/api/vehicle/status` - Query vehicle status
  - `/api/vehicle/lock` - Lock/unlock commands
  - `/api/vehicle/climate` - Climate control
  - `/api/vehicle/charge` - Charging control
- **Components**:
  - `VehicleDashboard` - Main dashboard with vehicle list
  - shadcn/ui components (Button, Card, Badge, Toast, Tabs, etc.)
  - Theme provider with dark mode support
- **Hooks**:
  - `useVehicle(vin)` - Real-time vehicle data for single vehicle
  - `useVehicles()` - Real-time data for all vehicles with Supabase subscriptions
- **Features**:
  - Real-time updates via Supabase Realtime
  - Vehicle control buttons (lock, climate, charge)
  - Battery status, range, temperature display
  - Timestamp formatting with relative time

#### 4. MQTT Ingestion Service
- **Location**: `server/ingest.ts`
- **Functionality**:
  - Subscribes to MQTT topics: `saic/+/vehicles/+/status/#`, `mg/+/status/#`
  - Parses vehicle telemetry from MQTT messages
  - Writes to Supabase using service role key
  - Upserts vehicle_status for latest data
  - Inserts vehicle_telemetry for historical records
- **Status**: Code complete, requires manual start with `npm run ingest`

#### 5. Docker Setup
- **docker-compose.yml**: Orchestrates mosquitto + gateway
- **Services Running**:
  - `mtc-mqtt-broker` (eclipse-mosquitto:2) - Port 1883
  - `mtc-ismart-gateway` (saicismartapi/saic-python-mqtt-gateway)
- **Volumes**: Persistent data and logs
- **Networks**: Isolated bridge network
- **Health Checks**: Configured for both services

#### 6. Environment Configuration
- **Files**:
  - `.env.local` - Supabase credentials, MQTT config for app
  - `.env.mg` - iSmart API credentials for gateway
  - `.env.example` - Template for new deployments
- **Credentials Configured**:
  - Supabase: URL, anon key, service role key
  - iSmart: system@air.city / ac202303
  - MQTT: localhost:1883 (anonymous for dev)

#### 7. Build & Deployment
- ✅ Next.js build successful (no errors)
- ✅ TypeScript compilation passing
- ✅ All routes generated correctly
- ✅ Git repository initialized
- ✅ All code committed and pushed to GitHub

---

## Current State

### What's Working Right Now

1. **MQTT Broker**: Running and accepting connections on localhost:1883
2. **SAIC Gateway**: Connected to iSmart API, polling 5 vehicles every 30 seconds
3. **Database**: Schema deployed, tables created, RLS policies active
4. **Dashboard**: Built and ready to display vehicles
5. **API Routes**: Ready to receive commands and queries

### What Needs to be Started

1. **Ingestion Service**: Run `npm run ingest` to start writing vehicle data to database
2. **Dev Server**: Run `npm run dev` to access dashboard at http://localhost:3000

---

## Pending Tasks

### Immediate (To See Vehicles in Dashboard)

1. **Start Ingestion Service**
   ```bash
   npm run ingest
   ```
   - Will connect to MQTT and start writing vehicle data
   - Should populate vehicle_status table within 30-60 seconds
   - Monitor with: `tail -f /tmp/ingest.log`

2. **Start Dashboard**
   ```bash
   npm run dev
   ```
   - Open http://localhost:3000
   - Vehicles will appear as data is ingested

3. **Populate Vehicle Metadata**
   ```sql
   -- Add friendly labels to vehicles
   INSERT INTO vehicles (vin, label, model, year) VALUES
   ('LSJWH4098PN070110', 'Vehicle 1', 'MG4 Electric', 2024),
   ('LSJWH409XPN070089', 'Vehicle 2', 'MG4 Electric', 2024);
   ```

### Short-term Enhancements

#### Security
- [ ] Create MQTT user passwords (currently anonymous)
  ```bash
  cd docker/mosquitto/config
  mosquitto_passwd -c passwd mg_gateway
  mosquitto_passwd passwd mtc_app
  mosquitto_passwd passwd mtc_ingest
  ```
- [ ] Update mosquitto config to require authentication
- [ ] Restart mosquitto and update .env files with passwords

#### Production Readiness
- [ ] Generate TLS certificates for MQTT broker
  - Use Let's Encrypt or Cloudflare Origin Certificates
  - Update mosquitto.conf to use TLS listener on port 8883
- [ ] Configure production domains:
  - mqtt.masstransit.hk (MQTT broker)
  - api.masstransit.hk (Next.js API)
- [ ] Test AU endpoint if EU endpoint has issues
  - Change SAIC_REST_URI in .env.mg
  - Monitor gateway logs for authentication

#### Dashboard Improvements
- [ ] Add map view for vehicle locations
  - Integrate Google Maps or Mapbox
  - Show markers for each vehicle
  - Display current position and route history
- [ ] Add vehicle details modal
  - Full telemetry display
  - Command history
  - Battery charge curve
  - Location history timeline
- [ ] Add filters and search
  - Filter by charging state
  - Search by VIN or label
  - Sort by battery level, location, etc.
- [ ] Add charts and analytics
  - Battery level over time
  - Charging sessions history
  - Distance traveled
  - Energy consumption

#### Features
- [ ] Implement authentication
  - Add Supabase Auth
  - Create login/signup pages
  - Update RLS policies for authenticated users
  - Add user management
- [ ] Command scheduling
  - Schedule climate pre-conditioning
  - Schedule charging windows
  - Recurring commands
- [ ] Notifications
  - Set up Firebase Cloud Messaging
  - Alert on low battery
  - Alert on charging complete
  - Alert on vehicle movement
  - Alert on doors unlocked
- [ ] Multi-tenant support
  - Associate vehicles with organizations
  - Role-based access control
  - Separate dashboards per tenant

#### Integrations
- [ ] ABRP (A Better Route Planner)
  - Configure ABRP_USER_TOKEN in .env.mg
  - Enable telemetry forwarding
  - Add route planning links in dashboard
- [ ] Home Assistant
  - Already publishing HA discovery messages
  - Document HA integration setup
- [ ] OsmAnd/Traccar
  - Configure OSMAND_SERVER_URI
  - Enable fleet tracking integration

#### Operations
- [ ] Add logging and monitoring
  - Structured logging with timestamps
  - Error tracking with Sentry
  - Performance monitoring
  - MQTT message metrics
- [ ] Add health check endpoints
  - `/api/health` - Overall system health
  - Check MQTT connection
  - Check Supabase connection
  - Check gateway status
- [ ] Add backup and recovery
  - Automated database backups
  - MQTT message replay capability
  - Disaster recovery procedures
- [ ] Documentation
  - API documentation
  - Deployment guide
  - Operations runbook
  - Troubleshooting guide

---

## Known Issues

### Minor Issues

1. **Punycode Deprecation Warning**
   - Shows during build
   - Coming from a dependency
   - No impact on functionality
   - Will be fixed when dependencies update

2. **Multiple Lockfiles Warning**
   - Next.js detects parent directory lockfile
   - Can be silenced by setting `turbopack.root` in next.config.ts
   - No functional impact

### Resolved Issues

- ✅ RLS policies blocking anon queries - Fixed with migration 002
- ✅ MQTT URI scheme error - Changed from mqtt:// to tcp://
- ✅ Docker image not found - Changed from ghcr.io to Docker Hub
- ✅ Environment variables not loading - Added dotenv support

---

## Development Workflow

### Starting the System

```bash
# 1. Ensure Docker is running
open -a Docker

# 2. Start MQTT broker and gateway
docker-compose up -d

# 3. Start ingestion service (in one terminal)
npm run ingest

# 4. Start Next.js dev server (in another terminal)
npm run dev

# 5. Open dashboard
open http://localhost:3000
```

### Monitoring Services

```bash
# Check Docker containers
docker ps

# View MQTT broker logs
docker logs mtc-mqtt-broker --tail 50

# View SAIC gateway logs
docker logs mtc-ismart-gateway --tail 50

# View ingestion service logs
tail -f /tmp/ingest.log

# Check database contents
psql "$POSTGRES_URL_NON_POOLING" -c "SELECT vin, soc, range_km, updated_at FROM vehicle_status;"
```

### Making Changes

```bash
# 1. Make code changes
# 2. Test locally
npm run build  # Verify build works
npm run dev    # Test in browser

# 3. Commit changes
git add -A
git commit -m "Your commit message"
git push
```

---

## Configuration Files

### Key Files

- `docker-compose.yml` - Docker services orchestration
- `docker/mosquitto/config/mosquitto-dev.conf` - MQTT broker dev config
- `docker/mosquitto/config/mosquitto.conf` - MQTT broker production config
- `.env.local` - Next.js and ingestion service environment
- `.env.mg` - SAIC gateway environment
- `supabase/migrations/001_vehicle_schema.sql` - Database schema
- `supabase/migrations/002_fix_rls_anon.sql` - RLS policy updates

### Environment Variables

#### .env.local (Next.js + Ingestion)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://sssyxnpanayqvamstind.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
POSTGRES_URL_NON_POOLING=postgres://...
MQTT_BROKER_URL=mqtt://localhost:1883
```

#### .env.mg (SAIC Gateway)
```bash
MQTT_URI=tcp://mosquitto:1883
SAIC_USER=system@air.city
SAIC_PASSWORD=ac202303
SAIC_REST_URI=https://gateway-mg-eu.soimt.com/api.app/v1/
SAIC_REGION=eu
```

---

## Database Schema

### Tables

#### vehicles
Master list of vehicles
```sql
vin TEXT PRIMARY KEY
label TEXT                 -- Friendly name
model TEXT                 -- Vehicle model
year INTEGER              -- Manufacturing year
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

#### vehicle_status
Latest status snapshot (1 row per VIN)
```sql
vin TEXT PRIMARY KEY
soc NUMERIC(5,2)          -- State of Charge %
range_km NUMERIC          -- Estimated range
charging_state TEXT       -- Idle|Charging|Complete
lat, lon NUMERIC          -- GPS coordinates
doors_locked BOOLEAN
interior_temp_c NUMERIC
hvac_state TEXT
ignition BOOLEAN
odometer_km NUMERIC
updated_at TIMESTAMPTZ
```

#### vehicle_telemetry
Historical time-series data
```sql
id BIGSERIAL PRIMARY KEY
vin TEXT
ts TIMESTAMPTZ
event_type TEXT           -- charge|location|vehicle_state
soc NUMERIC(5,2)
range_km NUMERIC
charging_state TEXT
charge_power_kw NUMERIC
lat, lon NUMERIC
raw_payload JSONB
```

#### vehicle_commands
Command audit log
```sql
id BIGSERIAL PRIMARY KEY
vin TEXT
command_type TEXT         -- lock|unlock|climate|charge
command_payload JSONB
status TEXT              -- pending|sent|success|failed
error_message TEXT
requested_at TIMESTAMPTZ
completed_at TIMESTAMPTZ
```

---

## MQTT Topics

### Published by Gateway (Status)

```
saic/<user>/vehicles/<vin>/status/basic
saic/<user>/vehicles/<vin>/status/charge
saic/<user>/vehicles/<vin>/status/location
saic/<user>/vehicles/<vin>/status/climate
saic/<user>/vehicles/<vin>/events/vehicle_alarm
```

### Subscribed by Gateway (Commands)

```
saic/<user>/vehicles/<vin>/cmd/doors/locked/set
saic/<user>/vehicles/<vin>/cmd/climate/remoteClimateState/set
saic/<user>/vehicles/<vin>/cmd/drivetrain/charging/set
saic/<user>/vehicles/<vin>/cmd/drivetrain/socTarget/set
```

---

## API Endpoints

### GET /api/vehicle/status
Get vehicle status
- Query params: `?vin=LSJWH...` (optional)
- Returns: Vehicle status with metadata

### POST /api/vehicle/lock
Lock or unlock vehicle
```json
{
  "vin": "LSJWH4098PN070110",
  "locked": true
}
```

### POST /api/vehicle/climate
Control climate
```json
{
  "vin": "LSJWH4098PN070110",
  "action": "on",
  "temperature": 22
}
```
Actions: `on`, `off`, `front`, `blowingonly`

### POST /api/vehicle/charge
Control charging
```json
{
  "vin": "LSJWH4098PN070110",
  "action": "start"
}
```
Actions: `start`, `stop`, `setTarget`, `setLimit`

---

## Troubleshooting

### SAIC Gateway Not Connecting
1. Check logs: `docker logs mtc-ismart-gateway`
2. Verify credentials in .env.mg
3. Try AU endpoint if EU fails
4. Check if iSmart app works (session conflict)

### No Vehicles in Dashboard
1. Check if gateway is running: `docker ps`
2. Verify gateway logs show vehicles
3. Check if ingestion service is running: `ps aux | grep ingest`
4. Query database directly to see if data exists

### MQTT Connection Issues
1. Check broker is running: `docker logs mtc-mqtt-broker`
2. Test connection: `mosquitto_sub -h localhost -p 1883 -t '#' -v`
3. Verify firewall not blocking port 1883

### Build Errors
1. Clean node_modules: `rm -rf node_modules && npm install`
2. Clear Next.js cache: `rm -rf .next`
3. Rebuild: `npm run build`

---

## Resources

- **SAIC Gateway**: https://github.com/SAIC-iSmart-API/saic-python-mqtt-gateway
- **Supabase Docs**: https://supabase.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Mosquitto Docs**: https://mosquitto.org/man/mosquitto-conf-5.html
- **shadcn/ui**: https://ui.shadcn.com

---

## Team

**Project**: MTC iSmart Fleet Management
**Started**: October 27, 2025
**Repository**: https://github.com/masstransitco/mtc-ismart
**Status**: Core system operational, ready for production deployment

---

*Last Updated: October 27, 2025*
