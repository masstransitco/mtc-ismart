import { NextRequest, NextResponse } from 'next/server'
import { getMqttClient, publishCommand } from '@/server/mqtt-client'
import { createClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { vin, action, targetSoc, currentLimit } = await req.json()

    if (!vin || !action) {
      return NextResponse.json(
        { error: 'Invalid request. Required: vin, action (start|stop|setTarget|setLimit)' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Log command to database
    const { data: commandLog, error: logError } = await supabase
      .from('vehicle_commands')
      .insert({
        vin,
        command_type: 'charge',
        command_payload: { action, targetSoc, currentLimit },
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
      switch (action) {
        case 'start':
          await publishCommand(client, vin, 'drivetrain/charging/set', 'true')
          break

        case 'stop':
          await publishCommand(client, vin, 'drivetrain/charging/set', 'false')
          break

        case 'setTarget':
          if (!targetSoc || ![40, 50, 60, 70, 80, 90, 100].includes(targetSoc)) {
            return NextResponse.json(
              { error: 'Invalid targetSoc. Must be one of: 40, 50, 60, 70, 80, 90, 100' },
              { status: 400 }
            )
          }
          await publishCommand(client, vin, 'drivetrain/socTarget/set', targetSoc.toString())
          break

        case 'setLimit':
          if (!currentLimit || !['6A', '8A', '16A', 'MAX'].includes(currentLimit)) {
            return NextResponse.json(
              { error: 'Invalid currentLimit. Must be one of: 6A, 8A, 16A, MAX' },
              { status: 400 }
            )
          }
          await publishCommand(client, vin, 'drivetrain/chargeCurrentLimit/set', currentLimit)
          break

        default:
          return NextResponse.json(
            { error: 'Invalid action. Must be: start, stop, setTarget, or setLimit' },
            { status: 400 }
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
        message: `Charge ${action} command sent`,
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
    console.error('[API] Charge command error:', error)
    return NextResponse.json(
      { error: 'Failed to send charge command', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
