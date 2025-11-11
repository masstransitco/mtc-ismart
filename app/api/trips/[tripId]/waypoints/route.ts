import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Waypoint {
  lat: number;
  lon: number;
  ts: string;
  speed: number | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;

    if (!tripId) {
      return NextResponse.json(
        { success: false, error: 'Trip ID is required' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // First, get the trip details
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('vin, start_ts, end_ts, start_lat, start_lon, end_lat, end_lon')
      .eq('trip_id', tripId)
      .single();

    if (tripError || !trip) {
      console.error('Error fetching trip:', tripError);
      return NextResponse.json(
        { success: false, error: 'Trip not found' },
        { status: 404 }
      );
    }

    // Fetch GPS waypoints from vehicle_telemetry
    const { data: telemetry, error: telemetryError } = await supabase
      .from('vehicle_telemetry')
      .select('ts, lat, lon, speed')
      .eq('vin', trip.vin)
      .gte('ts', trip.start_ts)
      .lte('ts', trip.end_ts)
      .not('lat', 'is', null)
      .not('lon', 'is', null)
      .neq('lat', 0)
      .neq('lon', 0)
      .order('ts', { ascending: true });

    if (telemetryError) {
      console.error('Error fetching telemetry:', telemetryError);
      return NextResponse.json(
        { success: false, error: telemetryError.message },
        { status: 500 }
      );
    }

    // Get unique waypoints (deduplicate identical coordinates)
    const uniqueWaypoints: Waypoint[] = [];
    const seenCoords = new Set<string>();

    telemetry?.forEach((point) => {
      const coordKey = `${point.lat},${point.lon}`;
      if (!seenCoords.has(coordKey)) {
        seenCoords.add(coordKey);
        uniqueWaypoints.push({
          lat: parseFloat(point.lat),
          lon: parseFloat(point.lon),
          ts: point.ts,
          speed: point.speed,
        });
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        tripId: parseInt(tripId),
        vin: trip.vin,
        startTs: trip.start_ts,
        endTs: trip.end_ts,
        waypoints: uniqueWaypoints,
        totalPoints: telemetry?.length || 0,
        uniquePoints: uniqueWaypoints.length,
      },
    });
  } catch (error) {
    console.error('Unexpected error in trip waypoints API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
