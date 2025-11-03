"use client"

import { useState, useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { useVehicles } from "@/hooks/use-vehicle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import { Logo } from "@/components/logo"
import { VehicleCard } from "@/components/vehicle"
import { RefreshCw, Car, Sun, Moon } from "lucide-react"
import { reverseGeocode } from "@/lib/geocoding"

export default function VehicleDashboard() {
  const { vehicles, loading, error, refetch } = useVehicles()
  const { theme, setTheme } = useTheme()
  const [refreshing, setRefreshing] = useState(false)
  const [locations, setLocations] = useState<Record<string, string>>({})
  const [targetTemps, setTargetTemps] = useState<Record<string, number>>({})
  const [showClimateControls, setShowClimateControls] = useState<Record<string, boolean>>({})
  const [mounted, setMounted] = useState(false)
  const [commandLoading, setCommandLoading] = useState<Record<string, boolean>>({})
  const [currentTime, setCurrentTime] = useState(new Date())
  const { toast } = useToast()

  // Prevent hydration mismatch with theme
  useEffect(() => {
    setMounted(true)
  }, [])

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

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

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
      <header className="sticky top-0 z-50 border-b bg-card">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="logo-hover">
              {mounted && (
                <Logo className="h-8 md:h-10 w-auto text-foreground" />
              )}
            </div>
            <Separator orientation="vertical" className="h-6 md:h-8 hidden sm:block" />
            <div className="flex flex-col">
              <h1 className="text-base md:text-xl font-semibold tracking-tight text-foreground">
                SAIC MQTT API
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground">
                {vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="smooth-transition"
            >
              {mounted && theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="smooth-transition"
            >
              <RefreshCw className={`w-4 h-4 mr-0 md:mr-2 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden md:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-6 max-w-6xl">
          {vehicles.length === 0 ? (
            <div className="text-center space-y-4 py-12">
              <Car className="w-16 h-16 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">No vehicles found</p>
              <p className="text-sm text-muted-foreground">
                Add a vehicle to get started
              </p>
            </div>
          ) : (
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
          )}
        </div>
      </main>
    </div>
  )
}
