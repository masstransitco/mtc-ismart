"use client"

import { useMemo } from "react"
import { VehicleTripStats } from "@/hooks/use-trips"
import { VehicleStatus } from "@/hooks/use-vehicle"
import { useSpeedUnit } from "@/contexts/speed-unit-context"

interface TripsTimelineChartProps {
  vehicleStats: VehicleTripStats[]
  timeRange: string
  vehicles: VehicleStatus[]
}

export default function TripsTimelineChart({ vehicleStats, timeRange, vehicles }: TripsTimelineChartProps) {
  const { speedUnit } = useSpeedUnit()

  // Calculate time range boundaries
  const { startTime, endTime, totalDurationMs } = useMemo(() => {
    const now = new Date()
    let start: Date

    switch(timeRange) {
      case '1h':
        start = new Date(now.getTime() - 60 * 60 * 1000)
        break
      case '6h':
        start = new Date(now.getTime() - 6 * 60 * 60 * 1000)
        break
      case '12h':
        start = new Date(now.getTime() - 12 * 60 * 60 * 1000)
        break
      case '24h':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      default:
        start = new Date(now.getTime() - 6 * 60 * 60 * 1000)
    }

    return {
      startTime: start,
      endTime: now,
      totalDurationMs: now.getTime() - start.getTime()
    }
  }, [timeRange])

  // Get all trips with vehicle info, filtering out vehicles with no trips in the time range
  const tripsWithVehicles = useMemo(() => {
    const trips: Array<{
      vin: string
      vehicleLabel: string
      trips: Array<{
        trip_id: number
        start_ts: string
        end_ts: string
        distance_fused_m: number
        duration_s: number
      }>
    }> = []

    vehicleStats.forEach(stats => {
      const vehicle = vehicles.find(v => v.vin === stats.vin)
      const vehicleLabel = vehicle?.vehicles?.plate_number || vehicle?.vehicles?.label || stats.vin.slice(-6)

      // Filter trips that fall within the time range
      const tripsInRange = stats.trips
        .map(t => ({
          trip_id: t.trip_id,
          start_ts: t.start_ts,
          end_ts: t.end_ts,
          distance_fused_m: t.distance_fused_m,
          duration_s: t.duration_s
        }))
        .filter(t => {
          const tripStart = new Date(t.start_ts).getTime()
          const tripEnd = new Date(t.end_ts).getTime()
          // Include trip if it overlaps with the time range
          return tripEnd >= startTime.getTime() && tripStart <= endTime.getTime()
        })

      // Only add vehicle if it has trips in the time range
      if (tripsInRange.length > 0) {
        trips.push({
          vin: stats.vin,
          vehicleLabel,
          trips: tripsInRange
        })
      }
    })

    // Sort by vehicle label for consistent ordering
    return trips.sort((a, b) => a.vehicleLabel.localeCompare(b.vehicleLabel))
  }, [vehicleStats, vehicles, startTime, endTime])

  // Find max speed (distance/time) for color scaling
  const maxSpeed = useMemo(() => {
    let max = 0
    tripsWithVehicles.forEach(v => {
      v.trips.forEach(t => {
        // Calculate speed as meters per second, convert to km/h
        const speedKph = (t.distance_fused_m / t.duration_s) * 3.6
        if (speedKph > max) max = speedKph
      })
    })
    return max || 1
  }, [tripsWithVehicles])

  // Get color based on speed (distance over time)
  const getSpeedColor = (distance: number, duration: number): string => {
    // Calculate speed in km/h
    const speedKph = (distance / duration) * 3.6
    const intensity = Math.min(speedKph / maxSpeed, 1)

    // Slow to Fast: Light green -> Dark green spectrum
    if (intensity <= 0.2) return 'bg-green-300 dark:bg-green-900'
    if (intensity <= 0.4) return 'bg-green-400 dark:bg-green-800'
    if (intensity <= 0.6) return 'bg-green-500 dark:bg-green-700'
    if (intensity <= 0.8) return 'bg-green-600 dark:bg-green-600'
    return 'bg-green-700 dark:bg-green-500'
  }

  // Format distance
  const formatDistance = (meters: number): string => {
    if (speedUnit === 'mph') {
      const miles = meters / 1609.344
      return `${miles.toFixed(1)} mi`
    }
    const km = meters / 1000
    return `${km.toFixed(1)} km`
  }

  // Format time for labels
  const formatTimeLabel = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  // Format duration
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  // Generate time markers (evenly spaced markers based on time range)
  const timeMarkers = useMemo(() => {
    const markers: Array<{ position: number, label: string }> = []

    // Determine number of intermediate markers (excluding start and end)
    let intermediateMarkers: number
    switch(timeRange) {
      case '1h':
        intermediateMarkers = 2 // Total: 4 markers including start/end
        break
      case '6h':
      case '12h':
      case '24h':
        intermediateMarkers = 3 // Total: 5 markers including start/end
        break
      default:
        intermediateMarkers = 3
    }

    const totalMarkers = intermediateMarkers + 2 // +2 for start and end

    // Add start marker
    markers.push({
      position: 0,
      label: formatTimeLabel(startTime)
    })

    // Add intermediate markers
    for (let i = 1; i <= intermediateMarkers; i++) {
      const position = (i / (totalMarkers - 1)) * 100
      const time = new Date(startTime.getTime() + (totalDurationMs * i / (totalMarkers - 1)))
      markers.push({
        position,
        label: formatTimeLabel(time)
      })
    }

    // Add end marker (now)
    markers.push({
      position: 100,
      label: formatTimeLabel(endTime)
    })

    return markers
  }, [startTime, endTime, totalDurationMs, timeRange])

  if (tripsWithVehicles.length === 0) {
    return null
  }

  return (
    <div className="w-full border-b bg-background">
      <div className="p-2 md:p-4 space-y-2">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Trip Timeline
        </div>

        <div className="w-full">
          <div className="w-full">
            {/* Time markers */}
            <div className="relative h-6 mb-2 ml-12 md:ml-16 lg:ml-20">
              {timeMarkers.map((marker, index) => {
                const isFirst = index === 0
                const isLast = index === timeMarkers.length - 1

                return (
                  <div
                    key={index}
                    className={`absolute top-0 flex flex-col ${isFirst ? 'items-start' : isLast ? 'items-end' : 'items-center'}`}
                    style={{
                      left: isFirst ? '0%' : isLast ? 'auto' : `${marker.position}%`,
                      right: isLast ? '0%' : 'auto',
                      transform: isFirst || isLast ? 'none' : 'translateX(-50%)'
                    }}
                  >
                    <div className="w-px h-2 bg-border" />
                    <span className="text-[9px] text-muted-foreground font-mono mt-1 whitespace-nowrap">
                      {marker.label}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Vehicle rows */}
            <div className="space-y-1">
              {tripsWithVehicles.map((vehicle) => (
                <div key={vehicle.vin} className="flex items-center gap-1 md:gap-2">
                  {/* Vehicle label - responsive width */}
                  <div className="w-10 md:w-14 lg:w-18 flex-shrink-0 text-right pr-1 md:pr-2">
                    <span className="text-[9px] md:text-[10px] font-mono text-muted-foreground truncate block">
                      {vehicle.vehicleLabel}
                    </span>
                  </div>

                  {/* Timeline track */}
                  <div className="flex-1 relative h-7 md:h-8 bg-muted/30 rounded">
                    {vehicle.trips.map((trip) => {
                      const tripStart = new Date(trip.start_ts).getTime()
                      const tripEnd = new Date(trip.end_ts).getTime()

                      // Calculate position and width as percentages
                      const leftPercent = Math.max(0, ((tripStart - startTime.getTime()) / totalDurationMs) * 100)
                      const rightPercent = Math.min(100, ((tripEnd - startTime.getTime()) / totalDurationMs) * 100)
                      const widthPercent = rightPercent - leftPercent

                      // Only show if trip is within visible range and has width
                      if (widthPercent <= 0 || leftPercent >= 100 || rightPercent <= 0) {
                        return null
                      }

                      const colorClass = getSpeedColor(trip.distance_fused_m, trip.duration_s)
                      const speedKph = (trip.distance_fused_m / trip.duration_s) * 3.6

                      return (
                        <div
                          key={trip.trip_id}
                          className={`absolute top-0.5 md:top-1 h-6 rounded-sm ${colorClass} hover:opacity-80 transition-all cursor-pointer group`}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            minWidth: '2px'
                          }}
                          title={`${formatDistance(trip.distance_fused_m)} • ${formatDuration(trip.duration_s)} • ${speedKph.toFixed(0)} km/h avg\n${new Date(trip.start_ts).toLocaleString()}`}
                        >
                          {/* Show distance label if bar is wide enough */}
                          {widthPercent > 8 && (
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-medium text-white">
                              {formatDistance(trip.distance_fused_m)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 pt-2 border-t text-xs text-muted-foreground">
          <span className="text-[10px] md:text-xs">Slow</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-sm bg-green-300 dark:bg-green-900" />
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-sm bg-green-400 dark:bg-green-800" />
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-sm bg-green-500 dark:bg-green-700" />
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-sm bg-green-600 dark:bg-green-600" />
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-sm bg-green-700 dark:bg-green-500" />
          </div>
          <span className="text-[10px] md:text-xs">Fast</span>
        </div>
      </div>
    </div>
  )
}
