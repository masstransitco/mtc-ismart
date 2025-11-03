import { Zap } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChargingIndicatorProps {
  isCharging: boolean
  className?: string
}

export function ChargingIndicator({ isCharging, className }: ChargingIndicatorProps) {
  if (!isCharging) return null

  return (
    <div
      className={cn(
        "p-2 rounded-lg bg-success/10 animate-pulse",
        className
      )}
      title="Charging"
    >
      <Zap className="w-4 h-4 text-success" />
    </div>
  )
}
