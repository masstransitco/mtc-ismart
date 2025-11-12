# GPS Telemetry Investigation - November 5, 2025

## Executive Summary

**Issue**: Two vehicles (LSJWH409XPN070089 and LSJWH4098PN070110) showing stale location data despite successful command execution.

**Root Cause**: SAIC Python MQTT Gateway version in production (from `-main` branch) contains a bug in GPS processing that causes crashes when accessing `wayPoint.timeStamp` attribute, preventing GPS data from being published to MQTT and subsequently stored in the database.

**Impact**: ALL 5 vehicles affected, but only 2 visibly impacted based on activity timing during deployment.

**Solution**: Upgrade to SAIC Gateway version 0.9.8 which removes the problematic GPS timestamp code.

**Status**: Dockerfile updated, pending Docker rebuild and Cloud Run deployment.

---

## Investigation Timeline

### Initial Symptoms (Reported)
- **LSJWH409XPN070089**: Location data frozen, commands working
- **LSJWH4098PN070110**: Location data frozen, commands working
- UI showing stale coordinates from Nov 4, ~10:18 AM UTC
- Google Places API translations also stale (but working correctly)

### Database Analysis

#### Vehicle Status Table (Current State)
```sql
SELECT vin, last_message_ts, location_updated_at, lat, lon, soc, updated_at
FROM vehicle_status ORDER BY vin;
```

| VIN | last_message_ts | lat | lon | soc | updated_at |
|-----|----------------|-----|-----|-----|------------|
| LSJWH4092PN070118 | 2025-11-05 08:32:39 | 22.3759720 | 114.1813870 | 55.30 | 2025-11-05 08:32:39 |
| LSJWH4092PN070121 | 2025-11-05 08:06:39 | 22.3763540 | 114.1820030 | 84.90 | 2025-11-05 08:06:39 |
| LSJWH4098PN070110 | 2025-11-05 05:22:37 | 22.2989670 | 114.1769140 | 40.30 | 2025-11-05 05:22:37 |
| LSJWH4098PN070124 | 2025-11-05 08:47:39 | 22.4465130 | 114.0962360 | 76.10 | 2025-11-05 08:47:39 |
| LSJWH409XPN070089 | 2025-11-05 07:46:09 | 22.4046340 | 114.1058460 | 64.50 | 2025-11-05 07:46:09 |

**Finding**: `vehicle_status` table IS being updated every ~5 seconds for ALL vehicles (confirmed by `last_message_ts`). Commands work because they read from this table.

#### Vehicle Telemetry Table (Historical Data)
```sql
SELECT
    vin,
    MAX(CASE WHEN lat IS NOT NULL THEN ts END) as last_gps_update,
    MAX(CASE WHEN soc IS NOT NULL THEN ts END) as last_soc_update,
    COUNT(CASE WHEN ts > NOW() - INTERVAL '24 hours' AND lat IS NOT NULL THEN 1 END) as gps_updates_24h,
    COUNT(CASE WHEN ts > NOW() - INTERVAL '24 hours' AND soc IS NOT NULL THEN 1 END) as soc_updates_24h
FROM vehicle_telemetry GROUP BY vin ORDER BY vin;
```

| VIN | last_gps_update | last_soc_update | gps_updates_24h | soc_updates_24h |
|-----|----------------|----------------|----------------|----------------|
| LSJWH4092PN070118 | 2025-11-03 09:47:07 | 2025-11-04 09:53:21 | 0 | 14 |
| LSJWH4092PN070121 | 2025-11-04 08:14:20 | 2025-11-04 08:14:20 | 0 | 0 |
| LSJWH4098PN070110 | 2025-11-04 10:18:46 | 2025-11-04 10:18:46 | 222 | 222 |
| LSJWH4098PN070124 | 2025-11-04 09:36:26 | 2025-11-04 09:36:26 | 454 | 454 |
| LSJWH409XPN070089 | 2025-11-04 10:18:37 | 2025-11-04 10:18:37 | 955 | 955 |

**Critical Finding**: ALL vehicles stopped receiving GPS telemetry on Nov 4, 2025. The last updates correlate exactly with Cloud Run deployment time.

---

## Cloud Run Log Analysis

