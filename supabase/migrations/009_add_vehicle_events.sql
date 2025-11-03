-- Create vehicle_events table for tracking all vehicle events
CREATE TABLE IF NOT EXISTS vehicle_events (
  id BIGSERIAL PRIMARY KEY,
  vin TEXT NOT NULL REFERENCES vehicles(vin) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- command_sent|command_completed|command_failed|status_change|alert|system
  event_category TEXT, -- lock|climate|charge|find|telemetry|door|location
  event_title TEXT NOT NULL,
  event_description TEXT,
  metadata JSONB, -- Additional event-specific data
  severity TEXT DEFAULT 'info', -- info|success|warning|error
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT -- user_id or 'system'
);

-- Create indexes for efficient querying
CREATE INDEX idx_vehicle_events_vin ON vehicle_events(vin);
CREATE INDEX idx_vehicle_events_created_at ON vehicle_events(created_at DESC);
CREATE INDEX idx_vehicle_events_type ON vehicle_events(event_type);
CREATE INDEX idx_vehicle_events_category ON vehicle_events(event_category);
CREATE INDEX idx_vehicle_events_vin_created_at ON vehicle_events(vin, created_at DESC);

-- Enable Row Level Security
ALTER TABLE vehicle_events ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow anonymous read access to all events
CREATE POLICY "Allow anonymous read access to vehicle events"
  ON vehicle_events
  FOR SELECT
  TO anon
  USING (true);

-- RLS Policy: Allow service role full access
CREATE POLICY "Allow service role full access to vehicle events"
  ON vehicle_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create a function to automatically log command events from vehicle_commands table
CREATE OR REPLACE FUNCTION log_command_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Log command sent event
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO vehicle_events (
      vin,
      event_type,
      event_category,
      event_title,
      event_description,
      metadata,
      severity,
      created_by
    ) VALUES (
      NEW.vin,
      'command_sent',
      NEW.command_type,
      'Command Sent: ' || UPPER(NEW.command_type),
      'Command sent to vehicle',
      jsonb_build_object(
        'command_id', NEW.id,
        'payload', NEW.command_payload
      ),
      'info',
      'system'
    );
  END IF;

  -- Log command completion or failure
  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
    IF (NEW.status = 'completed') THEN
      INSERT INTO vehicle_events (
        vin,
        event_type,
        event_category,
        event_title,
        event_description,
        metadata,
        severity,
        created_by
      ) VALUES (
        NEW.vin,
        'command_completed',
        NEW.command_type,
        'Command Completed: ' || UPPER(NEW.command_type),
        'Command completed successfully',
        jsonb_build_object(
          'command_id', NEW.id,
          'payload', NEW.command_payload
        ),
        'success',
        'system'
      );
    ELSIF (NEW.status = 'failed') THEN
      INSERT INTO vehicle_events (
        vin,
        event_type,
        event_category,
        event_title,
        event_description,
        metadata,
        severity,
        created_by
      ) VALUES (
        NEW.vin,
        'command_failed',
        NEW.command_type,
        'Command Failed: ' || UPPER(NEW.command_type),
        COALESCE(NEW.error_message, 'Command failed'),
        jsonb_build_object(
          'command_id', NEW.id,
          'payload', NEW.command_payload,
          'error', NEW.error_message
        ),
        'error',
        'system'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically log command events
DROP TRIGGER IF EXISTS trigger_log_command_events ON vehicle_commands;
CREATE TRIGGER trigger_log_command_events
  AFTER INSERT OR UPDATE ON vehicle_commands
  FOR EACH ROW
  EXECUTE FUNCTION log_command_event();

-- Create a function to log status change events
CREATE OR REPLACE FUNCTION log_status_change_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Log significant status changes
  IF (TG_OP = 'UPDATE') THEN
    -- Lock/Unlock events
    IF (OLD.doors_locked IS DISTINCT FROM NEW.doors_locked) THEN
      INSERT INTO vehicle_events (
        vin,
        event_type,
        event_category,
        event_title,
        event_description,
        metadata,
        severity
      ) VALUES (
        NEW.vin,
        'status_change',
        'lock',
        CASE WHEN NEW.doors_locked THEN 'Vehicle Locked' ELSE 'Vehicle Unlocked' END,
        'Door lock status changed',
        jsonb_build_object('locked', NEW.doors_locked),
        'info'
      );
    END IF;

    -- Climate state changes
    IF (OLD.hvac_state IS DISTINCT FROM NEW.hvac_state) THEN
      INSERT INTO vehicle_events (
        vin,
        event_type,
        event_category,
        event_title,
        event_description,
        metadata,
        severity
      ) VALUES (
        NEW.vin,
        'status_change',
        'climate',
        'Climate ' || CASE WHEN NEW.hvac_state = 'on' THEN 'Activated' ELSE 'Deactivated' END,
        'HVAC state changed',
        jsonb_build_object('hvac_state', NEW.hvac_state, 'temperature', NEW.remote_temperature),
        'info'
      );
    END IF;

    -- Charging state changes
    IF (OLD.charging_state IS DISTINCT FROM NEW.charging_state) THEN
      INSERT INTO vehicle_events (
        vin,
        event_type,
        event_category,
        event_title,
        event_description,
        metadata,
        severity
      ) VALUES (
        NEW.vin,
        'status_change',
        'charge',
        'Charging ' || INITCAP(NEW.charging_state),
        'Charging state changed',
        jsonb_build_object('charging_state', NEW.charging_state, 'soc', NEW.soc),
        'info'
      );
    END IF;

    -- Door open alerts
    IF (
      (OLD.door_driver_open = false AND NEW.door_driver_open = true) OR
      (OLD.door_passenger_open = false AND NEW.door_passenger_open = true) OR
      (OLD.door_rear_left_open = false AND NEW.door_rear_left_open = true) OR
      (OLD.door_rear_right_open = false AND NEW.door_rear_right_open = true)
    ) THEN
      INSERT INTO vehicle_events (
        vin,
        event_type,
        event_category,
        event_title,
        event_description,
        metadata,
        severity
      ) VALUES (
        NEW.vin,
        'alert',
        'door',
        'Door Opened',
        'One or more doors have been opened',
        jsonb_build_object(
          'driver', NEW.door_driver_open,
          'passenger', NEW.door_passenger_open,
          'rear_left', NEW.door_rear_left_open,
          'rear_right', NEW.door_rear_right_open
        ),
        'warning'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to log status change events
DROP TRIGGER IF EXISTS trigger_log_status_changes ON vehicle_status;
CREATE TRIGGER trigger_log_status_changes
  AFTER UPDATE ON vehicle_status
  FOR EACH ROW
  EXECUTE FUNCTION log_status_change_event();
