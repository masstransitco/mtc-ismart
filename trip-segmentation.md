# Trip Segmentation System

**Implementation Date**: November 5, 2025
**Algorithm**: v1.1 Jitter-Aware Deterministic Segmentation
**Status**: ✅ Backend Complete, 🚧 Frontend In Progress

---

## Overview

The trip segmentation system automatically detects and segments vehicle trips from continuous telemetry data using an adaptive, jitter-aware algorithm. It addresses common challenges in urban environments like GPS multipath, signal drift, and momentary stops at traffic lights.

### Key Principles

1. **Adaptive Jitter Suppression**: Calculate per-vehicle, per-day GPS jitter radius from stationary periods
2. **Hysteresis**: Different thresholds for trip start and stop to prevent oscillation
3. **Fused Evidence**: Combine GPS displacement and speed sensor data for robust detection
4. **Intelligent Merging**: Collapse short gaps (traffic lights, barriers) into continuous trips
5. **Minimum Filters**: Remove micro-movements and false positives

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Vehicle Telemetry Stream (5s intervals)                    │
│  - GPS coordinates (lat, lon, altitude, bearing)            │
│  - Speed, SOC, timestamps                                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  PostGIS Geometry Layer                                      │
│  - ST_MakePoint(lon, lat) trigger on insert                 │
│  - Spatial indexing (GIST)                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Daily Jitter Calculation (compute_daily_jitter)            │
│  - Filter: speed ≤ 0.5 kph (stationary)                    │
│  - Calculate: 95th percentile of GPS displacement           │
│  - Clamp: 10m - 35m range                                  │
│  - Cache: gps_jitter_daily table                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Trip Segmentation (process-trips.py)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 1. Load telemetry for vehicle since date            │  │
│  │ 2. Calculate Haversine distances between points     │  │
│  │ 3. Derive speed from GPS displacement               │  │
│  │ 4. Create evidence flags (speed > 1.5kph, disp > 0.6mps)│
│  │ 5. Sliding windows (60s start, 120s stop)           │  │
│  │ 6. State machine: STOPPED ↔ MOVING                  │  │
│  │ 7. Detect start/stop edges                          │  │
│  │ 8. Filter: duration ≥ 120s, distance ≥ 300m         │  │
│  │ 9. Merge: gap ≤ 180s, proximity ≤ 50m               │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Trips Table                                                 │
│  - trip_id, vin, start/end timestamps                       │
│  - start/end coordinates (lat/lon + geometry)               │
│  - distance (GPS, speed-derived, fused)                     │
│  - duration, avg/max speed, SOC delta                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Tables

#### `trips`
Primary table storing segmented trips.

```sql
trip_id              BIGSERIAL PRIMARY KEY
vin                  TEXT NOT NULL
start_ts             TIMESTAMPTZ NOT NULL
end_ts               TIMESTAMPTZ NOT NULL
start_lat            NUMERIC(10,7)
start_lon            NUMERIC(10,7)
end_lat              NUMERIC(10,7)
end_lon              NUMERIC(10,7)
start_geom           GEOMETRY(Point,4326)      -- PostGIS geometry
end_geom             GEOMETRY(Point,4326)
duration_s           DOUBLE PRECISION NOT NULL
distance_gps_m       DOUBLE PRECISION NOT NULL -- From GPS displacement
distance_speed_m     DOUBLE PRECISION NOT NULL -- From speed integration
distance_fused_m     DOUBLE PRECISION NOT NULL -- max(gps, speed)
avg_speed_kph        DOUBLE PRECISION
max_speed_kph        DOUBLE PRECISION
start_soc            NUMERIC(5,2)
end_soc              NUMERIC(5,2)
energy_used_kwh      NUMERIC(10,4)
sample_count         INTEGER
created_at           TIMESTAMPTZ DEFAULT NOW()
updated_at           TIMESTAMPTZ DEFAULT NOW()

UNIQUE INDEX: (vin, start_ts, end_ts)
INDEXES: vin, vin+start_ts, start_ts, end_ts, vin+created_at
```

