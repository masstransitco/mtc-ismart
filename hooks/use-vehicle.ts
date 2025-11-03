"use client"

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface VehicleStatus {
  vin: string
  soc: number | null
  soc_precise: number | null
  range_km: number | null
  charging_state: string | null
  charge_current_a: number | null
  charge_voltage_v: number | null
  charge_power_kw: number | null
  charging_plug_connected: boolean | null
  hv_battery_active: boolean | null
  battery_heating: boolean | null
  charge_current_limit: string | null
  charge_status_detailed: string | null
  battery_temp_c: number | null
  target_soc: number | null
  lat: number | null
  lon: number | null
  altitude: number | null
  bearing: number | null
  speed: number | null
  gps_accuracy: number | null
  location_updated_at: string | null
  doors_locked: boolean | null
  door_driver_open: boolean | null
  door_passenger_open: boolean | null
  door_rear_left_open: boolean | null
  door_rear_right_open: boolean | null
  windows_state: any
  boot_locked: boolean | null
  bonnet_closed: boolean | null
  interior_temp_c: number | null
  exterior_temp_c: number | null
  hvac_state: string | null
  remote_climate_active: boolean | null
  ignition: boolean | null
  engine_running: boolean | null
  odometer_km: number | null
  lights_main_beam: boolean | null
  lights_dipped_beam: boolean | null
  lights_side: boolean | null
  remote_temperature: number | null
  heated_seat_front_left_level: number | null
  heated_seat_front_right_level: number | null
  rear_window_defrost: boolean | null
  last_message_ts: string | null
  last_api_call_ts: string | null
  gateway_status: string | null
  updated_at: string | null
  vehicles?: {
    vin: string
    label: string | null
    model: string | null
    year: number | null
    plate_number: string | null
  }
}

export function useVehicle(vin: string) {
  const [status, setStatus] = useState<VehicleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!vin) return

    const supabase = createBrowserClient()
    let channel: RealtimeChannel

    async function fetchStatus() {
      try {
        const { data, error: fetchError } = await supabase
          .from('vehicle_status')
          .select('*, vehicles(*)')
          .eq('vin', vin)
          .single()

        if (fetchError) throw fetchError

        setStatus(data)
        setError(null)
      } catch (err) {
        console.error('[useVehicle] Error fetching status:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()

    // Subscribe to realtime updates
    channel = supabase
      .channel(`vehicle-${vin}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'vehicle_status',
          filter: `vin=eq.${vin}`,
        },
        (payload) => {
          console.log('[useVehicle] Realtime update:', payload)
          setStatus((prev) => ({ ...prev, ...payload.new } as VehicleStatus))
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[useVehicle] ✓ Realtime subscribed for vehicle ${vin}`)
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`[useVehicle] ❌ Realtime error for vehicle ${vin}:`, err)
          setError(`Realtime connection failed: ${err?.message || 'Unknown error'}`)
        } else if (status === 'TIMED_OUT') {
          console.error(`[useVehicle] ⏱️  Realtime timeout for vehicle ${vin}`)
          setError('Realtime connection timed out')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [vin])

  return { status, loading, error }
}

export function useVehicles() {
  const [vehicles, setVehicles] = useState<VehicleStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient()
    let channel: RealtimeChannel

    async function fetchVehicles() {
      try {
        const { data, error: fetchError } = await supabase
          .from('vehicle_status')
          .select('*, vehicles(*)')
          .order('updated_at', { ascending: false })

        if (fetchError) throw fetchError

        setVehicles(data || [])
        setError(null)
      } catch (err) {
        console.error('[useVehicles] Error fetching vehicles:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchVehicles()

    // Subscribe to realtime updates
    channel = supabase
      .channel('vehicles-all')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vehicle_status',
        },
        (payload) => {
          console.log('[useVehicles] Realtime update:', payload)

          if (payload.eventType === 'INSERT') {
            setVehicles((prev) => [payload.new as VehicleStatus, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setVehicles((prev) =>
              prev.map((v) =>
                v.vin === (payload.new as VehicleStatus).vin
                  ? ({ ...v, ...payload.new } as VehicleStatus)
                  : v
              )
            )
          } else if (payload.eventType === 'DELETE') {
            setVehicles((prev) =>
              prev.filter((v) => v.vin !== (payload.old as VehicleStatus).vin)
            )
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log('[useVehicles] ✓ Realtime subscribed for all vehicles')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[useVehicles] ❌ Realtime error:', err)
          setError(`Realtime connection failed: ${err?.message || 'Unknown error'}`)
        } else if (status === 'TIMED_OUT') {
          console.error('[useVehicles] ⏱️  Realtime timeout')
          setError('Realtime connection timed out')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const refetch = async () => {
    setLoading(true)
    const supabase = createBrowserClient()
    const { data, error: fetchError } = await supabase
      .from('vehicle_status')
      .select('*, vehicles(*)')
      .order('updated_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setVehicles(data || [])
      setError(null)
    }
    setLoading(false)
  }

  return { vehicles, loading, error, refetch }
}
