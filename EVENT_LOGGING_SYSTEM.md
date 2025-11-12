# Event Logging System

**Version:** 2.0
**Last Updated:** November 12, 2025
**Status:** ✅ Production Ready

---

## Overview

The MTC iSmart Event Logging System provides comprehensive real-time tracking of all vehicle state changes, commands, and alerts. Events are automatically captured via database triggers and displayed in a searchable, filterable dashboard.

### Key Features

- ✅ **Real-time Event Capture**: Automatic logging via PostgreSQL triggers
- ✅ **Comprehensive Coverage**: 12 event types across 8 categories
- ✅ **Smart Severity Detection**: Context-aware alert levels
- ✅ **Rich Metadata**: Detailed state information for every event
- ✅ **Searchable Interface**: Filter by vehicle, category, and severity
- ✅ **Audit Trail**: Complete command and status change history

---

## Architecture

### Database Layer

**Table:** `vehicle_events`

```sql
CREATE TABLE vehicle_events (
  id BIGSERIAL PRIMARY KEY,
  vin TEXT NOT NULL REFERENCES vehicles(vin),
  event_type TEXT NOT NULL,        -- command_sent|command_completed|command_failed|status_change|alert|system
  event_category TEXT,              -- lock|climate|charge|find|telemetry|door|location|lights|ignition
  event_title TEXT NOT NULL,        -- Human-readable title
  event_description TEXT,           -- Detailed description
  metadata JSONB,                   -- Additional event-specific data
  severity TEXT DEFAULT 'info',     -- info|success|warning|error
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT                   -- user_id or 'system'
);
```

**Indexes:**
- `idx_vehicle_events_vin` - Fast queries by vehicle
- `idx_vehicle_events_created_at` - Chronological sorting
- `idx_vehicle_events_type` - Filter by event type
- `idx_vehicle_events_category` - Filter by category
- `idx_vehicle_events_vin_created_at` - Composite for vehicle timeline

### Trigger System

**Function:** `log_status_change_event()`

Automatically logs events when `vehicle_status` table is updated. Monitors changes across:
- Lock status
- Door states (individual doors + bonnet)
- Light states (main beam, dipped beam, side)
- Climate controls (HVAC, temperature, heated seats, defrost)
- Charging states
- Ignition on/off

**Trigger:**
```sql
CREATE TRIGGER trigger_log_status_changes
  AFTER UPDATE ON vehicle_status
  FOR EACH ROW
  EXECUTE FUNCTION log_status_change_event();
```

---

## Event Categories

### 1. Lock/Unlock (`lock`, `unlock`)

**Events:**
- Vehicle Locked
- Vehicle Unlocked

**Metadata:**
```json
{
  "doors_locked": true,
  "ignition": false
}
```

**Usage:** Track when vehicles are secured/accessed
**Severity:** `info`

---

### 2. Door Events (`door`)

**Events:**
- Driver Door Opened/Closed
- Passenger Door Opened/Closed
- Rear Left Door Opened/Closed
- Rear Right Door Opened/Closed
- Bonnet Opened/Closed

**Metadata:**
```json
{
  "door": "driver",
  "open": true,
  "doors_locked": false,
  "ignition": false
}
```

**Smart Severity:**
- `warning` - Door opened while vehicle is locked (potential intrusion)
- `warning` - Bonnet opened (maintenance/security concern)
- `info` - Normal door open/close operations
- `info` - Door closed

**Usage:** Security monitoring, maintenance tracking

---

### 3. Light Events (`lights`)

**Events:**
- Main Beam On/Off
- Dipped Beam On/Off
- Side Lights On/Off

**Metadata:**
```json
{
  "light_type": "main_beam",
  "state": true,
  "ignition": true
}
```

**Severity:** `info`

**Usage:** Track light usage, identify lights left on when parked

---

### 4. Ignition Events (`ignition`)

**Events:**
- Ignition On
- Ignition Off