#### `gps_jitter_daily`
Cache of adaptive jitter thresholds per vehicle per day.

```sql
vin                  TEXT NOT NULL
day                  DATE NOT NULL
r_jit_m              DOUBLE PRECISION NOT NULL -- Jitter radius (10-35m)
sample_count         INTEGER
created_at           TIMESTAMPTZ DEFAULT NOW()

PRIMARY KEY: (vin, day)
```

#### `vehicle_telemetry` (Enhanced)
Added geometry column for spatial operations.

```sql
geom                 GEOMETRY(Point,4326)      -- Auto-generated from lat/lon

TRIGGER: set_telemetry_geom BEFORE INSERT OR UPDATE
INDEX: GIST index on geom
```

### Functions

#### `compute_daily_jitter(vin_in text, day_in date)`
Calculates the 95th percentile GPS displacement when vehicle is stationary.

**Logic**:
1. Filter telemetry for the given VIN and day
2. Select samples where `speed_kph ≤ 0.5` (stationary)
3. Calculate `ST_DistanceSphere` between consecutive points
4. Take 95th percentile of displacements
5. Clamp between 10m (urban minimum) and 35m (canyon maximum)
6. Cache in `gps_jitter_daily`

**Usage**:
```sql
SELECT compute_daily_jitter('LSJWH4092PN070121', '2025-11-04'::date);
```

#### `derive_trips(vin_in text, since_ts timestamptz)`
Main trip segmentation function (SQL implementation - currently unused in favor of Python).

**Returns**: `INTEGER` (count of trips created)

**Note**: SQL implementation exists but is currently too slow for processing all historical data. Python implementation (`scripts/process-trips.py`) is used instead.

---

## Algorithm Details

### Parameters

```python
# Window sizes
START_WINDOW_S = 60      # Evidence window for trip start
STOP_WINDOW_S = 120      # Evidence window for trip stop
SILENCE_TMO_S = 180      # Silence timeout (forces stop)

# Filtering
MIN_TRIP_DURATION_S = 120   # 2 minutes minimum
MIN_TRIP_DISTANCE_M = 300   # 300 meters minimum

# Merging
MERGE_GAP_S = 180        # Max gap to merge (3 minutes)
MERGE_PROX_M = 50        # Max proximity to merge (adaptive: max(50, r_jit))

# Evidence thresholds
V_MEAS_START = 1.5 kph   # Speed flag threshold
V_EST_FLAG = 0.6 m/s     # Displacement flag threshold (≈2.2 kph)
```

### Adaptive Thresholds

Calculated per vehicle, per day:

```python
r_jit = clamp(percentile95(d_gps_m where speed ≤ 0.5), 10.0, 35.0)

R_START = max(25.0, 2 * r_jit)  # Start threshold: 25-70m
R_STOP  = max(10.0, 1 * r_jit)  # Stop threshold: 10-35m
```

**Typical Hong Kong values**:
- Urban canyons: r_jit = 15-30m
- Open areas: r_jit = 10-15m
- Dense high-rises: r_jit = 25-35m

### Trip Detection State Machine

```
┌─────────────┐
│   STOPPED   │
└──────┬──────┘
       │ flags60 ≥ 2 AND fused60 > R_START
       ▼
┌─────────────┐
│   MOVING    │◄───┐
└──────┬──────┘    │
       │           │ Continue if movement detected
       │           │
       └───────────┘
       │
       │ fused120 < R_STOP AND flags60 = 0
       │ OR silence > 180s
       ▼
┌─────────────┐
│  TRIP END   │
└─────────────┘
```

### Evidence Fusion

Per sample, calculate:

```python
# Time delta
dt_s = ts - lag(ts)

# GPS displacement
d_gps_m = haversine(lat, lon, lag(lat), lag(lon))

# Speed-derived displacement
d_speed_m = (speed_kph / 3.6) * dt_s

# Estimated velocity from GPS
v_est_mps = d_gps_m / dt_s

# Evidence flags
speed_flag = (speed_kph > 1.5)
disp_flag  = (v_est_mps > 0.6)

# Rolling windows (60s and 120s)
gps60_m   = Σ d_gps_m over last 60s
spd60_m   = Σ d_speed_m over last 60s
gps120_m  = Σ d_gps_m over last 120s
spd120_m  = Σ d_speed_m over last 120s

# Fused distances (take max to handle GPS stale or speed unavailable)
fused60_m  = max(gps60_m, spd60_m)
fused120_m = max(gps120_m, spd120_m)

# Flag count (motion evidence in last 60s)
flags60 = Σ (speed_flag OR disp_flag) over last 60s
```

