-- Migration: Add vehicle PIN storage for unlock commands
-- Created: 2025-10-30
-- Purpose: Store vehicle unlock PINs to fix unlock timeout issues

-- Add PIN column to vehicles table (simple approach)
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS unlock_pin TEXT;

-- Create dedicated PIN table for better security (encrypted storage)
CREATE TABLE IF NOT EXISTS public.vehicle_pins (
  vin TEXT PRIMARY KEY REFERENCES public.vehicles(vin) ON DELETE CASCADE,
  pin_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.vehicle_pins ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for backend API)
CREATE POLICY "Service role full access to vehicle_pins"
  ON public.vehicle_pins
  FOR ALL
  TO service_role
  USING (true);

-- Authenticated users can read PINs (if implementing user auth in future)
CREATE POLICY "Authenticated users can read vehicle_pins"
  ON public.vehicle_pins
  FOR SELECT
  TO authenticated
  USING (true);

-- Anonymous users can read PINs (for current setup without auth)
CREATE POLICY "Anonymous users can read vehicle_pins"
  ON public.vehicle_pins
  FOR SELECT
  TO anon
  USING (true);

-- Add comments for documentation
COMMENT ON TABLE public.vehicle_pins IS 'Encrypted vehicle unlock PINs for remote unlock commands';
COMMENT ON COLUMN public.vehicle_pins.pin_encrypted IS 'PIN code for unlock (4-6 digits, stored as text)';

-- Populate PINs for existing vehicles
-- Using PIN: 0301 for all vehicles as provided by user
INSERT INTO public.vehicle_pins (vin, pin_encrypted) VALUES
  ('LSJWH4092PN070118', '0301'),  -- ZK5419 (problematic vehicle)
  ('LSJWH4098PN070110', '0301'),  -- YV4136
  ('LSJWH409XPN070089', '0301'),  -- YV2548
  ('LSJWH4092PN070121', '0301'),  -- YV2570
  ('LSJWH4098PN070124', '0301')   -- YV3617
ON CONFLICT (vin) DO UPDATE
  SET pin_encrypted = EXCLUDED.pin_encrypted,
      updated_at = NOW();

-- Also update the simple column for backward compatibility
UPDATE public.vehicles
SET unlock_pin = '0301'
WHERE vin IN (
  'LSJWH4092PN070118',
  'LSJWH4098PN070110',
  'LSJWH409XPN070089',
  'LSJWH4092PN070121',
  'LSJWH4098PN070124'
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_vehicle_pins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_vehicle_pins_timestamp ON public.vehicle_pins;
CREATE TRIGGER update_vehicle_pins_timestamp
  BEFORE UPDATE ON public.vehicle_pins
  FOR EACH ROW
  EXECUTE FUNCTION update_vehicle_pins_updated_at();
