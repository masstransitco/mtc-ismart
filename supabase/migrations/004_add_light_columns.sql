-- Add light status columns to vehicle_status table
ALTER TABLE public.vehicle_status
  ADD COLUMN IF NOT EXISTS lights_main_beam BOOLEAN,
  ADD COLUMN IF NOT EXISTS lights_dipped_beam BOOLEAN,
  ADD COLUMN IF NOT EXISTS lights_side BOOLEAN;

-- Add comments for clarity
COMMENT ON COLUMN public.vehicle_status.lights_main_beam IS 'High beam headlights status (true = on, false = off)';
COMMENT ON COLUMN public.vehicle_status.lights_dipped_beam IS 'Low beam/dipped headlights status (true = on, false = off)';
COMMENT ON COLUMN public.vehicle_status.lights_side IS 'Side lights/parking lights status (true = on, false = off)';