### Trip Start Conditions

```python
if state == STOPPED:
    if flags60 >= 2 AND fused60_m > R_START:
        # At least 2 motion flags in last 60s
        # AND moved more than adaptive threshold
        state = MOVING
        record start_ts, start_lat, start_lon, start_soc
```

### Trip Stop Conditions

```python
if state == MOVING:
    if (fused120_m < R_STOP AND flags60 == 0) OR silence > 180s:
        # No movement in last 120s and no motion flags
        # OR no data for more than 3 minutes
        state = STOPPED
        record end_ts, end_lat, end_lon, end_soc
        save trip
```

### Post-Processing

**1. Minimum Filter**
```python
trips = filter(trips, lambda t:
    t.duration_s >= 120 AND
    t.distance_fused_m >= 300
)
```

**2. Merge Adjacent Trips**
```python
for each consecutive trip pair (prev, curr):
    gap_s = curr.start_ts - prev.end_ts
    prox_m = haversine(prev.end_lat, prev.end_lon,
                       curr.start_lat, curr.start_lon)

    if gap_s <= 180 AND prox_m <= max(50, r_jit):
        # Merge: extend prev to include curr
        prev.end_ts = curr.end_ts
        prev.duration_s += gap_s + curr.duration_s
        prev.distance_fused_m = max(
            prev.distance_gps_m + curr.distance_gps_m,
            prev.distance_speed_m + curr.distance_speed_m
        )
```

---

## Implementation Status

### ✅ Completed

#### 1. Database Layer
- **Migration**: `supabase/migrations/017_add_trip_segmentation.sql`
- PostGIS extension enabled
- Tables created: `trips`, `gps_jitter_daily`
- Geometry support added to `vehicle_telemetry`
- Triggers for auto-geometry generation
- RLS policies configured
- Indexes optimized for trip queries

#### 2. Processing Script
- **File**: `scripts/process-trips.py`
- Full v1.1 algorithm implementation
- Adaptive jitter calculation
- Sliding window state machine
- Trip filtering and merging
- Database persistence

#### 3. Historical Data Processing
- Processed: Oct 28 - Nov 4, 2025 (7 days)
- Total trips: 122 across 5 vehicles
- Results validated and stored in database

### Results Summary

| VIN | Trips | Total KM | Avg Duration (min) | First Trip | Last Trip |
|-----|-------|----------|-------------------|------------|-----------|
| LSJWH4092PN070118 | 21 | 189.7 | 20.5 | 2025-10-28 | 2025-11-03 |
| LSJWH4092PN070121 | 29 | 407.4 | 31.2 | 2025-10-28 | 2025-11-04 |
| LSJWH4098PN070110 | 23 | 401.5 | 28.5 | 2025-10-28 | 2025-11-04 |
| LSJWH4098PN070124 | 26 | 395.4 | 22.3 | 2025-10-28 | 2025-11-04 |
| LSJWH409XPN070089 | 23 | 534.3 | 37.1 | 2025-11-01 | 2025-11-04 |

**Total**: 122 trips, ~1,928 km, avg 27.9 min per trip

### Jitter Statistics

Adaptive jitter radius by vehicle and date:

| VIN | Date Range | Jitter Range | Typical Value |
|-----|------------|--------------|---------------|
| LSJWH4092PN070118 | Oct 28 - Nov 3 | 10-35m | 10m (good GPS) |
| LSJWH4092PN070121 | Oct 28 - Nov 4 | 10-25m | 10m |
| LSJWH4098PN070110 | Oct 28 - Nov 4 | 10-35m | 10-35m (variable) |
| LSJWH4098PN070124 | Oct 28 - Nov 4 | 10-35m | 10-35m (variable) |
| LSJWH409XPN070089 | Oct 28 - Nov 4 | 10-35m | 10-35m (urban canyons) |

