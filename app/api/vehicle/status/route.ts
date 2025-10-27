import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const vin = searchParams.get('vin')

    const supabase = createClient()

    if (vin) {
      // Get status for specific vehicle
      const { data, error } = await supabase
        .from('vehicle_status')
        .select('*, vehicles(*)')
        .eq('vin', vin)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return NextResponse.json(
            { error: 'Vehicle not found' },
            { status: 404 }
          )
        }
        throw error
      }

      return NextResponse.json({ success: true, data })
    } else {
      // Get status for all vehicles
      const { data, error } = await supabase
        .from('vehicle_status')
        .select('*, vehicles(*)')
        .order('updated_at', { ascending: false })

      if (error) throw error

      return NextResponse.json({ success: true, data })
    }
  } catch (error) {
    console.error('[API] Status query error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vehicle status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
