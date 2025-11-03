import { Badge } from "@/components/ui/badge"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const statusVariants = cva(
  "font-medium",
  {
    variants: {
      status: {
        charging: "bg-success text-success-foreground",
        charged: "bg-info text-info-foreground",
        driving: "bg-warning text-warning-foreground",
        parked: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      status: "parked",
    },
  }
)

export interface VehicleStatusBadgeProps extends VariantProps<typeof statusVariants> {
  className?: string
}

export function VehicleStatusBadge({ status, className }: VehicleStatusBadgeProps) {
  const labels = {
    charging: "Charging",
    charged: "Charged",
    driving: "Driving",
    parked: "Parked",
  }

  return (
    <Badge
      variant="outline"
      className={cn(statusVariants({ status }), className)}
    >
      {status && labels[status]}
    </Badge>
  )
}