---

## Workflow

### Initial Setup (One-time)

1. **Apply migration**:
```bash
psql "$POSTGRES_URL_NON_POOLING" -f supabase/migrations/017_add_trip_segmentation.sql
```

2. **Install Python dependencies**:
```bash
pip3 install pandas numpy psycopg2-binary
```

### Processing Historical Data

```bash
# Process all vehicles from Oct 28 onwards
python3 scripts/process-trips.py

# Output:
# Processing 5 vehicles...
# Processing trips for LSJWH4092PN070118 since 2025-10-28...
#   Loaded 6382 telemetry records
#   Calculated jitter for 4 days: {...}
#   Detected 37 raw trip segments
#   After filtering: 21 trips
#   After merging: 21 trips
#   ✓ Inserted 21 trips for LSJWH4092PN070118
# ...
```

### Processing New Data (Incremental)

Modify the script to process only recent data:

```python
# In process-trips.py, change the since_date:
process_vehicle_trips(vin, since_date='2025-11-05')
```

Or process last N hours:

```python
from datetime import datetime, timedelta
since = (datetime.utcnow() - timedelta(hours=24)).strftime('%Y-%m-%d %H:%M:%S')
process_vehicle_trips(vin, since_date=since)
```

### Querying Trips

```sql
-- Get trips for a vehicle
SELECT
    trip_id,
    start_ts,
    end_ts,
    duration_s / 60 as duration_min,
    distance_fused_m / 1000 as distance_km,
    avg_speed_kph,
    start_soc,
    end_soc,
    (start_soc - end_soc) as soc_used
FROM trips
WHERE vin = 'LSJWH4092PN070121'
ORDER BY start_ts DESC
LIMIT 10;

-- Get daily trip statistics
SELECT
    vin,
    start_ts::date as day,
    COUNT(*) as trip_count,
    SUM(distance_fused_m) / 1000 as total_km,
    SUM(duration_s) / 3600 as total_hours,
    AVG(avg_speed_kph) as avg_speed
FROM trips
GROUP BY vin, start_ts::date
ORDER BY vin, day;

-- Find long trips (> 30 min, > 20 km)
SELECT
    vin,
    start_ts,
    duration_s / 60 as duration_min,
    distance_fused_m / 1000 as distance_km,
    avg_speed_kph
FROM trips
WHERE duration_s > 1800
  AND distance_fused_m > 20000
ORDER BY distance_fused_m DESC;
```

---

## TODO Items

### 🚧 Frontend Components

#### 1. Create Trip Card Component
**File**: `components/vehicle-trip-card.tsx`

**Requirements**:
- Display per-vehicle trip statistics
- Show trip count, total distance, total duration
- Chart visualization (time series of trips)
- Recent trips list
- Energy efficiency metrics

**Design**:
```tsx
<VehicleTripCard vin="LSJWH4092PN070121">
  <TripStats>
    - Total Trips: 29
    - Total Distance: 407.4 km
    - Total Time: 15.0 hours
    - Avg Trip: 14.0 km, 31 min
  </TripStats>

  <TripChart type="timeline">
    - X-axis: Date
    - Y-axis: Trip distance (km)
    - Color: By duration or energy use
  </TripChart>

  <RecentTrips limit={5}>
    - Start/End timestamps
    - Distance, duration
    - SOC delta
    - Start/End locations (reverse geocoded)
  </RecentTrips>
</VehicleTripCard>
```

**Data Hook**:
```typescript
// hooks/use-trips.ts
export function useVehicleTrips(vin: string, limit?: number) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [stats, setStats] = useState<TripStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Fetch trips from Supabase
    // Subscribe to realtime updates
  }, [vin, limit])

  return { trips, stats, loading, error }
}
```

#### 2. Trip Statistics Component
**File**: `components/trip/trip-stats.tsx`

