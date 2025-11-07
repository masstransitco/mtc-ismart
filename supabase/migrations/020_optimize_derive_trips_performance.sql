-- Optimize derive_trips performance by removing CROSS JOIN cartesian product
-- Issue: The CROSS JOIN between feat and segments creates O(n*m) complexity
-- Solution: Use window functions and JOIN ON timestamp ranges instead

CREATE OR REPLACE FUNCTION derive_trips(vin_in text, since_ts timestamptz)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  trips_created integer := 0;
BEGIN
  WITH base AS (
    SELECT
      ts,
      speed as speed_kph,
      soc,
      soc_precise,
      extract(epoch from ts - lag(ts) OVER w) as dt_s,
      geom,
      lat,
      lon,
      ST_DistanceSphere(lag(geom) OVER w, geom) as d_gps_m,
      ts - lag(ts) OVER w as dt_interval
    FROM vehicle_telemetry
    WHERE vin = vin_in
      AND ts >= since_ts
      AND geom IS NOT NULL
      AND lat != 0  -- Exclude POINT(0,0) coordinates
      AND lon != 0  -- These represent GPS signal loss
    WINDOW w AS (ORDER BY ts)
  ),
  feat AS (
    SELECT *,
      greatest(dt_s, 0) as dt_s_pos,
      coalesce(d_gps_m, 0) as d_gps_m_pos,
      (coalesce(speed_kph, 0) / 3.6) as speed_mps,
      (coalesce(speed_kph, 0) / 3.6) * greatest(dt_s, 0) as d_speed_m,
      CASE
        WHEN greatest(dt_s, 0) > 0 THEN coalesce(d_gps_m, 0) / greatest(dt_s, 0)
        ELSE 0
      END as v_est_mps
    FROM base
  ),
  win AS (
    SELECT *,
      -- 60s / 120s rolling sums using time RANGE windows
      sum(d_gps_m_pos) OVER (ORDER BY ts RANGE BETWEEN interval '60 seconds' PRECEDING AND CURRENT ROW) as gps60_m,
      sum(d_speed_m) OVER (ORDER BY ts RANGE BETWEEN interval '60 seconds' PRECEDING AND CURRENT ROW) as spd60_m,
      sum(d_gps_m_pos) OVER (ORDER BY ts RANGE BETWEEN interval '120 seconds' PRECEDING AND CURRENT ROW) as gps120_m,
      sum(d_speed_m) OVER (ORDER BY ts RANGE BETWEEN interval '120 seconds' PRECEDING AND CURRENT ROW) as spd120_m,
      sum(
        CASE
          WHEN (speed_mps > 1.5/3.6) OR (v_est_mps > 0.6) THEN 1
          ELSE 0
        END
      ) OVER (ORDER BY ts RANGE BETWEEN interval '60 seconds' PRECEDING AND CURRENT ROW) as flags60
    FROM feat
  ),
  silence_calc AS (
    SELECT *,
      CASE WHEN dt_interval > interval '180 seconds' THEN 1 ELSE 0 END as is_silence_break
    FROM win
  ),
  thr AS (
    SELECT w.*,
      coalesce(j.r_jit_m, 20.0) as r_jit,
      greatest(25.0, 2 * coalesce(j.r_jit_m, 20.0)) as r_start,
      greatest(10.0, 1 * coalesce(j.r_jit_m, 20.0)) as r_stop,
      sum(w.is_silence_break) OVER (ORDER BY w.ts) as silence_group
    FROM silence_calc w
    LEFT JOIN gps_jitter_daily j ON j.vin = vin_in AND j.day = w.ts::date
  ),
  mv AS (
    SELECT *,
      greatest(gps60_m, spd60_m) as fused60_m,
      greatest(gps120_m, spd120_m) as fused120_m,
      CASE WHEN (flags60 >= 2 AND greatest(gps60_m, spd60_m) > r_start) THEN 1 ELSE 0 END as moving_start_cond,
      CASE WHEN (flags60 = 0 AND greatest(gps120_m, spd120_m) < r_stop) THEN 1 ELSE 0 END as moving_stop_cond
    FROM thr
  ),
  edges AS (
    SELECT *,
      CASE WHEN moving_start_cond = 1 AND coalesce(lag(moving_start_cond) OVER (ORDER BY ts), 0) = 0 THEN 1 ELSE 0 END as start_edge,
      CASE WHEN moving_stop_cond = 1 AND coalesce(lag(moving_stop_cond) OVER (ORDER BY ts), 0) = 0 THEN 1 ELSE 0 END as stop_edge
    FROM mv
  ),
  segments AS (
    SELECT
      s.ts as start_ts,
      s.lat as start_lat,
      s.lon as start_lon,
      s.geom as start_geom,
      s.soc as start_soc,
      s.silence_group,
      coalesce(
        (SELECT e2.ts FROM edges e2
         WHERE e2.ts > s.ts
           AND (e2.stop_edge = 1 OR e2.silence_group > s.silence_group)
         ORDER BY e2.ts LIMIT 1),
        (SELECT max(ts) FROM edges)
      ) as end_ts
    FROM edges s
    WHERE s.start_edge = 1
  ),
  -- Use efficient aggregation with JOIN ON timestamp range instead of CROSS JOIN
  scored AS (
    SELECT
      seg.start_ts,
      seg.end_ts,
      seg.start_lat,
      seg.start_lon,
      seg.start_geom,
      seg.start_soc,
      sum(f.d_gps_m_pos) as distance_gps_m,
      sum(f.d_speed_m) as distance_speed_m,
      avg(f.speed_kph) as avg_speed_kph,
      max(f.speed_kph) as max_speed_kph,
      count(*) as sample_count,
      extract(epoch FROM (seg.end_ts - seg.start_ts)) as duration_s,
      (SELECT lat FROM feat WHERE ts >= seg.start_ts ORDER BY abs(extract(epoch FROM ts - seg.end_ts)) LIMIT 1) as end_lat,
      (SELECT lon FROM feat WHERE ts >= seg.start_ts ORDER BY abs(extract(epoch FROM ts - seg.end_ts)) LIMIT 1) as end_lon,
      (SELECT geom FROM feat WHERE ts >= seg.start_ts ORDER BY abs(extract(epoch FROM ts - seg.end_ts)) LIMIT 1) as end_geom,
      (SELECT soc FROM feat WHERE ts >= seg.start_ts ORDER BY abs(extract(epoch FROM ts - seg.end_ts)) LIMIT 1) as end_soc
    FROM segments seg
    JOIN feat f ON f.ts > seg.start_ts AND f.ts <= seg.end_ts
    GROUP BY seg.start_ts, seg.end_ts, seg.start_lat, seg.start_lon, seg.start_geom, seg.start_soc
  ),
  filtered AS (
    SELECT *
    FROM scored
    WHERE duration_s >= 120
      AND greatest(coalesce(distance_gps_m, 0), coalesce(distance_speed_m, 0)) >= 300
  )
  INSERT INTO trips (
    vin, start_ts, end_ts, start_lat, start_lon, end_lat, end_lon,
    start_geom, end_geom, duration_s, distance_gps_m, distance_speed_m,
    distance_fused_m, avg_speed_kph, max_speed_kph, start_soc, end_soc,
    sample_count
  )
  SELECT
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
  FROM filtered f
  WHERE NOT EXISTS (
    SELECT 1 FROM trips t
    WHERE t.vin = vin_in
      AND tstzrange(t.start_ts, t.end_ts, '[)') && tstzrange(f.start_ts, f.end_ts, '[)')
  )
  ON CONFLICT (vin, start_ts, end_ts) DO NOTHING;

  GET DIAGNOSTICS trips_created = ROW_COUNT;
  RETURN trips_created;
END;
$$;

COMMENT ON FUNCTION derive_trips IS 'Derives trip segments from telemetry using adaptive jitter thresholds (excludes POINT(0,0), optimized performance)';
