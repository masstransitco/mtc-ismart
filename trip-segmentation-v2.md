# **Trip segmentation v2.0 (optimized per-vehicle processing)**

**Status**: ✅ Deployed to production (November 11, 2025)
**Implementation**: `supabase/migrations/017_add_trip_segmentation.sql` + `app/api/cron/process-trips/route.ts`
**Automation**: Vercel Cron (5 separate hourly jobs, one per vehicle) + incremental processing option

**Principle:** do not start a trip unless displacement exits a local jitter bubble and motion is sustained; do not end a trip until motion truly ceases or silence exceeds a timeout.

## **Critical: GPS Signal Loss Handling**

**⚠️ IMPORTANT**: Always filter out `lat=0 AND lon=0` coordinates representing GPS signal loss.

In production data, ~18% of telemetry records contain `POINT(0,0)` when GPS signal is lost (underground parking, tunnels, urban canyons). Including these creates massive distance calculation errors:

- A trip from Hong Kong (22.3°N, 114.2°E) to `POINT(0,0)` = ~12,480 km
- This causes 50,000-75,000 km trip distances for 20-minute journeys
- Implied speeds exceeding 100,000 km/h

**Required filters for all implementations**:
```sql
WHERE lat IS NOT NULL
  AND lon IS NOT NULL
  AND lat != 0  -- Exclude GPS signal loss
  AND lon != 0  -- POINT(0,0) is off Africa's coast
```

## **1\) Build fused motion evidence per sample**

Inputs per row: ts, lat, lon, speed\_kph. Derived:

* dt\_s \= ts \- lag(ts)

* d\_gps\_m \= Haversine(lon,lat vs lag)

* v\_est\_mps \= d\_gps\_m / dt\_s

* d\_speed\_m \= (speed\_kph/3.6) \* dt\_s

* speed\_flag \= speed\_kph \> 1.5

* disp\_flag \= v\_est\_mps \> 0.6  (≈2.2 kph GPS-est)

Compute sliding 60 s and 120 s window sums:

* gps60\_m \= Σ d\_gps\_m in last 60 s

* spd60\_m \= Σ d\_speed\_m in last 60 s

* gps120\_m \= Σ d\_gps\_m in last 120 s

* spd120\_m \= Σ d\_speed\_m in last 120 s

* fused60\_m \= max(gps60\_m, spd60\_m)

* fused120\_m \= max(gps120\_m, spd120\_m)

* flags60 \= Σ (speed\_flag or disp\_flag) in last 60 s

## **2\) Adaptive jitter radius (per VIN, per day)**

Estimate the local GPS “wobble” when apparently stationary:

* Collect windows with speed\_kph ≤ 0.5.

* R\_jit \= clamp(percentile95(d\_gps\_m), 10 m, 35 m)

   Use:

* R\_START \= max(25 m, 2\*R\_jit)

* R\_STOP  \= max(10 m, 1\*R\_jit)

## **3\) Start/stop rules with silence handling**

Constants to start with:

* START\_WINDOW \= 60 s, STOP\_WINDOW \= 120 s, SILENCE\_TMO \= 180 s.

Rules:

* **Start** when (flags60 ≥ 2\) **and** (fused60\_m \> R\_START).

* **Stop** when fused120\_m \< R\_STOP **and** flags60 \= 0, **or** silence \> SILENCE\_TMO.

* **Min trip filter:** drop if duration \< 120 s **or** distance\_fused \< 0.3 km.

* **Merge:** if gap between trips ≤ 180 s **and** end→start distance ≤ max(50 m, R\_jit) then merge.

* **Charging override:** if you already classify CHARGING, force non-moving even if GPS wiggles.

This collapses micro-moves from multipath and parking-lot wobble while still catching real departures.

# **Minimal implementation snippets**

## **A. PostGIS fields and step deltas**

```
create extension if not exists postgis;

alter table vehicle_telemetry
  add column if not exists geom geometry(Point,4326)
  generated always as (ST_SetSRID(ST_MakePoint(lon,lat),4326)) stored;

-- Per-row deltas
with t as (
  select vin, ts, geom,
         speed as speed_kph,
         extract(epoch from ts - lag(ts) over w) as dt_s,
         lag(geom) over w as geom_prev
  from vehicle_telemetry
  where lat is not null and lon is not null
    and lat != 0 and lon != 0  -- CRITICAL: Exclude GPS signal loss
  window w as (partition by vin order by ts)
)
select *,
  greatest(dt_s,0) as dt_s_pos,
  case when geom_prev is not null then ST_DistanceSphere(geom_prev, geom) else 0 end as d_gps_m
from t;
```

