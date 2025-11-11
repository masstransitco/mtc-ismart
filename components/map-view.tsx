"use client"

import { useEffect, useMemo, useState } from "react"
import { useTheme } from "next-themes"
import { APIProvider, Map, AdvancedMarker, InfoWindow } from "@vis.gl/react-google-maps"
import { useVehicles } from "@/hooks/use-vehicle"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Battery, Gauge, Thermometer, MapPin, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

import { VehicleStatus } from "@/hooks/use-vehicle"

interface VehicleMarkerProps {
  vehicle: VehicleStatus
  onClick: () => void
  isDarkMode: boolean
}

function VehicleMarker({ vehicle, onClick, isDarkMode }: VehicleMarkerProps) {
  const getMarkerColor = () => {
    const soc = vehicle.soc || 0
    if (soc >= 80) return "#22c55e" // green
    if (soc >= 50) return "#eab308" // yellow
    if (soc >= 20) return "#f97316" // orange
    return "#ef4444" // red
  }

  if (!vehicle.lat || !vehicle.lon) return null

  // Bearing is 0-359 degrees where 0 is North
  // SVG rotation needs to account for the arrow pointing up by default
  const rotation = vehicle.bearing ?? 0

  return (
    <AdvancedMarker
      position={{ lat: vehicle.lat, lng: vehicle.lon }}
      onClick={onClick}
    >
      <div
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center center',
          width: '32px',
          height: '32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Arrow cursor shape */}
          <path
            d="M16 4 L24 28 L16 24 L8 28 Z"
            fill={getMarkerColor()}
            stroke={isDarkMode ? "#fff" : "#000"}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Center dot for better visibility */}
          <circle
            cx="16"
            cy="18"
            r="2"
            fill="#fff"
            opacity="0.8"
          />
        </svg>
      </div>
    </AdvancedMarker>
  )
}

