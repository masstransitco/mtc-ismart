"use client"

import { useState, useEffect, useRef } from "react"
import { useTrips } from "@/hooks/use-trips"
import { useVehicles } from "@/hooks/use-vehicle"
import { TripVehicleCard } from "@/components/vehicle/trip-vehicle-card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RefreshCw, TrendingUp } from "lucide-react"
import { useTheme } from "next-themes"

export default function TripsView() {
  const [selectedVin, setSelectedVin] = useState<string>("all")
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("24h")
  const [refreshing, setRefreshing] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  const { vehicles } = useVehicles()
  const { vehicleStats, loading, error, refetch } = useTrips(selectedVin, selectedTimeRange)
  const { theme, systemTheme } = useTheme()
  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  // Prevent scroll on touch for mobile browsers
  useEffect(() => {
    const filter = filterRef.current
    if (!filter) return

    const preventScroll = (e: TouchEvent) => {
      e.preventDefault()
    }

    filter.addEventListener('touchmove', preventScroll, { passive: false })

    return () => {
      filter.removeEventListener('touchmove', preventScroll)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const getTimeRangeLabel = (range: string) => {
    switch (range) {
      case "24h":
        return "Last 24 Hours"
      case "7d":
        return "Last 7 Days"
      default:
        return range
    }
  }

  const totalTrips = vehicleStats.reduce((sum, v) => sum + v.tripCount, 0)

  if (loading && vehicleStats.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading trip data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div ref={filterRef} className="sticky top-0 z-10 bg-background border-b touch-none">
        <div className="p-2 md:p-4 space-y-2">
          {/* Trip count and time range */}
          <div className="text-xs md:text-sm text-muted-foreground font-medium px-1">
            {totalTrips} trip{totalTrips !== 1 ? "s" : ""} • {getTimeRangeLabel(selectedTimeRange)}
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2">
            <Select value={selectedVin} onValueChange={setSelectedVin}>
              <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                <SelectValue placeholder="All vehicles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.vin} value={vehicle.vin}>
                    {vehicle.vehicles?.label || vehicle.vehicles?.plate_number || vehicle.vin}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
              <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24h</SelectItem>
                <SelectItem value="7d">7d</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 px-2 md:px-3"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4">
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Error loading trips</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && vehicleStats.length === 0 && (
        <div className="flex items-center justify-center flex-1 p-8">
          <div className="text-center space-y-3 max-w-md">
            <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <h3 className="text-lg font-semibold">No trips found</h3>
            <p className="text-sm text-muted-foreground">
              No trips were recorded in the selected time range. Try selecting a longer time period or check back later.
            </p>
          </div>
        </div>
      )}

      {/* Trip Cards Grid */}
      {vehicleStats.length > 0 && (
        <ScrollArea className="flex-1">
          <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {vehicleStats.map((stats) => {
              const vehicleInfo = vehicles.find(v => v.vin === stats.vin)
              return (
                <TripVehicleCard
                  key={stats.vin}
                  stats={stats}
                  vehicleInfo={vehicleInfo}
                />
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
