import { NextRequest, NextResponse } from 'next/server'
import { getMqttClient, publishCommand } from '@/server/mqtt-client'
import { createClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { vin, mode } = await req.json()

    if (!vin || !mode) {
      return NextResponse.json(
        { error: 'Invalid request. Required: vin, mode (activate|lights_only|horn_only|stop)' },
        { status: 400 }
      )
    }

    const validModes = ['activate', 'lights_only', 'horn_only', 'stop']
    if (!validModes.includes(mode)) {
      return NextResponse.json(
        { error: `Invalid mode. Must be one of: ${validModes.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Log command to database
    const { data: commandLog, error: logError } = await supabase
      .from('vehicle_commands')
      .insert({
        vin,
        command_type: 'find_my_car',
        command_payload: { mode },
        status: 'pending',
      })
      .select()
      .single()

    if (logError) {
      console.error('[API] Error logging command:', logError)
    }

    // Publish to MQTT
    const mqttConfig = {
      brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
      username: process.env.MQTT_USER || 'mtc_app',
      password: process.env.MQTT_PASSWORD || '',
    }

    const client = getMqttClient(mqttConfig)

    try {
      await publishCommand(
        client,
        vin,
        'location/findMyCar/set',
        mode
      )

      // Update command status
      if (commandLog) {
        await supabase
          .from('vehicle_commands')
          .update({ status: 'sent', completed_at: new Date().toISOString() })
          .eq('id', commandLog.id)
      }

      const modeLabels = {
        activate: 'Horn & Lights activated',
        lights_only: 'Lights flashing',
        horn_only: 'Horn activated',
        stop: 'Alert stopped',
      }

      return NextResponse.json({
        success: true,
        message: modeLabels[mode as keyof typeof modeLabels] || 'Find My Car command sent',
        commandId: commandLog?.id,
      })
    } catch (error) {
      // Update command status to failed
      if (commandLog) {
        await supabase
          .from('vehicle_commands')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            completed_at: new Date().toISOString(),
          })
          .eq('id', commandLog.id)
      }

      throw error
    }
  } catch (error) {
    console.error('[API] Find My Car command error:', error)
    return NextResponse.json(
      { error: 'Failed to send Find My Car command', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
