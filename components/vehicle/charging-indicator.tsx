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
          "p-2 rounded-lg animate-pulse",
          className
        )}
        style={{ backgroundColor: 'hsl(var(--success) / 0.1)' }}
        title="Actively Charging"
      >
        <Zap className="w-4 h-4" style={{ color: 'hsl(var(--success))' }} />
      </div>
    )
  }

  // Show plugged in but not charging
  if (isPluggedIn) {
    return (
      <div
        className={cn(
          "p-2 rounded-lg",
          className
        )}
        style={{ backgroundColor: 'hsl(var(--info) / 0.1)' }}
        title="Plugged In (Not Charging)"
      >
        <Plug className="w-4 h-4" style={{ color: 'hsl(var(--info))' }} />
      </div>
    )
  }

  // Show battery heating if active and not charging
  if (batteryHeating) {
    return (
      <div
        className={cn(
          "p-2 rounded-lg",
          className
        )}
        style={{ backgroundColor: 'hsl(var(--warning) / 0.1)' }}
        title="Battery Heating Active"
      >
        <Battery className="w-4 h-4" style={{ color: 'hsl(var(--warning))' }} />
      </div>
    )
  }

  return null
}