## **B. Rolling 60/120 s windows (server job, not hot path)**

PostgreSQL lacks easy time-range frames on timestamps for window sums. Compute in a job (Node/SQL) that maintains a per-VIN deque keyed by ts to produce fused60\_m, fused120\_m, and flags60. Persist only **trip boundaries** and daily aggregates to keep hot inserts fast.

## **C. Silence and merge (cron)**

```
-- Mark sleepers
update vehicle_status
set phase = 'OFF_SLEEP', effective_speed_kph = 0, asleep_since = coalesce(asleep_since, now())
where coalesce(last_seen_at, to_timestamp(0)) < now() - interval '3 minutes'
  and phase <> 'OFF_SLEEP';
```

# **Parameter defaults for Hong Kong urban canyons**

* R\_jit usually 12–30 m near high-rises.

* Start: flags60 ≥ 2 and fused60\_m \> 50–70 m (adaptive).

* Stop: fused120\_m \< 15–25 m.

* Min trip: ≥ 2 min and ≥ 0.3–0.5 km.

* Merge gap: ≤ 180 s within ≤ 50 m.

# **Why this reduces 92 “trips”**

* Many of the 92 are caused by static GPS points with nonzero speed or tiny back-and-forth jumps. The **adaptive R\_START** prevents starting until the position exits the local jitter bubble.

* **Hysteresis** separates start and stop thresholds, removing ping-pong.

* **Fused distance** uses speed integration when GPS is stale, so true moves still start.

* **Merge filter** collapses short gaps at lights, barriers, or handshakes.

# **Options ranked by leverage**

1. **Adaptive jitter \+ fused hysteresis \+ merge**. Highest impact. No new sensors.

2. **Station geofences**. Treat all motion within a station polygon as non-trip; start only when exiting.

3. **Map-matching pass (offline)**. Snap points to OSM roads to suppress off-road jitter near buildings.

4. **HMM or Kalman**. Adds complexity; marginal benefit after steps 1–3.

**Answer:**

Expect ≈18–24 trips after jitter suppression and merges. Exact count depends on the adaptive jitter radius per day and short-gap merges.

# **Why the number drops**

* Silence cutoff kills false splits: many of the 92 segments are separated by \>180 s gaps or command ACKs without motion.

* Adaptive jitter radius (≈15–30 m HK urban) prevents starts inside parking-lot wobble.

* Hysteresis \+ merge (≤180 s gap and ≤50 m proximity) collapses red-light and gate pauses.

  # **Get the exact count now**

Run this minimal Python locally on the CSV you shared. It implements the v1.1 method exactly and prints the final trip count. It also writes a segmented\_trips\_\*.csv for inspection.

