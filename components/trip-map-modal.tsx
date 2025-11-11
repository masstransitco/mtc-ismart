"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps"
import { useTheme } from "next-themes"

interface Waypoint {
  lat: number
  lon: number
  ts: string
  speed: number | null
}

interface TripWaypointsData {
  tripId: number
  vin: string
  startTs: string
  endTs: string
  waypoints: Waypoint[]
  totalPoints: number
  uniquePoints: number
}

interface TripMapModalProps {
  tripId: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

function TripPolyline({ waypoints }: { waypoints: Waypoint[] }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !waypoints.length || typeof google === 'undefined') return

    // Create polyline
    const polyline = new google.maps.Polyline({
      path: waypoints.map(w => ({ lat: w.lat, lng: w.lon })),
      geodesic: true,
      strokeColor: "#3b82f6",
      strokeOpacity: 0.8,
      strokeWeight: 4,
    })

    polyline.setMap(map)

    // Fit bounds to show entire route
    const bounds = new google.maps.LatLngBounds()
    waypoints.forEach(w => bounds.extend({ lat: w.lat, lng: w.lon }))
    map.fitBounds(bounds)

    return () => {
      polyline.setMap(null)
    }
  }, [map, waypoints])

  return null
}

function TripMarkers({ waypoints }: { waypoints: Waypoint[] }) {
  const map = useMap()
  const [markers, setMarkers] = useState<google.maps.Marker[]>([])

  useEffect(() => {
    if (!map || !waypoints.length || typeof google === 'undefined') return

    // Create start marker
    const startMarker = new google.maps.Marker({
      position: { lat: waypoints[0].lat, lng: waypoints[0].lon },
      map,
      title: "Start",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#22c55e",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2,
      },
    })

    // Create end marker
    const endMarker = new google.maps.Marker({
      position: {
        lat: waypoints[waypoints.length - 1].lat,
        lng: waypoints[waypoints.length - 1].lon
      },
      map,
      title: "End",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#ef4444",
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2,
      },
    })

    setMarkers([startMarker, endMarker])

    return () => {
      startMarker.setMap(null)
      endMarker.setMap(null)
    }
  }, [map, waypoints])

  return null
}

export function TripMapModal({ tripId, open, onOpenChange }: TripMapModalProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TripWaypointsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { theme, systemTheme } = useTheme()
  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  useEffect(() => {
    if (!open || !tripId) {
      setData(null)
      setError(null)
      return
    }

    const fetchWaypoints = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/trips/${tripId}/waypoints`)
        const result = await response.json()

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch waypoints')
        }

        setData(result.data)
      } catch (err) {
        console.error('Error fetching trip waypoints:', err)
        setError(err instanceof Error ? err.message : 'Failed to load trip data')
      } finally {
        setLoading(false)
      }
    }

    fetchWaypoints()
  }, [tripId, open])

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl h-[80vh] p-0 overflow-hidden"
        style={{
          background: isDark
            ? 'linear-gradient(to bottom right, hsl(222 47% 8% / 0.95), hsl(217 33% 15% / 0.9), hsl(217 33% 17% / 0.95))'
            : 'linear-gradient(to bottom right, hsl(210 20% 98% / 0.95), hsl(214 32% 96% / 0.95), hsl(220 13% 95% / 0.95))'
        }}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Trip Route Map</DialogTitle>
        </DialogHeader>

        <div className="flex-1 relative rounded-lg overflow-hidden border border-border mx-6 mb-6" style={{ height: 'calc(80vh - 120px)' }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="text-center text-muted-foreground">
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {data && data.waypoints.length > 0 && (
            <div className="w-full h-full">
              <APIProvider apiKey={apiKey}>
                <Map
                  mapId={mapId}
                  defaultCenter={{ lat: data.waypoints[0].lat, lng: data.waypoints[0].lon }}
                  defaultZoom={13}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  className="w-full h-full"
                >
                  <TripPolyline waypoints={data.waypoints} />
                  <TripMarkers waypoints={data.waypoints} />
                </Map>
              </APIProvider>

              <div className="absolute bottom-4 left-4 bg-background/90 backdrop-blur-sm rounded-lg px-3 py-2 text-xs text-muted-foreground border border-border">
                <div>{data.uniquePoints} waypoints</div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    <span>Start</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    <span>End</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {data && data.waypoints.length === 0 && !loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="text-center text-muted-foreground">
                <p className="text-sm">No GPS data available for this trip</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
