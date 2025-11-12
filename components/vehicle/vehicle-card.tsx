"use client"

import { Card } from "@/components/ui/card"
import { VehicleStatus } from "@/hooks/use-vehicle"
import { VehicleStatusBadge } from "./status-badge"
import { LockStatus } from "./lock-status"
import { ChargingIndicator } from "./charging-indicator"
import { IgnitionIndicator } from "./ignition-indicator"
import { ParkingIndicator } from "./parking-indicator"
import { MotionStatus } from "./motion-status"
import { StatItem } from "./stat-item"
import { VehicleControls } from "./vehicle-controls"
import { ClimateControls } from "./climate-controls"
import { FindMyCarControls } from "./find-my-car-controls"
import { getVehicleStatus } from "@/lib/vehicle-status"
import { cn } from "@/lib/utils"
import { useSpeedUnit } from "@/contexts/speed-unit-context"
import { useTheme } from "next-themes"
import {
  Battery,
  Navigation,
  Thermometer,
  Gauge,
  Clock,
  Lightbulb,
  MapPin,
} from "lucide-react"

interface VehicleCardProps {
  vehicle: VehicleStatus
  location?: string
  targetTemp: number
  showClimateControls: boolean
  commandLoading: Record<string, boolean>
  onLockToggle: (vin: string, lock: boolean) => void
  onClimateToggle: (vin: string) => void
  onChargeCommand: (vin: string, action: "start" | "stop") => void
  onTempAdjust: (vin: string, delta: number) => void
  onClimateCommand: (vin: string, action: string, temperature?: number) => void
  onFindCommand: (vin: string, mode: string) => void
  formatTimestamp: (ts: string | null) => string
}

