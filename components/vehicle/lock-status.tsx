import { Lock, Unlock } from "lucide-react"
import { cn } from "@/lib/utils"

interface LockStatusProps {
  locked: boolean
  className?: string
}

export function LockStatus({ locked, className }: LockStatusProps) {
  return (
    <div
      className={cn(
        "p-2 rounded-lg",
        locked ? "bg-muted" : "bg-muted",
        className
      )}
      title={locked ? "Locked" : "Unlocked"}
    >
      {locked ? (
        <Lock className="w-4 h-4 text-success" />
      ) : (
        <Unlock className="w-4 h-4 text-warning" />
      )}
    </div>
  )
}
