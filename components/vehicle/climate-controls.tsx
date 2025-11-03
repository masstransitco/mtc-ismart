import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Minus, Wind, Snowflake, Fan, RefreshCw } from "lucide-react"

interface ClimateControlsProps {
  vin: string
  hvacState: string
  targetTemp: number
  commandLoading: Record<string, boolean>
  onTempAdjust: (vin: string, delta: number) => void
  onClimateCommand: (vin: string, action: string, temperature?: number) => void
}

export function ClimateControls({
  vin,
  hvacState,
  targetTemp,
  commandLoading,
  onTempAdjust,
  onClimateCommand,
}: ClimateControlsProps) {
  const isOn = hvacState === "on"
  const toggleKey = `climate-${vin}-${isOn ? "off" : "on"}`
  const blowingKey = `climate-${vin}-blowingonly`
  const frontKey = `climate-${vin}-front`

  return (
    <div className="mt-3 p-3 border rounded-lg bg-muted">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium">Climate Control</span>
        <Badge variant={isOn ? "default" : "secondary"}>
          {isOn ? "Active" : "Off"}
        </Badge>
      </div>

      {/* Temperature Selector */}
      <div className="flex items-center justify-between mb-3">
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation()
            onTempAdjust(vin, -1)
          }}
          disabled={targetTemp <= 17}
        >
          <Minus className="w-4 h-4" />
        </Button>
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold">{targetTemp}°C</span>
          <span className="text-xs text-muted-foreground">Target Temperature</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation()
            onTempAdjust(vin, 1)
          }}
          disabled={targetTemp >= 33}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Climate Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant={isOn ? "destructive" : "default"}
          disabled={commandLoading[toggleKey]}
          onClick={(e) => {
            e.stopPropagation()
            if (isOn) {
              onClimateCommand(vin, "off")
            } else {
              onClimateCommand(vin, "on", targetTemp)
            }
          }}
        >
          {commandLoading[toggleKey] ? (
            <>
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              {isOn ? "Stopping..." : "Starting..."}
            </>
          ) : isOn ? (
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
          disabled={commandLoading[blowingKey]}
          onClick={(e) => {
            e.stopPropagation()
            onClimateCommand(vin, "blowingonly")
          }}
        >
          {commandLoading[blowingKey] ? (
            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Fan className="w-4 h-4 mr-1" />
          )}
          {commandLoading[blowingKey] ? "Starting..." : "Fan Only"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={commandLoading[frontKey]}
          onClick={(e) => {
            e.stopPropagation()
            onClimateCommand(vin, "front")
          }}
        >
          {commandLoading[frontKey] ? (
            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Wind className="w-4 h-4 mr-1" />
          )}
          {commandLoading[frontKey] ? "Starting..." : "Defrost"}
        </Button>
      </div>
    </div>
  )
}
