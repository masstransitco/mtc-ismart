"use client"

import { Badge } from "@/components/ui/badge"
import { VehicleTripStats } from "@/hooks/use-trips"
import { VehicleStatus } from "@/hooks/use-vehicle"
import { useSpeedUnit } from "@/components/main-dashboard"
import {
  Clock,
  Car,
  ChevronDown,
  ChevronUp,
  Play,
  Loader2,
} from "lucide-react"
import { RouteIcon } from "@/components/icons/route"
import { CursorIcon } from "@/components/icons/cursor"
import { formatDistanceToNow, format } from "date-fns"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useTheme } from "next-themes"
import { TripMapModal } from "@/components/trip-map-modal"

interface TripVehicleCardProps {
  stats: VehicleTripStats
  vehicleInfo?: VehicleStatus
}

export function TripVehicleCard({ stats, vehicleInfo }: TripVehicleCardProps) {
  const { convertSpeed, getSpeedLabel, speedUnit } = useSpeedUnit()
  const [expanded, setExpanded] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null)
  const [mapModalOpen, setMapModalOpen] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const { theme, systemTheme } = useTheme()
  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  const handleShowMap = (tripId: number) => {
    setSelectedTripId(tripId)
    setMapModalOpen(true)
  }

  const handleProcessTrips = async () => {
    setIsProcessing(true)
    try {
      const response = await fetch(
        `/api/cron/process-trips?secret=${process.env.NEXT_PUBLIC_CRON_SECRET}&vin=${stats.vin}&legacy=true&hours=2`
      )
      const data = await response.json()

      if (data.success && data.results?.[0]?.trips_created > 0) {
        // Reload the page to show new trips
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to process trips:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  // Format duration (seconds to hours/minutes)
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  // Format distance (meters to km/mi)
  const formatDistance = (meters: number): string => {
    if (speedUnit === 'mph') {
      const miles = meters / 1609.344
      return `${miles.toFixed(1)} mi`
    }
    const km = meters / 1000
    return `${km.toFixed(1)} km`
  }

  // Get top 5 trips by chronological order (most recent first)
  const topTrips = [...stats.trips]
    .sort((a, b) => new Date(b.start_ts).getTime() - new Date(a.start_ts).getTime())
    .slice(0, 5)

  const maxDistance = Math.max(...topTrips.map(t => t.distance_fused_m), 1)
  const maxDuration = Math.max(...topTrips.map(t => t.duration_s), 1)

  // Format timestamp with relative time
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp)
    const exactTime = format(date, "MMM d, h:mm a")
    const relativeTime = formatDistanceToNow(date, { addSuffix: true })
    return `${exactTime} (${relativeTime.replace('about ', '')})`
  }

  // Vehicle display name
  const vehicleName = vehicleInfo?.vehicles?.label ||
                      vehicleInfo?.vehicles?.plate_number ||
                      stats.vin.slice(-8)

  return (
    <div className="relative overflow-hidden rounded-lg border border-border shadow-sm card-hover animate-fade-in" style={{
      background: isDark
        ? 'linear-gradient(to bottom right, hsl(222 47% 8% / 0.9), hsl(217 33% 15% / 0.4), hsl(217 33% 17% / 0.6))'
        : 'linear-gradient(to bottom right, hsl(210 20% 98% / 0.5), hsl(214 32% 96% / 0.6), hsl(220 13% 95% / 0.4))'
    }}>
      <div className="relative">
      <div className="flex flex-col space-y-1.5 p-6 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              {vehicleInfo?.vehicles?.plate_number && (
                <div className="inline-flex items-center justify-center px-3 py-1.5 bg-gradient-to-b from-white to-gray-50 border-2 border-slate-800 rounded-md shadow-sm">
                  <span className="text-base font-bold tracking-wider text-slate-900 font-mono">
                    {vehicleInfo.vehicles.plate_number}
                  </span>
                </div>
              )}
              {!vehicleInfo?.vehicles?.plate_number && (
                <div className="text-lg font-semibold">
                  {vehicleName}
                </div>
              )}
            </div>
            {vehicleInfo?.vehicles?.model && (
              <p className="text-sm text-muted-foreground">
                {vehicleInfo.vehicles.model}
                {vehicleInfo.vehicles.year && ` (${vehicleInfo.vehicles.year})`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="shrink-0 text-lg px-3 py-1 flex items-center gap-1.5">
              <span>{stats.tripCount}</span>
              <span className="text-xs font-normal">Trips</span>
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-primary/10"
              onClick={handleProcessTrips}
              disabled={isProcessing}
              title="Process new trips"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Play className="h-4 w-4 text-primary" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-6 pt-0 space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col items-center text-center p-2 rounded-lg bg-muted/50">
            <Clock className="h-4 w-4 text-blue-500 mb-1" />
            <div className="text-xs text-muted-foreground mb-0.5">Total Duration</div>
            <div className="text-lg font-semibold">{formatDuration(stats.totalDuration)}</div>
          </div>
          <div className="flex flex-col items-center text-center p-2 rounded-lg bg-muted/50">
            <RouteIcon className="h-4 w-4 text-green-500 mb-1" />
            <div className="text-xs text-muted-foreground mb-0.5">Total Dist</div>
            <div className="text-lg font-semibold">{formatDistance(stats.totalDistance)}</div>
          </div>
        </div>

        {/* Combined Distance & Duration Visualization */}
        {topTrips.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Recent Trips</h4>
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-green-500 to-green-600"></div>
                  <span className="text-muted-foreground">Distance</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-gradient-to-r from-blue-500 to-blue-600"></div>
                  <span className="text-muted-foreground">Duration</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {topTrips.map((trip, index) => (
                <div key={trip.trip_id} className="space-y-1.5">
                  {/* Timestamp with Map Button */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium text-foreground">
                      {formatTimestamp(trip.start_ts)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => handleShowMap(trip.trip_id)}
                    >
                      <CursorIcon className="h-3.5 w-3.5 text-muted-foreground hover:text-blue-500" />
                    </Button>
                  </div>

                  {/* Distance Bar */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <RouteIcon className="h-3 w-3 text-green-500" />
                      <span className="font-medium">
                        {formatDistance(trip.distance_fused_m)}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full transition-all"
                        style={{ width: `${(trip.distance_fused_m / maxDistance) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Duration Bar */}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Clock className="h-3 w-3 text-blue-500" />
                      <span className="font-medium">
                        {formatDuration(trip.duration_s)}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all"
                        style={{ width: `${(trip.duration_s / maxDuration) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Averages */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="text-center p-2 rounded-lg border border-border/50">
            <div className="text-xs text-muted-foreground mb-1">Avg Distance</div>
            <div className="text-base font-semibold">{formatDistance(stats.avgDistance)}</div>
          </div>
          <div className="text-center p-2 rounded-lg border border-border/50">
            <div className="text-xs text-muted-foreground mb-1">Avg Duration</div>
            <div className="text-base font-semibold">{formatDuration(stats.avgDuration)}</div>
          </div>
        </div>

        {/* Expandable Trip List */}
        {stats.trips.length > 0 && (
          <>
            <Separator />
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Hide All Trips
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Show All Trips ({stats.trips.length})
                </>
              )}
            </Button>

            {expanded && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {[...stats.trips]
                  .sort((a, b) => new Date(b.start_ts).getTime() - new Date(a.start_ts).getTime())
                  .map((trip) => (
                  <div
                    key={trip.trip_id}
                    className="p-3 rounded-lg border border-border/50 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground">{formatTimestamp(trip.start_ts)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => handleShowMap(trip.trip_id)}
                        >
                          <CursorIcon className="h-3 w-3 text-muted-foreground hover:text-blue-500" />
                        </Button>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {formatDistance(trip.distance_fused_m)}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground space-y-0.5">
                      <div>Duration: {formatDuration(trip.duration_s)}</div>
                      {trip.avg_speed_kph != null && (
                        <div>
                          Avg Speed: {convertSpeed(trip.avg_speed_kph)?.toFixed(0) || '0'} {getSpeedLabel()}
                        </div>
                      )}
                      {trip.energy_used_kwh !== null && (
                        <div>Energy: {trip.energy_used_kwh.toFixed(2)} kWh</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      </div>

      {/* Trip Map Modal */}
      {selectedTripId && (
        <TripMapModal
          tripId={selectedTripId}
          open={mapModalOpen}
          onOpenChange={setMapModalOpen}
        />
      )}
    </div>
  )
}
