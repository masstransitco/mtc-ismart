-- Trip Segmentation Schema (v1.1 - Jitter-aware, deterministic)
-- Implements adaptive jitter radius, hysteresis, silence timeout, and merge logic

-- Enable PostGIS for spatial operations
create extension if not exists postgis;

-- Add geometry column to vehicle_telemetry for efficient spatial calculations
alter table vehicle_telemetry
  add column if not exists geom geometry(Point,4326);

-- Generate geometry from lat/lon (only for existing records that don't have it)
update vehicle_telemetry
set geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326)
where geom is null and lat is not null and lon is not null;

-- Make it a generated column for future inserts
-- Note: Can't alter existing column to generated, so we'll use a trigger instead
create or replace function update_telemetry_geom()
returns trigger language plpgsql as $$
begin
  if NEW.lat is not null and NEW.lon is not null then
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326);
  end if;
  return NEW;
end;
$$;

drop trigger if exists set_telemetry_geom on vehicle_telemetry;
create trigger set_telemetry_geom
  before insert or update on vehicle_telemetry
  for each row
  execute function update_telemetry_geom();

-- Create spatial index on geometry column
create index if not exists idx_telem_geom on vehicle_telemetry using gist (geom);

-- Ensure we have indexes for trip processing
create index if not exists idx_telem_vin_ts on vehicle_telemetry (vin, ts);