Display aggregate statistics:
- Trip count
- Total distance (km)
- Total duration (hours)
- Average speed
- Energy efficiency (km/kWh)
- Most frequent routes (if available)

#### 3. Trip Timeline Chart
**File**: `components/trip/trip-timeline-chart.tsx`

**Library**: Recharts (already in project)

**Chart Types**:
1. **Bar Chart**: Trips per day
2. **Line Chart**: Distance over time
3. **Scatter Plot**: Duration vs Distance
4. **Stacked Bar**: Daily trip breakdown by duration ranges

```tsx
<ResponsiveContainer width="100%" height={300}>
  <BarChart data={tripsByDay}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="day" />
    <YAxis yAxisId="left" orientation="left" label="Trips" />
    <YAxis yAxisId="right" orientation="right" label="km" />
    <Tooltip />
    <Legend />
    <Bar yAxisId="left" dataKey="count" fill="#8884d8" name="Trip Count" />
    <Bar yAxisId="right" dataKey="distance" fill="#82ca9d" name="Distance (km)" />
  </BarChart>
</ResponsiveContainer>
```

#### 4. Trip List Component
**File**: `components/trip/trip-list.tsx`

Table or list of recent trips:
```tsx
<TripList trips={trips}>
  {trips.map(trip => (
    <TripListItem key={trip.trip_id}>
      <TripTime>{formatRelativeTime(trip.start_ts)}</TripTime>
      <TripRoute>
        {trip.start_location} → {trip.end_location}
      </TripRoute>
      <TripMetrics>
        {trip.distance_km} km · {trip.duration_min} min
      </TripMetrics>
      <TripEnergy>
        -{trip.soc_delta}% SOC
      </TripEnergy>
    </TripListItem>
  ))}
</TripList>
```

### 🚧 Dashboard Integration

#### Add "Trips" Tab
**File**: `components/main-dashboard.tsx`

**Changes**:
1. Add tab to navigation:
```tsx
<TabsList className="grid w-full grid-cols-4 max-w-lg">
  <TabsTrigger value="cars">Cars</TabsTrigger>
  <TabsTrigger value="map">Map</TabsTrigger>
  <TabsTrigger value="logs">Logs</TabsTrigger>
  <TabsTrigger value="trips">Trips</TabsTrigger> {/* NEW */}
</TabsList>
```

2. Add tab content:
```tsx
<TabsContent value="trips" className="h-full m-0">
  <TripsView /> {/* NEW COMPONENT */}
</TabsContent>
```

#### Create Trips View
**File**: `components/trips-view.tsx`

**Layout**:
```tsx
<div className="h-full overflow-y-auto">
  <div className="container mx-auto px-4 py-6 max-w-7xl">
    <div className="grid gap-6">
      {vehicles.map(vehicle => (
        <VehicleTripCard
          key={vehicle.vin}
          vin={vehicle.vin}
          label={vehicle.label}
          plateNumber={vehicle.plate_number}
        />
      ))}
    </div>
  </div>
</div>
```

### 🚧 Real-time Processing

#### Option 1: Cron Job (Recommended)
**File**: `scripts/process-trips-incremental.py`

```python
# Process last 24 hours every 5 minutes
from datetime import datetime, timedelta

since = datetime.utcnow() - timedelta(hours=24)
for vin in get_all_vins():
    process_vehicle_trips(vin, since_date=since.isoformat())
```

**Schedule**: Every 5 minutes via cron or scheduler
```bash
*/5 * * * * cd /path/to/mtc-ismart && python3 scripts/process-trips-incremental.py
```

#### Option 2: Supabase Edge Function
**File**: `supabase/functions/process-trips/index.ts`

