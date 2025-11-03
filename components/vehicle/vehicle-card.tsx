import { Card } from "@/components/ui/card"
import { VehicleStatus } from "@/hooks/use-vehicle"
import { VehicleStatusBadge } from "./status-badge"
import { LockStatus } from "./lock-status"
import { ChargingIndicator } from "./charging-indicator"
import { StatItem } from "./stat-item"
import { VehicleControls } from "./vehicle-controls"
import { ClimateControls } from "./climate-controls"
import { FindMyCarControls } from "./find-my-car-controls"
import { getVehicleStatus } from "@/lib/vehicle-status"
import { cn } from "@/lib/utils"
import {
  Battery,
  Navigation,
  Thermometer,
  Gauge,
  Clock,
  Lightbulb,
  MapPin,
  AlertTriangle,
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

  return (
    <Card className={cn(
      "p-4 md:p-6 cursor-pointer card-hover animate-fade-in",
      {
        "bg-gradient-to-br from-success/5 via-card to-card border-success/20": status === "charging",
        "bg-gradient-to-br from-info/5 via-card to-card border-info/20": status === "charged",
        "bg-gradient-to-br from-warning/5 via-card to-card border-warning/20": status === "driving",
        "bg-card border-border": status === "parked",
      }
    )}>
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
                <LockStatus locked={vehicle.doors_locked} />
                <ChargingIndicator isCharging={vehicle.charging_state === "Charging"} />
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
            value={`${vehicle.speed?.toFixed(0) || 0} km/h`}
            iconColor="text-primary"
          />
        </div>

        {/* Location */}
        {location && (
          <div className="flex items-start gap-2.5 mb-3 p-3 bg-gradient-to-r from-accent/40 to-accent/20 rounded-lg border border-border/30">
            <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <span className="text-foreground/80 text-sm leading-relaxed">
              {location}
            </span>
          </div>
        )}

        {/* Warnings */}
        {vehicle.battery_voltage && vehicle.battery_voltage < 12.2 && (
          <div className="flex items-start gap-2 text-sm mb-3 p-2 bg-warning/10 border border-warning/20 rounded-md">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-warning">
                Low 12V battery: {vehicle.battery_voltage.toFixed(1)}V
              </span>
              {vehicle.battery_voltage < 11.8 && (
                <span className="text-warning">
                  Warning: May not start. Consider charging soon.
                </span>
              )}
            </div>
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
          commandLoading={commandLoading}
          onFindCommand={onFindCommand}
        />
      </div>
    </Card>
  )
}