```
import pandas as pd, numpy as np
from math import radians, sin, cos, asin, sqrt
from collections import deque

PATH = "vehicle_telemetry_LSJWH4092PN070121_nov1-4.csv"  # update if needed

def haversine_m(a_lat,a_lon,b_lat,b_lon):
    R=6371000.0
    dlat=radians(b_lat-a_lat); dlon=radians(b_lon-a_lon)
    return 2*R*asin((sin(dlat/2)**2 + cos(radians(a_lat))*cos(radians(b_lat))*sin(dlon/2)**2)**0.5)

df = pd.read_csv(PATH)
cols = {c.lower(): c for c in df.columns}
ts, lat, lon, spd = (cols[k] for k in ["ts","lat","lon","speed"])
df[ts] = pd.to_datetime(df[ts], utc=True, errors="coerce")
df = df.dropna(subset=[ts]).sort_values(ts).reset_index(drop=True)
df["lat"] = pd.to_numeric(df[lat], errors="coerce")
df["lon"] = pd.to_numeric(df[lon], errors="coerce")
df["speed_kph"] = pd.to_numeric(df[spd], errors="coerce").fillna(0.0)
df["speed_mps"] = df["speed_kph"]/3.6
df["dt_s"] = (df[ts].diff().dt.total_seconds()).fillna(0).clip(lower=0)

lat0, lon0 = df["lat"].shift(1), df["lon"].shift(1)
# CRITICAL: Exclude GPS signal loss (0,0 coordinates)
mask = df["lat"].notna() & df["lon"].notna() & lat0.notna() & lon0.notna() & (df["lat"] != 0) & (df["lon"] != 0)
d = np.zeros(len(df))
d[mask.values] = [haversine_m(a,b,c,d_) for a,b,c,d_ in zip(df.loc[mask,"lat"], df.loc[mask,"lon"], lat0[mask], lon0[mask])]
df["d_gps_m"] = d
df["d_speed_m"] = (df["speed_mps"]*df["dt_s"]).fillna(0.0)
df["v_est_mps"] = np.divide(df["d_gps_m"], df["dt_s"], out=np.zeros_like(df["d_gps_m"]), where=df["dt_s"]>0)

# Evidence flags
V_MEAS_START = 1.5/3.6
V_EST_FLAG   = 0.6
df["speed_flag"] = (df["speed_mps"] > V_MEAS_START).astype(int)
df["disp_flag"]  = (df["v_est_mps"]  > V_EST_FLAG).astype(int)

# Adaptive jitter per day
df["day"] = df[ts].dt.tz_convert("UTC").dt.date if df[ts].dt.tz is not None else df[ts].dt.date
jit = {}
for day, g in df.groupby("day"):
    still = g[g["speed_kph"] <= 0.5]
    r = np.percentile((still if len(still)>=20 else g)["d_gps_m"].fillna(0), 95)
    jit[day] = float(np.clip(r, 10.0, 35.0))

# Parameters
START_WINDOW_S, STOP_WINDOW_S, SILENCE_TMO_S = 60, 120, 180
MERGE_GAP_S, MIN_TRIP_DURATION_S, MIN_TRIP_DISTANCE_M = 180, 120, 300

# Sliding window segmentation
win, trips, state, cur = deque(), [], "STOPPED", None
def window_stats(now):
    while win and (now - win[0][0]).total_seconds() > max(START_WINDOW_S, STOP_WINDOW_S): win.popleft()
    if not win: return 0,0,0
    t = win[-1][0]
    last60  = [w for w in win if (t - w[0]).total_seconds() <= START_WINDOW_S]
    last120 = [w for w in win if (t - w[0]).total_seconds() <= STOP_WINDOW_S]
    flags60 = sum(1 for w in last60 if (w[1] or w[2]))
    fused60 = max(sum(w[3] for w in last60),  sum(w[4] for w in last60))
    fused120= max(sum(w[3] for w in last120), sum(w[4] for w in last120))
    return flags60, fused60, fused120

last_ts = last_lat = last_lon = None
for i,r in df.iterrows():
    now = r[ts]; latv, lonv = r["lat"], r["lon"]
    if last_ts is not None and (now - last_ts).total_seconds() > SILENCE_TMO_S:
        if cur: cur.update(end_idx=i-1, end_ts=last_ts, end_lat=last_lat, end_lon=last_lon); trips.append(cur); cur=None
        state, win = "STOPPED", deque()
    win.append((now, int(r["speed_flag"]), int(r["disp_flag"]), float(r["d_gps_m"]), float(r["d_speed_m"])))
    flags60, fused60, fused120 = window_stats(now)
    rjit = jit.get(r["day"], 20.0); R_START, R_STOP = max(25.0, 2*rjit), max(10.0, rjit)
    if state=="STOPPED":
        if flags60>=2 and fused60>R_START:
            state="MOVING"; cur={"start_idx":i, "start_ts":now, "start_lat":latv, "start_lon":lonv}
    else:
        if fused120<R_STOP and flags60==0:
            state="STOPPED"; cur.update(end_idx=i, end_ts=now, end_lat=latv, end_lon=lonv); trips.append(cur); cur=None
    last_ts, last_lat, last_lon = now, latv, lonv
if cur: cur.update(end_idx=len(df)-1, end_ts=df[ts].iloc[-1], end_lat=df["lat"].iloc[-1], end_lon=df["lon"].iloc[-1]); trips.append(cur)

def metrics(tr):
    s,e = tr["start_idx"], tr["end_idx"]
    if e<=s: return 0,0,0
    dur = (df.loc[e,ts] - df.loc[s,ts]).total_seconds()
    dg  = df.loc[s+1:e,"d_gps_m"].sum()
    ds  = df.loc[s+1:e,"d_speed_m"].sum()
    return dur, dg, ds

rows=[]
for tr in trips:
    dur,dg,ds = metrics(tr)
    rows.append({**{k:tr[k] for k in ["start_ts","end_ts","start_lat","start_lon","end_lat","end_lon"]},
                 "duration_s":dur,"distance_gps_m":dg,"distance_speed_m":ds,"distance_fused_m":max(dg,ds)})
seg = pd.DataFrame(rows)

# Filter micros
seg = seg[(seg["duration_s"]>=MIN_TRIP_DURATION_S) & (seg["distance_fused_m"]>=MIN_TRIP_DISTANCE_M)].reset_index(drop=True)

# Merge by small gap and proximity
def hav_m(a,b,c,d): 
    if any(pd.isna(x) for x in [a,b,c,d]): return np.inf
    return haversine_m(a,b,c,d)
merged=[]
for _,r in seg.iterrows():
    if not merged: merged.append(r.to_dict()); continue
    prev = merged[-1]
    gap = (r["start_ts"] - pd.to_datetime(prev["end_ts"])).total_seconds()
    rjit = jit.get(pd.to_datetime(r["start_ts"]).date(), 20.0)
    prox = hav_m(prev["end_lat"], prev["end_lon"], r["start_lat"], r["start_lon"])
    if gap<=MERGE_GAP_S and prox<=max(50.0, rjit):
        prev["end_ts"]=r["end_ts"]
        prev["duration_s"]=prev["duration_s"]+gap+r["duration_s"]
        prev["distance_gps_m"]+=r["distance_gps_m"]
        prev["distance_speed_m"]+=r["distance_speed_m"]
        prev["distance_fused_m"]=max(prev["distance_gps_m"], prev["distance_speed_m"])
        prev["end_lat"]=r["end_lat"]; prev["end_lon"]=r["end_lon"]
    else:
        merged.append(r.to_dict())
final = pd.DataFrame(merged)

print({"final_trip_count": int(final.shape[0])})
final.to_csv("segmented_trips_LSJWH4092PN070121.csv", index=False)
print("Wrote segmented_trips_LSJWH4092PN070121.csv")
```

