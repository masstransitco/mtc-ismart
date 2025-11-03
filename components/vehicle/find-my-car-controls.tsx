import { Button } from "@/components/ui/button"
import { MapPinned, Lightbulb, Bell, RefreshCw } from "lucide-react"

interface FindMyCarControlsProps {
  vin: string
  commandLoading: Record<string, boolean>
  onFindCommand: (vin: string, mode: string) => void
}

export function FindMyCarControls({
  vin,
  commandLoading,
  onFindCommand,
}: FindMyCarControlsProps) {
  const activateKey = `find-${vin}-activate`
  const lightsKey = `find-${vin}-lights_only`
  const hornKey = `find-${vin}-horn_only`

  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      <Button
        size="sm"
        variant="outline"
        className="flex-1 min-h-[44px] md:min-h-[36px]"
        disabled={commandLoading[activateKey]}
        onClick={(e) => {
          e.stopPropagation()
          onFindCommand(vin, "activate")
        }}
      >
        {commandLoading[activateKey] ? (
          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <MapPinned className="w-4 h-4 mr-1" />
        )}
        {commandLoading[activateKey] ? "..." : "Find"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="flex-1 min-h-[44px] md:min-h-[36px]"
        disabled={commandLoading[lightsKey]}
        onClick={(e) => {
          e.stopPropagation()
          onFindCommand(vin, "lights_only")
        }}
      >
        {commandLoading[lightsKey] ? (
          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <Lightbulb className="w-4 h-4 mr-1" />
        )}
        {commandLoading[lightsKey] ? "..." : "Lights"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="flex-1 min-h-[44px] md:min-h-[36px]"
        disabled={commandLoading[hornKey]}
        onClick={(e) => {
          e.stopPropagation()
          onFindCommand(vin, "horn_only")
        }}
      >
        {commandLoading[hornKey] ? (
          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
        ) : (
          <Bell className="w-4 h-4 mr-1" />
        )}
        {commandLoading[hornKey] ? "..." : "Horn"}
      </Button>
    </div>
  )
}