```typescript
import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from '@supabase/supabase-js'

serve(async (req) => {
  const supabase = createClient(/* ... */)

  // Get VINs
  const { data: vins } = await supabase
    .from('vehicle_telemetry')
    .select('vin')
    .distinct()

  // Call process_all_vehicles_trips function
  for (const { vin } of vins) {
    await supabase.rpc('derive_trips', {
      vin_in: vin,
      since_ts: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

**Schedule**: Using `pg_cron` or external scheduler

#### Option 3: Trigger on New Telemetry
**Challenge**: Too frequent, would create overhead
**Recommendation**: Batch processing (Option 1 or 2) is better

### 🚧 Enhanced Features (Future)

1. **Route Visualization**
   - Display trip route on map
   - Animate trip playback
   - Show speed/SOC variations along route

2. **Trip Comparison**
   - Compare similar trips (same start/end locations)
   - Energy efficiency analysis
   - Route optimization suggestions

3. **Geofencing**
   - Define home, work, charging station geofences
   - Automatic trip categorization
   - Start/stop detection improvements

4. **Map Matching**
   - Snap GPS points to road network (OSM)
   - Improve accuracy of route distance
   - Identify specific roads/highways used

5. **HMM/Kalman Filtering**
   - Advanced state estimation
   - Smoother trajectories
   - Better handling of GPS outages

6. **Trip Prediction**
   - Predict trip start based on patterns
   - Range anxiety alerts
   - Charging recommendations

---

## Troubleshooting

### No Trips Detected

**Check**:
1. Verify telemetry has GPS coordinates:
```sql
SELECT COUNT(*), COUNT(lat), COUNT(lon)
FROM vehicle_telemetry
WHERE vin = 'YOUR_VIN';
```

2. Check jitter calculation:
```sql
SELECT * FROM gps_jitter_daily
WHERE vin = 'YOUR_VIN'
ORDER BY day DESC;
```

3. Verify geometry is populated:
```sql
SELECT COUNT(*), COUNT(geom)
FROM vehicle_telemetry
WHERE vin = 'YOUR_VIN';
```

### Too Many Micro-Trips

**Adjust parameters** in `process-trips.py`:
```python
# Increase minimum filters
MIN_TRIP_DURATION_S = 180  # 3 minutes instead of 2
MIN_TRIP_DISTANCE_M = 500  # 500m instead of 300m

# Increase merge window
MERGE_GAP_S = 300  # 5 minutes instead of 3
```

### Missed Legitimate Trips

**Lower thresholds**:
```python
# Reduce minimum filters
MIN_TRIP_DURATION_S = 90   # 1.5 minutes
MIN_TRIP_DISTANCE_M = 200  # 200m

# More sensitive start detection
V_MEAS_START = 1.0 / 3.6  # 1 kph instead of 1.5
```

### SQL Function Timeout

**Issue**: The SQL `derive_trips` function is too slow for large datasets.

**Solution**: Use Python script instead:
```bash
python3 scripts/process-trips.py
```

For incremental processing, modify script to process smaller time windows.

### Duplicate Trips

**Check uniqueness constraint**:
```sql
SELECT vin, start_ts, end_ts, COUNT(*)
FROM trips
GROUP BY vin, start_ts, end_ts
HAVING COUNT(*) > 1;
```

The `ON CONFLICT (vin, start_ts, end_ts) DO NOTHING` should prevent duplicates.

---

## Performance Considerations

### Database

- **Geometry Indexes**: GIST index on `vehicle_telemetry.geom` speeds up spatial queries
- **Composite Indexes**: `(vin, ts)` optimizes time-range queries
- **Partial Indexes**: Can index only recent data if needed

### Processing

- **Batch Size**: Process 1 week at a time for historical data
- **Incremental**: Process last 24 hours for ongoing data
- **Parallel**: Can process multiple vehicles in parallel

**Current Performance**:
- ~10,000 telemetry records in ~5 seconds
- ~30 trips detected per vehicle per week
- Total processing time: ~30 seconds for all 5 vehicles (7 days of data)

### Frontend

- **Pagination**: Show 10-20 recent trips, load more on demand
- **Aggregation**: Pre-aggregate statistics server-side
- **Caching**: Cache trip data in React Query or SWR

---

## References

- **Algorithm**: `trip-segmentation-v1.1.md` (source document)
- **Migration**: `supabase/migrations/017_add_trip_segmentation.sql`
- **Processing Script**: `scripts/process-trips.py`
- **Project Context**: `project-context.md`

---

*Last Updated: 2025-11-05*
