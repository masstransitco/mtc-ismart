"use client"

import { useMemo } from "react"
import { VehicleEvent } from "@/hooks/use-vehicle-events"

interface EventsGridChartProps {
  events: VehicleEvent[]
  timeRange: string
  vehicles: Array<{ vin: string, vehicles?: { label?: string, plate_number?: string } }>
}

export default function EventsGridChart({ events, timeRange, vehicles }: EventsGridChartProps) {
  // Calculate bucket size based on time range
  const getBucketConfig = (range: string) => {
    switch(range) {
      case '30m':
        return { buckets: 30, intervalMinutes: 1 }
      case '1h':
        return { buckets: 30, intervalMinutes: 2 }
      case '12h':
        return { buckets: 24, intervalMinutes: 30 }
      case '24h':
        return { buckets: 24, intervalMinutes: 60 }
      default:
        return { buckets: 30, intervalMinutes: 2 }
    }
  }

  const config = getBucketConfig(timeRange)

  // Get unique VINs from events
  const uniqueVins = useMemo(() => {
    const vins = new Set(events.map(e => e.vin))
    return Array.from(vins).sort()
  }, [events])

  // Create heatmap matrix: vehicles x time buckets
  const heatmapData = useMemo(() => {
    const now = new Date()
    const matrix: number[][] = []
    const timeLabels: string[] = []

    // Create time buckets
    const buckets: Array<{ start: Date, end: Date }> = []
    for (let i = 0; i < config.buckets; i++) {
      const end = new Date(now.getTime() - i * config.intervalMinutes * 60 * 1000)
      const start = new Date(end.getTime() - config.intervalMinutes * 60 * 1000)
      buckets.unshift({ start, end })

      if (i % Math.floor(config.buckets / 4) === 0 || i === config.buckets - 1) {
        timeLabels.unshift(start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }))
      } else {
        timeLabels.unshift('')
      }
    }

    // Initialize matrix
    uniqueVins.forEach(() => {
      matrix.push(new Array(config.buckets).fill(0))
    })

    // Fill matrix with event counts
    events.forEach(event => {
      const vinIndex = uniqueVins.indexOf(event.vin)
      const eventTime = new Date(event.created_at)
      const bucketIndex = buckets.findIndex(b => eventTime >= b.start && eventTime < b.end)

      if (vinIndex >= 0 && bucketIndex >= 0) {
        matrix[vinIndex][bucketIndex]++
      }
    })

    return { matrix, timeLabels }
  }, [events, uniqueVins, config.buckets, config.intervalMinutes])

  // Calculate max value for color scaling
  const maxValue = Math.max(...heatmapData.matrix.flat(), 1)

  // Get intensity color based on event count
  const getIntensityColor = (count: number): string => {
    if (count === 0) return 'bg-gray-200 dark:bg-gray-800'
    const intensity = Math.min(count / maxValue, 1)

    if (intensity <= 0.25) return 'bg-blue-300 dark:bg-blue-900'
    if (intensity <= 0.5) return 'bg-blue-400 dark:bg-blue-700'
    if (intensity <= 0.75) return 'bg-blue-500 dark:bg-blue-600'
    return 'bg-blue-600 dark:bg-blue-500'
  }

  const getVehicleLabel = (vin: string) => {
    const vehicle = vehicles.find(v => v.vin === vin)
    return vehicle?.vehicles?.plate_number || vehicle?.vehicles?.label || vin.slice(-6)
  }

  if (uniqueVins.length === 0) {
    return (
      <div className="w-full p-4 text-center text-sm text-muted-foreground">
        No events to display
      </div>
    )
  }

  return (
    <div className="w-full p-4 space-y-2 overflow-x-auto">
      <div className="text-xs font-medium text-muted-foreground mb-3">
        Telemetry Heatmap
      </div>

      <div className="inline-block min-w-full">
        <div className="flex gap-2">
          {/* Vehicle labels (Y-axis) */}
          <div className="flex flex-col gap-0.5 justify-start pt-4">
            {uniqueVins.map((vin, index) => (
              <div
                key={vin}
                className="h-5 flex items-center text-[10px] font-mono text-muted-foreground pr-2"
              >
                {getVehicleLabel(vin)}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="flex-1">
            {/* Time labels (X-axis) */}
            <div className="flex gap-0.5 mb-1">
              {heatmapData.timeLabels.map((label, index) => (
                <div key={index} className="flex-1 text-center text-[9px] text-muted-foreground font-mono h-3">
                  {label}
                </div>
              ))}
            </div>

            {/* Grid cells */}
            {heatmapData.matrix.map((row, vinIndex) => (
              <div key={vinIndex} className="flex gap-0.5 mb-0.5">
                {row.map((count, timeIndex) => (
                  <div
                    key={timeIndex}
                    className={`flex-1 h-5 rounded-sm transition-all hover:scale-110 hover:z-10 cursor-pointer ${getIntensityColor(count)}`}
                    title={`${getVehicleLabel(uniqueVins[vinIndex])}\n${count} event${count !== 1 ? 's' : ''}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-4 h-4 rounded-sm bg-gray-200 dark:bg-gray-800" />
            <div className="w-4 h-4 rounded-sm bg-blue-300 dark:bg-blue-900" />
            <div className="w-4 h-4 rounded-sm bg-blue-400 dark:bg-blue-700" />
            <div className="w-4 h-4 rounded-sm bg-blue-500 dark:bg-blue-600" />
            <div className="w-4 h-4 rounded-sm bg-blue-600 dark:bg-blue-500" />
          </div>
          <span>More</span>
        </div>
        <span>{events.length} events across {uniqueVins.length} vehicle{uniqueVins.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  )
}
