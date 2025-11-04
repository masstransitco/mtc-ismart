import { cn } from "@/lib/utils"

interface IgnitionIndicatorProps {
  ignitionOn: boolean | null
}

export function IgnitionIndicator({ ignitionOn }: IgnitionIndicatorProps) {
  // Only show when ignition is explicitly ON (true)
  if (ignitionOn !== true) return null

  return (
    <div
      className="relative flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30"
      title="Ignition On"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        className={cn(
          "transition-all duration-300",
          ignitionOn ? "text-blue-500 animate-pulse" : "text-muted-foreground/30"
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2v10"/>
        <path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>
      </svg>

      {/* Glow effect when on */}
      {ignitionOn && (
        <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-md animate-pulse" />
      )}
    </div>
  )
}
