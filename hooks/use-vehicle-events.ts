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

export function useVehicleEvents(limit: number = 100) {
  const [events, setEvents] = useState<VehicleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient()

    const fetchEvents = async () => {
      try {
        setLoading(true)
        const { data, error: fetchError } = await supabase
          .from("vehicle_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit)

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
            setEvents((current) => [payload.new as VehicleEvent, ...current].slice(0, limit))
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
  }, [limit])

  const refetch = async () => {
    const supabase = createBrowserClient()
    try {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from("vehicle_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit)

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
