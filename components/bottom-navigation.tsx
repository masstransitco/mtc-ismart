'use client'

import { useEffect, useRef } from 'react'
import { Car, Map, TrendingUp, FileText } from 'lucide-react'
import { useView } from '@/contexts/view-context'
import { Button } from '@/components/ui/button'

export function BottomNavigation() {
  const { activeView, setActiveView } = useView()
  const navRef = useRef<HTMLDivElement>(null)

  const tabs = [
    { id: 'cars' as const, icon: Car, label: 'Cars' },
    { id: 'map' as const, icon: Map, label: 'Map' },
    { id: 'trips' as const, icon: TrendingUp, label: 'Trips' },
    { id: 'logs' as const, icon: FileText, label: 'Logs' },
  ]

  // Prevent scroll on touch for mobile browsers
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return

    const preventScroll = (e: TouchEvent) => {
      e.preventDefault()
    }

    nav.addEventListener('touchmove', preventScroll, { passive: false })

    return () => {
      nav.removeEventListener('touchmove', preventScroll)
    }
  }, [])

  return (
    <div ref={navRef} className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 touch-none">
      <div className="grid grid-cols-4 gap-1 p-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeView === tab.id

          return (
            <Button
              key={tab.id}
              variant={isActive ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView(tab.id)}
              className="flex flex-col items-center gap-1 h-auto py-2"
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{tab.label}</span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
