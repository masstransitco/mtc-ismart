import { NextRequest, NextResponse } from 'next/server'

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

    // Forward to Cloud Run backend command API
    const backendUrl = process.env.BACKEND_API_URL || 'https://mqtt.air.zone'
    const response = await fetch(`${backendUrl}/api/vehicle/climate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vin, action, temperature }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[API] Climate command error:', error)
    return NextResponse.json(
      { error: 'Failed to send climate command', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
