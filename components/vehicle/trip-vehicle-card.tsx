"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { VehicleTripStats } from "@/hooks/use-trips"
import { VehicleStatus } from "@/hooks/use-vehicle"
import { useSpeedUnit } from "@/components/main-dashboard"
import {
  TrendingUp,
  Clock,
  Navigation,
  Car,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface TripVehicleCardProps {
  stats: VehicleTripStats
  vehicleInfo?: VehicleStatus
}

export function TripVehicleCard({ stats, vehicleInfo }: TripVehicleCardProps) {
  const { convertSpeed, getSpeedLabel, speedUnit } = useSpeedUnit()
  const [expanded, setExpanded] = useState(false)

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

  // Get top 5 trips by distance for visualization
  const topTrips = [...stats.trips]
    .sort((a, b) => b.distance_fused_m - a.distance_fused_m)
    .slice(0, 5)

  const maxDistance = topTrips[0]?.distance_fused_m || 1
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
    <Card className="overflow-hidden card-hover animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold flex items-center gap-2 mb-1">
              <Car className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">{vehicleName}</span>
            </CardTitle>
            {vehicleInfo?.vehicles?.model && (
              <p className="text-sm text-muted-foreground">
                {vehicleInfo.vehicles.model}
                {vehicleInfo.vehicles.year && ` (${vehicleInfo.vehicles.year})`}
              </p>
            )}
          </div>
          <Badge variant="secondary" className="shrink-0 text-lg px-3 py-1">
            {stats.tripCount}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center text-center p-2 rounded-lg bg-muted/50">
            <TrendingUp className="h-4 w-4 text-primary mb-1" />
            <div className="text-xs text-muted-foreground mb-0.5">Trips</div>
            <div className="text-lg font-semibold">{stats.tripCount}</div>
          </div>
          <div className="flex flex-col items-center text-center p-2 rounded-lg bg-muted/50">
            <Clock className="h-4 w-4 text-blue-500 mb-1" />
            <div className="text-xs text-muted-foreground mb-0.5">Total Time</div>
            <div className="text-lg font-semibold">{formatDuration(stats.totalDuration)}</div>
          </div>
          <div className="flex flex-col items-center text-center p-2 rounded-lg bg-muted/50">
            <Navigation className="h-4 w-4 text-green-500 mb-1" />
            <div className="text-xs text-muted-foreground mb-0.5">Total Dist</div>
            <div className="text-lg font-semibold">{formatDistance(stats.totalDistance)}</div>
          </div>
        </div>

        {/* Combined Distance & Duration Visualization */}
        {topTrips.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Top Trips by Distance</h4>
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
                  {/* Timestamp */}
                  <div className="text-xs font-medium text-foreground">
                    {formatTimestamp(trip.start_ts)}
                  </div>

                  {/* Distance Bar */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <Navigation className="h-3 w-3 text-green-500" />
                        <span className="text-muted-foreground">Distance</span>
                      </div>
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
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-blue-500" />
                        <span className="text-muted-foreground">Duration</span>
                      </div>
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
                {stats.trips.map((trip) => (
                  <div
                    key={trip.trip_id}
                    className="p-3 rounded-lg border border-border/50 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-foreground">{formatTimestamp(trip.start_ts)}</span>
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
      </CardContent>
    </Card>
  )
}
