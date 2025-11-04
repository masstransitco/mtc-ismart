-- Add per-signal timestamps to preserve MQTT message arrival times before 5-second batching
-- This allows post-facto diagnosis of temporal contradictions (e.g., ignition changed before GPS updated)
-- Only tracking timestamps for critical fields that are used in state determinations

-- Add per-signal timestamp columns to vehicle_telemetry table
ALTER TABLE public.vehicle_telemetry
  ADD COLUMN IF NOT EXISTS soc_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lat_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lon_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS speed_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ignition_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS doors_locked_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS charging_state_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS charge_power_timestamp TIMESTAMPTZ;

-- Add helpful comments
COMMENT ON COLUMN public.vehicle_telemetry.soc_timestamp IS 'Actual MQTT message arrival time for SoC field (before 5s batching flush)';
COMMENT ON COLUMN public.vehicle_telemetry.lat_timestamp IS 'Actual MQTT message arrival time for latitude field (before 5s batching flush)';
COMMENT ON COLUMN public.vehicle_telemetry.lon_timestamp IS 'Actual MQTT message arrival time for longitude field (before 5s batching flush)';
COMMENT ON COLUMN public.vehicle_telemetry.speed_timestamp IS 'Actual MQTT message arrival time for speed field (before 5s batching flush)';
COMMENT ON COLUMN public.vehicle_telemetry.ignition_timestamp IS 'Actual MQTT message arrival time for ignition field (before 5s batching flush)';
COMMENT ON COLUMN public.vehicle_telemetry.doors_locked_timestamp IS 'Actual MQTT message arrival time for doors_locked field (before 5s batching flush)';
COMMENT ON COLUMN public.vehicle_telemetry.charging_state_timestamp IS 'Actual MQTT message arrival time for charging_state field (before 5s batching flush)';
COMMENT ON COLUMN public.vehicle_telemetry.charge_power_timestamp IS 'Actual MQTT message arrival time for charge_power field (before 5s batching flush)';

-- Create indexes for timestamp-based queries
CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_soc_ts ON public.vehicle_telemetry(vin, soc_timestamp DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_location_ts ON public.vehicle_telemetry(vin, lat_timestamp DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_speed_ts ON public.vehicle_telemetry(vin, speed_timestamp DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_ignition_ts ON public.vehicle_telemetry(vin, ignition_timestamp DESC NULLS LAST);

-- Note: These timestamps are populated by the ingestion service (server/ingest.ts) when it
-- records individual MQTT message arrival times before the 5-second cache flush
