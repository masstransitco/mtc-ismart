#!/usr/bin/env python3
"""
Process vehicle trips using the v1.1 jitter-aware algorithm.
Reads from vehicle_telemetry and writes to trips table.
"""

import pandas as pd
import numpy as np
from math import radians, sin, cos, asin, sqrt
from collections import deque
import os
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime

# Database connection from environment
DB_URL = os.getenv('POSTGRES_URL_NON_POOLING', 'postgres://postgres.sssyxnpanayqvamstind:S9MuK3OiFs3GZSp3@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require')

def haversine_m(a_lat, a_lon, b_lat, b_lon):
    """Calculate distance in meters between two lat/lon points."""
    R = 6371000.0
    dlat = radians(b_lat - a_lat)
    dlon = radians(b_lon - a_lon)
    a = sin(dlat/2)**2 + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(dlon/2)**2
    return 2 * R * asin(sqrt(a))

def process_vehicle_trips(vin, since_date='2025-10-28'):
    """Process trips for a single vehicle."""
    print(f"Processing trips for {vin} since {since_date}...")

    # Connect to database
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # Fetch telemetry data
    query = """
        SELECT ts, lat, lon, speed, soc, soc_precise
        FROM vehicle_telemetry
        WHERE vin = %s
          AND ts >= %s::timestamptz
          AND lat IS NOT NULL
          AND lon IS NOT NULL
          AND lat != 0  -- Exclude POINT(0,0) coordinates
          AND lon != 0  -- These represent GPS signal loss
        ORDER BY ts
    """
    cur.execute(query, (vin, since_date))
    rows = cur.fetchall()

    if len(rows) < 10:
        print(f"  Not enough data for {vin} ({len(rows)} rows)")
        cur.close()
        conn.close()
        return

    print(f"  Loaded {len(rows)} telemetry records")

    # Create DataFrame
    df = pd.DataFrame(rows, columns=['ts', 'lat', 'lon', 'speed_kph', 'soc', 'soc_precise'])
    df['ts'] = pd.to_datetime(df['ts'], utc=True)
    df = df.sort_values('ts').reset_index(drop=True)

    # Convert decimals to floats
    df['speed_kph'] = pd.to_numeric(df['speed_kph'], errors='coerce').fillna(0.0)
    df['lat'] = pd.to_numeric(df['lat'], errors='coerce')
    df['lon'] = pd.to_numeric(df['lon'], errors='coerce')
    df['soc'] = pd.to_numeric(df['soc'], errors='coerce')
    df['soc_precise'] = pd.to_numeric(df['soc_precise'], errors='coerce')

    df['speed_mps'] = df['speed_kph'] / 3.6
    df['dt_s'] = df['ts'].diff().dt.total_seconds().fillna(0).clip(lower=0)

    # Calculate GPS distances
    lat0, lon0 = df['lat'].shift(1), df['lon'].shift(1)
    mask = df['lat'].notna() & df['lon'].notna() & lat0.notna() & lon0.notna()
    d = np.zeros(len(df))
    d[mask.values] = [haversine_m(a, b, c, d_) for a, b, c, d_ in zip(
        df.loc[mask, 'lat'], df.loc[mask, 'lon'], lat0[mask], lon0[mask]
    )]
    df['d_gps_m'] = d
    df['d_speed_m'] = (df['speed_mps'] * df['dt_s']).fillna(0.0)
    df['v_est_mps'] = np.divide(df['d_gps_m'], df['dt_s'], out=np.zeros_like(df['d_gps_m']), where=df['dt_s'] > 0)

    # Evidence flags
    V_MEAS_START = 1.5 / 3.6
    V_EST_FLAG = 0.6
    df['speed_flag'] = (df['speed_mps'] > V_MEAS_START).astype(int)
    df['disp_flag'] = (df['v_est_mps'] > V_EST_FLAG).astype(int)

    # Adaptive jitter per day
    df['day'] = df['ts'].dt.date
    jit = {}
    for day, g in df.groupby('day'):
        still = g[g['speed_kph'] <= 0.5]
        r = np.percentile((still if len(still) >= 20 else g)['d_gps_m'].fillna(0), 95)
        jit[day] = float(np.clip(r, 10.0, 35.0))

    print(f"  Calculated jitter for {len(jit)} days: {jit}")

    # Parameters
    START_WINDOW_S, STOP_WINDOW_S, SILENCE_TMO_S = 60, 120, 180
    MERGE_GAP_S, MIN_TRIP_DURATION_S, MIN_TRIP_DISTANCE_M = 180, 120, 300

    # Sliding window segmentation
    win, trips, state, current_trip = deque(), [], "STOPPED", None

    def window_stats(now):
        while win and (now - win[0][0]).total_seconds() > max(START_WINDOW_S, STOP_WINDOW_S):
            win.popleft()
        if not win:
            return 0, 0, 0
        t = win[-1][0]
        last60 = [w for w in win if (t - w[0]).total_seconds() <= START_WINDOW_S]
        last120 = [w for w in win if (t - w[0]).total_seconds() <= STOP_WINDOW_S]
        flags60 = sum(1 for w in last60 if (w[1] or w[2]))
        fused60 = max(sum(w[3] for w in last60), sum(w[4] for w in last60))
        fused120 = max(sum(w[3] for w in last120), sum(w[4] for w in last120))
        return flags60, fused60, fused120

    last_ts = last_lat = last_lon = last_soc = None
    for i, r in df.iterrows():
        now = r['ts']
        latv, lonv, socv = r['lat'], r['lon'], r['soc']

        # Handle silence timeout
        if last_ts is not None and (now - last_ts).total_seconds() > SILENCE_TMO_S:
            if current_trip:
                current_trip.update(end_idx=i-1, end_ts=last_ts, end_lat=last_lat, end_lon=last_lon, end_soc=last_soc)
                trips.append(current_trip)
                current_trip = None
            state, win = "STOPPED", deque()

        win.append((now, int(r['speed_flag']), int(r['disp_flag']), float(r['d_gps_m']), float(r['d_speed_m'])))
        flags60, fused60, fused120 = window_stats(now)

        rjit = jit.get(r['day'], 20.0)
        R_START, R_STOP = max(25.0, 2*rjit), max(10.0, rjit)

        if state == "STOPPED":
            if flags60 >= 2 and fused60 > R_START:
                state = "MOVING"
                current_trip = {"start_idx": i, "start_ts": now, "start_lat": latv, "start_lon": lonv, "start_soc": socv}
        else:
            if fused120 < R_STOP and flags60 == 0:
                state = "STOPPED"
                current_trip.update(end_idx=i, end_ts=now, end_lat=latv, end_lon=lonv, end_soc=socv)
                trips.append(current_trip)
                current_trip = None

        last_ts, last_lat, last_lon, last_soc = now, latv, lonv, socv

    if current_trip:
        current_trip.update(end_idx=len(df)-1, end_ts=df['ts'].iloc[-1], end_lat=df['lat'].iloc[-1], end_lon=df['lon'].iloc[-1], end_soc=df['soc'].iloc[-1])
        trips.append(current_trip)

    print(f"  Detected {len(trips)} raw trip segments")

    # Calculate metrics
    def metrics(tr):
        s, e = tr['start_idx'], tr['end_idx']
        if e <= s:
            return 0, 0, 0, 0, 0
        dur = (df.loc[e, 'ts'] - df.loc[s, 'ts']).total_seconds()
        dg = df.loc[s+1:e, 'd_gps_m'].sum()
        ds = df.loc[s+1:e, 'd_speed_m'].sum()
        avg_spd = df.loc[s:e, 'speed_kph'].mean()
        max_spd = df.loc[s:e, 'speed_kph'].max()
        return dur, dg, ds, avg_spd, max_spd

    rows = []
    for tr in trips:
        dur, dg, ds, avg_spd, max_spd = metrics(tr)
        rows.append({
            **{k: tr[k] for k in ['start_ts', 'end_ts', 'start_lat', 'start_lon', 'end_lat', 'end_lon', 'start_soc', 'end_soc']},
            "duration_s": dur,
            "distance_gps_m": dg,
            "distance_speed_m": ds,
            "distance_fused_m": max(dg, ds),
            "avg_speed_kph": avg_spd,
            "max_speed_kph": max_spd
        })

    seg = pd.DataFrame(rows)

    # Filter micros
    seg = seg[(seg['duration_s'] >= MIN_TRIP_DURATION_S) & (seg['distance_fused_m'] >= MIN_TRIP_DISTANCE_M)].reset_index(drop=True)
    print(f"  After filtering: {len(seg)} trips")

    # Merge by small gap and proximity
    def hav_m(a, b, c, d):
        if any(pd.isna(x) for x in [a, b, c, d]):
            return np.inf
        return haversine_m(a, b, c, d)

    merged = []
    for _, r in seg.iterrows():
        if not merged:
            merged.append(r.to_dict())
            continue
        prev = merged[-1]
        gap = (r['start_ts'] - pd.to_datetime(prev['end_ts'])).total_seconds()
        rjit = jit.get(pd.to_datetime(r['start_ts']).date(), 20.0)
        prox = hav_m(prev['end_lat'], prev['end_lon'], r['start_lat'], r['start_lon'])
        if gap <= MERGE_GAP_S and prox <= max(50.0, rjit):
            prev['end_ts'] = r['end_ts']
            prev['duration_s'] = prev['duration_s'] + gap + r['duration_s']
            prev['distance_gps_m'] += r['distance_gps_m']
            prev['distance_speed_m'] += r['distance_speed_m']
            prev['distance_fused_m'] = max(prev['distance_gps_m'], prev['distance_speed_m'])
            prev['end_lat'] = r['end_lat']
            prev['end_lon'] = r['end_lon']
            prev['end_soc'] = r['end_soc']
            # Recalculate avg speeds
            prev['avg_speed_kph'] = (prev['avg_speed_kph'] + r['avg_speed_kph']) / 2
            prev['max_speed_kph'] = max(prev['max_speed_kph'], r['max_speed_kph'])
        else:
            merged.append(r.to_dict())

    final = pd.DataFrame(merged)
    print(f"  After merging: {len(final)} trips")

    if len(final) == 0:
        print(f"  No valid trips for {vin}")
        cur.close()
        conn.close()
        return

    # Insert into database
    insert_query = """
        INSERT INTO trips (
            vin, start_ts, end_ts, start_lat, start_lon, end_lat, end_lon,
            duration_s, distance_gps_m, distance_speed_m, distance_fused_m,
            avg_speed_kph, max_speed_kph, start_soc, end_soc
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (vin, start_ts, end_ts) DO NOTHING
    """

    for idx in range(len(final)):
        row = final.iloc[idx]

        # Convert timestamps to strings
        start_ts_str = row['start_ts'].isoformat() if isinstance(row['start_ts'], pd.Timestamp) else str(row['start_ts'])
        end_ts_str = row['end_ts'].isoformat() if isinstance(row['end_ts'], pd.Timestamp) else str(row['end_ts'])

        cur.execute(insert_query, (
            vin,
            start_ts_str,
            end_ts_str,
            float(row['start_lat']) if pd.notna(row['start_lat']) else None,
            float(row['start_lon']) if pd.notna(row['start_lon']) else None,
            float(row['end_lat']) if pd.notna(row['end_lat']) else None,
            float(row['end_lon']) if pd.notna(row['end_lon']) else None,
            float(row['duration_s']),
            float(row['distance_gps_m']),
            float(row['distance_speed_m']),
            float(row['distance_fused_m']),
            float(row['avg_speed_kph']) if pd.notna(row['avg_speed_kph']) else None,
            float(row['max_speed_kph']) if pd.notna(row['max_speed_kph']) else None,
            float(row['start_soc']) if pd.notna(row['start_soc']) else None,
            float(row['end_soc']) if pd.notna(row['end_soc']) else None
        ))

    conn.commit()

    print(f"  ✓ Inserted {len(final)} trips for {vin}")

    cur.close()
    conn.close()

if __name__ == '__main__':
    # Get all VINs
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT vin FROM vehicle_telemetry ORDER BY vin")
    vins = [row[0] for row in cur.fetchall()]
    cur.close()
    conn.close()

    print(f"Processing {len(vins)} vehicles...")
    for vin in vins:
        try:
            process_vehicle_trips(vin)
        except Exception as e:
            print(f"Error processing {vin}: {e}")
            import traceback
            traceback.print_exc()

    print("\nDone!")
