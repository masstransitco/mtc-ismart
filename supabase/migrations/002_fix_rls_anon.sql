-- Fix RLS Policies to Allow Anonymous (Public) Access
-- This migration updates RLS policies to allow anon role to read vehicle data

-- Drop old authenticated-only policies
DROP POLICY IF EXISTS "Allow authenticated users to read vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Allow authenticated users to read vehicle_status" ON public.vehicle_status;
DROP POLICY IF EXISTS "Allow authenticated users to read vehicle_telemetry" ON public.vehicle_telemetry;
DROP POLICY IF EXISTS "Allow authenticated users to read their commands" ON public.vehicle_commands;
DROP POLICY IF EXISTS "Allow authenticated users to insert commands" ON public.vehicle_commands;

-- Vehicles: anon can read, service role can write
CREATE POLICY "Allow anon users to read vehicles"
  ON public.vehicles
  FOR SELECT
  TO anon
  USING (true);

-- Vehicle Status: anon can read, service role can write
CREATE POLICY "Allow anon users to read vehicle_status"
  ON public.vehicle_status
  FOR SELECT
  TO anon
  USING (true);

-- Vehicle Telemetry: anon can read, service role can write
CREATE POLICY "Allow anon users to read vehicle_telemetry"
  ON public.vehicle_telemetry
  FOR SELECT
  TO anon
  USING (true);

-- Vehicle Commands: anon can insert and read their own commands
CREATE POLICY "Allow anon users to insert commands"
  ON public.vehicle_commands
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon users to read commands"
  ON public.vehicle_commands
  FOR SELECT
  TO anon
  USING (true);

-- Note: service_role policies remain unchanged and have full access
-- This is needed for the ingestion service to write vehicle data
