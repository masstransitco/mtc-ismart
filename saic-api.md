# SAIC API Documentation

This document captures findings from testing the SAIC iSmart API, including command requirements, error codes, and behavioral patterns.

## Overview

The SAIC iSmart API is the backend service for MG iSmart electric vehicles, providing remote control capabilities through the SAIC Python MQTT Gateway.

**API Endpoint**: `https://gateway-mg-eu.soimt.com/api.app/v1/`

---

## Command Requirements

Different commands have different vehicle state requirements:

### Lock/Unlock Commands

**Requirements:**
- ✅ Vehicle must be stationary
- ✅ Vehicle can be in any ignition state
- ✅ Vehicle can be locked or unlocked

**MQTT Topic:**
```
saic/<user>/vehicles/<vin>/doors/locked/set
```

**Payload:** `true` (lock) | `false` (unlock)

**Success Rate:** High - works in most conditions

---

### Find My Car Commands

**Requirements:**
- ✅ Vehicle must be **turned off** (ignition OFF)
- ✅ Vehicle must be **locked**
- ✅ Vehicle **power must be off** (no auxiliary systems active)

**MQTT Topic:**
```
saic/<user>/vehicles/<vin>/location/findMyCar/set
```

**Payload Options:**
- `activate` - Horn and lights
- `lights_only` - Lights only
- `horn_only` - Horn only
- `stop` - Stop current activation

**Success Rate:** Lower - strict state requirements

**Important:** These commands are more sensitive to vehicle state than lock/unlock. Even if the vehicle appears to be off and locked, residual auxiliary power (infotainment, etc.) can cause failures.

---

### Climate Control Commands

**Requirements:**
- ✅ Vehicle must be **turned off** (ignition OFF)
- ✅ Vehicle must be **locked**
- ⚠️ Battery must have sufficient charge

**MQTT Topic:**
```
saic/<user>/vehicles/<vin>/climate/remoteClimateState/set
```

**Payload Options:**
- `on` - Full climate control
- `off` - Turn off climate
- `front` - Front defrost
- `blowingonly` - Fan only

---

### Charge Control Commands

**Requirements:**
- ✅ Vehicle must be **turned off** (ignition OFF)
- ✅ Charging cable must be **connected**
- ✅ Vehicle must be in a valid charging state

**MQTT Topics:**
```
saic/<user>/vehicles/<vin>/charging/start/set
saic/<user>/vehicles/<vin>/charging/stop/set
```

---

## Error Codes

### Error Code 8 - Vehicle State Validation

The SAIC API returns error code 8 when vehicle state requirements are not met. The error message provides specific details:

#### Variant 1: Power State
```
return code: 8,
message: Please confirm that the vehicle has been turned off and the power is turned off,
         otherwise the command cannot be executed successfully.(1)
```

**Cause:** Vehicle has auxiliary power active (infotainment, lights, etc.)

**Solution:**
- Ensure all vehicle systems are fully off
- Wait 10-30 seconds after turning off the vehicle
- Check that no doors are open

#### Variant 2: Lock State
```
return code: 8,
message: Please confirm that the vehicle has been turned off and locked,
         otherwise the command cannot be executed successfully.(2)
```

**Cause:** Vehicle is not properly locked or ignition is not off

**Solution:**
- Verify `doors_locked = true`
- Verify `ignition = false`
- Send lock command and wait for confirmation before proceeding

---

## Testing Log

### Test Session 1: 2025-11-03 06:53-06:54 UTC ✅

**Vehicle:** VIN LSJWH4098PN070110

**Vehicle State:**
- Ignition: OFF
- Doors: Locked
- Power: OFF

**Commands Executed:**
1. ✅ Find My Car (activate) - SUCCESS
2. ✅ Unlock - SUCCESS
3. ✅ Lock - SUCCESS
4. ✅ Find My Car (lights_only) - SUCCESS
5. ✅ Find My Car (horn_only) - SUCCESS

**Result:** All commands successful

**Key Takeaway:** When vehicle is fully off and locked, all commands work reliably.

---

### Test Session 2: 2025-11-03 12:56-12:58 UTC ⚠️

