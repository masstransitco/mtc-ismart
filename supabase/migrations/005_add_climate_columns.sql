-- Add comprehensive climate control columns to vehicle_status table
ALTER TABLE public.vehicle_status
  ADD COLUMN IF NOT EXISTS remote_temperature INTEGER,
  ADD COLUMN IF NOT EXISTS heated_seat_front_left_level INTEGER,
  ADD COLUMN IF NOT EXISTS heated_seat_front_right_level INTEGER,
  ADD COLUMN IF NOT EXISTS rear_window_defrost BOOLEAN;

-- Add comments for clarity
COMMENT ON COLUMN public.vehicle_status.remote_temperature IS 'Target AC temperature in Celsius (e.g., 22)';
COMMENT ON COLUMN public.vehicle_status.heated_seat_front_left_level IS 'Front left heated seat level (0=off, 1-3=heat levels)';
COMMENT ON COLUMN public.vehicle_status.heated_seat_front_right_level IS 'Front right heated seat level (0=off, 1-3=heat levels)';
COMMENT ON COLUMN public.vehicle_status.rear_window_defrost IS 'Rear window defroster heating status (true=on, false=off)';
