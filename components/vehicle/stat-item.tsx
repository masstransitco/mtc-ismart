import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatItemProps {
  icon: LucideIcon
  label: string
  value: string | number
  iconColor?: string
  className?: string
}

export function StatItem({
  icon: Icon,
  label,
  value,
  iconColor = "text-primary",
  className
}: StatItemProps) {
  return (
    <div className={cn(
      "flex items-center gap-2.5 p-2.5 rounded-lg bg-accent smooth-transition hover:bg-accent/90",
      className
    )}>
      <div className="p-1.5 rounded-md bg-background">
        <Icon className={cn("w-4 h-4", iconColor)} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold">{value}</span>
      </div>
    </div>
  )
}
