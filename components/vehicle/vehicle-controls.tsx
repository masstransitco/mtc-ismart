import { Button } from "@/components/ui/button"
import { Lock, Unlock, Thermometer, Zap, RefreshCw } from "lucide-react"

interface VehicleControlsProps {
  vin: string
  doorsLocked: boolean
  chargingState: string
  commandLoading: Record<string, boolean>
  onLockToggle: (vin: string, lock: boolean) => void
  onClimateToggle: (vin: string) => void
  onChargeCommand: (vin: string, action: "start" | "stop") => void
}

export function VehicleControls({
  vin,
  doorsLocked,
  chargingState,
  commandLoading,
  onLockToggle,
  onClimateToggle,
  onChargeCommand,
}: VehicleControlsProps) {
  const lockCommandKey = `lock-${vin}`
  const chargeStopKey = `charge-${vin}-stop`
  const chargeStartKey = `charge-${vin}-start`

  return (
    <div className="grid grid-cols-3 gap-2">
      {/* Lock/Unlock Button */}
      <Button
        size="sm"
        variant="outline"
        className="flex-1 min-h-[44px] md:min-h-[36px]"
        disabled={commandLoading[lockCommandKey]}
        onClick={(e) => {
          e.stopPropagation()
          onLockToggle(vin, !doorsLocked)
        }}
      >
        {commandLoading[lockCommandKey] ? (
          <>
            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
            Processing...
          </>
        ) : doorsLocked ? (
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

      {/* Climate Button */}
      <Button
        size="sm"
        variant="outline"
        className="flex-1 min-h-[44px] md:min-h-[36px]"
        onClick={(e) => {
          e.stopPropagation()
          onClimateToggle(vin)
        }}
      >
        <Thermometer className="w-4 h-4 mr-1" />
        Climate
      </Button>

      {/* Charge Button */}
      {chargingState === "Charging" ? (
        <Button
          size="sm"
          variant="outline"
          className="flex-1 min-h-[44px] md:min-h-[36px]"
          disabled={commandLoading[chargeStopKey]}
          onClick={(e) => {
            e.stopPropagation()
            onChargeCommand(vin, "stop")
          }}
        >
          {commandLoading[chargeStopKey] ? (
            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Zap className="w-4 h-4 mr-1" />
          )}
          {commandLoading[chargeStopKey] ? "Stopping..." : "Stop"}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="flex-1 min-h-[44px] md:min-h-[36px]"
          disabled={commandLoading[chargeStartKey]}
          onClick={(e) => {
            e.stopPropagation()
            onChargeCommand(vin, "start")
          }}
        >
          {commandLoading[chargeStartKey] ? (
            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Zap className="w-4 h-4 mr-1" />
          )}
          {commandLoading[chargeStartKey] ? "Starting..." : "Charge"}
        </Button>
      )}
    </div>
  )
}