**Vehicle:** VIN LSJWH4098PN070110

**Vehicle State:**
- Ignition: Unknown (likely transitioning)
- Doors: Being locked/unlocked during test
- Power: Possibly active

**Commands Executed:**
1. ❌ Find My Car (activate) - FAILED (Error 8)
2. ❌ Find My Car (activate) - FAILED (Error 8)
3. ✅ Lock - SUCCESS
4. ✅ Unlock - SUCCESS
5. ❌ Find My Car (activate) - FAILED (Error 8, variant 2)
6. ❌ Find My Car (lights_only) - FAILED (Error 8, variant 2)
7. ❌ Find My Car (horn_only) - FAILED (Error 8, variant 2)
8. ❌ Find My Car (activate) - FAILED (Error 8, variant 1)

**Errors Observed:**
```
12:57:11 - Error Code 8 (variant 2): "vehicle has been turned off and locked"
12:57:28 - Error Code 8 (variant 2): "vehicle has been turned off and locked"
12:57:37 - Error Code 8 (variant 2): "vehicle has been turned off and locked"
12:57:45 - Error Code 8 (variant 2): "vehicle has been turned off and locked"
12:58:27 - Error Code 8 (variant 1): "vehicle has been turned off and the power is turned off"
```

**Result:** Lock/unlock worked, but all Find My Car commands failed

**Key Takeaway:**
- Lock/unlock commands have lower validation requirements
- Find My Car requires strict state validation
- Unlocking the vehicle immediately before Find My Car causes failures
- Vehicle needs time to settle into a stable "off and locked" state

---

## Best Practices

### 1. Command Sequencing

When executing multiple commands, follow this sequence:

```
1. Lock vehicle
2. Wait 5-10 seconds for state to settle
3. Verify doors_locked = true AND ignition = false
4. Send Find My Car / Climate commands
```

### 2. State Validation Before Commands

Before sending any command, check:

**For Lock/Unlock:**
- Vehicle is stationary (speed = 0 or null)

**For Find My Car:**
- `doors_locked = true`
- `ignition = false`
- No recent unlock events (wait 10+ seconds after last unlock)

**For Climate Control:**
- `doors_locked = true`
- `ignition = false`
- `soc >= 20%` (recommended minimum)

**For Charge Control:**
- `charging_plug_connected = true`
- `ignition = false`

### 3. Error Handling

When error code 8 is received:
- Parse the error message to determine the specific issue
- Display user-friendly message explaining the requirement
- Suggest waiting and retrying
- Consider automatic retry with exponential backoff (5s, 10s, 20s)

### 4. UI State Management

**Find My Car Button Should Be:**

**Enabled when:**
- `doors_locked = true`
- `ignition = false`
- No recent unlock events (< 10 seconds ago)

**Disabled when:**
- `doors_locked = false` → Show: "Vehicle must be locked"
- `ignition = true` → Show: "Turn off vehicle ignition"
- Recent unlock (< 10 seconds) → Show: "Please wait, vehicle settling..."

---

## MQTT Topic Reference

### Status Topics (Published by Gateway)

