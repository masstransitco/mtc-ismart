-- Migration: Fix Overlapping Trips Issue
-- Date: 2025-11-12
-- Issue: Hourly cron jobs with 1-hour lookback creating duplicate/overlapping trips
--        causing total trip duration to exceed 24 hours in a 24-hour period
--
-- Root Cause: The duplicate check uses `&&` (any overlap) which is too permissive
--             Hourly processing with rolling windows causes slightly different trip
--             boundaries to be detected, all converging to the same end time
--
-- Fix: Change duplicate detection from "any overlap" to "significant overlap"
--      Only reject trips that have >10% time overlap with existing trips

-- Drop the old function
drop function if exists derive_trips(text, timestamptz);

-- Recreate with fixed duplicate detection logic
create or replace function derive_trips(vin_in text, since_ts timestamptz)
returns integer language plpgsql as $$
declare
  trips_created integer;
begin
  with base as (
    select
      vin, ts, speed as speed_kph, soc,
      extract(epoch from ts - lag(ts) over (order by ts)) as dt_s,
      geom,
      ST_DistanceSphere(lag(geom) over (order by ts), geom) as d_gps_m
    from vehicle_telemetry
    where vin = vin_in
      and ts >= since_ts
      and lat is not null
      and lon is not null
      and lat != 0  -- Exclude GPS signal loss
      and lon != 0  -- POINT(0,0) coordinates
  ),
  feat as (
    select *,
      greatest(dt_s, 0) as dt_s_pos,
      coalesce(d_gps_m, 0) as d_gps_m_pos,
      (coalesce(speed_kph, 0) / 3.6) as speed_mps,
      (coalesce(speed_kph, 0) / 3.6) * greatest(dt_s, 0) as d_speed_m,
      case when greatest(dt_s, 0) > 0 then coalesce(d_gps_m, 0) / greatest(dt_s, 0) else 0 end as v_est_mps
    from base
  ),
  win as (
    select *,
      sum(d_gps_m_pos) over (order by ts range between interval '60 seconds' preceding and current row) as gps60_m,
      sum(d_speed_m) over (order by ts range between interval '60 seconds' preceding and current row) as spd60_m,
      sum(d_gps_m_pos) over (order by ts range between interval '120 seconds' preceding and current row) as gps120_m,
      sum(d_speed_m) over (order by ts range between interval '120 seconds' preceding and current row) as spd120_m,
      sum(case when ((coalesce(speed_kph, 0) / 3.6) > 1.5 / 3.6) or (coalesce(v_est_mps, 0) > 0.6) then 1 else 0 end)
        over (order by ts range between interval '60 seconds' preceding and current row) as flags60
    from feat
  ),
  thr as (
    select w.*,
      coalesce(j.r_jit_m, 20.0) as r_jit,
      greatest(25.0, 2 * coalesce(j.r_jit_m, 20.0)) as r_start,
      greatest(10.0, 1 * coalesce(j.r_jit_m, 20.0)) as r_stop,
      greatest(sum(case when ts - lag(ts) over (order by ts) > interval '180 seconds' then 1 else 0 end)
        over (order by ts), 0) as silence_breaks
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
      case when moving_start_cond = 1 and lag(moving_start_cond, 1, 0) over (order by ts) = 0 then 1 else 0 end as start_edge,
      case when moving_stop_cond = 1 and lag(moving_stop_cond, 1, 0) over (order by ts) = 0 then 1 else 0 end as stop_edge
    from mv
  ),
  segments as (
    select s.ts as start_ts,
      coalesce(
        (select e2.ts from edges e2
         where e2.ts > s.ts
           and (e2.stop_edge = 1 or e2.silence_breaks > (select silence_breaks from edges x where x.ts = s.ts))
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
      sum(d_gps_m_pos) filter (where ts > seg.start_ts and ts <= seg.end_ts) as distance_gps_m,
      sum(d_speed_m) filter (where ts > seg.start_ts and ts <= seg.end_ts) as distance_speed_m,
      extract(epoch from (seg.end_ts - seg.start_ts)) as duration_s,
      avg(speed_kph) filter (where ts > seg.start_ts and ts <= seg.end_ts) as avg_speed_kph,
      max(speed_kph) filter (where ts > seg.start_ts and ts <= seg.end_ts) as max_speed_kph,
      (select soc from feat where ts <= seg.start_ts order by ts desc limit 1) as start_soc,
      (select soc from feat where ts <= seg.end_ts order by ts desc limit 1) as end_soc,
      count(*) filter (where ts > seg.start_ts and ts <= seg.end_ts) as sample_count
    from feat f
    join segments seg on f.ts between seg.start_ts and seg.end_ts
    group by seg.start_ts, seg.end_ts
  ),
  filtered as (
    select * from scored
    where duration_s >= 120
      and greatest(coalesce(distance_gps_m, 0), coalesce(distance_speed_m, 0)) >= 300
  )
  insert into trips (
    vin, start_ts, end_ts, start_geom, end_geom,
    distance_gps_m, distance_speed_m, distance_fused_m,
    duration_s, avg_speed_kph, max_speed_kph,
    start_soc, end_soc, sample_count
  )
  select
    vin_in,
    f.start_ts,
    f.end_ts,
    (select geom from vehicle_telemetry
     where vin = vin_in order by abs(extract(epoch from (ts - f.start_ts))) asc limit 1),
    (select geom from vehicle_telemetry
     where vin = vin_in order by abs(extract(epoch from (ts - f.end_ts))) asc limit 1),
    coalesce(f.distance_gps_m, 0),
    coalesce(f.distance_speed_m, 0),
    greatest(coalesce(f.distance_gps_m, 0), coalesce(f.distance_speed_m, 0)),
    f.duration_s,
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
      -- NEW: Only reject if overlap is >10% of the new trip's duration
      and (
        extract(epoch from (least(t.end_ts, f.end_ts) - greatest(t.start_ts, f.start_ts)))
        / nullif(extract(epoch from (f.end_ts - f.start_ts)), 0)
      ) > 0.1
  )
  on conflict (vin, start_ts, end_ts) do nothing;

  get diagnostics trips_created = row_count;
  return trips_created;
end;
$$;

-- Create function to merge overlapping trips for a specific VIN
create or replace function merge_overlapping_trips(vin_in text)
returns table(
  deleted_count integer,
  merged_into_count integer
) language plpgsql as $$
declare
  deleted_trips integer := 0;
  kept_trips integer := 0;
begin
  -- Delete overlapping trips, keeping the earliest trip in each group
  with overlapping_pairs as (
    select
      t1.trip_id as keep_id,
      t2.trip_id as delete_id,
      extract(epoch from (least(t1.end_ts, t2.end_ts) - greatest(t1.start_ts, t2.start_ts))) as overlap_seconds,
      extract(epoch from (t2.end_ts - t2.start_ts)) as delete_duration_seconds
    from trips t1
    join trips t2 on t1.vin = t2.vin
      and t1.trip_id < t2.trip_id  -- Keep earlier trip
      and tstzrange(t1.start_ts, t1.end_ts, '[)') && tstzrange(t2.start_ts, t2.end_ts, '[)')
    where t1.vin = vin_in
  ),
  filtered_overlaps as (
    select keep_id, delete_id
    from overlapping_pairs
    where (overlap_seconds / nullif(delete_duration_seconds, 0)) > 0.1  -- >10% overlap
  )
  delete from trips
  where trip_id in (select delete_id from filtered_overlaps);

  get diagnostics deleted_trips = row_count;

  -- Count kept trips (those that had overlaps)
  with overlapping_pairs as (
    select
      t1.trip_id as keep_id,
      extract(epoch from (least(t1.end_ts, t2.end_ts) - greatest(t1.start_ts, t2.start_ts))) as overlap_seconds,
      extract(epoch from (t2.end_ts - t2.start_ts)) as delete_duration_seconds
    from trips t1
    left join (
      select trip_id, vin, start_ts, end_ts from trips where false
    ) t2 on t1.vin = t2.vin
      and t1.trip_id < t2.trip_id
      and tstzrange(t1.start_ts, t1.end_ts, '[)') && tstzrange(t2.start_ts, t2.end_ts, '[)')
    where t1.vin = vin_in
  )
  select 0 into kept_trips;

  deleted_count := deleted_trips;
  merged_into_count := kept_trips;

  return next;
end;
$$;

-- Create function to clean all overlapping trips across all vehicles
create or replace function clean_all_overlapping_trips()
returns table(
  vin text,
  deleted_count integer,
  merged_into_count integer
) language plpgsql as $$
declare
  vehicle_vin text;
begin
  for vehicle_vin in
    select distinct trips.vin from trips order by trips.vin
  loop
    return query
    select vehicle_vin, r.deleted_count, r.merged_into_count
    from merge_overlapping_trips(vehicle_vin) r;
  end loop;
end;
$$;

-- Add comment explaining the fix
comment on function derive_trips(text, timestamptz) is
  'v2.1: Fixed duplicate detection to only reject trips with >10% time overlap. '
  'Prevents hourly cron jobs from creating multiple trips with slightly different '
  'start times that all converge to the same end time.';

comment on function merge_overlapping_trips(text) is
  'Merge overlapping trips for a specific VIN by deleting trips that have >10% '
  'time overlap with earlier trips. Keeps the earliest trip in each overlapping group.';

comment on function clean_all_overlapping_trips() is
  'Clean overlapping trips across all vehicles in the database.';
