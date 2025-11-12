'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

type View = 'cars' | 'map' | 'trips' | 'logs'

interface ViewContextType {
  activeView: View
  setActiveView: (view: View) => void
}

const ViewContext = createContext<ViewContextType | undefined>(undefined)

export function ViewProvider({ children }: { children: ReactNode }) {
  const [activeView, setActiveView] = useState<View>('cars')

  return (
    <ViewContext.Provider value={{ activeView, setActiveView }}>
      {children}
    </ViewContext.Provider>
  )
}

export function useView() {
  const context = useContext(ViewContext)
  if (context === undefined) {
    throw new Error('useView must be used within a ViewProvider')
  }
  return context
}
