import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution time

/**
 * Process trips incrementally using the v1.1 jitter-aware algorithm
 * This endpoint is designed to be called by Vercel Cron
 *
 * Uses checkpoint-based incremental processing to only process new telemetry data
 * since the last successful run, avoiding expensive full 24-hour scans.
 *
 * Query params:
 * - vin: specific VIN to process (default: all)
 * - secret: authentication token (required)
 * - legacy: set to "true" to use old hours-based lookback (default: false)
 * - hours: number of hours to look back (only used with legacy=true, default: 24)
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
    const specificVin = request.nextUrl.searchParams.get('vin');
    const useLegacyMode = request.nextUrl.searchParams.get('legacy') === 'true';
    const hoursBack = parseInt(request.nextUrl.searchParams.get('hours') || '24');

    const supabase = createClient();

    // Get list of VINs to process
    let vins: string[];
    if (specificVin) {
      vins = [specificVin];
    } else {
      // Get all VINs with recent telemetry (last 6 hours to catch active vehicles)
      const recentCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicle_telemetry')
        .select('vin')
        .gte('ts', recentCutoff.toISOString())
        .limit(1000);

      if (vehicleError) {
        throw new Error(`Failed to fetch vehicles: ${vehicleError.message}`);
      }

      vins = [...new Set(vehicleData?.map(v => v.vin) || [])];
    }

    console.log(`[CRON] Processing ${vins.length} vehicles (mode: ${useLegacyMode ? 'legacy' : 'incremental'})`);
    if (useLegacyMode) {
      const sinceTimestamp = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
      console.log(`[CRON] Legacy mode: looking back ${hoursBack} hours to ${sinceTimestamp.toISOString()}`);
    }

    if (vins.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No vehicles to process',
        processedAt: new Date().toISOString(),
      });
    }

    // Process each VIN using the database function
    const results = [];
    for (const vin of vins) {
      try {
        const startTime = Date.now();

        let data, error;

        if (useLegacyMode) {
          // Legacy mode: use hours-based lookback
          const sinceTimestamp = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
          const response = await supabase.rpc('derive_trips', {
            vin_in: vin,
            since_ts: sinceTimestamp.toISOString(),
          });
          data = response.data;
          error = response.error;
        } else {
          // Incremental mode: use checkpoint-based processing
          const response = await supabase.rpc('derive_trips_incremental', {
            vin_in: vin,
          });
          data = response.data;
          error = response.error;
        }

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
          let tripsCreated: number;
          let timeRange: { start?: string; end?: string } = {};

          if (useLegacyMode) {
            tripsCreated = data || 0;
          } else {
            // Incremental mode returns array with single row: [trips_created, time_range_start, time_range_end]
            const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
            tripsCreated = result?.trips_created || 0;
            if (result?.time_range_start) timeRange.start = result.time_range_start;
            if (result?.time_range_end) timeRange.end = result.time_range_end;
          }

          console.log(`[CRON] ✓ Processed ${vin}: ${tripsCreated} trips created in ${duration}ms${timeRange.start ? ` (${timeRange.start} to ${timeRange.end})` : ''}`);
          results.push({
            vin,
            success: true,
            trips_created: tripsCreated,
            duration_ms: duration,
            ...(timeRange.start && { time_range: timeRange }),
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
      mode: useLegacyMode ? 'legacy' : 'incremental',
      summary,
      results,
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