export function VehicleCard({
  vehicle,
  location,
  targetTemp,
  showClimateControls,
  commandLoading,
  onLockToggle,
  onClimateToggle,
  onChargeCommand,
  onTempAdjust,
  onClimateCommand,
  onFindCommand,
  formatTimestamp,
}: VehicleCardProps) {
  const status = getVehicleStatus(vehicle)
  const { convertSpeed, getSpeedLabel } = useSpeedUnit()
  const { theme, systemTheme } = useTheme()
  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  // Generate gradient based on status and theme
  const getBackgroundGradient = () => {
    const lightBase = 'linear-gradient(to bottom right, hsl(210 20% 98% / 0.5), hsl(214 32% 96% / 0.6), hsl(220 13% 95% / 0.4))'
    const darkBase = 'linear-gradient(to bottom right, hsl(222 47% 8% / 0.9), hsl(217 33% 15% / 0.4), hsl(217 33% 17% / 0.6))'

    if (isDark) {
      switch (status) {
        case "charging":
          return 'linear-gradient(to bottom right, hsl(142 76% 36% / 0.15), hsl(217 33% 15% / 0.4), hsl(217 33% 17% / 0.6))'
        case "charged":
          return 'linear-gradient(to bottom right, hsl(221 83% 53% / 0.15), hsl(217 33% 15% / 0.4), hsl(217 33% 17% / 0.6))'
        case "driving":
          return 'linear-gradient(to bottom right, hsl(32 95% 44% / 0.15), hsl(217 33% 15% / 0.4), hsl(217 33% 17% / 0.6))'
        default:
          return darkBase
      }
    } else {
      switch (status) {
        case "charging":
          return 'linear-gradient(to bottom right, hsl(142 76% 95% / 0.6), hsl(214 32% 96% / 0.6), hsl(220 13% 95% / 0.4))'
        case "charged":
          return 'linear-gradient(to bottom right, hsl(221 83% 95% / 0.6), hsl(214 32% 96% / 0.6), hsl(220 13% 95% / 0.4))'
        case "driving":
          return 'linear-gradient(to bottom right, hsl(32 95% 95% / 0.6), hsl(214 32% 96% / 0.6), hsl(220 13% 95% / 0.4))'
        default:
          return lightBase
      }
    }
  }

  return (
    <Card className={cn(
      "p-4 md:p-6 cursor-pointer card-hover animate-fade-in border-border",
      {
        "border-success/20": status === "charging",
        "border-info/20": status === "charged",
        "border-warning/20": status === "driving",
      }
    )} style={{ background: getBackgroundGradient() }}>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                {/* Plate Number - Primary Identifier */}
                {vehicle.vehicles?.plate_number && (
                  <h3 className="text-xl md:text-2xl font-semibold text-foreground font-mono tracking-tight mb-1.5">
                    {vehicle.vehicles.plate_number}
                  </h3>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ParkingIndicator isParked={vehicle.is_parked} />
                <IgnitionIndicator ignitionOn={vehicle.ignition} />
                <LockStatus locked={vehicle.doors_locked} />
                <ChargingIndicator
                  isCharging={vehicle.charging_state === "Charging"}
                  isPluggedIn={vehicle.charging_plug_connected}
                  batteryHeating={vehicle.battery_heating}
                />
              </div>
            </div>

            {/* Model Name */}
            <p className="text-sm md:text-base text-foreground font-medium mb-1">
              {vehicle.vehicles?.model || "MG4 Electric"}
              {vehicle.vehicles?.year && ` (${vehicle.vehicles.year})`}
            </p>

            {/* VIN - Secondary */}
            <p className="text-xs text-muted-foreground font-mono">
              VIN: {vehicle.vin}
            </p>

            <div className="flex items-center gap-2 mt-2">
              <VehicleStatusBadge status={status} />
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
          <Clock className="w-3 h-3" />
          <span>{formatTimestamp(vehicle.updated_at)}</span>

          {/* Light Status Indicators */}
          {(vehicle.lights_main_beam || vehicle.lights_dipped_beam || vehicle.lights_side) && (
            <div className="flex items-center gap-1 ml-2">
              {vehicle.lights_main_beam && (
                <span title="High Beam On">
                  <Lightbulb className="w-3 h-3 text-info" />
                </span>
              )}
              {vehicle.lights_dipped_beam && (
                <span title="Dipped Beam On">
                  <Lightbulb className="w-3 h-3 text-info/70" />
                </span>
              )}
              {vehicle.lights_side && !vehicle.lights_dipped_beam && !vehicle.lights_main_beam && (
                <span title="Side Lights On">
                  <Lightbulb className="w-3 h-3 text-muted-foreground" />
                </span>
              )}
            </div>
          )}
        </div>

        {/* Vehicle Metrics */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatItem
            icon={Battery}
            label="Battery"
            value={`${vehicle.soc?.toFixed(1) || "N/A"}%`}
            iconColor="text-success"
          />
          <StatItem
            icon={Navigation}
            label="Range"
            value={`${vehicle.range_km?.toFixed(0) || "N/A"} km`}
            iconColor="text-info"
          />
          <StatItem
            icon={Thermometer}
            label="Temp"
            value={
              vehicle.interior_temp_c ? (
                <span className="flex items-center gap-1">
                  {vehicle.interior_temp_c.toFixed(1)}°
                  {vehicle.remote_temperature && (
                    <span className="text-xs text-warning">→{vehicle.remote_temperature}°</span>
                  )}
                </span>
              ) : vehicle.remote_temperature ? (
                <span>{vehicle.remote_temperature}°</span>
              ) : vehicle.exterior_temp_c ? (
                <span>{vehicle.exterior_temp_c.toFixed(1)}°</span>
              ) : (
                "N/A"
              )
            }
            iconColor={vehicle.hvac_state === "on" ? "text-warning" : "text-muted-foreground"}
          />
          <StatItem
            icon={Gauge}
            label="Speed"
            value={`${convertSpeed(vehicle.speed)?.toFixed(0) || 0} ${getSpeedLabel()}`}
            iconColor="text-primary"
          />
        </div>

        {/* Motion Status - Show when vehicle is moving */}
        <MotionStatus
          motionState={vehicle.motion_state}
          speed={vehicle.speed}
          currentA={vehicle.charge_current_a}
          powerKw={vehicle.charge_power_kw}
        />

        {/* Charging Details - Show when plugged in or charging */}
        {(vehicle.charging_plug_connected || vehicle.charging_state === "Charging") && (
          <div className="p-3 bg-accent/30 rounded-lg border border-border/30 mb-3">
            <div className="text-xs font-medium text-muted-foreground mb-2">Charging Status</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {vehicle.charge_power_kw !== null && Math.abs(vehicle.charge_power_kw) > 0 && (
                <div>
                  <span className="text-muted-foreground">Power:</span>{" "}
                  <span className="font-medium text-foreground">{Math.abs(vehicle.charge_power_kw).toFixed(2)} kW</span>
                </div>
              )}
              {vehicle.charge_current_a !== null && Math.abs(vehicle.charge_current_a) > 0 && (
                <div>
                  <span className="text-muted-foreground">Current:</span>{" "}
                  <span className="font-medium text-foreground">{Math.abs(vehicle.charge_current_a).toFixed(1)} A</span>
                </div>
              )}
              {vehicle.charge_voltage_v !== null && vehicle.charge_voltage_v > 0 && (
                <div>
                  <span className="text-muted-foreground">Voltage:</span>{" "}
                  <span className="font-medium text-foreground">{vehicle.charge_voltage_v.toFixed(0)} V</span>
                </div>
              )}
              {vehicle.charge_current_limit && (
                <div>
                  <span className="text-muted-foreground">Limit:</span>{" "}
                  <span className="font-medium text-foreground">{vehicle.charge_current_limit}</span>
                </div>
              )}
              {vehicle.battery_heating && (
                <div className="col-span-2">
                  <span className="text-warning font-medium">⚡ Battery Heating Active</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Location */}
        {location && (
          <div className="flex items-start gap-2.5 mb-3 p-3 bg-gradient-to-r from-accent/40 to-accent/20 rounded-lg border border-border/30">
            <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <span className="text-foreground/80 text-sm leading-relaxed">
              {location}
            </span>
          </div>
        )}


        {/* Controls */}
        <VehicleControls
          vin={vehicle.vin}
          doorsLocked={vehicle.doors_locked}
          chargingState={vehicle.charging_state || ""}
          commandLoading={commandLoading}
          onLockToggle={onLockToggle}
          onClimateToggle={onClimateToggle}
          onChargeCommand={onChargeCommand}
        />

        {/* Expanded Climate Controls */}
        {showClimateControls && (
          <ClimateControls
            vin={vehicle.vin}
            hvacState={vehicle.hvac_state || "off"}
            targetTemp={targetTemp}
            commandLoading={commandLoading}
            onTempAdjust={onTempAdjust}
            onClimateCommand={onClimateCommand}
          />
        )}

        {/* Find My Car Controls */}
        <FindMyCarControls
          vin={vehicle.vin}
          doorsLocked={vehicle.doors_locked}
          ignition={vehicle.ignition}
          commandLoading={commandLoading}
          onFindCommand={onFindCommand}
        />
      </div>
    </Card>
  )
}
