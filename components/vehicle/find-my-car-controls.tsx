import { Button } from "@/components/ui/button"
import { MapPinned, Lightbulb, Bell, RefreshCw, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface FindMyCarControlsProps {
  vin: string
  doorsLocked: boolean | null
  ignition: boolean | null
  commandLoading: Record<string, boolean>
  onFindCommand: (vin: string, mode: string) => void
}

export function FindMyCarControls({
  vin,
  doorsLocked,
  ignition,
  commandLoading,
  onFindCommand,
}: FindMyCarControlsProps) {
  const { toast } = useToast()
  const activateKey = `find-${vin}-activate`
  const lightsKey = `find-${vin}-lights_only`
  const hornKey = `find-${vin}-horn_only`

  // Validate vehicle state for Find My Car commands
  // Requirements: doors locked AND ignition off
  const canExecuteFindCommand = doorsLocked === true && ignition === false

  const getDisabledReason = (): string | null => {
    if (ignition === true) {
      return "Turn off vehicle ignition first"
    }
    if (doorsLocked === false) {
      return "Lock the vehicle first"
    }
    if (doorsLocked === null || ignition === null) {
      return "Waiting for vehicle status..."
    }
    return null
  }

  const handleFindCommand = (e: React.MouseEvent, mode: string) => {
    e.stopPropagation()

    if (!canExecuteFindCommand) {
      const reason = getDisabledReason()
      if (reason) {
        toast({
          variant: "destructive",
          title: "Cannot activate Find My Car",
          description: reason,
          duration: 3000,
        })
      }
      return
    }

    onFindCommand(vin, mode)
  }

  const isDisabled = (mode: string) => {
    const loadingKey = `find-${vin}-${mode}`
    return !canExecuteFindCommand || commandLoading[loadingKey]
  }

  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      <Button
        size="sm"
        variant="outline"
        className="flex-1 min-h-[44px] md:min-h-[36px]"
        disabled={isDisabled("activate")}
        onClick={(e) => handleFindCommand(e, "activate")}
        title={!canExecuteFindCommand ? getDisabledReason() || "" : "Activate horn and lights"}
      >
        {commandLoading[activateKey] ? (
          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
        ) : !canExecuteFindCommand ? (
          <AlertCircle className="w-4 h-4 mr-1 text-muted-foreground" />
        ) : (
          <MapPinned className="w-4 h-4 mr-1" />
        )}
        {commandLoading[activateKey] ? "..." : "Find"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="flex-1 min-h-[44px] md:min-h-[36px]"
        disabled={isDisabled("lights_only")}
        onClick={(e) => handleFindCommand(e, "lights_only")}
        title={!canExecuteFindCommand ? getDisabledReason() || "" : "Activate lights only"}
      >
        {commandLoading[lightsKey] ? (
          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
        ) : !canExecuteFindCommand ? (
          <AlertCircle className="w-4 h-4 mr-1 text-muted-foreground" />
        ) : (
          <Lightbulb className="w-4 h-4 mr-1" />
        )}
        {commandLoading[lightsKey] ? "..." : "Lights"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="flex-1 min-h-[44px] md:min-h-[36px]"
        disabled={isDisabled("horn_only")}
        onClick={(e) => handleFindCommand(e, "horn_only")}
        title={!canExecuteFindCommand ? getDisabledReason() || "" : "Activate horn only"}
      >
        {commandLoading[hornKey] ? (
          <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
        ) : !canExecuteFindCommand ? (
          <AlertCircle className="w-4 h-4 mr-1 text-muted-foreground" />
        ) : (
          <Bell className="w-4 h-4 mr-1" />
        )}
        {commandLoading[hornKey] ? "..." : "Horn"}
      </Button>
    </div>
  )
}
