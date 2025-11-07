import { useState, useEffect, useCallback } from 'react';

export interface TripData {
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

export interface VehicleTripStats {
  vin: string;
  tripCount: number;
  totalDuration: number;
  totalDistance: number;
  avgDuration: number;
  avgDistance: number;
  trips: TripData[];
}

interface TripsResponse {
  success: boolean;
  data?: VehicleTripStats[];
  timeRange?: string;
  fetchedAt?: string;
  error?: string;
}

export function useTrips(vin: string = 'all', timeRange: string = '24h') {
  const [vehicleStats, setVehicleStats] = useState<VehicleTripStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchTrips = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        timeRange,
      });

      if (vin !== 'all') {
        params.append('vin', vin);
      }

      const response = await fetch(`/api/trips?${params.toString()}`);
      const result: TripsResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch trips');
      }

      setVehicleStats(result.data || []);
      setLastFetched(result.fetchedAt ? new Date(result.fetchedAt) : new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
      console.error('Error fetching trips:', err);
    } finally {
      setLoading(false);
    }
  }, [vin, timeRange]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  const refetch = useCallback(() => {
    return fetchTrips();
  }, [fetchTrips]);

  return {
    vehicleStats,
    loading,
    error,
    lastFetched,
    refetch,
  };
}
