import dotenv from 'dotenv'

// Load .env.local file
dotenv.config({ path: '.env.local' })

console.log('[Ingest] Loaded env vars:', {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
  hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  mqttUrl: process.env.MQTT_BROKER_URL
})

import { getMqttClient, subscribeToTopics } from './mqtt-client'
import { createClient } from '@supabase/supabase-js'
import { MqttClient } from 'mqtt'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[Ingest] Missing required environment variables!')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

interface VehicleStatusPayload {
  vin?: string
  soc?: number
  soc_precise?: number
  range_km?: number
  charging_state?: string
  charge_current_a?: number
  charge_voltage_v?: number
  charge_power_kw?: number
  lat?: number
  lon?: number
  altitude?: number
  bearing?: number
  speed?: number
  doors_locked?: boolean
  windows_state?: object
  boot_locked?: boolean
  interior_temp_c?: number
  exterior_temp_c?: number
  hvac_state?: string
  ignition?: boolean
  engine_running?: boolean
  odometer_km?: number
}

function safeParse(message: string): any {
  try {
    return JSON.parse(message)
  } catch {
    return { value: message }
  }
}

function extractVin(topic: string): string | null {
  // Topic format: saic/<user>/vehicles/<vin>/<category>/<subcategory>
  // or: mg/<vin>/status/<category>
  const parts = topic.split('/')
  if (parts[0] === 'saic' && parts[2] === 'vehicles') {
    return parts[3]
  } else if (parts[0] === 'mg') {
    return parts[1]
  }
  return null
}

// Cache to accumulate vehicle data before writing
const vehicleDataCache: Map<string, Partial<VehicleStatusPayload> & { lastUpdate: number }> = new Map()
const CACHE_FLUSH_INTERVAL = 5000 // Flush every 5 seconds

async function handleMessage(topic: string, message: Buffer) {
  try {
    const vin = extractVin(topic)
    if (!vin) {
      console.warn(`[Ingest] Could not extract VIN from topic: ${topic}`)
      return
    }

    // Parse the value - SAIC gateway sends individual values, not JSON objects
    const value = message.toString().trim()
    const parsedValue = safeParse(value)
    const actualValue = parsedValue.value !== undefined ? parsedValue.value : parsedValue

    console.log(`[Ingest] ${vin}: ${topic.split('/').slice(-2).join('/')} = ${value}`)

    // Get or create cache entry for this VIN
    let cache = vehicleDataCache.get(vin)
    if (!cache) {
      cache = { lastUpdate: Date.now() }
      vehicleDataCache.set(vin, cache)

      // Ensure vehicle exists
      await supabase
        .from('vehicles')
        .upsert(
          { vin, updated_at: new Date().toISOString() },
          { onConflict: 'vin' }
        )
    }

    // Map SAIC topics to our database fields
    if (topic.includes('/drivetrain/soc')) {
      cache.soc = parseFloat(actualValue)
      cache.soc_precise = parseFloat(actualValue)
    } else if (topic.includes('/drivetrain/range')) {
      cache.range_km = parseFloat(actualValue)
    } else if (topic.includes('/drivetrain/charging')) {
      cache.charging_state = actualValue === 'true' || actualValue === true ? 'Charging' : 'Idle'
    } else if (topic.includes('/drivetrain/current')) {
      cache.charge_current_a = parseFloat(actualValue)
    } else if (topic.includes('/drivetrain/voltage')) {
      cache.charge_voltage_v = parseFloat(actualValue)
    } else if (topic.includes('/drivetrain/power')) {
      cache.charge_power_kw = parseFloat(actualValue) / 1000 // Convert W to kW
    } else if (topic.includes('/drivetrain/mileage')) {
      cache.odometer_km = parseFloat(actualValue)
    } else if (topic.includes('/drivetrain/running')) {
      cache.ignition = actualValue === 'true' || actualValue === true
      cache.engine_running = actualValue === 'true' || actualValue === true
    } else if (topic.includes('/location/latitude')) {
      cache.lat = parseFloat(actualValue)
    } else if (topic.includes('/location/longitude')) {
      cache.lon = parseFloat(actualValue)
    } else if (topic.includes('/location/elevation')) {
      cache.altitude = parseFloat(actualValue)
    } else if (topic.includes('/location/heading')) {
      cache.bearing = parseFloat(actualValue)
    } else if (topic.includes('/location/speed')) {
      cache.speed = parseFloat(actualValue)
    } else if (topic.includes('/doors/locked')) {
      cache.doors_locked = actualValue === 'true' || actualValue === true
    } else if (topic.includes('/doors/boot')) {
      cache.boot_locked = actualValue === 'true' || actualValue === true
    } else if (topic.includes('/climate/interiorTemperature')) {
      cache.interior_temp_c = parseFloat(actualValue)
    } else if (topic.includes('/climate/exteriorTemperature')) {
      cache.exterior_temp_c = parseFloat(actualValue)
    } else if (topic.includes('/climate/remoteClimateState')) {
      cache.hvac_state = actualValue
    }

    cache.lastUpdate = Date.now()
  } catch (error) {
    console.error('[Ingest] Error processing message:', error)
  }
}

