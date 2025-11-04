import { cn } from "@/lib/utils"

interface ParkingIndicatorProps {
  isParked: boolean | null
}

export function ParkingIndicator({ isParked }: ParkingIndicatorProps) {
  // Only show when vehicle is explicitly parked (true)
  if (isParked !== true) return null

  return (
    <div
      className="relative flex items-center justify-center w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/30"
      title="Parking Brake Engaged"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        className={cn(
          "transition-all duration-300",
          isParked ? "text-orange-500" : "text-muted-foreground/30"
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Parking brake symbol - P in circle */}
        <circle cx="12" cy="12" r="10"/>
        <path d="M9 12h2a2 2 0 1 0 0-4H9v8"/>
      </svg>

      {/* Subtle glow effect */}
      {isParked && (
        <div className="absolute inset-0 rounded-full bg-orange-500/10 blur-sm" />
      )}
    </div>
  )
}
