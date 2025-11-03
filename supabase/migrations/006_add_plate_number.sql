-- Add plate_number column to vehicles table
-- Migration 006: Vehicle Plate Numbers

-- Add plate_number column
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS plate_number TEXT;

-- Add index for plate number lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_plate_number ON public.vehicles(plate_number);

-- Populate plate numbers for existing vehicles
UPDATE public.vehicles SET plate_number = 'YV3617' WHERE vin = 'LSJWH4098PN070124';
UPDATE public.vehicles SET plate_number = 'YV2570' WHERE vin = 'LSJWH4092PN070121';
UPDATE public.vehicles SET plate_number = 'ZK5419' WHERE vin = 'LSJWH4092PN070118';
UPDATE public.vehicles SET plate_number = 'YV4136' WHERE vin = 'LSJWH4098PN070110';
UPDATE public.vehicles SET plate_number = 'YV2548' WHERE vin = 'LSJWH409XPN070089';

-- Comment for documentation
COMMENT ON COLUMN public.vehicles.plate_number IS 'Vehicle registration plate number';
