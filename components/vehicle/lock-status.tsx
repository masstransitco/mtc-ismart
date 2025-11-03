import { Lock, Unlock } from "lucide-react"
import { cn } from "@/lib/utils"

interface LockStatusProps {
  locked: boolean | null
  className?: string
}

export function LockStatus({ locked, className }: LockStatusProps) {
  const isLocked = locked === true

  return (
    <div
      className={cn(
        "p-2 rounded-lg",
        isLocked ? "bg-muted" : "bg-muted",
        className
      )}
      title={isLocked ? "Locked" : locked === false ? "Unlocked" : "Unknown"}
    >
      {isLocked ? (
        <Lock className="w-4 h-4 text-success" />
      ) : locked === false ? (
        <Unlock className="w-4 h-4 text-warning" />
      ) : (
        <Lock className="w-4 h-4 text-muted-foreground" />
      )}
    </div>
  )
}