// Flush cached data to database periodically
setInterval(async () => {
  for (const [vin, cache] of vehicleDataCache.entries()) {
    // Only flush if we have data and it's been updated recently
    if (Object.keys(cache).length > 1 && Date.now() - cache.lastUpdate < 60000) {
      try {
        const { lastUpdate, ...statusData } = cache

        if (Object.keys(statusData).length > 0) {
          const { error } = await supabase.rpc('upsert_vehicle_status', {
            p_vin: vin,
            p_data: statusData as any,
          })

          if (error) {
            console.error(`[Ingest] Error upserting ${vin}:`, error)
          } else {
            console.log(`[Ingest] ✓ Updated ${vin} with ${Object.keys(statusData).length} fields`)
          }

          // Record telemetry for significant updates
          if (statusData.soc !== undefined || statusData.lat !== undefined) {
            await insertTelemetry(vin, statusData)
          }
        }
      } catch (error) {
        console.error(`[Ingest] Error flushing ${vin}:`, error)
      }
    }
  }
}, CACHE_FLUSH_INTERVAL)

async function insertTelemetry(vin: string, statusData: Partial<VehicleStatusPayload>) {
  const eventType = statusData.soc !== undefined
    ? 'charge'
    : statusData.lat !== undefined
    ? 'location'
    : 'vehicle_state'

  const telemetryData = {
    vin,
    event_type: eventType,
    soc: statusData.soc,
    soc_precise: statusData.soc_precise,
    range_km: statusData.range_km,
    charging_state: statusData.charging_state,
    charge_power_kw: statusData.charge_power_kw,
    charge_current_a: statusData.charge_current_a,
    charge_voltage_v: statusData.charge_voltage_v,
    lat: statusData.lat,
    lon: statusData.lon,
    altitude: statusData.altitude,
    bearing: statusData.bearing,
    speed: statusData.speed,
    raw_payload: statusData,
  }

  const { error } = await supabase.from('vehicle_telemetry').insert(telemetryData)

  if (error) {
    console.error('[Ingest] Error inserting telemetry:', error)
  }
}

export function startIngestion() {
  const config = {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USER || 'mtc_ingest',
    password: process.env.MQTT_PASSWORD || '',
    clientId: 'mtc-ismart-ingest',
  }

  console.log('[Ingest] Starting ingestion service...')
  console.log(`[Ingest] Connecting to MQTT broker: ${config.brokerUrl}`)

  const client = getMqttClient(config)

  client.on('connect', async () => {
    console.log('[Ingest] Connected to MQTT broker')

    // Subscribe to SAIC gateway's actual topic structure
    const topics = [
      'saic/+/vehicles/+/drivetrain/#',   // Battery, charge, range, mileage
      'saic/+/vehicles/+/location/#',     // GPS, heading, speed
      'saic/+/vehicles/+/climate/#',      // Temperature, HVAC
      'saic/+/vehicles/+/doors/#',        // Lock status, windows
      'saic/+/vehicles/+/refresh/#',      // Refresh state
    ]

    try {
      await subscribeToTopics(client, topics)
      console.log('[Ingest] Subscribed to topics:', topics)
      console.log('[Ingest] Waiting for vehicle data...')
    } catch (error) {
      console.error('[Ingest] Failed to subscribe:', error)
    }
  })

  client.on('message', handleMessage)

  client.on('error', (error) => {
    console.error('[Ingest] MQTT error:', error)
  })

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('[Ingest] Shutting down...')
    client.end()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('[Ingest] Shutting down...')
    client.end()
    process.exit(0)
  })

  return client
}

// Run if executed directly
if (require.main === module) {
  startIngestion()
}
