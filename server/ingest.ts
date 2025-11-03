import dotenv from 'dotenv'

// Load .env.local file only in development (not in production/Docker)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local' })
}

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
  charging_plug_connected?: boolean
  hv_battery_active?: boolean
  battery_heating?: boolean
  charge_current_limit?: string
  charge_status_detailed?: string
  lat?: number
  lon?: number
  altitude?: number
  bearing?: number
  speed?: number
  doors_locked?: boolean
  door_driver_open?: boolean
  door_passenger_open?: boolean
  door_rear_left_open?: boolean
  door_rear_right_open?: boolean
  windows_state?: object
  boot_locked?: boolean
  bonnet_closed?: boolean
  interior_temp_c?: number
  exterior_temp_c?: number
  hvac_state?: string
  ignition?: boolean
  engine_running?: boolean
  odometer_km?: number
  lights_main_beam?: boolean
  lights_dipped_beam?: boolean
  lights_side?: boolean
  remote_temperature?: number
  heated_seat_front_left_level?: number
  heated_seat_front_right_level?: number
  rear_window_defrost?: boolean
}

function safeParse(message: string): any {
  try {
    return JSON.parse(message)
  } catch {
    return { value: message }
  }
}

function extractVin(topic: string): string | null {
  // Topic format: <mqtt_topic>/<user>/vehicles/<vin>/<category>/<subcategory>
  // Example: saic/system@air.city/vehicles/LSJWH4092PN070121/drivetrain/soc
  const parts = topic.split('/')

  // Handle saic/<user>/vehicles/<VIN>/... format
  if (parts[0] === 'saic' && parts[2] === 'vehicles' && parts[3]) {
    return parts[3]  // VIN is at index 3
  }

  // Handle legacy <user>/vehicles/<VIN>/... format (without mqtt_topic prefix)
  if (parts[1] === 'vehicles' && parts[2]) {
    return parts[2]  // VIN is at index 2 for <user>/vehicles/<VIN>/...
  }

  // Handle mg/<VIN>/... format
  if (parts[0] === 'mg' && parts[1]) {
    return parts[1]
  }

  return null
}

// Cache to accumulate vehicle data before writing
interface VehicleCache extends Partial<VehicleStatusPayload> {
  lastUpdate: number
  prevSoc?: number
  gateway_bool_charging?: boolean
}
const vehicleDataCache: Map<string, VehicleCache> = new Map()
const CACHE_FLUSH_INTERVAL = 5000 // Flush every 5 seconds

