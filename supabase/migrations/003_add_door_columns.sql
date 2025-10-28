-- Add individual door status columns to vehicle_status table
ALTER TABLE public.vehicle_status
  ADD COLUMN IF NOT EXISTS door_driver_open BOOLEAN,
  ADD COLUMN IF NOT EXISTS door_passenger_open BOOLEAN,
  ADD COLUMN IF NOT EXISTS door_rear_left_open BOOLEAN,
  ADD COLUMN IF NOT EXISTS door_rear_right_open BOOLEAN;

-- Add comments for clarity
COMMENT ON COLUMN public.vehicle_status.door_driver_open IS 'Driver door open status (true = open, false = closed)';
COMMENT ON COLUMN public.vehicle_status.door_passenger_open IS 'Front passenger door open status (true = open, false = closed)';
COMMENT ON COLUMN public.vehicle_status.door_rear_left_open IS 'Rear left door open status (true = open, false = closed)';
COMMENT ON COLUMN public.vehicle_status.door_rear_right_open IS 'Rear right door open status (true = open, false = closed)';