**Metadata:**
```json
{
  "ignition": true,
  "engine_running": true,
  "doors_locked": false,
  "speed": 0
}
```

**Smart Severity:**
- `warning` - Ignition On (vehicle started)
- `info` - Ignition Off (vehicle stopped)

**Usage:** Track vehicle usage patterns, unauthorized starts

---

### 5. Climate Events (`climate`)

**Events:**
- Climate Activated/Deactivated
- Target Temperature Changed
- Driver Seat Heating On/Off/Adjusted
- Passenger Seat Heating On/Off/Adjusted
- Rear Defrost On/Off

**Metadata Examples:**

Temperature Change:
```json
{
  "old_temperature": 22,
  "new_temperature": 24,
  "hvac_state": "on"
}
```

Heated Seats:
```json
{
  "seat": "front_left",
  "old_level": 0,
  "new_level": 2
}
```

**Severity:** `info`

**Usage:** Energy usage analysis, comfort preferences

---

### 6. Charging Events (`charge`)

**Events:**
- Charging Charging
- Charging Plugged
- Charging Disconnected

**Metadata:**
```json
{
  "charging_state": "Charging",
  "soc": 45.5,
  "charging_plug_connected": true
}
```

**Smart Severity:**
- `success` - Charging started
- `warning` - Disconnected (cable removed)
- `info` - Plugged but not charging

**Usage:** Charging session tracking, energy management

---

### 7. Command Events (`find_my_car`, etc.)

**Events:**
- Command Sent: [TYPE]
- Command Completed: [TYPE]
- Command Failed: [TYPE]

**Metadata:**
```json
{
  "command_id": 12345,
  "payload": {"locked": true},
  "error": "timeout" // only for failures
}
```

**Smart Severity:**
- `info` - Command sent
- `success` - Command completed
- `error` - Command failed

**Usage:** Command audit trail, debugging

---

### 8. Location Events (`location`)

**Events:**
- Location updated
- GPS fix acquired/lost

**Metadata:**
```json
{
  "lat": 22.3956680,
  "lon": 113.9715980,
  "gps_fix_quality": "FIX_3D"
}
```

**Severity:** `info`

**Usage:** Track vehicle movement, GPS signal quality

---

## UI Components

### Logs View (`components/logs-view.tsx`)

**Features:**
- Real-time event stream (Supabase Realtime)
- Three-tier filtering:
  - By Vehicle (plate number)
  - By Category (door, lights, climate, etc.)
  - By Severity (info, success, warning, error)
- Icon-only refresh button
- License plate display with realistic styling
- Gradient card backgrounds (matching trip cards)
- Responsive design (mobile, tablet, desktop)

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Event Logs                    [Vehicle][Category][Severity][↻]│
│ 1,754 events                                                 │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🚪 Driver Door Opened              [YV4136]  ⚠️ warning │ │
│ │ Driver door state changed                    5m ago     │ │
│ │ ┌─────────────────────────────────────────────────────┐ │ │
│ │ │ Metadata                                            │ │ │
│ │ │ door: driver    open: true    doors_locked: true    │ │ │
│ │ └─────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Category Icons:**
- 🔒 Lock/Unlock
- 🚪 Door
- 💡 Lights
- ⚡ Ignition
- 💨 Climate
- 🔋 Charge
- 🔍 Find My Car
- 📍 Location
- 📄 Telemetry

---

## Database Migrations

### Migration 009: Base Event System
**File:** `supabase/migrations/009_add_vehicle_events.sql`

- Created `vehicle_events` table
- Created `log_command_event()` function
- Created `log_status_change_event()` function
- Created triggers for automatic logging
- Added RLS policies

### Migration 012: Ignition Events
**File:** `supabase/migrations/012_add_ignition_event_logging.sql`

- Added ignition state change tracking
- Enhanced metadata capture for lock events

