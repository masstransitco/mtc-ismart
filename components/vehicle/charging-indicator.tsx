import { Zap, Plug, Battery } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChargingIndicatorProps {
  isCharging: boolean
  isPluggedIn?: boolean | null
  batteryHeating?: boolean | null
  className?: string
}

export function ChargingIndicator({
  isCharging,
  isPluggedIn,
  batteryHeating,
  className
}: ChargingIndicatorProps) {
  // Show actively charging - highest priority
  if (isCharging) {
    return (
      <div
        className={cn(
          "p-2 rounded-lg bg-success/10 animate-pulse",
          className
        )}
        title="Actively Charging"
      >
        <Zap className="w-4 h-4 text-success" />
      </div>
    )
  }

  // Show plugged in but not charging
  if (isPluggedIn) {
    return (
      <div
        className={cn(
          "p-2 rounded-lg bg-info/10",
          className
        )}
        title="Plugged In (Not Charging)"
      >
        <Plug className="w-4 h-4 text-info" />
      </div>
    )
  }

  // Show battery heating if active and not charging
  if (batteryHeating) {
    return (
      <div
        className={cn(
          "p-2 rounded-lg bg-warning/10",
          className
        )}
        title="Battery Heating Active"
      >
        <Battery className="w-4 h-4 text-warning" />
      </div>
    )
  }

  return null
}