```
saic/<user>/vehicles/<vin>/drivetrain/soc              # Battery %
saic/<user>/vehicles/<vin>/drivetrain/range            # Range km
saic/<user>/vehicles/<vin>/drivetrain/charging         # Charging state (boolean - unreliable)
saic/<user>/vehicles/<vin>/drivetrain/running          # Ignition/engine state (boolean)
saic/<user>/vehicles/<vin>/drivetrain/current          # Charge current (A, negative = charging)
saic/<user>/vehicles/<vin>/drivetrain/voltage          # Battery voltage (V)
saic/<user>/vehicles/<vin>/drivetrain/power            # Charge power (kW)
saic/<user>/vehicles/<vin>/drivetrain/chargerConnected # Plug connected (boolean)
saic/<user>/vehicles/<vin>/drivetrain/hvBatteryActive  # HV battery active (boolean)
saic/<user>/vehicles/<vin>/drivetrain/batteryHeating   # Battery heating (boolean)
saic/<user>/vehicles/<vin>/drivetrain/chargeCurrentLimit # Charge limit (6A|8A|16A|Max)
saic/<user>/vehicles/<vin>/drivetrain/mileage          # Odometer reading
saic/<user>/vehicles/<vin>/doors/locked                # Lock status
saic/<user>/vehicles/<vin>/doors/driver                # Driver door
saic/<user>/vehicles/<vin>/doors/passenger             # Passenger door
saic/<user>/vehicles/<vin>/doors/rearLeft              # Rear left door
saic/<user>/vehicles/<vin>/doors/rearRight             # Rear right door
saic/<user>/vehicles/<vin>/doors/bonnet                # Bonnet/hood
saic/<user>/vehicles/<vin>/doors/boot                  # Boot/trunk
saic/<user>/vehicles/<vin>/location/latitude           # GPS latitude
saic/<user>/vehicles/<vin>/location/longitude          # GPS longitude
saic/<user>/vehicles/<vin>/location/elevation          # Altitude
saic/<user>/vehicles/<vin>/location/heading            # Bearing/heading
saic/<user>/vehicles/<vin>/location/speed              # Speed (km/h)
saic/<user>/vehicles/<vin>/climate/interiorTemperature # Interior temp
saic/<user>/vehicles/<vin>/climate/exteriorTemperature # Exterior temp
saic/<user>/vehicles/<vin>/climate/remoteClimateState  # HVAC state
saic/<user>/vehicles/<vin>/climate/remoteTemperature   # Target temp (°C)
saic/<user>/vehicles/<vin>/climate/heatedSeatsFrontLeftLevel  # Heated seat level (0-3)
saic/<user>/vehicles/<vin>/climate/heatedSeatsFrontRightLevel # Heated seat level (0-3)
saic/<user>/vehicles/<vin>/climate/rearWindowDefrosterHeating # Rear defrost (on/off)
saic/<user>/vehicles/<vin>/lights/mainBeam             # High beams
saic/<user>/vehicles/<vin>/lights/dippedBeam           # Low beams
saic/<user>/vehicles/<vin>/lights/side                 # Side lights
```

**Important:** The `/drivetrain/running` topic indicates ignition state and is critical for command validation.

### Command Topics (Subscribed by Gateway)

```
saic/<user>/vehicles/<vin>/doors/locked/set                    # Lock/unlock
saic/<user>/vehicles/<vin>/location/findMyCar/set              # Find my car
saic/<user>/vehicles/<vin>/climate/remoteClimateState/set      # Climate
saic/<user>/vehicles/<vin>/climate/remoteTemperature/set       # Set temp
saic/<user>/vehicles/<vin>/charging/start/set                  # Start charge
saic/<user>/vehicles/<vin>/charging/stop/set                   # Stop charge
```

---

## Ignition Status Tracking

### MQTT Topic
The ignition state is published via:
```
saic/<user>/vehicles/<vin>/drivetrain/running
```

**Values:** `true` (ignition on) | `false` (ignition off)

### Database Storage
Ignition status is stored in two columns in `vehicle_status`:
- `ignition` (boolean) - Main ignition state
- `engine_running` (boolean) - Engine running state (same as ignition for EVs)

Both fields are populated from the same MQTT topic (`/drivetrain/running`).

### Ingestion Logic
Location: `server/ingest.ts` lines 199-201

```typescript
else if (topic.includes('/drivetrain/running')) {
  cache.ignition = parseBoolean(actualValue)
  cache.engine_running = parseBoolean(actualValue)
}
```

### UI Implementation (2025-11-04)

**Component:** `components/vehicle/find-my-car-controls.tsx`

The Find My Car controls now validate vehicle state before allowing commands:

```typescript
// Requirements: doors locked AND ignition off
const canExecuteFindCommand = doorsLocked === true && ignition === false
```

**Button States:**
- ✅ **Enabled**: Doors locked AND ignition off
- ❌ **Disabled + Toast**:
  - Ignition ON → "Turn off vehicle ignition first"
  - Doors unlocked → "Lock the vehicle first"
  - Status unknown → "Waiting for vehicle status..."