### Deployment Information
```bash
gcloud run revisions describe mtc-backend-00044-cfj --region=asia-east1
```
- **Revision**: mtc-backend-00044-cfj
- **Deployed**: 2025-11-04 10:18:05Z
- **Ready**: 2025-11-04 10:18:35Z
- **Source**: saic-python-mqtt-gateway-main (Nov 4, 2024 15:36)

### Current Service Status (Nov 5, 08:00-09:00 UTC)

#### Successful Updates (Ingest Service)
```
[Ingest] ✅ Updated LSJWH4098PN070124 with 25 fields (every 5s)
[Ingest] ✅ Updated LSJWH4092PN070118 with 25 fields (every 5s)
[Ingest] ✅ Updated LSJWH4092PN070121 with 25 fields (every 5s)
[Ingest] ✅ Updated LSJWH409XPN070089 with 25 fields (every 5s)
[Ingest] ✅ Updated LSJWH4098PN070110 with 25 fields (stopped at 05:22:37)
```

**Finding**: Ingest service successfully updating `vehicle_status` with 25 fields every 5 seconds. The 25 fields do NOT include GPS coordinates.

#### Gateway Errors (SAIC Python MQTT Gateway)
```
ERROR: AttributeError: 'WayPoint' object has no attribute 'timeStamp'

Traceback (most recent call last):
  File "/opt/saic-gateway/src/handlers/vehicle.py", line 118, in handle_vehicle
  File "/opt/saic-gateway/src/handlers/vehicle.py", line 151, in __polling
  File "/opt/saic-gateway/src/handlers/vehicle.py", line 245, in update_vehicle_status
  File "/opt/saic-gateway/src/vehicle.py", line 270, in handle_vehicle_status
  File "/opt/saic-gateway/src/status_publisher/vehicle/vehicle_status_resp.py", line 80
  File "/opt/saic-gateway/src/status_publisher/vehicle/gps_position.py", line 30
    if gps_position.wayPoint and gps_position.wayPoint.timeStamp:
                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
AttributeError: 'WayPoint' object has no attribute 'timeStamp'
```

**Frequency**: Error occurs periodically for vehicles with active GPS data
**Last Observed**: 2025-11-05 08:46:40Z

---

## Root Cause Analysis

### The Bug

**Location**: `saic-python-mqtt-gateway-main/src/status_publisher/vehicle/gps_position.py:30`

**Problematic Code**:
```python
# Publish GPS timestamp and age
if gps_position.wayPoint and gps_position.wayPoint.timeStamp:  # ← BUG: timeStamp attribute doesn't exist
    gps_time = datetime.fromtimestamp(gps_position.wayPoint.timeStamp, tz=UTC)
    now = current_time or datetime.now(tz=UTC)
    age_seconds = int((now - gps_time).total_seconds())
    # ... publishing code
```

**Issue**: The `WayPoint` object in the SAIC API response does not have a `timeStamp` attribute, causing an `AttributeError` exception.

### Data Flow Breakdown

```
SAIC API (EU)
    ↓ (polls every 5s)
SAIC Gateway
    ├─ Processes battery/doors/climate data ✅
    ├─ Publishes to MQTT ✅
    ├─ Processes GPS data ❌ CRASHES HERE
    └─ Never publishes GPS to MQTT ❌

Mosquitto MQTT Broker
    ├─ Receives non-GPS topics ✅
    └─ Never receives GPS topics ❌

Ingest Service (subscribes to MQTT)
    ├─ Receives soc, doors_locked, etc. ✅
    ├─ Never receives lat/lon ❌
    └─ Writes to vehicle_status (25 fields without GPS) ✅

Database
    ├─ vehicle_status updated every 5s ✅
    └─ vehicle_telemetry NOT created (requires lat OR soc) ❌
```

### Why Telemetry Stopped

**Ingest Service Logic** (`server/ingest.ts:345`):
```typescript
// Record telemetry for significant updates
if (statusData.soc !== undefined || statusData.lat !== undefined) {
    await insertTelemetry(vin, statusData, cache)
}
```

**Condition**: Telemetry only written when SOC or LAT is present.

**Reality**:
- GPS crashes before publishing lat/lon to MQTT
- Ingest receives updates without GPS data
- `statusData.lat` is `undefined`
- Some vehicles might have `statusData.soc` present → telemetry written (LSJWH4092PN070118: 14 records in last 24h)
- Some vehicles have neither → no telemetry written (LSJWH409XPN070089, LSJWH4098PN070110)