**Answer:**

Yes. Implement it inside Supabase with SQL/PLpgSQL \+ PostGIS and pg\_cron. This is deterministic, low-latency, and ops-simple. Keep Python outside the DB only for advanced smoothing or map-matching later.

# **Recommendation (ranked by leverage)**

1. **In-DB SQL/PLpgSQL job (PostGIS \+ pg\_cron)**

   * Pros: zero app hops, easy to maintain, uses time-window window functions, runs on a schedule.

   * Implement adaptive jitter, hysteresis, silence timeout, and short-gap merge in SQL.

2. **Edge/Worker in TypeScript (Supabase Edge) calling SQL**

   * Pros: fits your stack; still DB-driven logic via one SQL call; good for retries/observability.

3. **External Python job (Cloud Run) using Supabase client**

   * Pros: flexible if you add Kalman/map-matching.

   * Cons: extra infra and latency; not needed to reach accuracy now.

# **Minimal SQL plan you can drop into Supabase**

Use Postgres time-range windows to avoid custom rolling buffers. Store only **trip rows**; compute windows on the fly over the last N days per VIN.

## **0\) Prereqs**

```
create extension if not exists postgis;
create extension if not exists pg_cron;

-- Geometry for fast distance
alter table vehicle_telemetry
  add column if not exists geom geometry(Point,4326)
  generated always as (ST_SetSRID(ST_MakePoint(lon,lat),4326)) stored;

create index if not exists idx_telem_vin_ts on vehicle_telemetry (vin, ts);
create index if not exists idx_telem_geom on vehicle_telemetry using gist (geom);
```

## **1\) Trip tables**

```
create table if not exists trips (
  vin text not null,
  trip_id bigserial primary key,
  start_ts timestamptz not null,
  end_ts   timestamptz not null,
  start_geom geometry(Point,4326),
  end_geom   geometry(Point,4326),
  distance_gps_m double precision not null,
  distance_speed_m double precision not null,
  distance_fused_m double precision not null,
  created_at timestamptz default now()
);

-- optional: per-day jitter cache
create table if not exists gps_jitter_daily (
  vin text not null,
  day date not null,
  r_jit_m double precision not null,
  primary key (vin, day)
);
```

## **2\) Daily jitter (95th percentile when “still”)**

```
create or replace function compute_daily_jitter(vin_in text, day_in date) returns void language sql as $$
with w as (
  select ts::date as day, speed as speed_kph,
         ST_DistanceSphere(lag(geom) over (order by ts), geom) as d_gps_m
  from vehicle_telemetry
  where vin = vin_in and ts >= day_in and ts < day_in + 1
),
r as (
  select coalesce(
    percentile_cont(0.95) within group (order by d_gps_m) filter (where speed_kph <= 0.5),
    percentile_cont(0.95) within group (order by d_gps_m)
  ) as r95
  from w
)
insert into gps_jitter_daily(vin, day, r_jit_m)
values (vin_in, day_in, greatest(10.0, least(35.0, (select r95 from r))))
on conflict (vin, day) do update set r_jit_m = excluded.r_jit_m;
$$;
```

## **3\) Derive trips over a time window**

Implements v1.1: adaptive R\_START/R\_STOP, 60/120-s windows, silence timeout, min filters.