**Visual Feedback:**
- Normal state: Shows command icon (MapPinned, Lightbulb, Bell)
- Disabled state: Shows AlertCircle icon
- Loading state: Shows spinning RefreshCw icon
- Hover tooltip: Shows disabled reason

This prevents SAIC API error code 8 by enforcing state requirements at the UI level.

---

## Units of Measurement (2025-11-04)

### Speed
- **SAIC API provides speed in km/h**
- Telemetry data shows maximum highway speeds of ~150 km/h (~94 mph)
- If values were in mph, would translate to unrealistic 243 km/h speeds
- **UI Implementation**: Toggle button in header allows users to switch between km/h and mph
  - Preference saved to localStorage
  - Conversion: mph = km/h × 0.621371
  - Components updated: `vehicle-card.tsx`, `motion-status.tsx`

### Temperature
- Interior/exterior temperature: Celsius (°C)
- Remote climate target temperature: Celsius (°C)

### Distance
- Range: kilometers (km)
- Odometer: kilometers (km)

### Power
- Voltage: Volts (V)
- Current: Amperes (A)
- Power: Kilowatts (kW)

---

## Known Limitations

1. **State Propagation Delay**: SAIC API takes 2-5 seconds to propagate state changes
2. **Command Rate Limiting**: Unknown rate limits exist; avoid rapid successive commands
3. **Concurrent Commands**: Sending multiple commands simultaneously may cause conflicts
4. **Power State Detection**: No direct API for auxiliary power state; must infer from failures
5. **GPS Accuracy**: Location updates are periodic (every 5 minutes when active)
6. **Ignition State Lag**: `/drivetrain/running` topic may have slight delay after vehicle state changes

---

## Event Logging (2025-11-04)

### Ignition State Change Tracking

**Migration:** `012_add_ignition_event_logging.sql`

The system now logs ignition state changes to `vehicle_events` table to analyze patterns such as:
- Whether vehicles automatically turn off when doors are locked
- Time delay between door lock and ignition off
- Driving behavior and ignition on/off patterns

**Event Schema:**
```sql
event_type: 'status_change'
event_category: 'ignition'
event_title: 'Ignition On' | 'Ignition Off'
metadata: {
  ignition: boolean,
  engine_running: boolean,
  doors_locked: boolean,
  speed: number
}
severity: 'warning' (on) | 'info' (off)
```

**Query Example:**
```sql
SELECT
  created_at,
  event_title,
  metadata->>'doors_locked' as doors_locked,
  metadata->>'speed' as speed
FROM vehicle_events
WHERE vin = 'YOUR_VIN'
  AND event_category = 'ignition'
ORDER BY created_at DESC;
```

### Lock/Unlock Event Enhancements

Lock and unlock events now include `ignition` state in metadata to correlate door lock actions with vehicle power state.

**Updated Metadata:**
```json
{
  "doors_locked": true/false,
  "ignition": true/false
}
```

This enables queries to determine:
- If doors are being locked while ignition is still on
- Typical time between ignition off and door lock
- Auto-lock behavior patterns

---

## Future Testing

### Areas to Explore

- [ ] Rate limiting thresholds (commands per minute)
- [ ] Behavior when vehicle is charging
- [ ] Behavior when vehicle is driving
- [ ] Climate control duration limits
- [ ] Heated seats command requirements
- [ ] Rear window defrost requirements
- [ ] Battery heating command requirements
- [ ] Charge current limit adjustment requirements
- [ ] Command retry strategies
- [ ] Concurrent command handling
- [x] **Ignition state change tracking** (Added 2025-11-04)
- [ ] **Auto-off timing**: Does vehicle turn off automatically after door lock?
- [ ] **Auto-lock timing**: Does vehicle lock automatically after ignition off?

### Questions to Answer

1. What is the minimum wait time after unlock before Find My Car works?
2. Does climate control work when vehicle is unlocked?
3. Can we detect auxiliary power state from telemetry?
4. What happens if you send lock while Find My Car is active?
5. Are there any successful command acknowledgment topics?

---

*Last Updated: 2025-11-04*
*Next Review: After additional testing sessions*
