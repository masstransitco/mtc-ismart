"use client"

import { useState, useEffect, useRef } from "react"
import { useVehicles } from "@/hooks/use-vehicle"
import { useToast } from "@/hooks/use-toast"
import { VehicleCard } from "@/components/vehicle"
import { reverseGeocode } from "@/lib/geocoding"
import { Car, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function VehicleCardsView() {
  const { vehicles, loading, error, refetch } = useVehicles()
  const [locations, setLocations] = useState<Record<string, string>>({})
  const [targetTemps, setTargetTemps] = useState<Record<string, number>>({})
  const [showClimateControls, setShowClimateControls] = useState<Record<string, boolean>>({})
  const [commandLoading, setCommandLoading] = useState<Record<string, boolean>>({})
  const [currentTime, setCurrentTime] = useState(new Date())
  const { toast } = useToast()

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Geocode vehicle locations
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
  }, [vehicles, locations])

  // Use ref to avoid stale closures
  const commandLoadingRef = useRef(commandLoading)
  commandLoadingRef.current = commandLoading

  // Re-enable buttons when vehicle status changes
  useEffect(() => {
    vehicles.forEach((vehicle) => {
      const lockCommandKey = `lock-${vehicle.vin}`
      const climateCommandKey = `climate-${vehicle.vin}-${vehicle.hvac_state === 'on' ? 'off' : 'on'}`

      if (commandLoadingRef.current[lockCommandKey]) {
        setCommandLoading(prev => ({ ...prev, [lockCommandKey]: false }))
        toast({
          title: "Confirmed",
          description: `Vehicle is now ${vehicle.doors_locked ? 'locked' : 'unlocked'}`,
          variant: "success",
        })
      }

      if (commandLoadingRef.current[climateCommandKey]) {
        setCommandLoading(prev => ({ ...prev, [climateCommandKey]: false }))
        toast({
          title: "Confirmed",
          description: `Climate is now ${vehicle.hvac_state === 'on' ? 'active' : 'off'}`,
          variant: "success",
        })
      }
    })
  }, [vehicles, toast])

  const handleLockCommand = async (vin: string, locked: boolean) => {
    const commandKey = `lock-${vin}`
    setCommandLoading(prev => ({ ...prev, [commandKey]: true }))

    try {
      const response = await fetch("/api/vehicle/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, locked }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success!",
          description: `Vehicle ${locked ? 'lock' : 'unlock'} command sent successfully`,
          variant: "success",
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
      setCommandLoading(prev => ({ ...prev, [commandKey]: false }))
    }
  }

  const handleClimateCommand = async (vin: string, action: string, temperature?: number) => {
    const commandKey = `climate-${vin}-${action}`
    setCommandLoading(prev => ({ ...prev, [commandKey]: true }))

    try {
      const response = await fetch("/api/vehicle/climate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, action, temperature }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success!",
          description: temperature
            ? `Climate ${action} at ${temperature}°C command sent`
            : `Climate ${action} command sent`,
          variant: "success",
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
      setCommandLoading(prev => ({ ...prev, [commandKey]: false }))
    }
  }

  const handleChargeCommand = async (vin: string, action: string) => {
    const commandKey = `charge-${vin}-${action}`
    setCommandLoading(prev => ({ ...prev, [commandKey]: true }))

    try {
      const response = await fetch("/api/vehicle/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, action }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success!",
          description: `Charging ${action} command sent successfully`,
          variant: "success",
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
      setCommandLoading(prev => ({ ...prev, [commandKey]: false }))
    }
  }

  const getTargetTemp = (vin: string) => {
    return targetTemps[vin] || 22
  }

  const adjustTemp = (vin: string, delta: number) => {
    const currentTemp = getTargetTemp(vin)
    const newTemp = Math.max(17, Math.min(33, currentTemp + delta))
    setTargetTemps((prev) => ({ ...prev, [vin]: newTemp }))
  }

  const toggleClimateControls = (vin: string) => {
    setShowClimateControls((prev) => ({ ...prev, [vin]: !prev[vin] }))
  }

  const handleFindMyCarCommand = async (vin: string, mode: string) => {
    const commandKey = `find-${vin}-${mode}`
    setCommandLoading(prev => ({ ...prev, [commandKey]: true }))

    try {
      const response = await fetch("/api/vehicle/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, mode }),
      })

      const data = await response.json()

      if (data.success) {
        toast({
          title: "Success!",
          description: data.message,
          variant: "info",
        })

        // Auto-clear loading after 5 seconds (horn/lights are momentary actions)
        setTimeout(() => {
          setCommandLoading(prev => ({ ...prev, [commandKey]: false }))
        }, 5000)
      } else {
        throw new Error(data.error || "Command failed")
      }
    } catch (error) {
      toast({
        title: "Command Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
      setCommandLoading(prev => ({ ...prev, [commandKey]: false }))
    }
  }

  const formatTimestamp = (ts: string | null) => {
    if (!ts) return "N/A"
    const date = new Date(ts)
    const diffMs = currentTime.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffMs / 60000)

    if (diffSecs < 10) return "Just now"
    if (diffSecs < 60) return `${diffSecs}s ago`
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return `${Math.floor(diffMins / 1440)}d ago`
  }

  // Show loading spinner while fetching data
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show error state with retry button
  if (error || vehicles.length === 0) {
    return (
      <div className="text-center space-y-4 py-12">
        <Car className="w-16 h-16 mx-auto text-muted-foreground/50" />
        <div className="space-y-2">
          <p className="text-lg font-medium text-foreground">
            Unable to establish connection
          </p>
          <p className="text-sm text-muted-foreground">
            {error || "No vehicles available"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refetch}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
      {vehicles.map((vehicle) => (
        <VehicleCard
          key={vehicle.vin}
          vehicle={vehicle}
          location={locations[vehicle.vin]}
          targetTemp={getTargetTemp(vehicle.vin)}
          showClimateControls={showClimateControls[vehicle.vin] || false}
          commandLoading={commandLoading}
          onLockToggle={handleLockCommand}
          onClimateToggle={toggleClimateControls}
          onChargeCommand={handleChargeCommand}
          onTempAdjust={adjustTemp}
          onClimateCommand={handleClimateCommand}
          onFindCommand={handleFindMyCarCommand}
          formatTimestamp={formatTimestamp}
        />
      ))}
    </div>
  )
}