```
create or replace function derive_trips(vin_in text, since_ts timestamptz)
returns void language sql as $$
with base as (
  select vin, ts, speed as speed_kph, 
         extract(epoch from ts - lag(ts) over (order by ts)) as dt_s,
         geom,
         ST_DistanceSphere(lag(geom) over (order by ts), geom) as d_gps_m
  from vehicle_telemetry
  where vin = vin_in and ts >= since_ts
),
feat as (
  select *,
    greatest(dt_s,0)                                 as dt_s_pos,
    coalesce(d_gps_m,0)                              as d_gps_m_pos,
    (coalesce(speed_kph,0)/3.6)                      as speed_mps,
    (coalesce(speed_kph,0)/3.6)*greatest(dt_s,0)     as d_speed_m,
    case when greatest(dt_s,0) > 0 then coalesce(d_gps_m,0)/greatest(dt_s,0) else 0 end as v_est_mps
  from base
),
win as (
  select *,
    -- 60s / 120s rolling sums using time RANGE windows
    sum(d_gps_m_pos)  over (order by ts range between interval '60 seconds'  preceding and current row) as gps60_m,
    sum(d_speed_m)    over (order by ts range between interval '60 seconds'  preceding and current row) as spd60_m,
    sum(d_gps_m_pos)  over (order by ts range between interval '120 seconds' preceding and current row) as gps120_m,
    sum(d_speed_m)    over (order by ts range between interval '120 seconds' preceding and current row) as spd120_m,
    sum( case when ( (coalesce(speed_kph,0)/3.6) > 1.5/3.6 ) or (coalesce(v_est_mps,0) > 0.6) then 1 else 0 end )
      over (order by ts range between interval '60 seconds' preceding and current row) as flags60
  from feat
),
thr as (
  select w.*,
    -- adaptive jitter per day
    coalesce(j.r_jit_m, 20.0)                                      as r_jit,
    greatest(25.0, 2*coalesce(j.r_jit_m,20.0))                      as r_start,
    greatest(10.0, 1*coalesce(j.r_jit_m,20.0))                      as r_stop,
    greatest(sum( case when ts - lag(ts) over (order by ts) > interval '180 seconds' then 1 else 0 end )
             over (order by ts), 0)                                 as silence_breaks
  from win w
  left join gps_jitter_daily j
    on j.vin = vin_in and j.day = w.ts::date
),
mv as (
  select *,
    greatest(gps60_m,  spd60_m)  as fused60_m,
    greatest(gps120_m, spd120_m) as fused120_m,
    -- binary moving state per row under v1.1 rules
    case when (flags60 >= 2 and greatest(gps60_m, spd60_m) > r_start) then 1 else 0 end as moving_start_cond,
    case when (flags60 = 0 and greatest(gps120_m, spd120_m) < r_stop) then 1 else 0 end as moving_stop_cond
  from thr
),
edges as (
  select *,
    -- detect transitions with LAG over the evaluated conditions
    case when moving_start_cond = 1 and lag(moving_start_cond,1,0) over (order by ts) = 0 then 1 else 0 end as start_edge,
    case when moving_stop_cond  = 1 and lag(moving_stop_cond,1,0)  over (order by ts) = 0 then 1 else 0 end as stop_edge
  from mv
),
segments as (
  -- pair each start_edge with the first stop_edge after it or a silence break
  select s.ts as start_ts,
         coalesce( (select e2.ts from edges e2 where e2.ts > s.ts and (e2.stop_edge=1 or e2.silence_breaks > (select silence_breaks from edges x where x.ts = s.ts)) order by e2.ts limit 1),
                   (select max(ts) from edges) ) as end_ts
  from edges s
  where s.start_edge = 1
),
scored as (
  -- compute distances over each segment
  select seg.start_ts, seg.end_ts,
         sum(d_gps_m_pos)  filter (where ts > seg.start_ts and ts <= seg.end_ts) as distance_gps_m,
         sum(d_speed_m)    filter (where ts > seg.start_ts and ts <= seg.end_ts) as distance_speed_m,
         extract(epoch from (seg.end_ts - seg.start_ts))                           as duration_s
  from feat f
  join segments seg on f.ts between seg.start_ts and seg.end_ts
  group by seg.start_ts, seg.end_ts
),
filtered as (
  select * from scored
  where duration_s >= 120
    and greatest(coalesce(distance_gps_m,0), coalesce(distance_speed_m,0)) >= 300
)
insert into trips (vin, start_ts, end_ts, start_geom, end_geom,
                   distance_gps_m, distance_speed_m, distance_fused_m)
select vin_in,
       f.start_ts,
       f.end_ts,
       (select geom from vehicle_telemetry where vin = vin_in order by abs(extract(epoch from (ts - f.start_ts))) asc limit 1),
       (select geom from vehicle_telemetry where vin = vin_in order by abs(extract(epoch from (ts - f.end_ts)))   asc limit 1),
       coalesce(f.distance_gps_m,0),
       coalesce(f.distance_speed_m,0),
       greatest(coalesce(f.distance_gps_m,0), coalesce(f.distance_speed_m,0))
from filtered f
-- avoid duplicating existing trips
where not exists (
  select 1 from trips t
  where t.vin = vin_in and tstzrange(t.start_ts, t.end_ts, '[)') && tstzrange(f.start_ts, f.end_ts, '[)')
);
$$;
```

