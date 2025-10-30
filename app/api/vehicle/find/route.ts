import { NextRequest, NextResponse } from 'next/server'

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

    // Forward to Cloud Run backend command API
    const backendUrl = process.env.BACKEND_API_URL || 'https://mqtt.air.zone'
    const response = await fetch(`${backendUrl}/api/vehicle/find`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vin, mode }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[API] Find My Car command error:', error)
    return NextResponse.json(
      { error: 'Failed to send Find My Car command', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
