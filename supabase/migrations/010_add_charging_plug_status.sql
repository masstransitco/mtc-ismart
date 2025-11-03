-- Add charging plug connection and battery status fields
-- Migration 010: Enhanced charging status tracking

-- Add new columns to vehicle_status
ALTER TABLE public.vehicle_status
  ADD COLUMN IF NOT EXISTS charging_plug_connected BOOLEAN,
  ADD COLUMN IF NOT EXISTS hv_battery_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS battery_heating BOOLEAN,
  ADD COLUMN IF NOT EXISTS charge_current_limit TEXT,
  ADD COLUMN IF NOT EXISTS charge_status_detailed TEXT;

-- Add same columns to vehicle_telemetry for historical tracking
ALTER TABLE public.vehicle_telemetry
  ADD COLUMN IF NOT EXISTS charging_plug_connected BOOLEAN,
  ADD COLUMN IF NOT EXISTS hv_battery_active BOOLEAN,
  ADD COLUMN IF NOT EXISTS battery_heating BOOLEAN,
  ADD COLUMN IF NOT EXISTS charge_current_limit TEXT;

-- Update the upsert_vehicle_status function to handle new fields
CREATE OR REPLACE FUNCTION public.upsert_vehicle_status(
  p_vin text,
  p_data jsonb
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.vehicle_status (
    vin, soc, soc_precise, range_km, charging_state,
    charge_current_a, charge_voltage_v, charge_power_kw,
    charging_plug_connected, hv_battery_active, battery_heating,
    charge_current_limit, charge_status_detailed,
    lat, lon, altitude, bearing, speed,
    doors_locked, windows_state, boot_locked,
    interior_temp_c, exterior_temp_c, hvac_state,
    ignition, engine_running, odometer_km,
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
    p_data->'windows_state',
    (p_data->>'boot_locked')::boolean,
    (p_data->>'interior_temp_c')::numeric,
    (p_data->>'exterior_temp_c')::numeric,
    p_data->>'hvac_state',
    (p_data->>'ignition')::boolean,
    (p_data->>'engine_running')::boolean,
    (p_data->>'odometer_km')::numeric,
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
    lat = COALESCE((p_data->>'lat')::numeric, vehicle_status.lat),
    lon = COALESCE((p_data->>'lon')::numeric, vehicle_status.lon),
    altitude = COALESCE((p_data->>'altitude')::numeric, vehicle_status.altitude),
    bearing = COALESCE((p_data->>'bearing')::numeric, vehicle_status.bearing),
    speed = COALESCE((p_data->>'speed')::numeric, vehicle_status.speed),
    doors_locked = COALESCE((p_data->>'doors_locked')::boolean, vehicle_status.doors_locked),
    windows_state = COALESCE(p_data->'windows_state', vehicle_status.windows_state),
    boot_locked = COALESCE((p_data->>'boot_locked')::boolean, vehicle_status.boot_locked),
    interior_temp_c = COALESCE((p_data->>'interior_temp_c')::numeric, vehicle_status.interior_temp_c),
    exterior_temp_c = COALESCE((p_data->>'exterior_temp_c')::numeric, vehicle_status.exterior_temp_c),
    hvac_state = COALESCE(p_data->>'hvac_state', vehicle_status.hvac_state),
    ignition = COALESCE((p_data->>'ignition')::boolean, vehicle_status.ignition),
    engine_running = COALESCE((p_data->>'engine_running')::boolean, vehicle_status.engine_running),
    odometer_km = COALESCE((p_data->>'odometer_km')::numeric, vehicle_status.odometer_km),
    last_message_ts = now(),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON COLUMN public.vehicle_status.charging_plug_connected IS 'Whether the charging cable is physically connected (independent of charging state)';
COMMENT ON COLUMN public.vehicle_status.hv_battery_active IS 'High voltage battery active state';
COMMENT ON COLUMN public.vehicle_status.battery_heating IS 'Battery heating status (useful in cold weather)';
COMMENT ON COLUMN public.vehicle_status.charge_current_limit IS 'Charge current limit setting (6A, 8A, 16A, MAX)';
COMMENT ON COLUMN public.vehicle_status.charge_status_detailed IS 'Detailed charge status text';