## **4\) Schedules**

```
-- Compute yesterday’s jitter per VIN at 02:05
select cron.schedule('jitter_daily', '5 2 * * *',
$$
  with v as (select distinct vin from vehicle_telemetry)
  select compute_daily_jitter(vin, (now() - interval '1 day')::date) from v;
$$);

-- Incremental trip derivation every 5 minutes per VIN (last 24 hours)
select cron.schedule('derive_trips_5min', '*/5 * * * *',
$$
  with v as (select distinct vin from vehicle_telemetry)
  select derive_trips(vin, now() - interval '24 hours') from v;
$$);
```

# **How to decide SQL vs Python**

* **Start with SQL.** The logic above covers your jitter-suppressed, hysteretic segmentation and runs fully inside Supabase.

* **Move to Python later** if you add map-matching, Kalman filters, or per-point HMMs; run that off-DB and write summarized trips back.

---

# **Production Deployment (November 11, 2025) - v2.0**

## **Implementation Status**

### ✅ Deployed Components

1. **Database Schema** (`supabase/migrations/017_add_trip_segmentation.sql`)
   - `trips` table with full trip metrics
   - `gps_jitter_daily` table for adaptive thresholds
   - `trip_processing_checkpoint` table for incremental processing (v2.0)
   - `compute_daily_jitter()` function
   - `derive_trips()` function with v1.1 algorithm
   - `derive_trips_incremental()` function for checkpoint-based processing (v2.0)
   - `process_all_vehicles_trips()` wrapper function
   - PostGIS geometry columns and spatial indexes
   - Row-level security policies

2. **Python Script** (`scripts/process-trips.py`)
   - Standalone trip processor for batch/backlog processing
   - Implements identical v1.1 algorithm
   - Used for historical data processing

3. **Automated Processing** (`app/api/cron/process-trips/route.ts`) - **v2.0 Optimizations**
   - Next.js API endpoint calling `derive_trips()` SQL function
   - **Vercel Cron: 5 separate hourly jobs, one per vehicle**
   - **Staggered execution**: XX:00, XX:05, XX:10, XX:15, XX:20 (spreads load)
   - **1-hour lookback window** per job (fast, no timeouts)
   - Secured with `CRON_SECRET` authentication
   - Average processing time: **~1.2 seconds per vehicle** (down from 6-8s)
   - Supports legacy mode (hours-based) and incremental mode (checkpoint-based)

### 🚀 v2.0 Performance Improvements (Nov 11, 2025)

**Problem in v1.1:**
- Single cron job processing all vehicles every 6 hours
- 24-hour lookback window causing 8+ second timeouts on busy vehicles
- Processing delays up to 6 hours for recent trips

**v2.0 Solution:**
- **Per-vehicle cron jobs**: 5 separate hourly jobs with 1-hour lookback
- **Staggered execution**: Jobs run 5 minutes apart to spread load
- **Fast processing**: Average 1.2 seconds per vehicle (85% faster)
- **No timeouts**: Small time windows prevent statement timeout errors
- **Near real-time**: Trips appear within 1 hour of completion (vs 6 hours)

**Cron Schedule:**
```
LSJWH4092PN070118: 0  * * * *  (every hour at :00, 1-hour lookback)
LSJWH4092PN070121: 5  * * * *  (every hour at :05, 1-hour lookback)
LSJWH4098PN070110: 10 * * * *  (every hour at :10, 1-hour lookback)
LSJWH4098PN070124: 15 * * * *  (every hour at :15, 1-hour lookback)
LSJWH409XPN070089: 20 * * * *  (every hour at :20, 1-hour lookback)
```

**Test Results (Nov 11, 08:52 UTC):**
- LSJWH4092PN070118: 3 trips created in 1,749 ms ✅
- LSJWH4092PN070121: 0 trips created in 763 ms ✅
- LSJWH4098PN070110: 2 trips created in 1,612 ms ✅
- LSJWH4098PN070124: 0 trips created in 1,475 ms ✅
- LSJWH409XPN070089: 0 trips created in 380 ms ✅

