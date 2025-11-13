"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@/lib/supabase"

export interface VehicleEvent {
  id: number
  vin: string
  event_type: string
  event_category: string | null
  event_title: string
  event_description: string | null
  metadata: Record<string, any> | null
  severity: string
  created_at: string
  created_by: string | null
}

// Helper function to calculate timestamp based on time range
function getTimestampForRange(timeRange: string): string {
  const now = new Date()
  let minutesBack = 60 // default to 1 hour

  switch(timeRange) {
    case '30m':
      minutesBack = 30
      break
    case '1h':
      minutesBack = 60
      break
    case '12h':
      minutesBack = 12 * 60
      break
    case '24h':
      minutesBack = 24 * 60
      break
    default:
      minutesBack = 60
  }

  const sinceTimestamp = new Date(now.getTime() - minutesBack * 60 * 1000)
  return sinceTimestamp.toISOString()
}

export function useVehicleEvents(timeRange: string = '1h') {
  const [events, setEvents] = useState<VehicleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient()

    const fetchEvents = async () => {
      try {
        setLoading(true)
        const sinceTimestamp = getTimestampForRange(timeRange)
        const { data, error: fetchError } = await supabase
          .from("vehicle_events")
          .select("*")
          .gte("created_at", sinceTimestamp)
          .order("created_at", { ascending: false })

        if (fetchError) throw fetchError

        setEvents(data || [])
        setError(null)
      } catch (err) {
        console.error("Error fetching vehicle events:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch events")
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()

    // Subscribe to real-time updates
    const channel = supabase
      .channel("vehicle_events_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vehicle_events",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newEvent = payload.new as VehicleEvent
            const sinceTimestamp = getTimestampForRange(timeRange)
            // Only add event if it's within the selected time range
            if (new Date(newEvent.created_at) >= new Date(sinceTimestamp)) {
              setEvents((current) => [newEvent, ...current])
            }
          } else if (payload.eventType === "UPDATE") {
            setEvents((current) =>
              current.map((event) =>
                event.id === (payload.new as VehicleEvent).id
                  ? (payload.new as VehicleEvent)
                  : event
              )
            )
          } else if (payload.eventType === "DELETE") {
            setEvents((current) =>
              current.filter((event) => event.id !== (payload.old as VehicleEvent).id)
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [timeRange])

  const refetch = async () => {
    const supabase = createBrowserClient()
    try {
      setLoading(true)
      const sinceTimestamp = getTimestampForRange(timeRange)
      const { data, error: fetchError } = await supabase
        .from("vehicle_events")
        .select("*")
        .gte("created_at", sinceTimestamp)
        .order("created_at", { ascending: false })

      if (fetchError) throw fetchError

      setEvents(data || [])
      setError(null)
    } catch (err) {
      console.error("Error fetching vehicle events:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch events")
    } finally {
      setLoading(false)
    }
  }

  return { events, loading, error, refetch }
}
