"use client"

import { useState, useEffect } from "react"
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
  Navigation,
  DoorOpen,
  DoorClosed,
  AlertTriangle,
  MapPinned,
  Bell,
  Lightbulb,
  Plus,
  Minus,
  Fan,
  Snowflake,
} from "lucide-react"
import { VehicleStatus } from "@/hooks/use-vehicle"
import { reverseGeocode } from "@/lib/geocoding"

export default function VehicleDashboard() {
  const { vehicles, loading, error, refetch } = useVehicles()
  const [refreshing, setRefreshing] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleStatus | null>(null)
  const [locations, setLocations] = useState<Record<string, string>>({})
  const [targetTemps, setTargetTemps] = useState<Record<string, number>>({})
  const [showClimateControls, setShowClimateControls] = useState<Record<string, boolean>>({})
  const { toast } = useToast()

  // Geocode vehicle locations when they update
  useEffect(() => {
    vehicles.forEach((vehicle) => {
      if (vehicle.lat && vehicle.lon && !locations[vehicle.vin]) {
        reverseGeocode(vehicle.lat, vehicle.lon).then((result) => {
          if (result) {
            setLocations((prev) => ({
              ...prev,
              [vehicle.vin]: result.shortAddress,
            }))
          }
        })
      }
    })
  }, [vehicles])

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

  const handleClimateCommand = async (vin: string, action: string, temperature?: number) => {
    try {
      const response = await fetch("/api/vehicle/climate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, action, temperature }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Climate Control",
          description: temperature
            ? `Climate ${action} at ${temperature}°C command sent`
            : `Climate ${action} command sent`,
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

  const getTargetTemp = (vin: string) => {
    return targetTemps[vin] || 22 // Default to 22°C
  }

  const adjustTemp = (vin: string, delta: number) => {
    const currentTemp = getTargetTemp(vin)
    const newTemp = Math.max(17, Math.min(33, currentTemp + delta)) // Clamp between 17-33°C
    setTargetTemps((prev) => ({ ...prev, [vin]: newTemp }))
  }

  const toggleClimateControls = (vin: string) => {
    setShowClimateControls((prev) => ({ ...prev, [vin]: !prev[vin] }))
  }

  const handleFindMyCarCommand = async (vin: string, mode: string) => {
    try {
      const response = await fetch("/api/vehicle/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, mode }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Find My Car",
          description: data.message,
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

  const getVehicleStatus = (vehicle: VehicleStatus) => {
    // Priority 1: Charging states
    if (vehicle.charging_state === "Charging") {
      return { label: "Charging", color: "bg-green-500 text-white" }
    }
    if (vehicle.charging_state === "Complete") {
      return { label: "Charged", color: "bg-blue-500 text-white" }
    }

    // Priority 2: Movement state based on speed
    const speed = vehicle.speed || 0
    if (speed > 5) {
      return { label: "Driving", color: "bg-orange-500 text-white" }
    }

    // Priority 3: Parked (low/no speed, not charging)
    return { label: "Parked", color: "bg-gray-500 text-white" }
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

  const getDoorStatus = (vehicle: VehicleStatus) => {
    const openDoors = []
    if (vehicle.door_driver_open) openDoors.push("Driver")
    if (vehicle.door_passenger_open) openDoors.push("Passenger")
    if (vehicle.door_rear_left_open) openDoors.push("Rear-L")
    if (vehicle.door_rear_right_open) openDoors.push("Rear-R")

    return {
      hasOpenDoors: openDoors.length > 0,
      openDoors,
      allClosed: openDoors.length === 0,
    }
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
                      {(() => {
                        const status = getVehicleStatus(vehicle)
                        return (
                          <Badge
                            variant="outline"
                            className={status.color}
                          >
                            {status.label}
                          </Badge>
                        )
                      })()}
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatTimestamp(vehicle.updated_at)}</span>
                      </div>
                      {/* Light Status Indicators */}
                      {(vehicle.lights_main_beam || vehicle.lights_dipped_beam || vehicle.lights_side) && (
                        <div className="flex items-center gap-1">
                          {vehicle.lights_main_beam && (
                            <span title="High Beam On">
                              <Lightbulb className="w-3 h-3 text-blue-500" />
                            </span>
                          )}
                          {vehicle.lights_dipped_beam && (
                            <span title="Low Beam On">
                              <Lightbulb className="w-3 h-3 text-blue-400" />
                            </span>
                          )}
                          {vehicle.lights_side && (
                            <span title="Side Lights On">
                              <Lightbulb className="w-3 h-3 text-gray-400" />
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                    <div className="flex items-center gap-2">
                      <Battery className="w-4 h-4 text-muted-foreground" />
                      <span>{vehicle.soc?.toFixed(1) || "N/A"}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-muted-foreground" />
                      <span>{vehicle.range_km?.toFixed(0) || "N/A"} km</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Thermometer className={`w-4 h-4 ${vehicle.hvac_state === 'on' ? 'text-blue-500' : 'text-muted-foreground'}`} />
                      <span className="flex items-center gap-1">
                        {vehicle.interior_temp_c?.toFixed(0) || "N/A"}°C
                        {vehicle.hvac_state === 'on' && vehicle.remote_temperature && (
                          <span className="text-xs text-blue-500">→{vehicle.remote_temperature}°</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Gauge className="w-4 h-4 text-muted-foreground" />
                      <span>{vehicle.speed?.toFixed(0) || 0} km/h</span>
                    </div>
                  </div>

                  {/* Location Display */}
                  {vehicle.lat && vehicle.lon && (
                    <div className="flex items-start gap-2 text-sm mb-3 p-2 bg-accent/50 rounded-md">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground text-xs leading-relaxed">
                        {locations[vehicle.vin] || "Loading location..."}
                      </span>
                    </div>
                  )}

                  {/* Door Status Display */}
                  {(() => {
                    const doorStatus = getDoorStatus(vehicle)
                    const hasIssues = doorStatus.hasOpenDoors ||
                                     vehicle.bonnet_closed === false

                    if (hasIssues) {
                      return (
                        <div className="flex items-start gap-2 text-sm mb-3 p-2 bg-orange-500/10 border border-orange-500/20 rounded-md">
                          <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                          <div className="flex flex-col gap-1 text-xs">
                            {doorStatus.hasOpenDoors && (
                              <span className="text-orange-600 dark:text-orange-400">
                                Open: {doorStatus.openDoors.join(", ")}
                              </span>
                            )}
                            {vehicle.bonnet_closed === false && (
                              <span className="text-orange-600 dark:text-orange-400">
                                Hood Open
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    }

                    // Show compact status when all closed
                    return (
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                        <div className="flex items-center gap-2">
                          {vehicle.doors_locked ? (
                            <>
                              <Lock className="w-3 h-3" />
                              <span>Locked & Secure</span>
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3 h-3" />
                              <span>Unlocked</span>
                            </>
                          )}
                        </div>
                        {vehicle.boot_locked === false && (
                          <span className="text-muted-foreground/60 text-[10px]">
                            Boot Unlocked
                          </span>
                        )}
                      </div>
                    )
                  })()}

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
                        toggleClimateControls(vehicle.vin)
                      }}
                    >
                      <Thermometer className="w-4 h-4 mr-1" />
                      Climate
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

                  {/* Expanded Climate Controls */}
                  {showClimateControls[vehicle.vin] && (
                    <div className="mt-3 p-3 border rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium">Climate Control</span>
                        <Badge variant={vehicle.hvac_state === "on" ? "default" : "secondary"}>
                          {vehicle.hvac_state === "on" ? "Active" : "Off"}
                        </Badge>
                      </div>

                      {/* Temperature Selector */}
                      <div className="flex items-center justify-between mb-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            adjustTemp(vehicle.vin, -1)
                          }}
                          disabled={getTargetTemp(vehicle.vin) <= 17}
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                        <div className="flex flex-col items-center">
                          <span className="text-2xl font-bold">{getTargetTemp(vehicle.vin)}°C</span>
                          <span className="text-xs text-muted-foreground">Target Temperature</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            adjustTemp(vehicle.vin, 1)
                          }}
                          disabled={getTargetTemp(vehicle.vin) >= 33}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Climate Action Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant={vehicle.hvac_state === "on" ? "destructive" : "default"}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (vehicle.hvac_state === "on") {
                              handleClimateCommand(vehicle.vin, "off")
                            } else {
                              handleClimateCommand(vehicle.vin, "on", getTargetTemp(vehicle.vin))
                            }
                          }}
                        >
                          {vehicle.hvac_state === "on" ? (
                            <>
                              <Wind className="w-4 h-4 mr-1" />
                              Stop A/C
                            </>
                          ) : (
                            <>
                              <Snowflake className="w-4 h-4 mr-1" />
                              Start A/C
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleClimateCommand(vehicle.vin, "blowingonly")
                          }}
                        >
                          <Fan className="w-4 h-4 mr-1" />
                          Fan Only
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleClimateCommand(vehicle.vin, "front")
                          }}
                        >
                          <Wind className="w-4 h-4 mr-1" />
                          Defrost
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Find My Car Controls */}
                  <div className="flex gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFindMyCarCommand(vehicle.vin, "activate")
                      }}
                    >
                      <MapPinned className="w-4 h-4 mr-1" />
                      Find
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFindMyCarCommand(vehicle.vin, "lights_only")
                      }}
                    >
                      <Lightbulb className="w-4 h-4 mr-1" />
                      Lights
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFindMyCarCommand(vehicle.vin, "horn_only")
                      }}
                    >
                      <Bell className="w-4 h-4 mr-1" />
                      Horn
                    </Button>
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
