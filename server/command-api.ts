/**
 * HTTP API Server for Cloud Run Backend
 * Accepts command requests via HTTP and publishes to local MQTT broker
 */

import express, { Request, Response } from 'express'
import { getMqttClient, publishCommand } from './mqtt-client.js'
import { createClient } from '../lib/supabase.js'

const app = express()
const PORT = process.env.PORT || 8080

app.use(express.json())

// MQTT client configuration (connects to localhost broker in Cloud Run)
const mqttConfig = {
  brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  username: process.env.MQTT_USERNAME || '',
  password: process.env.MQTT_PASSWORD || '',
}

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mtc-command-api' })
})

// Lock/Unlock vehicle
app.post('/api/vehicle/lock', async (req: Request, res: Response) => {
  try {
    const { vin, locked } = req.body

    if (!vin || typeof locked !== 'boolean') {
      return res.status(400).json({
        error: 'Invalid request. Required: vin, locked (boolean)',
      })
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

    // Publish to local MQTT broker
    const client = getMqttClient(mqttConfig)

    try {
      // SAIC gateway only accepts "true" or "false" (no PIN in MQTT payload)
      // The PIN is configured in the SAIC API account/vehicle settings
      const payload = locked ? 'true' : 'false'

      console.log(`[API] Publishing lock command: vin=${vin}, locked=${locked}, payload=${payload}`)

      await publishCommand(
        client,
        vin,
        'doors/locked/set',
        payload
      )

      // Update command status
      if (commandLog) {
        await supabase
          .from('vehicle_commands')
          .update({ status: 'sent', completed_at: new Date().toISOString() })
          .eq('id', commandLog.id)
      }

      return res.json({
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
    return res.status(500).json({
      error: 'Failed to send lock command',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Climate control
app.post('/api/vehicle/climate', async (req: Request, res: Response) => {
  try {
    const { vin, action, temperature } = req.body

    if (!vin || !action) {
      return res.status(400).json({
        error: 'Invalid request. Required: vin, action (on|off|front|blowingonly)',
      })
    }

    const validActions = ['on', 'off', 'front', 'blowingonly']
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
      })
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

    const client = getMqttClient(mqttConfig)

    try {
      // Publish climate state command
      await publishCommand(client, vin, 'climate/remoteClimateState/set', action)

      // If action is 'on' and temperature is provided, set temperature
      if (action === 'on' && temperature) {
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

      return res.json({
        success: true,
        message: `Climate control ${action} command sent`,
        commandId: commandLog?.id,
      })
    } catch (error) {
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
    return res.status(500).json({
      error: 'Failed to send climate command',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Find My Car
app.post('/api/vehicle/find', async (req: Request, res: Response) => {
  try {
    const { vin, mode } = req.body

    if (!vin || !mode) {
      return res.status(400).json({
        error: 'Invalid request. Required: vin, mode (activate|lights_only|horn_only|stop)',
      })
    }

    const validModes = ['activate', 'lights_only', 'horn_only', 'stop']
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        error: `Invalid mode. Must be one of: ${validModes.join(', ')}`,
      })
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

    const client = getMqttClient(mqttConfig)

    try {
      await publishCommand(client, vin, 'location/findMyCar/set', mode)

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

      return res.json({
        success: true,
        message: modeLabels[mode as keyof typeof modeLabels] || 'Find My Car command sent',
        commandId: commandLog?.id,
      })
    } catch (error) {
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
    return res.status(500).json({
      error: 'Failed to send Find My Car command',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Charge control
app.post('/api/vehicle/charge', async (req: Request, res: Response) => {
  try {
    const { vin, action, target } = req.body

    if (!vin || !action) {
      return res.status(400).json({
        error: 'Invalid request. Required: vin, action (start|stop|setTarget)',
      })
    }

    const validActions = ['start', 'stop', 'setTarget']
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error: `Invalid action. Must be one of: ${validActions.join(', ')}`,
      })
    }

    const supabase = createClient()

    // Log command to database
    const { data: commandLog, error: logError } = await supabase
      .from('vehicle_commands')
      .insert({
        vin,
        command_type: 'charge',
        command_payload: { action, target },
        status: 'pending',
      })
      .select()
      .single()

    if (logError) {
      console.error('[API] Error logging command:', logError)
    }

    const client = getMqttClient(mqttConfig)

    try {
      if (action === 'start') {
        await publishCommand(client, vin, 'drivetrain/charging/set', 'true')
      } else if (action === 'stop') {
        await publishCommand(client, vin, 'drivetrain/charging/set', 'false')
      } else if (action === 'setTarget' && target) {
        await publishCommand(client, vin, 'drivetrain/socTarget/set', target.toString())
      }

      if (commandLog) {
        await supabase
          .from('vehicle_commands')
          .update({ status: 'sent', completed_at: new Date().toISOString() })
          .eq('id', commandLog.id)
      }

      return res.json({
        success: true,
        message: `Charging ${action} command sent`,
        commandId: commandLog?.id,
      })
    } catch (error) {
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
    return res.status(500).json({
      error: 'Failed to send charge command',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`[Command API] Server running on port ${PORT}`)
  console.log(`[Command API] Health check: http://localhost:${PORT}/health`)
})

export default app
