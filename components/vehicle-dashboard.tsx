"use client"

import { useState } from "react"
import { useVehicles } from "@/hooks/use-vehicle"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import {
  Battery,
  Lock,
  Unlock,
  Wind,
  Zap,
  MapPin,
  RefreshCw,
  Car,
  Thermometer,
  Gauge,
  Clock,
} from "lucide-react"
import { VehicleStatus } from "@/hooks/use-vehicle"

export default function VehicleDashboard() {
  const { vehicles, loading, error, refetch } = useVehicles()
  const [refreshing, setRefreshing] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleStatus | null>(null)
  const { toast } = useToast()

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
    toast({
      title: "Refreshed",
      description: `${vehicles.length} vehicles loaded`,
    })
  }

  const handleLockCommand = async (vin: string, locked: boolean) => {
    try {
      const response = await fetch("/api/vehicle/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, locked }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: locked ? "Vehicle Locked" : "Vehicle Unlocked",
          description: `Command sent successfully`,
        })
      } else {
        throw new Error(data.error || "Command failed")
      }
    } catch (error) {
      toast({
        title: "Command Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const handleClimateCommand = async (vin: string, action: string) => {
    try {
      const response = await fetch("/api/vehicle/climate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, action }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Climate Control",
          description: `Climate ${action} command sent`,
        })
      } else {
        throw new Error(data.error || "Command failed")
      }
    } catch (error) {
      toast({
        title: "Command Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const handleChargeCommand = async (vin: string, action: string) => {
    try {
      const response = await fetch("/api/vehicle/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, action }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Charge Control",
          description: `Charge ${action} command sent`,
        })
      } else {
        throw new Error(data.error || "Command failed")
      }
    } catch (error) {
      toast({
        title: "Command Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  const getChargingStatusColor = (state: string | null) => {
    switch (state) {
      case "Charging":
        return "bg-green-500"
      case "Complete":
        return "bg-blue-500"
      default:
        return "bg-gray-500"
    }
  }

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return "N/A"
    const date = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return `${Math.floor(diffMins / 1440)}d ago`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading vehicles...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-4">
          <p className="text-destructive">Error loading vehicles</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={handleRefresh}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Car className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">MTC iSmart</h1>
              <p className="text-xs text-muted-foreground">
                {vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {vehicles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4">
              <Car className="w-16 h-16 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">No vehicles found</p>
              <p className="text-sm text-muted-foreground">
                Vehicles will appear here once the MQTT gateway connects
              </p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {vehicles.map((vehicle) => (
                <Card
                  key={vehicle.vin}
                  className="p-4 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => setSelectedVehicle(vehicle)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Battery
                        className={`w-6 h-6 ${
                          vehicle.charging_state === "Charging"
                            ? "text-green-500"
                            : "text-muted-foreground"
                        }`}
                      />
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {vehicle.vehicles?.label || vehicle.vin}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {vehicle.vehicles?.model || "Unknown Model"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className={getChargingStatusColor(vehicle.charging_state)}
                      >
                        {vehicle.charging_state || "Unknown"}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(vehicle.updated_at)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div className="flex items-center gap-2">
                      <Battery className="w-4 h-4 text-muted-foreground" />
                      <span>{vehicle.soc?.toFixed(1) || "N/A"}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span>{vehicle.range_km?.toFixed(0) || "N/A"} km</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Thermometer className="w-4 h-4 text-muted-foreground" />
                      <span>{vehicle.exterior_temp_c?.toFixed(0) || "N/A"}°C</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-muted-foreground" />
                      <span>{vehicle.speed?.toFixed(0) || 0} km/h</span>
                    </div>
                  </div>

                  {vehicle.charging_state === "Charging" && vehicle.charge_power_kw && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-3">
                      <Zap className="w-4 h-4" />
                      <span>
                        Charging at {vehicle.charge_power_kw.toFixed(1)} kW
                      </span>
                    </div>
                  )}

                  <Separator className="my-3" />

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleLockCommand(vehicle.vin, !vehicle.doors_locked)
                      }}
                    >
                      {vehicle.doors_locked ? (
                        <>
                          <Unlock className="w-4 h-4 mr-1" />
                          Unlock
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 mr-1" />
                          Lock
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleClimateCommand(
                          vehicle.vin,
                          vehicle.hvac_state === "on" ? "off" : "on"
                        )
                      }}
                    >
                      <Wind className="w-4 h-4 mr-1" />
                      {vehicle.hvac_state === "on" ? "Stop" : "Start"} A/C
                    </Button>
                    {vehicle.charging_state === "Charging" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleChargeCommand(vehicle.vin, "stop")
                        }}
                      >
                        <Zap className="w-4 h-4 mr-1" />
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleChargeCommand(vehicle.vin, "start")
                        }}
                      >
                        <Zap className="w-4 h-4 mr-1" />
                        Charge
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
