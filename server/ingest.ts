import { getMqttClient, subscribeToTopics } from './mqtt-client'
import { createClient } from '@supabase/supabase-js'
import { MqttClient } from 'mqtt'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

async function handleMessage(topic: string, message: Buffer) {
  try {
    const payload = safeParse(message.toString())
    const vin = extractVin(topic)

    if (!vin) {
      console.warn(`[Ingest] Could not extract VIN from topic: ${topic}`)
      return
    }

    console.log(`[Ingest] Received message for VIN ${vin} on topic ${topic}`)

    // Ensure vehicle exists
    const { error: vehicleError } = await supabase
      .from('vehicles')
      .upsert(
        { vin, updated_at: new Date().toISOString() },
        { onConflict: 'vin' }
      )

    if (vehicleError) {
      console.error('[Ingest] Error upserting vehicle:', vehicleError)
    }

    // Handle status updates
    if (topic.includes('/status/')) {
      await handleStatusUpdate(vin, topic, payload)
    }

    // Handle events
    if (topic.includes('/events/')) {
      await handleEvent(vin, topic, payload)
    }

    // Insert telemetry record for significant events
    if (shouldRecordTelemetry(topic, payload)) {
      await insertTelemetry(vin, topic, payload)
    }
  } catch (error) {
    console.error('[Ingest] Error processing message:', error)
  }
}

async function handleStatusUpdate(
  vin: string,
  topic: string,
  payload: any
) {
  const statusData: VehicleStatusPayload = {}

  // Map payload fields to our schema
  if (payload.soc !== undefined) statusData.soc = payload.soc
  if (payload.socPrecise !== undefined) statusData.soc_precise = payload.socPrecise
  if (payload.rangeKm !== undefined) statusData.range_km = payload.rangeKm
  if (payload.chargingState !== undefined) statusData.charging_state = payload.chargingState
  if (payload.currentA !== undefined) statusData.charge_current_a = payload.currentA
  if (payload.voltageV !== undefined) statusData.charge_voltage_v = payload.voltageV
  if (payload.powerKw !== undefined) statusData.charge_power_kw = payload.powerKw
  if (payload.lat !== undefined) statusData.lat = payload.lat
  if (payload.lon !== undefined) statusData.lon = payload.lon
  if (payload.altitude !== undefined) statusData.altitude = payload.altitude
  if (payload.bearing !== undefined) statusData.bearing = payload.bearing
  if (payload.speed !== undefined) statusData.speed = payload.speed
  if (payload.doorsLocked !== undefined) statusData.doors_locked = payload.doorsLocked
  if (payload.windows !== undefined) statusData.windows_state = payload.windows
  if (payload.bootLocked !== undefined) statusData.boot_locked = payload.bootLocked
  if (payload.interiorTemp !== undefined) statusData.interior_temp_c = payload.interiorTemp
  if (payload.exteriorTemp !== undefined) statusData.exterior_temp_c = payload.exteriorTemp
  if (payload.hvacState !== undefined) statusData.hvac_state = payload.hvacState
  if (payload.ignition !== undefined) statusData.ignition = payload.ignition
  if (payload.engineRunning !== undefined) statusData.engine_running = payload.engineRunning
  if (payload.odometerKm !== undefined) statusData.odometer_km = payload.odometerKm

  if (Object.keys(statusData).length > 0) {
    const { error } = await supabase.rpc('upsert_vehicle_status', {
      p_vin: vin,
      p_data: statusData as any,
    })

    if (error) {
      console.error('[Ingest] Error upserting vehicle status:', error)
    } else {
      console.log(`[Ingest] Updated status for VIN ${vin}`)
    }
  }
}

async function handleEvent(vin: string, topic: string, payload: any) {
  // Log events for future analysis
  console.log(`[Ingest] Event for ${vin}:`, topic, payload)
}

function shouldRecordTelemetry(topic: string, payload: any): boolean {
  // Record telemetry for charging, location, and significant state changes
  if (topic.includes('/status/charge')) return true
  if (topic.includes('/status/location')) return true
  if (topic.includes('/status/battery')) return true
  if (payload.chargingState && payload.chargingState !== 'Idle') return true
  return false
}

async function insertTelemetry(vin: string, topic: string, payload: any) {
  const eventType = topic.includes('/charge')
    ? 'charge'
    : topic.includes('/location')
    ? 'location'
    : 'vehicle_state'

  const telemetryData = {
    vin,
    event_type: eventType,
    soc: payload.soc,
    soc_precise: payload.socPrecise,
    range_km: payload.rangeKm,
    charging_state: payload.chargingState,
    charge_power_kw: payload.powerKw,
    charge_current_a: payload.currentA,
    charge_voltage_v: payload.voltageV,
    battery_temp_c: payload.batteryTemp,
    lat: payload.lat,
    lon: payload.lon,
    altitude: payload.altitude,
    bearing: payload.bearing,
    speed: payload.speed,
    raw_payload: payload,
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

    // Subscribe to all vehicle topics
    const topics = [
      'saic/+/vehicles/+/status/#',
      'saic/+/vehicles/+/events/#',
      'mg/+/status/#',
      'mg/+/events/#',
    ]

    try {
      await subscribeToTopics(client, topics)
      console.log('[Ingest] Subscribed to topics:', topics)
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
