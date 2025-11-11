import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time

/**
 * Process trips incrementally using the v1.1 jitter-aware algorithm
 * This endpoint is designed to be called by Vercel Cron
 *
 * Query params:
 * - hours: number of hours to look back (default: 24)
 * - vin: specific VIN to process (default: all)
 * - secret: authentication token (required)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || process.env.NEXT_PUBLIC_CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Check authorization
    const providedSecret = authHeader?.replace('Bearer ', '') || request.nextUrl.searchParams.get('secret');
    if (providedSecret !== cronSecret) {
      console.error('Unauthorized cron request');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse query parameters
    const hoursBack = parseInt(request.nextUrl.searchParams.get('hours') || '24');
    const specificVin = request.nextUrl.searchParams.get('vin');

    // Calculate since timestamp
    const sinceTimestamp = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    console.log(`[CRON] Processing trips since ${sinceTimestamp.toISOString()}`);

    const supabase = createClient();

    // Get list of VINs to process
    let vins: string[];
    if (specificVin) {
      vins = [specificVin];
    } else {
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicle_telemetry')
        .select('vin')
        .gte('ts', sinceTimestamp.toISOString())
        .limit(1000);

      if (vehicleError) {
        throw new Error(`Failed to fetch vehicles: ${vehicleError.message}`);
      }

      vins = [...new Set(vehicleData?.map(v => v.vin) || [])];
    }

    if (vins.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No vehicles to process',
        processedAt: new Date().toISOString(),
      });
    }

    console.log(`[CRON] Processing ${vins.length} vehicles: ${vins.join(', ')}`);

    // Process each VIN using the database function
    const results = [];
    for (const vin of vins) {
      try {
        const startTime = Date.now();

        // Call the derive_trips function for this VIN
        const { data, error } = await supabase.rpc('derive_trips', {
          vin_in: vin,
          since_ts: sinceTimestamp.toISOString(),
        });

        const duration = Date.now() - startTime;

        if (error) {
          console.error(`[CRON] Error processing ${vin}:`, error);
          results.push({
            vin,
            success: false,
            error: error.message,
            duration_ms: duration,
          });
        } else {
          const tripsCreated = data || 0;
          console.log(`[CRON] ✓ Processed ${vin}: ${tripsCreated} trips created in ${duration}ms`);
          results.push({
            vin,
            success: true,
            trips_created: tripsCreated,
            duration_ms: duration,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[CRON] Exception processing ${vin}:`, err);
        results.push({
          vin,
          success: false,
          error: message,
        });
      }
    }

    // Calculate summary
    const summary = {
      total_vehicles: vins.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      total_trips_created: results.reduce((sum, r) => sum + (r.trips_created || 0), 0),
      avg_duration_ms: results.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / results.length,
    };

    console.log('[CRON] Summary:', summary);

    return NextResponse.json({
      success: true,
      summary,
      results,
      since: sinceTimestamp.toISOString(),
      processedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('[CRON] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