-- Table: trips
-- Stores segmented trips with start/end boundaries and metrics
create table if not exists trips (
  trip_id bigserial primary key,
  vin text not null,
  start_ts timestamptz not null,
  end_ts timestamptz not null,
  start_lat numeric(10,7),
  start_lon numeric(10,7),
  end_lat numeric(10,7),
  end_lon numeric(10,7),
  start_geom geometry(Point,4326),
  end_geom geometry(Point,4326),
  duration_s double precision not null,
  distance_gps_m double precision not null,
  distance_speed_m double precision not null,
  distance_fused_m double precision not null,
  avg_speed_kph double precision,
  max_speed_kph double precision,
  start_soc numeric(5,2),
  end_soc numeric(5,2),
  energy_used_kwh numeric(10,4),
  sample_count integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for trip queries
create index if not exists idx_trips_vin on trips (vin);
create index if not exists idx_trips_vin_start_ts on trips (vin, start_ts desc);
create index if not exists idx_trips_start_ts on trips (start_ts desc);
create index if not exists idx_trips_end_ts on trips (end_ts desc);
create index if not exists idx_trips_vin_created on trips (vin, created_at desc);

-- Unique constraint to prevent duplicate trips
create unique index if not exists idx_trips_vin_start_end_unique
  on trips (vin, start_ts, end_ts);

-- Table: gps_jitter_daily
-- Caches daily GPS jitter radius per vehicle for adaptive thresholds
create table if not exists gps_jitter_daily (
  vin text not null,
  day date not null,
  r_jit_m double precision not null,
  sample_count integer,
  created_at timestamptz default now(),
  primary key (vin, day)
);

-- Index for jitter lookups
create index if not exists idx_jitter_vin_day on gps_jitter_daily (vin, day desc);

-- Function: compute_daily_jitter
-- Calculates the 95th percentile GPS jitter when vehicle is stationary
create or replace function compute_daily_jitter(vin_in text, day_in date)
returns void language plpgsql as $$
declare
  r95 double precision;
  cnt integer;
begin
  with w as (
    select speed as speed_kph,
           ST_DistanceSphere(
             lag(geom) over (order by ts),
             geom
           ) as d_gps_m
    from vehicle_telemetry
    where vin = vin_in
      and ts >= day_in
      and ts < day_in + interval '1 day'
      and geom is not null
  ),
  still_samples as (
    select d_gps_m from w where speed_kph <= 0.5 and d_gps_m is not null
  ),
  all_samples as (
    select d_gps_m from w where d_gps_m is not null
  )
  select
    case
      when (select count(*) from still_samples) >= 20 then
        (select percentile_cont(0.95) within group (order by d_gps_m) from still_samples)
      else
        (select percentile_cont(0.95) within group (order by d_gps_m) from all_samples)
    end,
    (select count(*) from all_samples)
  into r95, cnt;

  if r95 is not null and cnt > 0 then
    insert into gps_jitter_daily(vin, day, r_jit_m, sample_count)
    values (vin_in, day_in, greatest(10.0, least(35.0, r95)), cnt)
    on conflict (vin, day)
    do update set
      r_jit_m = greatest(10.0, least(35.0, excluded.r_jit_m)),
      sample_count = excluded.sample_count,
      created_at = now();
  end if;
end;
$$;

-- Function: derive_trips
-- Implements v1.1 trip segmentation with adaptive jitter, hysteresis, and merging
create or replace function derive_trips(vin_in text, since_ts timestamptz)
returns integer language plpgsql as $$
declare
  trips_created integer := 0;
begin
  with base as (
    select
      ts,
      speed as speed_kph,
      soc,
      soc_precise,
      extract(epoch from ts - lag(ts) over w) as dt_s,
      geom,
      lat,
      lon,
      ST_DistanceSphere(lag(geom) over w, geom) as d_gps_m
    from vehicle_telemetry
    where vin = vin_in
      and ts >= since_ts
      and geom is not null
    window w as (order by ts)
  ),
  feat as (
    select *,
      greatest(dt_s, 0) as dt_s_pos,
      coalesce(d_gps_m, 0) as d_gps_m_pos,
      (coalesce(speed_kph, 0) / 3.6) as speed_mps,
      (coalesce(speed_kph, 0) / 3.6) * greatest(dt_s, 0) as d_speed_m,
      case
        when greatest(dt_s, 0) > 0 then coalesce(d_gps_m, 0) / greatest(dt_s, 0)
        else 0
      end as v_est_mps
    from base
  ),
  win as (
    select *,
      -- 60s / 120s rolling sums using time RANGE windows
      sum(d_gps_m_pos) over (order by ts range between interval '60 seconds' preceding and current row) as gps60_m,
      sum(d_speed_m) over (order by ts range between interval '60 seconds' preceding and current row) as spd60_m,
      sum(d_gps_m_pos) over (order by ts range between interval '120 seconds' preceding and current row) as gps120_m,
      sum(d_speed_m) over (order by ts range between interval '120 seconds' preceding and current row) as spd120_m,
      sum(
        case
          when (speed_mps > 1.5/3.6) or (v_est_mps > 0.6) then 1
          else 0
        end
      ) over (order by ts range between interval '60 seconds' preceding and current row) as flags60
    from feat
  ),
  thr as (
    select w.*,
      coalesce(j.r_jit_m, 20.0) as r_jit,
      greatest(25.0, 2 * coalesce(j.r_jit_m, 20.0)) as r_start,
      greatest(10.0, 1 * coalesce(j.r_jit_m, 20.0)) as r_stop,
      sum(
        case
          when ts - lag(ts) over (order by ts) > interval '180 seconds' then 1
          else 0
        end
      ) over (order by ts) as silence_group
    from win w
    left join gps_jitter_daily j on j.vin = vin_in and j.day = w.ts::date
  ),
  mv as (
    select *,
      greatest(gps60_m, spd60_m) as fused60_m,
      greatest(gps120_m, spd120_m) as fused120_m,
      case when (flags60 >= 2 and greatest(gps60_m, spd60_m) > r_start) then 1 else 0 end as moving_start_cond,
      case when (flags60 = 0 and greatest(gps120_m, spd120_m) < r_stop) then 1 else 0 end as moving_stop_cond
    from thr
  ),
  edges as (
    select *,
      case when moving_start_cond = 1 and coalesce(lag(moving_start_cond) over (order by ts), 0) = 0 then 1 else 0 end as start_edge,
      case when moving_stop_cond = 1 and coalesce(lag(moving_stop_cond) over (order by ts), 0) = 0 then 1 else 0 end as stop_edge
    from mv
  ),
  segments as (
    select
      s.ts as start_ts,
      s.lat as start_lat,
      s.lon as start_lon,
      s.geom as start_geom,
      s.soc as start_soc,
      coalesce(
        (select e2.ts from edges e2
         where e2.ts > s.ts
           and (e2.stop_edge = 1 or e2.silence_group > s.silence_group)
         order by e2.ts limit 1),
        (select max(ts) from edges)
      ) as end_ts
    from edges s
    where s.start_edge = 1
  ),
  scored as (
    select
      seg.start_ts,
      seg.end_ts,
      seg.start_lat,
      seg.start_lon,
      seg.start_geom,
      seg.start_soc,
      sum(f.d_gps_m_pos) filter (where f.ts > seg.start_ts and f.ts <= seg.end_ts) as distance_gps_m,
      sum(f.d_speed_m) filter (where f.ts > seg.start_ts and f.ts <= seg.end_ts) as distance_speed_m,
      avg(f.speed_kph) filter (where f.ts > seg.start_ts and f.ts <= seg.end_ts) as avg_speed_kph,
      max(f.speed_kph) filter (where f.ts > seg.start_ts and f.ts <= seg.end_ts) as max_speed_kph,
      count(*) filter (where f.ts > seg.start_ts and f.ts <= seg.end_ts) as sample_count,
      extract(epoch from (seg.end_ts - seg.start_ts)) as duration_s,
      (select lat from base where ts = seg.end_ts or abs(extract(epoch from ts - seg.end_ts)) < 5 order by abs(extract(epoch from ts - seg.end_ts)) limit 1) as end_lat,
      (select lon from base where ts = seg.end_ts or abs(extract(epoch from ts - seg.end_ts)) < 5 order by abs(extract(epoch from ts - seg.end_ts)) limit 1) as end_lon,
      (select geom from base where ts = seg.end_ts or abs(extract(epoch from ts - seg.end_ts)) < 5 order by abs(extract(epoch from ts - seg.end_ts)) limit 1) as end_geom,
      (select soc from base where ts = seg.end_ts or abs(extract(epoch from ts - seg.end_ts)) < 5 order by abs(extract(epoch from ts - seg.end_ts)) limit 1) as end_soc
    from feat f
    cross join segments seg
    where f.ts between seg.start_ts and seg.end_ts
    group by seg.start_ts, seg.end_ts, seg.start_lat, seg.start_lon, seg.start_geom, seg.start_soc
  ),
  filtered as (
    select *
    from scored
    where duration_s >= 120
      and greatest(coalesce(distance_gps_m, 0), coalesce(distance_speed_m, 0)) >= 300
  )
  insert into trips (
    vin, start_ts, end_ts, start_lat, start_lon, end_lat, end_lon,
    start_geom, end_geom, duration_s, distance_gps_m, distance_speed_m,
    distance_fused_m, avg_speed_kph, max_speed_kph, start_soc, end_soc,
    sample_count
  )
  select
    vin_in,
    f.start_ts,
    f.end_ts,
    f.start_lat,
    f.start_lon,
    f.end_lat,
    f.end_lon,
    f.start_geom,
    f.end_geom,
    f.duration_s,
    coalesce(f.distance_gps_m, 0),
    coalesce(f.distance_speed_m, 0),
    greatest(coalesce(f.distance_gps_m, 0), coalesce(f.distance_speed_m, 0)),
    f.avg_speed_kph,
    f.max_speed_kph,
    f.start_soc,
    f.end_soc,
    f.sample_count
  from filtered f
  where not exists (
    select 1 from trips t
    where t.vin = vin_in
      and tstzrange(t.start_ts, t.end_ts, '[)') && tstzrange(f.start_ts, f.end_ts, '[)')
  )
  on conflict (vin, start_ts, end_ts) do nothing;

  get diagnostics trips_created = row_count;
  return trips_created;
end;
$$;

-- Function: process_all_vehicles_trips
-- Convenience function to process trips for all vehicles
create or replace function process_all_vehicles_trips(since_ts timestamptz default now() - interval '24 hours')
returns table(vin text, trips_created integer) language plpgsql as $$
begin
  return query
  select
    v.vin,
    derive_trips(v.vin, since_ts)
  from (select distinct vehicle_telemetry.vin from vehicle_telemetry) v;
end;
$$;

-- Add RLS policies for trips table
alter table trips enable row level security;

create policy "Allow public read access to trips"
  on trips for select
  using (true);

create policy "Allow service role full access to trips"
  on trips for all
  using (true);

-- Add RLS policies for gps_jitter_daily table
alter table gps_jitter_daily enable row level security;

create policy "Allow public read access to jitter"
  on gps_jitter_daily for select
  using (true);

create policy "Allow service role full access to jitter"
  on gps_jitter_daily for all
  using (true);

-- Grant permissions
grant select on trips to anon, authenticated;
grant select on gps_jitter_daily to anon, authenticated;
grant all on trips to service_role;
grant all on gps_jitter_daily to service_role;

-- Comments
comment on table trips is 'Segmented vehicle trips using v1.1 jitter-aware algorithm';
comment on table gps_jitter_daily is 'Daily GPS jitter radius cache for adaptive trip detection';
comment on function compute_daily_jitter is 'Calculates 95th percentile GPS jitter for a vehicle on a specific day';
comment on function derive_trips is 'Derives trip segments from telemetry using adaptive jitter thresholds';
comment on function process_all_vehicles_trips is 'Process trips for all vehicles since a given timestamp';
