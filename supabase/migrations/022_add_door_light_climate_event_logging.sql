-- Migration: Add comprehensive event logging for doors, lights, and climate details
-- Date: 2025-11-12
-- Purpose: Extend log_status_change_event() to track all 12 newly-enabled fields
--
-- New events:
-- - Individual door open/close events (driver, passenger, rear left, rear right)
-- - Bonnet open/close events
-- - Light state changes (main beam, dipped beam, side lights)
-- - Heated seat level changes
-- - Rear window defrost on/off
-- - Remote temperature changes

CREATE OR REPLACE FUNCTION log_status_change_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Log significant status changes
  IF (TG_OP = 'UPDATE') THEN

    -- ==========================================
    -- LOCK/UNLOCK EVENTS
    -- ==========================================
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

    -- ==========================================
    -- IGNITION EVENTS
    -- ==========================================
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

    -- ==========================================
    -- CHARGING EVENTS
    -- ==========================================
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

    -- ==========================================
    -- CLIMATE HVAC STATE EVENTS
    -- ==========================================
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

    -- ==========================================
    -- NEW: INDIVIDUAL DOOR EVENTS
    -- ==========================================

    -- Driver door
    IF (OLD.door_driver_open IS DISTINCT FROM NEW.door_driver_open) THEN
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
        CASE WHEN NEW.door_driver_open THEN 'alert' ELSE 'status_change' END,
        'door',
        CASE WHEN NEW.door_driver_open THEN 'Driver Door Opened' ELSE 'Driver Door Closed' END,
        'Driver door state changed',
        jsonb_build_object(
          'door', 'driver',
          'open', NEW.door_driver_open,
          'doors_locked', NEW.doors_locked,
          'ignition', NEW.ignition
        ),
        CASE
          WHEN NEW.door_driver_open AND NEW.doors_locked THEN 'warning'
          WHEN NEW.door_driver_open THEN 'info'
          ELSE 'info'
        END
      );
    END IF;

    -- Passenger door
    IF (OLD.door_passenger_open IS DISTINCT FROM NEW.door_passenger_open) THEN
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
        CASE WHEN NEW.door_passenger_open THEN 'alert' ELSE 'status_change' END,
        'door',
        CASE WHEN NEW.door_passenger_open THEN 'Passenger Door Opened' ELSE 'Passenger Door Closed' END,
        'Passenger door state changed',
        jsonb_build_object(
          'door', 'passenger',
          'open', NEW.door_passenger_open,
          'doors_locked', NEW.doors_locked,
          'ignition', NEW.ignition
        ),
        CASE
          WHEN NEW.door_passenger_open AND NEW.doors_locked THEN 'warning'
          WHEN NEW.door_passenger_open THEN 'info'
          ELSE 'info'
        END
      );
    END IF;

    -- Rear left door
    IF (OLD.door_rear_left_open IS DISTINCT FROM NEW.door_rear_left_open) THEN
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
        CASE WHEN NEW.door_rear_left_open THEN 'alert' ELSE 'status_change' END,
        'door',
        CASE WHEN NEW.door_rear_left_open THEN 'Rear Left Door Opened' ELSE 'Rear Left Door Closed' END,
        'Rear left door state changed',
        jsonb_build_object(
          'door', 'rear_left',
          'open', NEW.door_rear_left_open,
          'doors_locked', NEW.doors_locked,
          'ignition', NEW.ignition
        ),
        CASE
          WHEN NEW.door_rear_left_open AND NEW.doors_locked THEN 'warning'
          WHEN NEW.door_rear_left_open THEN 'info'
          ELSE 'info'
        END
      );
    END IF;

    -- Rear right door
    IF (OLD.door_rear_right_open IS DISTINCT FROM NEW.door_rear_right_open) THEN
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
        CASE WHEN NEW.door_rear_right_open THEN 'alert' ELSE 'status_change' END,
        'door',
        CASE WHEN NEW.door_rear_right_open THEN 'Rear Right Door Opened' ELSE 'Rear Right Door Closed' END,
        'Rear right door state changed',
        jsonb_build_object(
          'door', 'rear_right',
          'open', NEW.door_rear_right_open,
          'doors_locked', NEW.doors_locked,
          'ignition', NEW.ignition
        ),
        CASE
          WHEN NEW.door_rear_right_open AND NEW.doors_locked THEN 'warning'
          WHEN NEW.door_rear_right_open THEN 'info'
          ELSE 'info'
        END
      );
    END IF;

    -- ==========================================
    -- NEW: BONNET EVENTS
    -- ==========================================
    IF (OLD.bonnet_closed IS DISTINCT FROM NEW.bonnet_closed) THEN
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
        CASE WHEN NOT NEW.bonnet_closed THEN 'alert' ELSE 'status_change' END,
        'door',
        CASE WHEN NEW.bonnet_closed THEN 'Bonnet Closed' ELSE 'Bonnet Opened' END,
        'Bonnet state changed',
        jsonb_build_object(
          'bonnet_closed', NEW.bonnet_closed,
          'doors_locked', NEW.doors_locked,
          'ignition', NEW.ignition
        ),
        CASE
          WHEN NOT NEW.bonnet_closed THEN 'warning'
          ELSE 'info'
        END
      );
    END IF;

    -- ==========================================
    -- NEW: LIGHT EVENTS
    -- ==========================================

    -- Main beam lights
    IF (OLD.lights_main_beam IS DISTINCT FROM NEW.lights_main_beam) THEN
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
        'lights',
        CASE WHEN NEW.lights_main_beam THEN 'Main Beam On' ELSE 'Main Beam Off' END,
        'Main beam headlights state changed',
        jsonb_build_object(
          'light_type', 'main_beam',
          'state', NEW.lights_main_beam,
          'ignition', NEW.ignition
        ),
        'info'
      );
    END IF;

    -- Dipped beam lights
    IF (OLD.lights_dipped_beam IS DISTINCT FROM NEW.lights_dipped_beam) THEN
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
        'lights',
        CASE WHEN NEW.lights_dipped_beam THEN 'Dipped Beam On' ELSE 'Dipped Beam Off' END,
        'Dipped beam headlights state changed',
        jsonb_build_object(
          'light_type', 'dipped_beam',
          'state', NEW.lights_dipped_beam,
          'ignition', NEW.ignition
        ),
        'info'
      );
    END IF;

    -- Side lights
    IF (OLD.lights_side IS DISTINCT FROM NEW.lights_side) THEN
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
        'lights',
        CASE WHEN NEW.lights_side THEN 'Side Lights On' ELSE 'Side Lights Off' END,
        'Side lights state changed',
        jsonb_build_object(
          'light_type', 'side',
          'state', NEW.lights_side,
          'ignition', NEW.ignition
        ),
        'info'
      );
    END IF;

    -- ==========================================
    -- NEW: CLIMATE DETAIL EVENTS
    -- ==========================================

    -- Remote temperature change
    IF (OLD.remote_temperature IS DISTINCT FROM NEW.remote_temperature AND NEW.remote_temperature IS NOT NULL) THEN
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
        'Target Temperature Changed',
        'Climate control target temperature adjusted',
        jsonb_build_object(
          'old_temperature', OLD.remote_temperature,
          'new_temperature', NEW.remote_temperature,
          'hvac_state', NEW.hvac_state
        ),
        'info'
      );
    END IF;

    -- Heated seat front left
    IF (OLD.heated_seat_front_left_level IS DISTINCT FROM NEW.heated_seat_front_left_level) THEN
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
        CASE
          WHEN NEW.heated_seat_front_left_level = 0 THEN 'Driver Seat Heating Off'
          WHEN OLD.heated_seat_front_left_level = 0 THEN 'Driver Seat Heating On'
          ELSE 'Driver Seat Heating Adjusted'
        END,
        'Driver heated seat level changed',
        jsonb_build_object(
          'seat', 'front_left',
          'old_level', OLD.heated_seat_front_left_level,
          'new_level', NEW.heated_seat_front_left_level
        ),
        'info'
      );
    END IF;

    -- Heated seat front right
    IF (OLD.heated_seat_front_right_level IS DISTINCT FROM NEW.heated_seat_front_right_level) THEN
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
        CASE
          WHEN NEW.heated_seat_front_right_level = 0 THEN 'Passenger Seat Heating Off'
          WHEN OLD.heated_seat_front_right_level = 0 THEN 'Passenger Seat Heating On'
          ELSE 'Passenger Seat Heating Adjusted'
        END,
        'Passenger heated seat level changed',
        jsonb_build_object(
          'seat', 'front_right',
          'old_level', OLD.heated_seat_front_right_level,
          'new_level', NEW.heated_seat_front_right_level
        ),
        'info'
      );
    END IF;

    -- Rear window defrost
    IF (OLD.rear_window_defrost IS DISTINCT FROM NEW.rear_window_defrost) THEN
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
        CASE WHEN NEW.rear_window_defrost THEN 'Rear Defrost On' ELSE 'Rear Defrost Off' END,
        'Rear window defrost state changed',
        jsonb_build_object(
          'rear_defrost', NEW.rear_window_defrost,
          'hvac_state', NEW.hvac_state
        ),
        'info'
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger already exists from migration 009, no need to recreate it
-- This migration only replaces the function definition with the enhanced version

-- Verification message
DO $$
BEGIN
  RAISE NOTICE 'Migration 022 complete: Enhanced event logging for 12 new fields';
  RAISE NOTICE 'New event categories: door (individual doors + bonnet), lights (3 types), climate (details)';
  RAISE NOTICE 'Total new event types: 12 (4 doors + 1 bonnet + 3 lights + 4 climate details)';
END $$;
