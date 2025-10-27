import { NextRequest, NextResponse } from 'next/server'
import { getMqttClient, publishCommand } from '@/server/mqtt-client'
import { createClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { vin, action, temperature } = await req.json()

    if (!vin || !action) {
      return NextResponse.json(
        { error: 'Invalid request. Required: vin, action (on|off|front|blowingonly)' },
        { status: 400 }
      )
    }

    const validActions = ['on', 'off', 'front', 'blowingonly']
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Log command to database
    const { data: commandLog, error: logError } = await supabase
      .from('vehicle_commands')
      .insert({
        vin,
        command_type: 'climate',
        command_payload: { action, temperature },
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
      // Set climate state
      await publishCommand(
        client,
        vin,
        'climate/remoteClimateState/set',
        action
      )

      // Set temperature if provided
      if (temperature && action === 'on') {
        await publishCommand(
          client,
          vin,
          'climate/remoteTemperature/set',
          temperature.toString()
        )
      }

      // Update command status
      if (commandLog) {
        await supabase
          .from('vehicle_commands')
          .update({ status: 'sent', completed_at: new Date().toISOString() })
          .eq('id', commandLog.id)
      }

      return NextResponse.json({
        success: true,
        message: `Climate control ${action} command sent`,
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
    console.error('[API] Climate command error:', error)
    return NextResponse.json(
      { error: 'Failed to send climate command', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
