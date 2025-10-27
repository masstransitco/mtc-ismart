import { NextRequest, NextResponse } from 'next/server'
import { getMqttClient, publishCommand } from '@/server/mqtt-client'
import { createClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { vin, locked } = await req.json()

    if (!vin || typeof locked !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid request. Required: vin, locked (boolean)' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Log command to database
    const { data: commandLog, error: logError } = await supabase
      .from('vehicle_commands')
      .insert({
        vin,
        command_type: locked ? 'lock' : 'unlock',
        command_payload: { locked },
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
        'doors/locked/set',
        locked ? 'true' : 'false'
      )

      // Update command status
      if (commandLog) {
        await supabase
          .from('vehicle_commands')
          .update({ status: 'sent', completed_at: new Date().toISOString() })
          .eq('id', commandLog.id)
      }

      return NextResponse.json({
        success: true,
        message: `Vehicle ${locked ? 'locked' : 'unlocked'} successfully`,
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
    console.error('[API] Lock command error:', error)
    return NextResponse.json(
      { error: 'Failed to send lock command', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
