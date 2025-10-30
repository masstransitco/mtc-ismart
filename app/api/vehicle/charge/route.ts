import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { vin, action, targetSoc, currentLimit } = await req.json()

    if (!vin || !action) {
      return NextResponse.json(
        { error: 'Invalid request. Required: vin, action (start|stop|setTarget|setLimit)' },
        { status: 400 }
      )
    }

    // Forward to Cloud Run backend command API
    const backendUrl = process.env.BACKEND_API_URL || 'https://mqtt.air.zone'
    const response = await fetch(`${backendUrl}/api/vehicle/charge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vin, action, target: targetSoc, currentLimit }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[API] Charge command error:', error)
    return NextResponse.json(
      { error: 'Failed to send charge command', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
