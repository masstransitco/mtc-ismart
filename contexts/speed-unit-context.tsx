'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type SpeedUnit = 'kmh' | 'mph'

interface SpeedUnitContextType {
  speedUnit: SpeedUnit
  setSpeedUnit: (unit: SpeedUnit) => void
  convertSpeed: (speedKmh: number | null) => number | null
  getSpeedLabel: () => string
}

const SpeedUnitContext = createContext<SpeedUnitContextType | undefined>(undefined)

export function SpeedUnitProvider({ children }: { children: ReactNode }) {
  const [speedUnit, setSpeedUnitState] = useState<SpeedUnit>('kmh')

  // Load speed unit preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('speedUnit')
    if (saved === 'mph' || saved === 'kmh') {
      setSpeedUnitState(saved)
    }
  }, [])

  // Save speed unit preference to localStorage
  const setSpeedUnit = (unit: SpeedUnit) => {
    setSpeedUnitState(unit)
    localStorage.setItem('speedUnit', unit)
  }

  const convertSpeed = (speedKmh: number | null): number | null => {
    if (speedKmh === null) return null
    return speedUnit === 'mph' ? speedKmh * 0.621371 : speedKmh
  }

  const getSpeedLabel = () => speedUnit === 'mph' ? 'mph' : 'km/h'

  return (
    <SpeedUnitContext.Provider
      value={{
        speedUnit,
        setSpeedUnit,
        convertSpeed,
        getSpeedLabel
      }}
    >
      {children}
    </SpeedUnitContext.Provider>
  )
}

export function useSpeedUnit() {
  const context = useContext(SpeedUnitContext)
  if (!context) {
    throw new Error('useSpeedUnit must be used within SpeedUnitProvider')
  }
  return context
}