### Migration 021: Door/Light/Climate Data
**File:** `supabase/migrations/021_add_missing_fields_to_upsert.sql`

- Fixed `upsert_vehicle_status()` to include 12 missing fields
- Enabled data flow for doors, lights, climate details

### Migration 022: Comprehensive Event Logging
**File:** `supabase/migrations/022_add_door_light_climate_event_logging.sql`

- Added individual door event logging (4 doors + bonnet)
- Added light state event logging (3 types)
- Added climate detail event logging (4 types)
- Smart severity detection for security events

---

## Event Flow

### 1. Data Collection
```
MQTT Topic → Ingestion Service → vehicle_status table
```

**Example:** Driver door opens
```
MQTT: saic/system@air.city/vehicles/LSJWH4098PN070110/doors/driver → "true"
↓
Ingestion: Cache → Flush every 5 seconds
↓
Database: UPDATE vehicle_status SET door_driver_open = true WHERE vin = '...'
```

### 2. Event Trigger
```
vehicle_status UPDATE → TRIGGER → log_status_change_event()
```

**Logic:**
```sql
IF (OLD.door_driver_open IS DISTINCT FROM NEW.door_driver_open) THEN
  INSERT INTO vehicle_events (
    vin, event_type, event_category, event_title,
    event_description, metadata, severity
  ) VALUES (
    NEW.vin,
    CASE WHEN NEW.door_driver_open THEN 'alert' ELSE 'status_change' END,
    'door',
    CASE WHEN NEW.door_driver_open THEN 'Driver Door Opened' ELSE 'Driver Door Closed' END,
    'Driver door state changed',
    jsonb_build_object('door', 'driver', 'open', NEW.door_driver_open, ...),
    CASE WHEN NEW.door_driver_open AND NEW.doors_locked THEN 'warning' ELSE 'info' END
  );
END IF;
```

### 3. Real-time Display
```
vehicle_events INSERT → Supabase Realtime → UI Update
```

**React Hook:** `useVehicleEvents(limit: number)`
```typescript
const { events, loading, refetch } = useVehicleEvents(500)
```

---

## Severity Levels

### Info (Blue)
- Normal operations
- Expected state changes
- Non-critical events

**Examples:**
- Door closed
- Light turned off
- Temperature adjusted
- Ignition off

### Success (Green)
- Successful operations
- Positive outcomes
- Commands completed

**Examples:**
- Charging started
- Command completed successfully

### Warning (Yellow)
- Potential security concerns
- Unusual but not critical
- Requires attention

**Examples:**
- Door opened while locked
- Bonnet opened
- Ignition on (vehicle started)
- Charging disconnected

### Error (Red)
- Failed operations
- Critical issues
- Action required

**Examples:**
- Command failed
- System errors

---

## Query Examples

### Recent Events for a Vehicle
```sql
SELECT event_title, event_category, severity, created_at
FROM vehicle_events
WHERE vin = 'LSJWH4098PN070110'
ORDER BY created_at DESC
LIMIT 50;
```

### Security Alerts (Last 24 Hours)
```sql
SELECT vin, event_title, metadata, created_at
FROM vehicle_events
WHERE severity = 'warning'
  AND event_category = 'door'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### Daily Event Summary
```sql
SELECT
  DATE(created_at) as date,
  event_category,
  COUNT(*) as event_count,
  COUNT(DISTINCT vin) as vehicles_affected
FROM vehicle_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at), event_category
ORDER BY date DESC, event_count DESC;
```

### Command Success Rate
```sql
SELECT
  event_category,
  COUNT(*) FILTER (WHERE event_type = 'command_sent') as sent,
  COUNT(*) FILTER (WHERE event_type = 'command_completed') as completed,
  COUNT(*) FILTER (WHERE event_type = 'command_failed') as failed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE event_type = 'command_completed') /
    NULLIF(COUNT(*) FILTER (WHERE event_type = 'command_sent'), 0),
    2
  ) as success_rate
