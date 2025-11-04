-- Add ignition state change event logging to vehicle_events
--
-- This migration extends the log_status_change_event() function to track
-- ignition state changes, allowing us to analyze patterns like:
-- - Whether vehicles automatically turn off when doors are locked
-- - Time delay between door lock and ignition off
-- - Ignition on/off events for driving behavior analysis

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
        jsonb_build_object(
          'doors_locked', NEW.doors_locked,
          'ignition', NEW.ignition
        ),
        'info'
      );
    END IF;

    -- Ignition state changes (NEW)
    IF (OLD.ignition IS DISTINCT FROM NEW.ignition) THEN
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
        'ignition',
        CASE WHEN NEW.ignition THEN 'Ignition On' ELSE 'Ignition Off' END,
        'Ignition state changed',
        jsonb_build_object(
          'ignition', NEW.ignition,
          'engine_running', NEW.engine_running,
          'doors_locked', NEW.doors_locked,
          'speed', NEW.speed
        ),
        CASE WHEN NEW.ignition THEN 'warning' ELSE 'info' END
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
        'Charging ' || NEW.charging_state,
        'Charging state changed',
        jsonb_build_object(
          'charging_state', NEW.charging_state,
          'soc', NEW.soc,
          'charging_plug_connected', NEW.charging_plug_connected
        ),
        CASE
          WHEN NEW.charging_state = 'Charging' THEN 'success'
          WHEN NEW.charging_state = 'Disconnected' THEN 'warning'
          ELSE 'info'
        END
      );
    END IF;

    -- Door open alerts (when unlocked and any door opens)
    IF (NEW.doors_locked = false) THEN
      IF (OLD.door_driver_open IS DISTINCT FROM NEW.door_driver_open AND NEW.door_driver_open = true) THEN
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
          'Driver Door Opened',
          'Driver door opened while unlocked',
          jsonb_build_object('door', 'driver', 'open', true),
          'info'
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: The trigger already exists from migration 009, so we don't need to recreate it
-- This migration only replaces the function definition with the enhanced version
