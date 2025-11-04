-- Add motion_state field to track driving dynamics
-- Possible values: Regenerating, Propelling, Coasting, NULL (not moving)

ALTER TABLE public.vehicle_status
  ADD COLUMN IF NOT EXISTS motion_state TEXT;

ALTER TABLE public.vehicle_telemetry
  ADD COLUMN IF NOT EXISTS motion_state TEXT;

COMMENT ON COLUMN public.vehicle_status.motion_state IS 'Derived motion state: Regenerating|Propelling|Coasting (NULL when stationary)';
COMMENT ON COLUMN public.vehicle_telemetry.motion_state IS 'Derived motion state: Regenerating|Propelling|Coasting (NULL when stationary)';
