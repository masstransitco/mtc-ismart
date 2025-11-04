"use client"

import { useState, useEffect, createContext, useContext } from "react"
import { useTheme } from "next-themes"
import { useVehicles } from "@/hooks/use-vehicle"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Logo } from "@/components/logo"
import { RefreshCw, Sun, Moon, Car, Map, FileText, Gauge } from "lucide-react"
import VehicleCardsView from "@/components/vehicle-cards-view"
import MapView from "@/components/map-view"
import LogsView from "@/components/logs-view"

type SpeedUnit = "kmh" | "mph"

interface SpeedUnitContextType {
  speedUnit: SpeedUnit
  setSpeedUnit: (unit: SpeedUnit) => void
  convertSpeed: (speedKmh: number | null) => number | null
  getSpeedLabel: () => string
}

const SpeedUnitContext = createContext<SpeedUnitContextType | undefined>(undefined)

export const useSpeedUnit = () => {
  const context = useContext(SpeedUnitContext)
  if (!context) {
    throw new Error("useSpeedUnit must be used within SpeedUnitProvider")
  }
  return context
}

export default function MainDashboard() {
  const { vehicles, loading, error, refetch } = useVehicles()
  const { theme, setTheme } = useTheme()
  const [refreshing, setRefreshing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState("cars")
  const [speedUnit, setSpeedUnit] = useState<SpeedUnit>("kmh")

  // Load speed unit preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("speedUnit")
    if (saved === "mph" || saved === "kmh") {
      setSpeedUnit(saved)
    }
  }, [])

  // Save speed unit preference to localStorage
  const handleSpeedUnitChange = (unit: SpeedUnit) => {
    setSpeedUnit(unit)
    localStorage.setItem("speedUnit", unit)
  }

  const convertSpeed = (speedKmh: number | null): number | null => {
    if (speedKmh === null) return null
    return speedUnit === "mph" ? speedKmh * 0.621371 : speedKmh
  }

  const getSpeedLabel = () => speedUnit === "mph" ? "mph" : "km/h"

  const speedUnitContext: SpeedUnitContextType = {
    speedUnit,
    setSpeedUnit: handleSpeedUnitChange,
    convertSpeed,
    getSpeedLabel,
  }

  // Prevent hydration mismatch with theme
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
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
    <SpeedUnitContext.Provider value={speedUnitContext}>
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
              size="sm"
              onClick={() => handleSpeedUnitChange(speedUnit === "kmh" ? "mph" : "kmh")}
              className="smooth-transition"
              title="Toggle speed unit"
            >
              <Gauge className="h-4 w-4 mr-1" />
              <span className="text-xs font-medium">{speedUnit === "kmh" ? "km/h" : "mph"}</span>
            </Button>

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

        {/* Navigation Tabs */}
        <div className="px-4 md:px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 max-w-md">
              <TabsTrigger value="cars" className="flex items-center gap-2">
                <Car className="w-4 h-4" />
                <span className="hidden sm:inline">Cars</span>
              </TabsTrigger>
              <TabsTrigger value="map" className="flex items-center gap-2">
                <Map className="w-4 h-4" />
                <span className="hidden sm:inline">Map</span>
              </TabsTrigger>
              <TabsTrigger value="logs" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Logs</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {/* Main Content with Tabs */}
      <main className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <TabsContent value="cars" className="h-full m-0 overflow-y-auto">
            <div className="container mx-auto px-4 py-6 max-w-6xl">
              <VehicleCardsView />
            </div>
          </TabsContent>

          <TabsContent value="map" className="h-full m-0">
            <MapView />
          </TabsContent>

          <TabsContent value="logs" className="h-full m-0">
            <LogsView />
          </TabsContent>
        </Tabs>
      </main>
      </div>
    </SpeedUnitContext.Provider>
  )
}
