"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps"

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
    if (!map || !waypoints.length) return

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

export function TripMapModal({ tripId, open, onOpenChange }: TripMapModalProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<TripWaypointsData | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      <DialogContent className="max-w-4xl h-[80vh]">
        <DialogHeader>
          <DialogTitle>Trip Route Map</DialogTitle>
        </DialogHeader>

        <div className="flex-1 relative rounded-lg overflow-hidden border border-border">
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

                  {/* Start marker */}
                  <Marker
                    position={{
                      lat: data.waypoints[0].lat,
                      lng: data.waypoints[0].lon
                    }}
                    title="Start"
                    icon={{
                      path: google.maps.SymbolPath.CIRCLE,
                      scale: 8,
                      fillColor: "#22c55e",
                      fillOpacity: 1,
                      strokeColor: "#fff",
                      strokeWeight: 2,
                    }}
                  />

                  {/* End marker */}
                  <Marker
                    position={{
                      lat: data.waypoints[data.waypoints.length - 1].lat,
                      lng: data.waypoints[data.waypoints.length - 1].lon
                    }}
                    title="End"
                    icon={{
                      path: google.maps.SymbolPath.CIRCLE,
                      scale: 8,
                      fillColor: "#ef4444",
                      fillOpacity: 1,
                      strokeColor: "#fff",
                      strokeWeight: 2,
                    }}
                  />
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