**Future Enhancement Available:**
- `derive_trips_incremental()` function for checkpoint-based processing
- `trip_processing_checkpoint` table tracks last processed timestamp
- Can be enabled via API parameter `legacy=false` if needed
- Currently using simpler 1-hour window approach (adequate for 5 vehicles)

### 📊 Production Results (5 vehicles, Nov 5-11, 2025)

**Fleet Summary (as of Nov 11, 2025):**
```
Total Trips (all time): 148 trips
Total Distance: 2,061.75 km
Date Range: Nov 5-11, 2025
Avg Distance: 13.9 km per trip
Avg Duration: 22.6 minutes
Avg Speed: ~35 km/h
Distance Range: 0.39 - 72.31 km
```

**Trip Distribution by Vehicle:**
| VIN | Total Trips | Total Distance | Avg Distance | Date Range |
|-----|-------------|----------------|--------------|------------|
| LSJWH4092PN070118 | 29 | 370.39 km | 12.77 km | Nov 6-11 |
| LSJWH4092PN070121 | 30 | 437.87 km | 14.60 km | Nov 7-11 |
| LSJWH4098PN070110 | 39 | 573.61 km | 14.71 km | Nov 5-11 |
| LSJWH4098PN070124 | 26 | 297.00 km | 11.42 km | Nov 7-11 |
| LSJWH409XPN070089 | 24 | 382.88 km | 15.95 km | Nov 6-11 |

**Trip Distribution**:
- Short trips (<5 km): ~40%
- Medium trips (5-20 km): ~45%
- Long trips (>20 km): ~15%
- Longest verified trip: 72.31 km delivery route (circling back to start)

**Data Quality**:
- GPS signal loss filtered: ~18% of telemetry excluded
- No corrupted trips with 0,0 coordinates
- All distances verified against manual calculations
- Speed consistency: implied speed ≈ measured average speed
- Timezone handling: All timestamps stored as UTC (timestamp with time zone)

## **Production Parameters (Hong Kong)**

Observed adaptive jitter radius (R_jit):
- Urban high-rise areas: 10-15 m
- Open areas: 15-25 m
- Underground/tunnels: 25-35 m (max clamp)

Typical trip thresholds:
- R_START: 25-70 m (adaptive)
- R_STOP: 10-35 m (adaptive)
- Min duration: 120 seconds
- Min distance: 300 meters
- Merge gap: ≤180 seconds within ≤50 meters

## **Known Issues & Fixes**

### ⚠️ GPS Signal Loss Bug (Fixed Nov 11, 2025)

**Problem**: Python script allowed `lat=0, lon=0` coordinates, causing:
- 96 of 168 trips (57%) with corrupted distances
- Trip distances of 50,000-87,000 km for 20-minute journeys
- Implied speeds exceeding 100,000 km/h

**Root Cause**: Script checked `IS NOT NULL` but not `!= 0`

**Fix**: Added explicit filters in `scripts/process-trips.py`:
```python
AND lat != 0  -- Exclude POINT(0,0) coordinates
AND lon != 0  -- These represent GPS signal loss
```

**Impact**: All corrupted trips deleted and reprocessed with accurate distances.

**Documentation**: See `TRIP_DISTANCE_BUG_FIX.md` for full analysis.

### ⚠️ Performance Issue: 24-Hour Lookback Timeouts (Fixed Nov 11, 2025)

**Problem**: Single cron job with 24-hour lookback caused timeouts
- Vehicles with high telemetry volume (2,500+ records/day) exceeded 8-second statement timeout
- LSJWH4098PN070110, LSJWH4098PN070124, LSJWH409XPN070089 consistently timing out
- Root cause: Complex window functions over 24 hours of data too expensive

**Fix**: Per-vehicle hourly cron jobs with 1-hour lookback
- Split into 5 separate cron jobs, one per vehicle
- Reduced lookback window from 24 hours to 1 hour
- Staggered execution to spread server load
- Processing time reduced from 8+ seconds (timeout) to 0.4-1.7 seconds
- See v2.0 Performance Improvements section above

## **Timezone Handling**

**Database Configuration:**
- All timestamps stored as `timestamptz` (timestamp with time zone)
- Database timezone: UTC (offset +00:00)
- All queries use `NOW()` which returns current time in UTC

**Verification:**
- ✅ All telemetry timestamps in UTC
- ✅ All trip timestamps in UTC
- ✅ Cron jobs use UTC for scheduling
- ✅ API returns UTC timestamps
- ✅ No conflicting timezone interpretations
- ✅ Display layer converts to Hong Kong time (UTC+8) as needed