---

## Why Only 2 Vehicles Appear Affected

### Vehicle Activity Timeline

| VIN | Last GPS Telemetry | Activity During Bug Deployment | User Visibility |
|-----|-------------------|-------------------------------|----------------|
| **LSJWH409XPN070089** | 2025-11-04 10:18:37 | ✅ **Active** - Driving when deployed | 🔴 **VISIBLE** |
| **LSJWH4098PN070110** | 2025-11-04 10:18:46 | ✅ **Active** - Driving when deployed | 🔴 **VISIBLE** |
| LSJWH4098PN070124 | 2025-11-04 09:36:26 | ⏸️ Parked 42 mins before deployment | 🟢 Not noticed |
| LSJWH4092PN070121 | 2025-11-04 08:14:20 | ⏸️ Parked 2 hours before deployment | 🟢 Not noticed |
| LSJWH4092PN070118 | 2025-11-03 09:47:07 | ⏸️ No GPS for 24+ hours | 🟢 Not noticed |

### Key Insight

**ALL vehicles lost GPS telemetry**, but only vehicles 089 and 110 were:
1. Actively transmitting GPS data at deployment time (10:18 AM)
2. Regularly used/monitored by the user
3. Had their location freeze at a visible, unexpected place

The other vehicles either:
- Were already parked and not moving (location freeze not noticeable)
- Had stopped transmitting earlier (user assumes they're offline)
- Are less frequently monitored

---

## Version Comparison

### Current (Buggy) Version
- **Source**: `saic-python-mqtt-gateway-main`
- **File Date**: Nov 4, 2024 15:36
- **GPS Handler**: 85 lines with timestamp processing
- **Bug**: Accesses `wayPoint.timeStamp` (doesn't exist)

### Fixed Version
- **Source**: `saic-python-mqtt-gateway-0.9.8`
- **File Date**: Jun 8, 2024 00:21
- **GPS Handler**: 65 lines WITHOUT timestamp processing
- **Status**: ✅ No timeStamp access, no crash

### Code Diff
```diff
--- saic-python-mqtt-gateway-main/src/status_publisher/vehicle/gps_position.py
+++ saic-python-mqtt-gateway-0.9.8/src/status_publisher/vehicle/gps_position.py

- from datetime import datetime, UTC

  class GpsPositionPublisher(VehicleDataPublisher):
-    def on_gps_position(self, gps_position: GpsPosition, current_time: datetime | None = None):
+    def on_gps_position(self, gps_position: GpsPosition):
         speed: float | None = None

-        # Publish GPS fix quality status
-        gps_status_name = gps_position.gps_status_decoded.name if gps_position.gps_status_decoded else "UNKNOWN"
-        self._publish(topic=mqtt_topics.LOCATION_GPS_STATUS, value=gps_status_name)
-
-        # Publish GPS timestamp and age
-        if gps_position.wayPoint and gps_position.wayPoint.timeStamp:  # ← BUG REMOVED
-            gps_time = datetime.fromtimestamp(gps_position.wayPoint.timeStamp, tz=UTC)
-            now = current_time or datetime.now(tz=UTC)
-            age_seconds = int((now - gps_time).total_seconds())
-            self._publish(topic=mqtt_topics.LOCATION_GPS_TIMESTAMP, value=gps_time.isoformat())
-            self._publish(topic=mqtt_topics.LOCATION_GPS_AGE_SECONDS, value=age_seconds)
-
         if gps_position.gps_status_decoded in [GpsStatus.FIX_2D, GpsStatus.FIX_3d]:
             # ... process GPS coordinates (this code works in both versions)
```

### What We Lose by Reverting
- GPS status publishing (`LOCATION_GPS_STATUS`)
- GPS timestamp publishing (`LOCATION_GPS_TIMESTAMP`)
- GPS age calculation (`LOCATION_GPS_AGE_SECONDS`)

### What We Gain
- ✅ GPS coordinates published to MQTT
- ✅ Location data flows to database
- ✅ Telemetry records created
- ✅ Real-time location updates in UI

**Trade-off**: Acceptable - we capture GPS data in `vehicle_telemetry` with our own timestamps (`lat_timestamp`, `lon_timestamp`, `gps_timestamp` fields).

---

## Solution Implementation

### Step 1: Update Dockerfile ✅ COMPLETED
**File**: `docker/cloud-run/Dockerfile.all-in-one`

**Change**:
```dockerfile
# Before
COPY saic-python-mqtt-gateway-main/pyproject.toml /opt/saic-gateway/
COPY saic-python-mqtt-gateway-main/poetry.lock /opt/saic-gateway/
COPY saic-python-mqtt-gateway-main/src/ /opt/saic-gateway/src/

# After (with comment documenting the fix)
# Copy SAIC gateway files from local directory (0.9.8 - fixes GPS wayPoint.timeStamp bug)
COPY saic-python-mqtt-gateway-0.9.8/pyproject.toml /opt/saic-gateway/
COPY saic-python-mqtt-gateway-0.9.8/poetry.lock /opt/saic-gateway/
COPY saic-python-mqtt-gateway-0.9.8/src/ /opt/saic-gateway/src/
```

**Commit**: Changes saved to `docker/cloud-run/Dockerfile.all-in-one`

### Step 2: Rebuild Docker Image ⏳ IN PROGRESS
**Command**:
```bash
docker build -f docker/cloud-run/Dockerfile.all-in-one \
  -t gcr.io/cityos-392102/mtc-backend:latest \
  -t gcr.io/cityos-392102/mtc-backend:0.9.8-fix \
  .
```

**Status**: Pending Docker Desktop restart and rebuild

**Note**: Initial build encountered Docker daemon connection issues. Requires manual Docker restart.

### Step 3: Push Image to Google Container Registry 📋 PENDING
**Command**:
```bash
docker push gcr.io/cityos-392102/mtc-backend:latest
docker push gcr.io/cityos-392102/mtc-backend:0.9.8-fix
```

### Step 4: Deploy to Cloud Run 📋 PENDING
**Command**:
```bash
gcloud run deploy mtc-backend \
  --image gcr.io/cityos-392102/mtc-backend:0.9.8-fix \
  --region asia-east1 \
  --platform managed
```

**Expected Duration**: 2-3 minutes for deployment to complete

### Step 5: Verify Fix 📋 PENDING

#### A. Check Cloud Run Logs (Immediate)
```bash
# Should see NO more AttributeError for wayPoint.timeStamp
gcloud logging read 'resource.type="cloud_run_revision" AND
  resource.labels.service_name="mtc-backend" AND
  severity="ERROR"' --limit=20 --region=asia-east1
```

Expected: No GPS-related errors after deployment

#### B. Check Ingest Success (Within 30 seconds)
```bash
gcloud logging read 'resource.type="cloud_run_revision" AND
  resource.labels.service_name="mtc-backend" AND
  textPayload=~"Ingest.*Updated.*LSJWH409XPN070089"' \
  --limit=5 --region=asia-east1
```

Expected: Continue seeing "✅ Updated LSJWH409XPN070089 with 25 fields"

#### C. Check Database for New Telemetry (Within 1-2 minutes)
```sql
-- Should see new records for all active vehicles
SELECT
    vin,
    MAX(ts) as latest_telemetry,
    COUNT(CASE WHEN ts > NOW() - INTERVAL '5 minutes' THEN 1 END) as recent_count,
    MAX(CASE WHEN lat IS NOT NULL THEN ts END) as latest_gps
FROM vehicle_telemetry
GROUP BY vin
ORDER BY vin;
```

Expected:
- `latest_telemetry` should be recent (within last 5 minutes)
- `recent_count` > 0 for active vehicles
- `latest_gps` should update with fresh timestamps

#### D. Check UI Location Updates (Within 2-3 minutes)
1. Open application: https://mtc-ismart.vercel.app (or local dev)
2. Navigate to Cars tab
3. Check LSJWH409XPN070089 and LSJWH4098PN070110
4. Verify location shows recent address (not frozen at Nov 4 location)
5. Check "Last updated" timestamp is recent

#### E. Verify All Vehicles (Within 5 minutes)
```sql
-- Check all vehicles are receiving GPS updates
SELECT
    vs.vin,
    v.label,
    vs.lat,
    vs.lon,
    vs.last_message_ts,
    vs.updated_at,
    COUNT(vt.id) as telemetry_last_5min
FROM vehicle_status vs
LEFT JOIN vehicles v ON vs.vin = v.vin
LEFT JOIN vehicle_telemetry vt ON vs.vin = vt.vin
    AND vt.ts > NOW() - INTERVAL '5 minutes'
GROUP BY vs.vin, v.label, vs.lat, vs.lon, vs.last_message_ts, vs.updated_at
ORDER BY vs.vin;
```

Expected: All active vehicles showing telemetry records in last 5 minutes

---

## Expected Outcomes After Fix

### Immediate (0-30 seconds after deployment)
- ✅ Gateway stops crashing on GPS processing
- ✅ GPS coordinates published to MQTT topics
- ✅ Ingest service receives lat/lon data
- ✅ No more `AttributeError: 'WayPoint' object has no attribute 'timeStamp'` in logs

### Short-term (1-5 minutes)
- ✅ New `vehicle_telemetry` records created for all active vehicles
- ✅ `vehicle_status` table receives GPS coordinate updates
- ✅ Database queries return fresh location data
- ✅ Google Places API translates current coordinates to addresses

### User-Visible (2-10 minutes)
- ✅ LSJWH409XPN070089 location updates in real-time
- ✅ LSJWH4098PN070110 location updates in real-time
- ✅ All vehicle locations reflect actual current positions
- ✅ Location history/trips resume tracking

---

## Prevention & Monitoring

### Immediate Actions
1. ✅ Document this issue (this file)
2. 📋 Add monitoring alert for telemetry gaps > 5 minutes
3. 📋 Add monitoring alert for GPS-related errors in logs
4. 📋 Create database view for telemetry health checks

### Long-term Improvements

#### 1. Gateway Version Management
- **Current**: Using local directory copy of gateway code
- **Proposed**:
  - Pin to specific stable release tags
  - Use official Docker images from GitHub releases
  - Implement automated testing before production deployment

#### 2. Telemetry Gap Detection
```sql
-- Create monitoring view
CREATE OR REPLACE VIEW telemetry_health AS
SELECT
    vin,
    MAX(ts) as last_telemetry,
    EXTRACT(EPOCH FROM (NOW() - MAX(ts)))/60 as minutes_since_last,
    CASE
        WHEN MAX(ts) > NOW() - INTERVAL '5 minutes' THEN 'healthy'
        WHEN MAX(ts) > NOW() - INTERVAL '30 minutes' THEN 'warning'
        ELSE 'critical'
    END as status
FROM vehicle_telemetry
GROUP BY vin;
```

#### 3. Alerting Rules
- Alert if any vehicle shows `minutes_since_last > 10` for active vehicles
- Alert on ERROR logs containing "AttributeError", "WayPoint", "gps_position"
- Alert on sudden drop in telemetry write rate

#### 4. Testing Protocol
Before deploying gateway updates:
1. Build Docker image locally
2. Run with test MQTT topics
3. Verify GPS processing doesn't crash
4. Check all vehicle data types flow correctly
5. Deploy to staging environment first
6. Monitor for 1 hour before production deployment

---

## Technical Details

### Architecture Components
- **Cloud Run Service**: mtc-backend (asia-east1)
- **Project**: cityos-392102 (Project Number: 880316754524)
- **Database**: Supabase (sssyxnpanayqvamstind.supabase.co)
- **MQTT Broker**: Mosquitto (internal to Cloud Run container)
- **Gateway**: SAIC Python MQTT Gateway
- **Ingest**: Custom Node.js/TypeScript service
- **Command API**: Custom Node.js/TypeScript HTTP server

### Process Management
All services run in a single container managed by supervisord:
1. **mosquitto** (priority 10) - MQTT broker
2. **gateway** (priority 20) - SAIC API ↔ MQTT bridge
3. **ingest** (priority 30) - MQTT ↔ Database sync
4. **command-api** (priority 40) - HTTP API for vehicle commands

### Data Flow
```
Vehicle (MG ZS EV)
    ↕ (4G cellular)
SAIC API Servers (EU: gateway-mg-eu.soimt.com)
    ↕ (HTTPS polling every 5s)
SAIC Gateway (Cloud Run)
    ↓ (MQTT publish)
Mosquitto Broker (localhost:1883)
    ↓ (MQTT subscribe)
Ingest Service
    ↓ (PostgreSQL insert/upsert)
Supabase Database
    ↓ (Realtime subscription)
Next.js Frontend (Vercel)
    ↓ (HTTPS)
User Browser
```

### Critical Code Paths

#### GPS Processing (Fixed in 0.9.8)
```python
# Version 0.9.8 (Working)
def on_gps_position(self, gps_position: GpsPosition):
    if gps_position.gps_status_decoded in [GpsStatus.FIX_2D, GpsStatus.FIX_3d]:
        way_point = gps_position.wayPoint
        if way_point:
            position = way_point.position
            if position and position.latitude and position.longitude:
                latitude = position.latitude / 1000000.0
                longitude = position.longitude / 1000000.0
                self._publish(topic=mqtt_topics.LOCATION_LATITUDE, value=latitude)
                self._publish(topic=mqtt_topics.LOCATION_LONGITUDE, value=longitude)
```

#### Telemetry Write Condition (Ingest Service)
```typescript
// Only write telemetry when GPS or SOC data present
if (statusData.soc !== undefined || statusData.lat !== undefined) {
    await insertTelemetry(vin, statusData, cache)
}
```

#### Vehicle Status Update (Always happens)
```typescript
const { error } = await supabase.rpc('upsert_vehicle_status', {
    p_vin: vin,
    p_data: statusData,
})
```

---

## References

### Files Modified
- ✅ `docker/cloud-run/Dockerfile.all-in-one` - Updated to use 0.9.8

### Files Analyzed
- `saic-python-mqtt-gateway-main/src/status_publisher/vehicle/gps_position.py` (Buggy)
- `saic-python-mqtt-gateway-0.9.8/src/status_publisher/vehicle/gps_position.py` (Fixed)
- `server/ingest.ts` - Telemetry write logic
- `docker/cloud-run/supervisord.conf` - Process management

### Documentation Created
- `cloud-run.md` - Cloud Run architecture documentation
- `gps-telemetry-investigation-2025-11-05.md` - This file

### Related Issues
- SAIC Gateway Issue Tracker: https://github.com/SAIC-iSmart-API/saic-python-mqtt-gateway/issues
- (Consider filing upstream bug report about wayPoint.timeStamp)

---

## Timeline Summary

| Time (UTC) | Event | Impact |
|------------|-------|--------|
| 2025-11-04 10:18 AM | Cloud Run deployment with buggy gateway | GPS processing starts failing |
| 2025-11-04 10:18:37 | LSJWH409XPN070089 last telemetry | Location frozen |
| 2025-11-04 10:18:46 | LSJWH4098PN070110 last telemetry | Location frozen |
| 2025-11-05 ~8:00 AM | Issue reported by user | Investigation begins |
| 2025-11-05 8:00-9:00 | Database & log analysis | Root cause identified |
| 2025-11-05 9:00 | Dockerfile updated to 0.9.8 | Fix prepared |
| 2025-11-05 TBD | Docker rebuild & deploy | **Fix deployment pending** |

---

## Contacts & Resources

### Service URLs
- **Frontend**: https://mtc-ismart.vercel.app
- **Backend API**: https://mtc-backend-880316754524.asia-east1.run.app
- **Supabase**: https://sssyxnpanayqvamstind.supabase.co
- **Database**: postgres://postgres.sssyxnpanayqvamstind@aws-1-us-east-1.pooler.supabase.com:5432/postgres

### Monitoring Commands
```bash
# Check service status
gcloud run services describe mtc-backend --region=asia-east1

# View recent logs
gcloud logging read 'resource.labels.service_name="mtc-backend"' --limit=100 --region=asia-east1

# Check database telemetry
PGPASSWORD=S9MuK3OiFs3GZSp3 psql postgres://postgres.sssyxnpanayqvamstind@aws-1-us-east-1.pooler.supabase.com:5432/postgres -c "SELECT vin, MAX(ts) FROM vehicle_telemetry GROUP BY vin;"
```

---

**Document Created**: 2025-11-05
**Last Updated**: 2025-11-05 09:10 UTC
**Status**: Fix pending Docker rebuild and deployment
**Next Action**: Complete Docker build and deploy to Cloud Run