export default function MapView() {
  const { vehicles, loading, error, refetch } = useVehicles()
  const { theme } = useTheme()
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || ""

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  const isDarkMode = mounted && theme === "dark"

  // Inject custom styles for InfoWindow dark mode
  useEffect(() => {
    if (!mounted) return

    const styleId = 'map-infowindow-dark-mode'
    let styleElement = document.getElementById(styleId) as HTMLStyleElement

    if (!styleElement) {
      styleElement = document.createElement('style')
      styleElement.id = styleId
      document.head.appendChild(styleElement)
    }

    if (isDarkMode) {
      styleElement.textContent = `
        .gm-style .gm-style-iw-c {
          background-color: #111827 !important;
          padding: 0 !important;
        }
        .gm-style .gm-style-iw-d {
          overflow: auto !important;
        }
        .gm-style .gm-style-iw-tc::after {
          background: #111827 !important;
        }
        .gm-ui-hover-effect {
          background-color: #1f2937 !important;
        }
        .gm-ui-hover-effect > span {
          background-color: #d1d5db !important;
        }
      `
    } else {
      styleElement.textContent = `
        .gm-style .gm-style-iw-c {
          background-color: #ffffff !important;
          padding: 0 !important;
        }
        .gm-style .gm-style-iw-d {
          overflow: auto !important;
        }
        .gm-style .gm-style-iw-tc::after {
          background: #ffffff !important;
        }
      `
    }

    return () => {
      // Keep the style element for performance, just update content
    }
  }, [isDarkMode, mounted])

  // Calculate map center based on vehicles
  const mapCenter = useMemo(() => {
    if (vehicles.length === 0) {
      return { lat: 22.3193, lng: 114.1694 } // Default to Hong Kong
    }

    const validVehicles = vehicles.filter(v => v.lat && v.lon)
    if (validVehicles.length === 0) {
      return { lat: 22.3193, lng: 114.1694 }
    }

    const avgLat = validVehicles.reduce((sum, v) => sum + (v.lat || 0), 0) / validVehicles.length
    const avgLng = validVehicles.reduce((sum, v) => sum + (v.lon || 0), 0) / validVehicles.length

    return { lat: avgLat, lng: avgLng }
  }, [vehicles])

  const selectedVehicleData = useMemo(() => {
    return vehicles.find(v => v.vin === selectedVehicle)
  }, [vehicles, selectedVehicle])

  // Calculate initial zoom based on vehicle spread
  const initialZoom = useMemo(() => {
    const validVehicles = vehicles.filter(v => v.lat && v.lon)
    if (validVehicles.length <= 1) return 14

    // Calculate the bounding box
    const lats = validVehicles.map(v => v.lat!).filter(Boolean)
    const lngs = validVehicles.map(v => v.lon!).filter(Boolean)
    if (lats.length === 0 || lngs.length === 0) return 14

    const latSpread = Math.max(...lats) - Math.min(...lats)
    const lngSpread = Math.max(...lngs) - Math.min(...lngs)
    const maxSpread = Math.max(latSpread, lngSpread)

    // Determine zoom level based on spread
    if (maxSpread > 1) return 9
    if (maxSpread > 0.5) return 10
    if (maxSpread > 0.1) return 12
    return 14
  }, [vehicles])

  return (
    <div className="h-full w-full relative">
      <APIProvider apiKey={apiKey}>
        <Map
          mapId={mapId}
          defaultCenter={mapCenter}
          defaultZoom={initialZoom}
          defaultTilt={45}
          defaultHeading={0}
          colorScheme={isDarkMode ? 'DARK' : 'LIGHT'}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: "100%", height: "100%" }}
          clickableIcons={false}
          mapTypeControl={true}
          rotateControl={true}
          tiltInteractionEnabled={true}
          headingInteractionEnabled={true}
          reuseMaps={true}
        >
          {vehicles
            .filter(v => v.lat && v.lon)
            .map(vehicle => (
              <VehicleMarker
                key={vehicle.vin}
                vehicle={vehicle}
                onClick={() => setSelectedVehicle(vehicle.vin)}
                isDarkMode={isDarkMode}
              />
            ))}

          {selectedVehicleData && selectedVehicleData.lat && selectedVehicleData.lon && (
            <InfoWindow
              position={{ lat: selectedVehicleData.lat, lng: selectedVehicleData.lon }}
              onCloseClick={() => setSelectedVehicle(null)}
            >
              <div className={`min-w-[280px] ${isDarkMode ? 'dark' : 'light'}`}>
                <Card className={`border-0 shadow-none ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
                  <CardContent className="p-4 space-y-3">
                    <div>
                      {selectedVehicleData.vehicles?.plate_number ? (
                        <>
                          <h3 className={`font-semibold text-lg font-mono tracking-tight ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                            {selectedVehicleData.vehicles.plate_number}
                          </h3>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {selectedVehicleData.vehicles?.model || "MG4 Electric"}
                            {selectedVehicleData.vehicles?.year && ` (${selectedVehicleData.vehicles.year})`}
                          </p>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} font-mono`}>
                            VIN: {selectedVehicleData.vin}
                          </p>
                        </>
                      ) : (
                        <>
                          <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                            {selectedVehicleData.vehicles?.label || selectedVehicleData.vin}
                          </h3>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} font-mono`}>
                            VIN: {selectedVehicleData.vin}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2">
                        <Battery className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                        <div>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Battery</p>
                          <p className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                            {selectedVehicleData.soc || 0}%
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Gauge className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                        <div>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Range</p>
                          <p className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                            {selectedVehicleData.range_km || 0} km
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Thermometer className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                        <div>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Temperature</p>
                          <p className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                            {selectedVehicleData.interior_temp_c || 0}°C
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin className={`w-4 h-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                        <div>
                          <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Status</p>
                          <Badge
                            variant={selectedVehicleData.doors_locked ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {selectedVehicleData.doors_locked ? "Locked" : "Unlocked"}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {selectedVehicleData.charging_state && selectedVehicleData.charging_state !== "idle" && (
                      <Badge variant="outline" className="w-full justify-center">
                        {selectedVehicleData.charging_state === "charging" ? "Charging..." : "Charge Complete"}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </div>
            </InfoWindow>
          )}
        </Map>
      </APIProvider>

      {/* Loading state */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error or no vehicles state */}
      {!loading && (error || vehicles.filter(v => v.lat && v.lon).length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="text-center space-y-4">
            <MapPin className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <div className="space-y-2">
              <p className="text-lg font-medium text-foreground">
                Unable to establish connection
              </p>
              <p className="text-sm text-muted-foreground">
                {error || "No vehicle locations available"}
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
        </div>
      )}
    </div>
  )
}