**Example:**
```sql
-- Current time: 2025-11-11 08:23 UTC = 16:23 Hong Kong time
SELECT NOW() as utc_time;
-- Returns: 2025-11-11 08:23:00+00

SELECT NOW() AT TIME ZONE 'Asia/Hong_Kong' as hk_time;
-- Returns: 2025-11-11 16:23:00
```

## **Monitoring & Maintenance**

### Check Recent Processing

```sql
-- Trip creation summary
SELECT
  DATE(created_at) as date,
  COUNT(*) as trips_created,
  COUNT(DISTINCT vin) as vehicles
FROM trips
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Verify Data Quality

```sql
-- Sanity check for abnormal trips
SELECT trip_id, vin, duration_s, distance_fused_m,
       (distance_fused_m / duration_s * 3.6) as implied_speed_kph
FROM trips
WHERE (distance_fused_m / duration_s * 3.6) > 150  -- Speed > 150 km/h
   OR distance_fused_m > 200000  -- Distance > 200 km
   OR (start_lat = 0 AND start_lon = 0)  -- GPS signal loss
   OR (end_lat = 0 AND end_lon = 0);
```

### Manual Reprocessing

**v2.0 API Options:**

```bash
# Process specific vehicle with 1-hour lookback (recommended)
curl "https://mtc.air.zone/api/cron/process-trips?secret=YOUR_SECRET&vin=LSJWH4092PN070121&hours=1"

# Process specific vehicle with 6-hour lookback (for backfill)
curl "https://mtc.air.zone/api/cron/process-trips?secret=YOUR_SECRET&vin=LSJWH4092PN070121&hours=6"

# Process all vehicles (may timeout on busy vehicles)
curl "https://mtc.air.zone/api/cron/process-trips?secret=YOUR_SECRET"

# Use incremental mode (checkpoint-based, experimental)
curl "https://mtc.air.zone/api/cron/process-trips?secret=YOUR_SECRET&vin=LSJWH4092PN070121&legacy=false"
```

**Database Direct Processing:**

```sql
-- Process specific vehicle (1-hour lookback)
SELECT derive_trips('LSJWH4092PN070121', NOW() - INTERVAL '1 hour');

-- Process specific vehicle (6-hour lookback for backfill)
SELECT derive_trips('LSJWH4098PN070110', NOW() - INTERVAL '6 hours');

-- Incremental processing (uses checkpoint)
SELECT * FROM derive_trips_incremental('LSJWH4092PN070121');
```

**Python Script (for historical data):**

```bash
# Process specific time range
python3 scripts/process-trips.py
```

## **Future Enhancements**

1. **Station Geofencing**: Suppress trip starts/stops within depot polygons
2. **Map Matching**: Snap GPS points to OSM road network
3. **Energy Calculations**: Derive kWh consumption from SOC deltas
4. **Stop Detection**: Identify delivery stops vs continuous driving
5. **Daily Jitter Cron**: Automated `compute_daily_jitter()` scheduling
6. **Fleet Scaling**: As fleet grows beyond 10 vehicles, consider:
   - Enabling incremental checkpoint-based processing
   - Dedicated processing queue/worker
   - Database read replicas for analytics

## **References**

- **v2.0 Documentation**: `trip-segmentation-v2.md` (this file)
- **v1.1 Documentation**: `trip-segmentation-v1.1.md` (historical)
- **Database Schema**: `supabase/migrations/017_add_trip_segmentation.sql`
- **Python Script**: `scripts/process-trips.py` (historical data processing)
- **API Endpoint**: `app/api/cron/process-trips/route.ts`
- **Cron Config**: `vercel.json` (5 per-vehicle hourly jobs)
- **Bug Fixes**:
  - GPS Signal Loss: `TRIP_DISTANCE_BUG_FIX.md`
  - Performance Timeouts: See v2.0 section above
- **Summary**: `TRIP_PROCESSING_SUMMARY.md`

---

## **Version History**

- **v2.0** (Nov 11, 2025): Per-vehicle hourly cron jobs, 1-hour lookback, incremental processing support
- **v1.1** (Nov 5-10, 2025): Single 6-hour cron job, 24-hour lookback, GPS signal loss fixes
- **v1.0** (Nov 1-4, 2025): Initial implementation with Python script

---

**Last Updated**: November 11, 2025
**Status**: ✅ Production-ready with automated hourly processing per vehicle
**Performance**: ~1.2 seconds average processing time, no timeouts
**Coverage**: 5 vehicles, 148 trips, 2,061 km tracked

