# MTC iSmart API Documentation

## Overview

The MTC iSmart API provides access to real-time vehicle telemetry data including VIN, license plate, battery level, temperature, and other vehicle metrics. The API is built on Next.js and uses Supabase for data storage and authentication.

**Base URL (Production):** `https://mtc.air.zone`
**Base URL (Development):** `http://localhost:3000`

---

## Authentication

### Service Role Authentication (Recommended for Server-to-Server)

For external applications calling the API, you should use Supabase Service Role authentication:

```bash
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
```

### Environment Variables Required

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://sssyxnpanayqvamstind.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc3l4bnBhbmF5cXZhbXN0aW5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDQxMjI2NCwiZXhwIjoyMDc1OTg4MjY0fQ.eT2Nfayd2o93PuCQVVmrlS7BflCQh-DMp7n4XdFNcoo

# For direct database access
POSTGRES_URL_NON_POOLING=postgres://postgres.sssyxnpanayqvamstind:S9MuK3OiFs3GZSp3@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

---

## API Endpoints

### 1. Get Vehicle Status

Retrieve current vehicle status including VIN, license plate, battery level, and temperature.

**Endpoint:** `GET /api/vehicle/status`

**Query Parameters:**
- `vin` (optional) - Filter by specific VIN. If omitted, returns all vehicles.

**Example Requests:**

```bash
# Get all vehicles
curl https://mtc.air.zone/api/vehicle/status

# Get specific vehicle by VIN
curl https://mtc.air.zone/api/vehicle/status?vin=LSJWH4092PN070121
```

**Response Format:**

```json
{
  "success": true,
  "data": {
    "vin": "LSJWH4092PN070121",
    "soc": 85.5,
    "soc_precise": 85.47,
    "range_km": 342,
    "charging_state": "Disconnected",
    "interior_temp_c": 22.5,
    "exterior_temp_c": 18.3,
    "battery_temp_c": 24.1,
    "lat": 22.123456,
    "lon": 113.123456,
    "speed": 0,
    "odometer_km": 12345,
    "doors_locked": true,
    "updated_at": "2025-11-07T10:30:45.123Z",
    "vehicles": {
      "vin": "LSJWH4092PN070121",
      "plate_number": "YV2570",
      "label": "My Car",
      "model": "MG ZS EV",
      "year": 2024
    }
  }
}
```

**Key Data Points:**

| Field | Type | Description |
|-------|------|-------------|
| `vin` | string | Vehicle Identification Number (Primary Key) |
| `vehicles.plate_number` | string | License plate number |
| `soc` | number | State of Charge (0-100%) |
| `soc_precise` | number | High-precision SOC |
| `range_km` | number | Estimated driving range in kilometers |
| `charging_state` | string | 'Disconnected', 'Plugged', or 'Charging' |
| `interior_temp_c` | number | Interior cabin temperature in Celsius |
| `exterior_temp_c` | number | Outside air temperature in Celsius |
| `battery_temp_c` | number | Battery pack temperature in Celsius |

**Full Response Fields:**

```typescript
{
  // Vehicle Identity
  vin: string
  vehicles: {
    vin: string
    plate_number: string
    label: string
    model: string
    year: number
  }

  // Battery & Charging
  soc: number                    // State of Charge (%)
  soc_precise: number            // Precise SOC
  range_km: number               // Estimated range
  charging_state: string         // 'Disconnected' | 'Plugged' | 'Charging'
  charge_current_a: number       // Charging current (Amps)
  charge_voltage_v: number       // Charging voltage (Volts)
  charge_power_kw: number        // Charging power (kW)
  battery_temp_c: number         // Battery temperature
  target_soc: number             // Target charge level

  // Location & Motion
  lat: number                    // Latitude
  lon: number                    // Longitude
  altitude: number               // Altitude (meters)
  bearing: number                // Heading (degrees)
  speed: number                  // Current speed (km/h)
  gps_accuracy: number           // GPS accuracy (meters)

  // Climate
  interior_temp_c: number        // Interior temperature
  exterior_temp_c: number        // Exterior temperature
  hvac_state: string             // HVAC status
  remote_temperature: number     // Remote climate setting

  // Security
  doors_locked: boolean          // Door lock status
  windows_state: string          // Window status
  boot_locked: boolean           // Boot/trunk lock status
  bonnet_closed: boolean         // Hood status

  // Vehicle State
  ignition: boolean              // Ignition on/off
  engine_running: boolean        // Engine running
  odometer_km: number            // Total distance traveled

  // Metadata
  gateway_status: string         // Connection status
  updated_at: string             // ISO 8601 timestamp
  location_updated_at: string    // Last GPS update
}
```

**Error Responses:**

```json
// 404 - Vehicle not found
{
  "error": "Vehicle not found"
}

// 500 - Server error
{
  "error": "Failed to fetch vehicle status",
  "details": "Error message"
}
```

---

### 2. Get Trip Data

Retrieve trip statistics and analytics for vehicles.

**Endpoint:** `GET /api/trips`

