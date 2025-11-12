"use client"

import { ArrowDown, ArrowUp, Minus } from "lucide-react"
import { useSpeedUnit } from "@/contexts/speed-unit-context"

interface MotionStatusProps {
  motionState: string | null
  speed: number | null
  currentA: number | null
  powerKw: number | null
}

export function MotionStatus({ motionState, speed, currentA, powerKw }: MotionStatusProps) {
  const { convertSpeed, getSpeedLabel } = useSpeedUnit()
  if (!motionState || !speed || speed < 0.5) {
    return null // Not moving
  }

  const getMotionIcon = () => {
    switch (motionState) {
      case 'Regenerating':
        return <ArrowDown className="w-4 h-4" style={{ color: 'hsl(var(--success))' }} />
      case 'Propelling':
        return <ArrowUp className="w-4 h-4" style={{ color: 'hsl(var(--warning))' }} />
      case 'Coasting':
        return <Minus className="w-4 h-4" style={{ color: 'hsl(var(--info))' }} />
      default:
        return null
    }
  }

  const getMotionColor = () => {
    switch (motionState) {
      case 'Regenerating':
        return 'border-success/30 bg-success/10'
      case 'Propelling':
        return 'border-warning/30 bg-warning/10'
      case 'Coasting':
        return 'border-info/30 bg-info/10'
      default:
        return 'border-border/30 bg-accent/30'
    }
  }

  const getMotionDescription = () => {
    switch (motionState) {
      case 'Regenerating':
        return 'Regenerative braking active'
      case 'Propelling':
        return 'Accelerating'
      case 'Coasting':
        return 'Coasting with minimal power'
      default:
        return 'In motion'
    }
  }

  return (
    <div className={`p-3 rounded-lg border mb-3 ${getMotionColor()}`}>
      <div className="flex items-center gap-2 mb-2">
        {getMotionIcon()}
        <div className="text-xs font-medium text-foreground">
          {motionState} • {getMotionDescription()}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Speed:</span>{" "}
          <span className="font-medium text-foreground">{convertSpeed(speed)?.toFixed(0)} {getSpeedLabel()}</span>
        </div>
        {currentA !== null && Math.abs(currentA) > 1 && (
          <div>
            <span className="text-muted-foreground">Current:</span>{" "}
            <span className="font-medium text-foreground">
              {currentA > 0 ? '+' : ''}{currentA.toFixed(1)} A
            </span>
          </div>
        )}
        {powerKw !== null && Math.abs(powerKw) > 0.1 && (
          <div>
            <span className="text-muted-foreground">Power:</span>{" "}
            <span className="font-medium text-foreground">
              {powerKw > 0 ? '+' : ''}{powerKw.toFixed(2)} kW
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
