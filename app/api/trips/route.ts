import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface TripData {
  trip_id: number;
  vin: string;
  start_ts: string;
  end_ts: string;
  duration_s: number;
  distance_gps_m: number;
  distance_speed_m: number;
  distance_fused_m: number;
  avg_speed_kph: number;
  max_speed_kph: number;
  start_soc: number | null;
  end_soc: number | null;
  energy_used_kwh: number | null;
  sample_count: number;
}

interface VehicleTripStats {
  vin: string;
  tripCount: number;
  totalDuration: number;
  totalDistance: number;
  avgDuration: number;
  avgDistance: number;
  trips: TripData[];
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const vin = searchParams.get('vin');
    const timeRange = searchParams.get('timeRange') || '24h';

    // Calculate time threshold
    const now = new Date();
    const hoursBack = timeRange === '7d' ? 24 * 7 : 24;
    const sinceTimestamp = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    const supabase = createClient();

    // Build query
    let query = supabase
      .from('trips')
      .select('*')
      .gte('start_ts', sinceTimestamp.toISOString())
      .order('start_ts', { ascending: false });

    // Filter by VIN if specified
    if (vin && vin !== 'all') {
      query = query.eq('vin', vin);
    }

    const { data: trips, error } = await query;

    if (error) {
      console.error('Error fetching trips:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Group trips by VIN and calculate stats
    const vehicleStatsMap = new Map<string, VehicleTripStats>();

    trips?.forEach((trip: TripData) => {
      if (!vehicleStatsMap.has(trip.vin)) {
        vehicleStatsMap.set(trip.vin, {
          vin: trip.vin,
          tripCount: 0,
          totalDuration: 0,
          totalDistance: 0,
          avgDuration: 0,
          avgDistance: 0,
          trips: [],
        });
      }

      const stats = vehicleStatsMap.get(trip.vin)!;
      stats.tripCount++;
      stats.totalDuration += trip.duration_s;
      stats.totalDistance += trip.distance_fused_m;
      stats.trips.push(trip);
    });

    // Calculate averages
    vehicleStatsMap.forEach((stats) => {
      stats.avgDuration = stats.tripCount > 0 ? stats.totalDuration / stats.tripCount : 0;
      stats.avgDistance = stats.tripCount > 0 ? stats.totalDistance / stats.tripCount : 0;
    });

    const vehicleStats = Array.from(vehicleStatsMap.values());

    return NextResponse.json({
      success: true,
      data: vehicleStats,
      timeRange,
      fetchedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('Unexpected error in trips API:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