async function handleMessage(topic: string, message: Buffer) {
  try {
    const vin = extractVin(topic)
    if (!vin) {
      console.log(JSON.stringify({svc:"ingest",level:"warn",event:"no_vin",topic}))
      return
    }

    // Parse the value - SAIC gateway sends individual values, not JSON objects
    const value = message.toString().trim()
    const parsedValue = safeParse(value)
    const actualValue = parsedValue.value !== undefined ? parsedValue.value : parsedValue

    // Log raw values for critical topics to debug mismatches
    const debugTopics = ['charging', 'power', 'current']
    const shouldDebug = debugTopics.some(t => topic.includes(t))

    if (shouldDebug) {
      console.log(JSON.stringify({
        svc:"ingest",
        level:"debug",
        event:"message_raw",
        topic,
        vin,
        raw:value,
        parsed:actualValue,
        bytes:message.length
      }))
    } else {
      console.log(JSON.stringify({svc:"ingest",level:"info",event:"message",topic,vin,bytes:message.length}))
    }

    // Get or create cache entry for this VIN
    let cache = vehicleDataCache.get(vin)
    if (!cache) {
      cache = { lastUpdate: Date.now() }
      vehicleDataCache.set(vin, cache)
      console.log(`[Ingest] 🆕 Created cache for new vehicle: ${vin}`)

      // Ensure vehicle exists
      await supabase
        .from('vehicles')
        .upsert(
          { vin, updated_at: new Date().toISOString() },
          { onConflict: 'vin' }
        )
    }

    // Helper function for case-insensitive boolean parsing
    const parseBoolean = (value: any): boolean => {
      if (typeof value === 'boolean') return value
      return value.toString().toLowerCase() === 'true'
    }

    // Map SAIC topics to our database fields
    if (topic.includes('/drivetrain/soc')) {
      const newSoc = parseFloat(actualValue)
      // Track previous SoC for delta detection
      if (cache.soc !== undefined && cache.soc !== newSoc) {
        cache.prevSoc = cache.soc
      }
      cache.soc = newSoc
      cache.soc_precise = newSoc
    } else if (topic.includes('/drivetrain/range')) {
      cache.range_km = parseFloat(actualValue)
    } else if (topic.includes('/drivetrain/charging')) {
      // Store gateway boolean for audit/debugging (unreliable)
      cache.gateway_bool_charging = parseBoolean(actualValue)
      // Do NOT use this to set charging_state - derived logic will handle it
    } else if (topic.includes('/drivetrain/current')) {
      cache.charge_current_a = parseFloat(actualValue)
    } else if (topic.includes('/drivetrain/voltage')) {
      cache.charge_voltage_v = parseFloat(actualValue)
    } else if (topic.endsWith('/drivetrain/power')) {
      // Match exact topic, not powerUsage* topics
      const power = parseFloat(actualValue)
      // Power is already in kW (negative for charging), use absolute value for display
      cache.charge_power_kw = Math.abs(power)
    } else if (topic.includes('/drivetrain/chargerConnected')) {
      cache.charging_plug_connected = parseBoolean(actualValue)
    } else if (topic.includes('/drivetrain/hvBatteryActive')) {
      cache.hv_battery_active = parseBoolean(actualValue)
    } else if (topic.includes('/drivetrain/batteryHeating')) {
      cache.battery_heating = parseBoolean(actualValue)
    } else if (topic.includes('/drivetrain/chargeCurrentLimit')) {
      cache.charge_current_limit = actualValue.toString()
    } else if (topic.includes('/drivetrain/mileage')) {
      cache.odometer_km = parseFloat(actualValue)
    } else if (topic.includes('/drivetrain/running')) {
      cache.ignition = parseBoolean(actualValue)
      cache.engine_running = parseBoolean(actualValue)
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
      cache.doors_locked = parseBoolean(actualValue)
    } else if (topic.includes('/doors/driver')) {
      cache.door_driver_open = parseBoolean(actualValue)
    } else if (topic.includes('/doors/passenger')) {
      cache.door_passenger_open = parseBoolean(actualValue)
    } else if (topic.includes('/doors/rearLeft')) {
      cache.door_rear_left_open = parseBoolean(actualValue)
    } else if (topic.includes('/doors/rearRight')) {
      cache.door_rear_right_open = parseBoolean(actualValue)
    } else if (topic.includes('/doors/bonnet')) {
      cache.bonnet_closed = !parseBoolean(actualValue) // Inverted: topic is "open", field is "closed"
    } else if (topic.includes('/doors/boot')) {
      cache.boot_locked = parseBoolean(actualValue)
    } else if (topic.includes('/climate/interiorTemperature')) {
      cache.interior_temp_c = parseFloat(actualValue)
    } else if (topic.includes('/climate/exteriorTemperature')) {
      cache.exterior_temp_c = parseFloat(actualValue)
    } else if (topic.includes('/climate/remoteClimateState')) {
      cache.hvac_state = actualValue
    } else if (topic.includes('/climate/remoteTemperature')) {
      cache.remote_temperature = parseInt(actualValue)
    } else if (topic.includes('/climate/heatedSeatsFrontLeftLevel')) {
      cache.heated_seat_front_left_level = parseInt(actualValue)
    } else if (topic.includes('/climate/heatedSeatsFrontRightLevel')) {
      cache.heated_seat_front_right_level = parseInt(actualValue)
    } else if (topic.includes('/climate/rearWindowDefrosterHeating')) {
      const value = actualValue.toString().toLowerCase()
      cache.rear_window_defrost = value === 'on' || value === 'true'
    } else if (topic.includes('/lights/mainBeam')) {
      cache.lights_main_beam = parseBoolean(actualValue)
    } else if (topic.includes('/lights/dippedBeam')) {
      cache.lights_dipped_beam = parseBoolean(actualValue)
    } else if (topic.includes('/lights/side')) {
      cache.lights_side = parseBoolean(actualValue)
    }

    cache.lastUpdate = Date.now()
  } catch (error) {
    console.error('[Ingest] Error processing message:', error)
  }
}

