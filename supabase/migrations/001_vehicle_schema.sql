-- MTC iSmart Vehicle Telemetry Schema
-- This migration creates the core tables for vehicle monitoring

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Vehicles table
create table public.vehicles (
  vin text primary key,
  label text,
  model text,
  year integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Latest vehicle status (single row per VIN)
create table public.vehicle_status (
  vin text primary key references public.vehicles(vin) on delete cascade,

  -- Battery & Charging
  soc numeric(5,2),                    -- State of Charge (%)
  soc_precise numeric(5,2),            -- Precise SoC if available
  range_km numeric,                    -- Estimated range
  charging_state text,                 -- Idle|Charging|Complete
  charge_current_a numeric,            -- Charging current
  charge_voltage_v numeric,            -- Charging voltage
  charge_power_kw numeric,             -- Charging power
  battery_temp_c numeric,              -- Battery temperature
  target_soc numeric(3,0),             -- Target charge %

  -- Location
  lat numeric(10,7),
  lon numeric(10,7),
  altitude numeric,
  bearing numeric,
  speed numeric,
  gps_accuracy numeric,
  location_updated_at timestamptz,

  -- Security
  doors_locked boolean,
  windows_state jsonb,                 -- {fl: closed, fr: closed, rl: closed, rr: closed}
  boot_locked boolean,
  bonnet_closed boolean,

  -- Climate
  interior_temp_c numeric,
  exterior_temp_c numeric,
  hvac_state text,                     -- off|on|blowing
  remote_climate_active boolean,

  -- Vehicle State
  ignition boolean,
  engine_running boolean,
  odometer_km numeric,

  -- Metadata
  last_message_ts timestamptz,
  last_api_call_ts timestamptz,
  gateway_status text default 'unknown', -- connected|disconnected|error
  updated_at timestamptz default now()
);

-- Time-series telemetry for historical data
create table public.vehicle_telemetry (
  id bigserial primary key,
  vin text references public.vehicles(vin) on delete cascade,
  ts timestamptz default now(),

  -- What changed (for efficient queries)
  event_type text,                     -- charge|location|security|climate|vehicle_state

  -- Battery snapshot
  soc numeric(5,2),
  soc_precise numeric(5,2),
  range_km numeric,
  charging_state text,
  charge_power_kw numeric,
  charge_current_a numeric,
  charge_voltage_v numeric,
  battery_temp_c numeric,

  -- Location snapshot
  lat numeric(10,7),
  lon numeric(10,7),
  altitude numeric,
  bearing numeric,
  speed numeric,

  -- Raw payload (for debugging)
  raw_payload jsonb,

  -- Indexes
  created_at timestamptz default now()
);

-- Vehicle commands log (audit trail)
create table public.vehicle_commands (
  id bigserial primary key,
  vin text references public.vehicles(vin) on delete cascade,
  command_type text not null,          -- lock|unlock|climate|charge|horn|lights
  command_payload jsonb,
  status text default 'pending',       -- pending|sent|success|failed|timeout
  error_message text,
  user_id text,                        -- For audit (from auth context)
  requested_at timestamptz default now(),
  completed_at timestamptz
);

-- Create indexes for performance
create index idx_vehicle_status_vin on public.vehicle_status(vin);
create index idx_vehicle_telemetry_vin on public.vehicle_telemetry(vin);
create index idx_vehicle_telemetry_ts on public.vehicle_telemetry(ts desc);
create index idx_vehicle_telemetry_event_type on public.vehicle_telemetry(event_type);
create index idx_vehicle_telemetry_vin_ts on public.vehicle_telemetry(vin, ts desc);
create index idx_vehicle_commands_vin on public.vehicle_commands(vin);
create index idx_vehicle_commands_status on public.vehicle_commands(status);
create index idx_vehicle_commands_requested_at on public.vehicle_commands(requested_at desc);

-- Enable Row Level Security
alter table public.vehicles enable row level security;
alter table public.vehicle_status enable row level security;
alter table public.vehicle_telemetry enable row level security;
alter table public.vehicle_commands enable row level security;

-- RLS Policies (adjust for your auth model)
-- For now, allow service role full access, authenticated users read access

-- Vehicles: authenticated users can read, service role can write
create policy "Allow service role full access to vehicles"
  on public.vehicles
  for all
  to service_role
  using (true);

create policy "Allow authenticated users to read vehicles"
  on public.vehicles
  for select
  to authenticated
  using (true);

-- Vehicle Status: same pattern
create policy "Allow service role full access to vehicle_status"
  on public.vehicle_status
  for all
  to service_role
  using (true);

create policy "Allow authenticated users to read vehicle_status"
  on public.vehicle_status
  for select
  to authenticated
  using (true);

-- Vehicle Telemetry: same pattern
create policy "Allow service role full access to vehicle_telemetry"
  on public.vehicle_telemetry
  for all
  to service_role
  using (true);

create policy "Allow authenticated users to read vehicle_telemetry"
  on public.vehicle_telemetry
  for select
  to authenticated
  using (true);

-- Vehicle Commands: users can insert their own, service role can update
create policy "Allow service role full access to vehicle_commands"
  on public.vehicle_commands
  for all
  to service_role
  using (true);

create policy "Allow authenticated users to insert commands"
  on public.vehicle_commands
  for insert
  to authenticated
  with check (true);

create policy "Allow authenticated users to read their commands"
  on public.vehicle_commands
  for select
  to authenticated
  using (true);

-- Function to update vehicle_status.updated_at on changes
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for vehicle_status
create trigger update_vehicle_status_updated_at
  before update on public.vehicle_status
  for each row
  execute function public.update_updated_at_column();

-- Trigger for vehicles
create trigger update_vehicles_updated_at
  before update on public.vehicles
  for each row
  execute function public.update_updated_at_column();

-- Function to upsert vehicle status (called by ingestion service)
create or replace function public.upsert_vehicle_status(
  p_vin text,
  p_data jsonb
)
returns void as $$
begin
  insert into public.vehicle_status (
    vin, soc, soc_precise, range_km, charging_state,
    charge_current_a, charge_voltage_v, charge_power_kw,
    lat, lon, altitude, bearing, speed,
    doors_locked, windows_state, boot_locked,
    interior_temp_c, exterior_temp_c, hvac_state,
    ignition, engine_running, odometer_km,
    last_message_ts, updated_at
  )
  values (
    p_vin,
    (p_data->>'soc')::numeric,
    (p_data->>'soc_precise')::numeric,
    (p_data->>'range_km')::numeric,
    p_data->>'charging_state',
    (p_data->>'charge_current_a')::numeric,
    (p_data->>'charge_voltage_v')::numeric,
    (p_data->>'charge_power_kw')::numeric,
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
  on conflict (vin)
  do update set
    soc = coalesce((p_data->>'soc')::numeric, vehicle_status.soc),
    soc_precise = coalesce((p_data->>'soc_precise')::numeric, vehicle_status.soc_precise),
    range_km = coalesce((p_data->>'range_km')::numeric, vehicle_status.range_km),
    charging_state = coalesce(p_data->>'charging_state', vehicle_status.charging_state),
    charge_current_a = coalesce((p_data->>'charge_current_a')::numeric, vehicle_status.charge_current_a),
    charge_voltage_v = coalesce((p_data->>'charge_voltage_v')::numeric, vehicle_status.charge_voltage_v),
    charge_power_kw = coalesce((p_data->>'charge_power_kw')::numeric, vehicle_status.charge_power_kw),
    lat = coalesce((p_data->>'lat')::numeric, vehicle_status.lat),
    lon = coalesce((p_data->>'lon')::numeric, vehicle_status.lon),
    altitude = coalesce((p_data->>'altitude')::numeric, vehicle_status.altitude),
    bearing = coalesce((p_data->>'bearing')::numeric, vehicle_status.bearing),
    speed = coalesce((p_data->>'speed')::numeric, vehicle_status.speed),
    doors_locked = coalesce((p_data->>'doors_locked')::boolean, vehicle_status.doors_locked),
    windows_state = coalesce(p_data->'windows_state', vehicle_status.windows_state),
    boot_locked = coalesce((p_data->>'boot_locked')::boolean, vehicle_status.boot_locked),
    interior_temp_c = coalesce((p_data->>'interior_temp_c')::numeric, vehicle_status.interior_temp_c),
    exterior_temp_c = coalesce((p_data->>'exterior_temp_c')::numeric, vehicle_status.exterior_temp_c),
    hvac_state = coalesce(p_data->>'hvac_state', vehicle_status.hvac_state),
    ignition = coalesce((p_data->>'ignition')::boolean, vehicle_status.ignition),
    engine_running = coalesce((p_data->>'engine_running')::boolean, vehicle_status.engine_running),
    odometer_km = coalesce((p_data->>'odometer_km')::numeric, vehicle_status.odometer_km),
    last_message_ts = now(),
    updated_at = now();
end;
$$ language plpgsql security definer;

-- Grant execute permission to service role
grant execute on function public.upsert_vehicle_status(text, jsonb) to service_role;

-- Comments for documentation
comment on table public.vehicles is 'Master list of vehicles in the fleet';
comment on table public.vehicle_status is 'Latest status snapshot for each vehicle (single row per VIN)';
comment on table public.vehicle_telemetry is 'Historical time-series data for analytics';
comment on table public.vehicle_commands is 'Audit log of commands sent to vehicles';
