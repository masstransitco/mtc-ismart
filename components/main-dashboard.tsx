"use client"

import { useVehicles } from "@/hooks/use-vehicle"
import { useView } from "@/contexts/view-context"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import VehicleCardsView from "@/components/vehicle-cards-view"
import MapView from "@/components/map-view"
import LogsView from "@/components/logs-view"
import TripsView from "@/components/trips-view"

export default function MainDashboard() {
  const { loading, error, refetch } = useVehicles()
  const { activeView } = useView()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-144px)]">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading vehicles...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-144px)]">
        <div className="text-center space-y-4">
          <p className="text-destructive">Error loading vehicles</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={refetch}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-144px)] overflow-hidden">
      {activeView === 'cars' && (
        <div className="h-full overflow-y-auto">
          <div className="container mx-auto px-4 py-6 max-w-6xl">
            <VehicleCardsView />
          </div>
        </div>
      )}

      {activeView === 'map' && (
        <div className="h-full">
          <MapView />
        </div>
      )}

      {activeView === 'trips' && (
        <div className="h-full">
          <TripsView />
        </div>
      )}

      {activeView === 'logs' && (
        <div className="h-full">
          <LogsView />
        </div>
      )}
    </div>
  )
}