// Derive charging state from multiple signals (ground truth)
function deriveChargingState(cache: VehicleCache): string {
  const isPlugged = cache.charging_plug_connected === true
  const current = cache.charge_current_a ?? 0
  const power = cache.charge_power_kw ?? 0
  const soc = cache.soc ?? 0
  const prevSoc = cache.prevSoc ?? soc

  // SAIC convention: negative current = charging, positive = discharging
  const isChargingByI = current < -1  // More than 1A charging
  const isChargingByP = power > 0.1   // More than 100W
  const socDelta = soc - prevSoc
  const isSocIncreasing = socDelta > 0.02  // SoC increased by >0.02%

  // Derived logic: plugged + (negative current OR power flow OR SoC increasing)
  if (isPlugged && (isChargingByI || isChargingByP || isSocIncreasing)) {
    // Log mismatch for debugging if gateway says not charging
    if (cache.gateway_bool_charging === false) {
      console.log(JSON.stringify({
        svc:"ingest",
        level:"warn",
        event:"charging_mismatch",
        vin:cache.vin,
        gateway_bool:false,
        derived:"Charging",
        current,
        power,
        socDelta,
        indicators:{isChargingByI,isChargingByP,isSocIncreasing}
      }))
    }
    return 'Charging'
  } else if (isPlugged) {
    return 'Plugged'  // Plugged but idle
  } else {
    return 'Disconnected'
  }
}

// Flush cached data to database periodically
setInterval(async () => {
  for (const [vin, cache] of vehicleDataCache.entries()) {
    // Only flush if we have data and it's been updated recently
    if (Object.keys(cache).length > 1 && Date.now() - cache.lastUpdate < 60000) {
      try {
        // Derive charging state from all signals (ground truth)
        cache.charging_state = deriveChargingState(cache)

        const { lastUpdate, prevSoc, gateway_bool_charging, ...statusData } = cache

        if (Object.keys(statusData).length > 0) {
          const { error } = await supabase.rpc('upsert_vehicle_status', {
            p_vin: vin,
            p_data: statusData as any,
          })

          if (error) {
            console.error(`[Ingest] ❌ Error upserting ${vin}:`, error)
          } else {
            console.log(`[Ingest] ✅ Updated ${vin} with ${Object.keys(statusData).length} fields`)
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
    charging_plug_connected: statusData.charging_plug_connected,
    hv_battery_active: statusData.hv_battery_active,
    battery_heating: statusData.battery_heating,
    charge_current_limit: statusData.charge_current_limit,
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
    console.log(JSON.stringify({svc:"ingest",level:"info",event:"connected",broker:config.brokerUrl}))

    // Subscribe to SAIC gateway's actual topic structure
    // Gateway publishes with format: <mqtt_topic>/<user>/vehicles/<vin>/<category>/<subcategory>
    // Default MQTT_TOPIC is "saic"
    const mqttTopic = process.env.MQTT_TOPIC || 'saic'
    const saicUser = process.env.SAIC_USER || 'system@air.city'

    const topics = [
      `${mqttTopic}/${saicUser}/vehicles/+/drivetrain/#`,   // Battery, charge, range, mileage
      `${mqttTopic}/${saicUser}/vehicles/+/location/#`,     // GPS, heading, speed
      `${mqttTopic}/${saicUser}/vehicles/+/climate/#`,      // Temperature, HVAC
      `${mqttTopic}/${saicUser}/vehicles/+/doors/#`,        // Lock status, windows
      `${mqttTopic}/${saicUser}/vehicles/+/lights/#`,       // Headlights, side lights
      `${mqttTopic}/${saicUser}/vehicles/+/tyres/#`,        // Tire pressure
      `${mqttTopic}/${saicUser}/vehicles/+/windows/#`,      // Window status
      `${mqttTopic}/${saicUser}/vehicles/+/refresh/#`,      // Refresh state
    ]

    try {
      await subscribeToTopics(client, topics)
      console.log(JSON.stringify({svc:"ingest",level:"info",event:"subscribe",pattern:topics[0],count:topics.length}))
    } catch (error) {
      console.log(JSON.stringify({svc:"ingest",level:"error",event:"subscribe_failed",error:String(error)}))
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