FROM vehicle_events
WHERE event_type IN ('command_sent', 'command_completed', 'command_failed')
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY event_category;
```

---

## Performance Metrics

### Storage (November 2025)

| Metric | Value |
|--------|-------|
| Total Events | 1,754 |
| Storage Used | ~350 KB |
| Avg Event Size | ~200 bytes |
| Oldest Event | Nov 3, 2025 |

### Event Volume (7-Day Average)

| Category | Events/Day | Vehicles |
|----------|------------|----------|
| Lock/Unlock | 146 | 5 |
| Ignition | 77 | 5 |
| Charging | 16 | 5 |
| Climate | 4 | 2 |
| Doors | Variable | 5 |
| Lights | Variable | 5 |

### Trigger Performance

- **Execution Time:** <1ms per event
- **Database Impact:** Negligible
- **Ingestion Latency:** 5 seconds (cache flush interval)
- **UI Update Latency:** Real-time (Supabase Realtime)

---

## Best Practices

### Adding New Event Types

1. **Update Trigger Function:**
```sql
-- In log_status_change_event()
IF (OLD.new_field IS DISTINCT FROM NEW.new_field) THEN
  INSERT INTO vehicle_events (...) VALUES (...);
END IF;
```

2. **Add Category Icon (UI):**
```typescript
// In components/logs-view.tsx
const eventIcons: Record<string, any> = {
  new_category: NewIcon,
  // ...
}
```

3. **Test Locally:**
```sql
-- Simulate state change
UPDATE vehicle_status SET new_field = new_value WHERE vin = 'TEST';

-- Verify event created
SELECT * FROM vehicle_events WHERE vin = 'TEST' ORDER BY created_at DESC LIMIT 1;
```

### Event Metadata Guidelines

**✅ Do:**
- Include relevant state information
- Use consistent JSON structure
- Add context (locked state, ignition, etc.)
- Store old/new values for changes

**❌ Don't:**
- Store sensitive user data
- Include large payloads (>1KB)
- Duplicate data available in vehicle_status
- Use inconsistent field names

### Severity Assignment

**Use `warning` when:**
- Security may be compromised
- Vehicle started/accessed
- Unusual state detected
- User attention needed

**Use `info` for:**
- Normal operations
- Expected changes
- Routine events

**Use `success` for:**
- Completed operations
- Positive outcomes
- Successful commands

**Use `error` for:**
- Failed operations
- System errors
- Critical issues

---

## Troubleshooting

### Events Not Being Created

**Check 1: Trigger Enabled**
```sql
SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trigger_log_status_changes';
-- tgenabled should be 'O' (enabled)
```

**Check 2: Function Exists**
```sql
SELECT proname FROM pg_proc WHERE proname = 'log_status_change_event';
```

**Check 3: Test Manually**
```sql
-- Force an update
UPDATE vehicle_status SET doors_locked = NOT doors_locked WHERE vin = 'LSJWH4098PN070110';

-- Check if event created
SELECT * FROM vehicle_events WHERE vin = 'LSJWH4098PN070110' ORDER BY created_at DESC LIMIT 1;
```

### UI Not Showing Events

**Check 1: RLS Policies**
```sql
SELECT * FROM vehicle_events LIMIT 1; -- As anon user
```

**Check 2: Realtime Enabled**
- Check Supabase dashboard → Database → Replication
- Ensure `vehicle_events` table has realtime enabled

**Check 3: Browser Console**
```javascript
// Check for errors in browser console
// Look for Supabase Realtime connection issues
```

### Performance Issues

**Check 1: Index Usage**
```sql
EXPLAIN ANALYZE
SELECT * FROM vehicle_events
WHERE vin = 'LSJWH4098PN070110'
ORDER BY created_at DESC
LIMIT 50;
-- Should use idx_vehicle_events_vin_created_at
```

**Check 2: Event Volume**
```sql
SELECT COUNT(*), DATE(created_at)
FROM vehicle_events
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;
```

**Solution: Archive Old Events**
```sql
-- Archive events older than 90 days
INSERT INTO vehicle_events_archive
SELECT * FROM vehicle_events
WHERE created_at < NOW() - INTERVAL '90 days';

