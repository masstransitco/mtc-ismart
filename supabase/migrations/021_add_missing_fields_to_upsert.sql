-- Migration: Add missing door, light, and climate fields to upsert_vehicle_status function
-- Date: 2025-11-12
-- Issue: Function was missing 12 columns that exist in vehicle_status table
-- Impact: Door states, lights, heated seats, and climate settings were not being updated

-- Drop and recreate the function with all fields
CREATE OR REPLACE FUNCTION public.upsert_vehicle_status(p_vin text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.vehicle_status (
    vin, soc, soc_precise, range_km, charging_state,
    charge_current_a, charge_voltage_v, charge_power_kw,
    charging_plug_connected, hv_battery_active, battery_heating,
    charge_current_limit, charge_status_detailed,
    lat, lon, altitude, bearing, speed,
    doors_locked, door_driver_open, door_passenger_open,
    door_rear_left_open, door_rear_right_open,
    windows_state, boot_locked, bonnet_closed,
    interior_temp_c, exterior_temp_c, hvac_state,
    remote_temperature, heated_seat_front_left_level, heated_seat_front_right_level,
    rear_window_defrost,
    lights_main_beam, lights_dipped_beam, lights_side,
    ignition, engine_running, odometer_km,
    is_parked, gps_fix_quality, gps_timestamp, gps_age_seconds,
    last_message_ts, updated_at
  )
  VALUES (
    p_vin,
    (p_data->>'soc')::numeric,
    (p_data->>'soc_precise')::numeric,
    (p_data->>'range_km')::numeric,
    p_data->>'charging_state',
    (p_data->>'charge_current_a')::numeric,
    (p_data->>'charge_voltage_v')::numeric,
    (p_data->>'charge_power_kw')::numeric,
    (p_data->>'charging_plug_connected')::boolean,
    (p_data->>'hv_battery_active')::boolean,
    (p_data->>'battery_heating')::boolean,
    p_data->>'charge_current_limit',
    p_data->>'charge_status_detailed',
    (p_data->>'lat')::numeric,
    (p_data->>'lon')::numeric,
    (p_data->>'altitude')::numeric,
    (p_data->>'bearing')::numeric,
    (p_data->>'speed')::numeric,
    (p_data->>'doors_locked')::boolean,
    (p_data->>'door_driver_open')::boolean,
    (p_data->>'door_passenger_open')::boolean,
    (p_data->>'door_rear_left_open')::boolean,
    (p_data->>'door_rear_right_open')::boolean,
    p_data->'windows_state',
    (p_data->>'boot_locked')::boolean,
    (p_data->>'bonnet_closed')::boolean,
    (p_data->>'interior_temp_c')::numeric,
    (p_data->>'exterior_temp_c')::numeric,
    p_data->>'hvac_state',
    (p_data->>'remote_temperature')::integer,
    (p_data->>'heated_seat_front_left_level')::integer,
    (p_data->>'heated_seat_front_right_level')::integer,
    (p_data->>'rear_window_defrost')::boolean,
    (p_data->>'lights_main_beam')::boolean,
    (p_data->>'lights_dipped_beam')::boolean,
    (p_data->>'lights_side')::boolean,
    (p_data->>'ignition')::boolean,
    (p_data->>'engine_running')::boolean,
    (p_data->>'odometer_km')::numeric,
    (p_data->>'is_parked')::boolean,
    p_data->>'gps_fix_quality',
    (p_data->>'gps_timestamp')::timestamptz,
    (p_data->>'gps_age_seconds')::integer,
    now(),
    now()
  )
  ON CONFLICT (vin)
  DO UPDATE SET
    soc = COALESCE((p_data->>'soc')::numeric, vehicle_status.soc),
    soc_precise = COALESCE((p_data->>'soc_precise')::numeric, vehicle_status.soc_precise),
    range_km = COALESCE((p_data->>'range_km')::numeric, vehicle_status.range_km),
    charging_state = COALESCE(p_data->>'charging_state', vehicle_status.charging_state),
    charge_current_a = COALESCE((p_data->>'charge_current_a')::numeric, vehicle_status.charge_current_a),
    charge_voltage_v = COALESCE((p_data->>'charge_voltage_v')::numeric, vehicle_status.charge_voltage_v),
    charge_power_kw = COALESCE((p_data->>'charge_power_kw')::numeric, vehicle_status.charge_power_kw),
    charging_plug_connected = COALESCE((p_data->>'charging_plug_connected')::boolean, vehicle_status.charging_plug_connected),
    hv_battery_active = COALESCE((p_data->>'hv_battery_active')::boolean, vehicle_status.hv_battery_active),
    battery_heating = COALESCE((p_data->>'battery_heating')::boolean, vehicle_status.battery_heating),
    charge_current_limit = COALESCE(p_data->>'charge_current_limit', vehicle_status.charge_current_limit),
    charge_status_detailed = COALESCE(p_data->>'charge_status_detailed', vehicle_status.charge_status_detailed),
    -- GPS Coordinates: Only update if new value is non-zero (SAIC sends 0.0 when GPS lost)
    -- This preserves last known good position when vehicle is in underground parking
    lat = CASE
      WHEN (p_data->>'lat')::numeric IS NOT NULL AND (p_data->>'lat')::numeric != 0
      THEN (p_data->>'lat')::numeric
      ELSE vehicle_status.lat
    END,
    lon = CASE
      WHEN (p_data->>'lon')::numeric IS NOT NULL AND (p_data->>'lon')::numeric != 0
      THEN (p_data->>'lon')::numeric
      ELSE vehicle_status.lon
    END,
    altitude = COALESCE((p_data->>'altitude')::numeric, vehicle_status.altitude),
    bearing = COALESCE((p_data->>'bearing')::numeric, vehicle_status.bearing),
    speed = COALESCE((p_data->>'speed')::numeric, vehicle_status.speed),
    doors_locked = COALESCE((p_data->>'doors_locked')::boolean, vehicle_status.doors_locked),
    door_driver_open = COALESCE((p_data->>'door_driver_open')::boolean, vehicle_status.door_driver_open),
    door_passenger_open = COALESCE((p_data->>'door_passenger_open')::boolean, vehicle_status.door_passenger_open),
    door_rear_left_open = COALESCE((p_data->>'door_rear_left_open')::boolean, vehicle_status.door_rear_left_open),
    door_rear_right_open = COALESCE((p_data->>'door_rear_right_open')::boolean, vehicle_status.door_rear_right_open),
    windows_state = COALESCE(p_data->'windows_state', vehicle_status.windows_state),
    boot_locked = COALESCE((p_data->>'boot_locked')::boolean, vehicle_status.boot_locked),
    bonnet_closed = COALESCE((p_data->>'bonnet_closed')::boolean, vehicle_status.bonnet_closed),
    interior_temp_c = COALESCE((p_data->>'interior_temp_c')::numeric, vehicle_status.interior_temp_c),
    exterior_temp_c = COALESCE((p_data->>'exterior_temp_c')::numeric, vehicle_status.exterior_temp_c),
    hvac_state = COALESCE(p_data->>'hvac_state', vehicle_status.hvac_state),
    remote_temperature = COALESCE((p_data->>'remote_temperature')::integer, vehicle_status.remote_temperature),
    heated_seat_front_left_level = COALESCE((p_data->>'heated_seat_front_left_level')::integer, vehicle_status.heated_seat_front_left_level),
    heated_seat_front_right_level = COALESCE((p_data->>'heated_seat_front_right_level')::integer, vehicle_status.heated_seat_front_right_level),
    rear_window_defrost = COALESCE((p_data->>'rear_window_defrost')::boolean, vehicle_status.rear_window_defrost),
    lights_main_beam = COALESCE((p_data->>'lights_main_beam')::boolean, vehicle_status.lights_main_beam),
    lights_dipped_beam = COALESCE((p_data->>'lights_dipped_beam')::boolean, vehicle_status.lights_dipped_beam),
    lights_side = COALESCE((p_data->>'lights_side')::boolean, vehicle_status.lights_side),
    ignition = COALESCE((p_data->>'ignition')::boolean, vehicle_status.ignition),
    engine_running = COALESCE((p_data->>'engine_running')::boolean, vehicle_status.engine_running),
    odometer_km = COALESCE((p_data->>'odometer_km')::numeric, vehicle_status.odometer_km),
    is_parked = COALESCE((p_data->>'is_parked')::boolean, vehicle_status.is_parked),
    gps_fix_quality = COALESCE(p_data->>'gps_fix_quality', vehicle_status.gps_fix_quality),
    gps_timestamp = COALESCE((p_data->>'gps_timestamp')::timestamptz, vehicle_status.gps_timestamp),
    gps_age_seconds = COALESCE((p_data->>'gps_age_seconds')::integer, vehicle_status.gps_age_seconds),
    last_message_ts = now(),
    updated_at = now();
END;
$function$;

-- Verify the function was updated
DO $$
BEGIN
  RAISE NOTICE 'Migration 021 complete: upsert_vehicle_status function updated with 12 additional fields';
  RAISE NOTICE 'Added fields: door_driver_open, door_passenger_open, door_rear_left_open, door_rear_right_open';
  RAISE NOTICE 'Added fields: bonnet_closed, lights_main_beam, lights_dipped_beam, lights_side';
  RAISE NOTICE 'Added fields: remote_temperature, heated_seat_front_left_level, heated_seat_front_right_level, rear_window_defrost';
END $$;
