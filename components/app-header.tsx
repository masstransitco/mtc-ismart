'use client'

import { useState, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { useVehicles } from '@/hooks/use-vehicle'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Logo } from '@/components/logo'
import { RefreshCw, Sun, Moon, Gauge } from 'lucide-react'
import { useSpeedUnit } from '@/contexts/speed-unit-context'

export function AppHeader() {
  const { vehicles, refetch } = useVehicles()
  const { theme, setTheme } = useTheme()
  const { speedUnit, setSpeedUnit } = useSpeedUnit()
  const [refreshing, setRefreshing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  // Prevent hydration mismatch with theme
  useEffect(() => {
    setMounted(true)
  }, [])

  // Prevent scroll on touch for mobile browsers
  useEffect(() => {
    const header = headerRef.current
    if (!header) return

    const preventScroll = (e: TouchEvent) => {
      e.preventDefault()
    }

    header.addEventListener('touchmove', preventScroll, { passive: false })

    return () => {
      header.removeEventListener('touchmove', preventScroll)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const handleSpeedUnitChange = () => {
    setSpeedUnit(speedUnit === 'kmh' ? 'mph' : 'kmh')
  }

  return (
    <header ref={headerRef} className="fixed top-0 left-0 right-0 z-50 bg-card touch-none">
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
        <div className="flex items-center gap-2 md:gap-4">
          <div className="logo-hover">
            {mounted && (
              <Logo className="h-8 md:h-10 w-auto text-foreground" />
            )}
          </div>
          <Separator orientation="vertical" className="h-6 md:h-8 hidden sm:block" />
          <div className="flex flex-col">
            <h1 className="text-base md:text-xl font-semibold tracking-tight text-foreground">
              SAIC MQTT API
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 md:gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSpeedUnitChange}
            className="smooth-transition"
            title="Toggle speed unit"
          >
            <Gauge className="h-4 w-4 mr-1" />
            <span className="text-xs font-medium">{speedUnit === 'kmh' ? 'km/h' : 'mph'}</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="smooth-transition"
          >
            {mounted && theme === 'dark' ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
            <span className="sr-only">Toggle theme</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="smooth-transition"
          >
            <RefreshCw className={`w-4 h-4 mr-0 md:mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">Refresh</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