**Query Parameters:**
- `vin` (optional) - Filter by specific VIN
- `timeRange` (optional) - Time range filter: '24h' or '7d' (default: '24h')

**Example Request:**

```bash
curl https://mtc.air.zone/api/trips?vin=LSJWH4092PN070121&timeRange=24h
```

**Response Format:**

```json
{
  "success": true,
  "data": [
    {
      "vin": "LSJWH4092PN070121",
      "plate_number": "YV2570",
      "total_trips": 5,
      "total_duration_hours": 2.5,
      "total_distance_km": 45.3,
      "avg_speed_kmh": 18.1,
      "max_speed_kmh": 65.0,
      "energy_consumed_kwh": 8.2
    }
  ]
}
```

---

## Direct Database Access

For more complex queries or data analysis, you can connect directly to the Supabase PostgreSQL database:

**Connection String:**
```
postgres://postgres.sssyxnpanayqvamstind:S9MuK3OiFs3GZSp3@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

**Key Tables:**

### `vehicles` - Master vehicle registry
```sql
SELECT vin, plate_number, label, model, year
FROM vehicles;
```

### `vehicle_status` - Latest vehicle status (real-time)
```sql
SELECT vin, soc, interior_temp_c, exterior_temp_c,
       lat, lon, updated_at
FROM vehicle_status
WHERE vin = 'LSJWH4092PN070121';
```

### `vehicle_telemetry` - Historical time-series data
```sql
SELECT vin, ts, soc, interior_temp_c, lat, lon
FROM vehicle_telemetry
WHERE vin = 'LSJWH4092PN070121'
  AND ts >= NOW() - INTERVAL '24 hours'
ORDER BY ts DESC;
```

---

## Integration Examples

### Node.js / TypeScript

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://sssyxnpanayqvamstind.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc3l4bnBhbmF5cXZhbXN0aW5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDQxMjI2NCwiZXhwIjoyMDc1OTg4MjY0fQ.eT2Nfayd2o93PuCQVVmrlS7BflCQh-DMp7n4XdFNcoo'
)

// Get vehicle status with plate number
async function getVehicleData(vin: string) {
  const { data, error } = await supabase
    .from('vehicle_status')
    .select('*, vehicles(*)')
    .eq('vin', vin)
    .single()

  if (error) throw error

  return {
    vin: data.vin,
    plateNumber: data.vehicles.plate_number,
    batteryLevel: data.soc,
    temperature: data.interior_temp_c
  }
}

// Get all vehicles
async function getAllVehicles() {
  const { data, error } = await supabase
    .from('vehicle_status')
    .select('*, vehicles(*)')

  if (error) throw error
  return data
}
```

### Python

```python
import requests

BASE_URL = "https://mtc.air.zone"

def get_vehicle_status(vin=None):
    """Fetch vehicle status"""
    url = f"{BASE_URL}/api/vehicle/status"
    if vin:
        url += f"?vin={vin}"

    response = requests.get(url)
    response.raise_for_status()
    return response.json()

# Get specific vehicle
vehicle = get_vehicle_status("LSJWH4092PN070121")
print(f"VIN: {vehicle['data']['vin']}")
print(f"Plate: {vehicle['data']['vehicles']['plate_number']}")
print(f"Battery: {vehicle['data']['soc']}%")
print(f"Temperature: {vehicle['data']['interior_temp_c']}°C")
```

### cURL

```bash
# Get all vehicles
curl https://mtc.air.zone/api/vehicle/status | jq

# Get specific vehicle and extract key data
curl https://mtc.air.zone/api/vehicle/status?vin=LSJWH4092PN070121 | \
  jq '{
    vin: .data.vin,
    plate: .data.vehicles.plate_number,
    battery: .data.soc,
    temp: .data.interior_temp_c
  }'
```

---

## Rate Limits & Quotas

- No explicit rate limiting is currently enforced
- Data updates every ~5 seconds via MQTT ingestion
- `vehicle_status` table contains the most recent snapshot
- `vehicle_telemetry` table contains historical time-series data

---

## Data Freshness

- **Real-time updates**: Vehicle data is ingested via MQTT every 5 seconds
- **`updated_at` field**: Indicates when the data was last updated
- **Stale data threshold**: Data older than 5 minutes may indicate vehicle offline or gateway disconnection

---

## Security Notes

**Important:** The Service Role Key provides unrestricted database access. For production integrations:

1. Consider creating a dedicated API key system
2. Implement Row-Level Security (RLS) policies for specific access
3. Use HTTPS for all API calls
4. Rotate credentials periodically
5. Store credentials securely (environment variables, secrets manager)

---

## Support & Contact

For API support or questions:
- GitHub Issues: (repository link)
- Documentation: https://mtc.air.zone/docs (if available)

---

## Changelog

**Version 1.0** (2025-11-07)
- Initial API documentation
- VIN, license plate, battery level, and temperature endpoints
- Direct database access documentation
- Integration examples for Node.js, Python, and cURL