DELETE FROM vehicle_events
WHERE created_at < NOW() - INTERVAL '90 days';
```

---

## Future Enhancements

### Planned Features

1. **Event Aggregation**
   - Daily/weekly summaries
   - Anomaly detection
   - Pattern recognition

2. **Advanced Filtering**
   - Date range picker
   - Custom metadata queries
   - Saved filter presets

3. **Notifications**
   - Email/SMS alerts for critical events
   - Webhook integration
   - Configurable alert rules

4. **Analytics Dashboard**
   - Event timeline visualization
   - Category distribution charts
   - Vehicle comparison metrics

5. **Export Capabilities**
   - CSV export
   - PDF reports
   - API endpoints for external systems

6. **Event Retention Policies**
   - Automatic archival
   - Compression for old events
   - Cold storage integration

---

## API Reference

### React Hooks

#### `useVehicleEvents(limit?: number)`

Fetches and subscribes to vehicle events with real-time updates.

**Parameters:**
- `limit` (optional): Maximum number of events to fetch (default: 100)

**Returns:**
```typescript
{
  events: VehicleEvent[],
  loading: boolean,
  refetch: () => Promise<void>
}
```

**Example:**
```typescript
const { events, loading, refetch } = useVehicleEvents(500)

if (loading) return <div>Loading...</div>

return (
  <div>
    {events.map(event => (
      <EventCard key={event.id} event={event} />
    ))}
  </div>
)
```

### Database Functions

#### `log_status_change_event()`

Automatically called by trigger when `vehicle_status` is updated.

**Returns:** `TRIGGER`

**Usage:** Automatic (no manual invocation needed)

#### `log_command_event()`

Automatically called by trigger when `vehicle_commands` is inserted/updated.

**Returns:** `TRIGGER`

**Usage:** Automatic (no manual invocation needed)

---

## Security

### Row Level Security (RLS)

**Anonymous Read Access:**
```sql
CREATE POLICY "Allow anonymous read access to vehicle events"
  ON vehicle_events FOR SELECT TO anon
  USING (true);
```

**Service Role Full Access:**
```sql
CREATE POLICY "Allow service role full access to vehicle events"
  ON vehicle_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### Data Privacy

- ✅ No PII stored in events
- ✅ VIN references only (not personal data)
- ✅ Metadata sanitized (no passwords, tokens)
- ✅ Audit trail for compliance

---

## Support

### Documentation
- Project Context: `project-context.md`
- Command System: `command-system.md`
- Trip Segmentation: `trip-segmentation-v2.md`

### Database Access
```bash
# Direct query (pooler URL)
psql "$POSTGRES_URL_NON_POOLING" -c "SELECT * FROM vehicle_events LIMIT 10;"
```

### Logs
- Supabase Dashboard → Logs → Database
- Filter by `vehicle_events` table operations

---

## Changelog

### Version 2.0 (November 12, 2025)
- ✅ Added comprehensive door event logging (4 doors + bonnet)
- ✅ Added light state event logging (3 types)
- ✅ Added climate detail event logging (4 types)
- ✅ Smart severity detection for security events
- ✅ Gradient card backgrounds in UI
- ✅ License plate display in event cards

### Version 1.1 (November 11, 2025)
- ✅ Added ignition state change tracking
- ✅ Enhanced metadata for lock events

### Version 1.0 (November 3, 2025)
- ✅ Initial event logging system
- ✅ Command event tracking
- ✅ Basic status change logging
- ✅ Logs view UI

---

**Maintained by:** MTC Development Team
**Repository:** https://github.com/masstransitco/mtc-ismart
**Last Verified:** November 12, 2025
