"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { useVehicleEvents } from "@/hooks/use-vehicle-events"
import { useVehicles } from "@/hooks/use-vehicle"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertCircle,
  CheckCircle2,
  Info,
  AlertTriangle,
  RefreshCw,
  FileText,
  Lock,
  Wind,
  Battery,
  Search,
  Car,
  MapPin,
  DoorOpen,
  Lightbulb,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useTheme } from "next-themes"
import EventsGridChart from "@/components/events-grid-chart"

const eventIcons: Record<string, any> = {
  lock: Lock,
  unlock: Lock,
  climate: Wind,
  charge: Battery,
  find: Search,
  find_my_car: Search,
  telemetry: FileText,
  door: DoorOpen,
  location: MapPin,
  lights: Lightbulb,
  ignition: Zap,
}

const severityColors: Record<string, string> = {
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
}

const severityIcons: Record<string, any> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
}

export default function LogsView() {
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("1h")
  const { events, loading, refetch } = useVehicleEvents(selectedTimeRange)
  const { vehicles } = useVehicles()
  const { theme, systemTheme } = useTheme()
  const [refreshing, setRefreshing] = useState(false)
  const [selectedVin, setSelectedVin] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all")
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set())
  const filterRef = useRef<HTMLDivElement>(null)

  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  // Prevent scroll on touch for mobile browsers
  useEffect(() => {
    const filter = filterRef.current
    if (!filter) return

    const preventScroll = (e: TouchEvent) => {
      e.preventDefault()
    }

    filter.addEventListener('touchmove', preventScroll, { passive: false })

    return () => {
      filter.removeEventListener('touchmove', preventScroll)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  const toggleEventExpanded = (eventId: number) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev)
      if (newSet.has(eventId)) {
        newSet.delete(eventId)
      } else {
        newSet.add(eventId)
      }
      return newSet
    })
  }

  // Filter events based on selections
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (selectedVin !== "all" && event.vin !== selectedVin) return false
      if (selectedCategory !== "all" && event.event_category !== selectedCategory) return false
      if (selectedSeverity !== "all" && event.severity !== selectedSeverity) return false
      return true
    })
  }, [events, selectedVin, selectedCategory, selectedSeverity])

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(
      events
        .map(e => e.event_category)
        .filter((c): c is string => c !== null && c !== undefined)
    )
    return Array.from(cats).sort()
  }, [events])

  const getVehicleLabel = (vin: string) => {
    const vehicle = vehicles.find(v => v.vin === vin)
    return vehicle?.vehicles?.plate_number || vehicle?.vehicles?.label || vin.slice(-6)
  }

  const getTimeRangeLabel = (range: string) => {
    switch(range) {
      case '30m': return 'last 30 minutes'
      case '1h': return 'last hour'
      case '12h': return 'last 12 hours'
      case '24h': return 'last 24 hours'
      default: return 'selected time range'
    }
  }

  const getTimeRangeShortLabel = (range: string) => {
    switch(range) {
      case '30m': return '30 min'
      case '1h': return '1 hour'
      case '12h': return '12 hours'
      case '24h': return '24 hours'
      default: return 'Time range'
    }
  }

  const formatTimestamp = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
    } catch {
      return timestamp
    }
  }

  const formatDateTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleString()
    } catch {
      return timestamp
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading events...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with Filters */}
      <div ref={filterRef} className="sticky top-0 z-10 bg-background border-b touch-none">
        <div className="p-2 md:p-4 space-y-2">
          {/* Event count and Time Range Filter */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs md:text-sm text-muted-foreground font-medium px-1">
              {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""} in {getTimeRangeLabel(selectedTimeRange)}
            </div>
            <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
              <SelectTrigger className="h-8 text-xs w-24 md:w-28">
                <SelectValue>
                  {getTimeRangeShortLabel(selectedTimeRange)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30m">Last 30 minutes</SelectItem>
                <SelectItem value="1h">Last hour</SelectItem>
                <SelectItem value="12h">Last 12 hours</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filters row */}
          <div className="flex items-center gap-2">
            <Select value={selectedVin} onValueChange={setSelectedVin}>
              <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                <SelectValue placeholder="All vehicles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                {vehicles.map(vehicle => (
                  <SelectItem key={vehicle.vin} value={vehicle.vin}>
                    {vehicle.vehicles?.label || vehicle.vin}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
              <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-8 px-2 md:px-3"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Events Grid Chart */}
      <div className="border-b bg-background">
        <EventsGridChart events={filteredEvents} timeRange={selectedTimeRange} vehicles={vehicles} />
      </div>

      {/* Events List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <FileText className="w-16 h-16 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">No events found</p>
              <p className="text-sm text-muted-foreground">
                Events will appear here as they occur
              </p>
            </div>
          ) : (
            filteredEvents.map(event => {
              const SeverityIcon = severityIcons[event.severity] || Info
              const CategoryIcon = event.event_category
                ? eventIcons[event.event_category] || FileText
                : FileText
              const isExpanded = expandedEvents.has(event.id)

              return (
                <div
                  key={event.id}
                  className="relative overflow-hidden rounded-lg border border-border shadow-sm hover:shadow-md transition-all cursor-pointer"
                  style={{
                    background: isDark
                      ? 'linear-gradient(to bottom right, hsl(222 47% 8% / 0.9), hsl(217 33% 15% / 0.4), hsl(217 33% 17% / 0.6))'
                      : 'linear-gradient(to bottom right, hsl(210 20% 98% / 0.5), hsl(214 32% 96% / 0.6), hsl(220 13% 95% / 0.4))'
                  }}
                  onClick={() => toggleEventExpanded(event.id)}
                >
                  <div className="relative">
                    <div className={`flex flex-col space-y-1.5 ${isExpanded ? 'p-4 pb-2' : 'p-3 pb-2'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <div className={isExpanded ? 'mt-1' : 'mt-0.5'}>
                            <CategoryIcon className={`${isExpanded ? 'w-5 h-5' : 'w-4 h-4'} text-muted-foreground`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className={`${isExpanded ? 'text-base' : 'text-sm'} font-semibold leading-none tracking-tight`}>
                                {event.event_title}
                              </h3>
                              {(() => {
                                const vehicle = vehicles.find(v => v.vin === event.vin)
                                const plateNumber = vehicle?.vehicles?.plate_number

                                if (plateNumber) {
                                  return (
                                    <div className="inline-flex items-center justify-center px-1.5 py-0.5 bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border border-slate-800 dark:border-slate-600 rounded shadow-sm">
                                      <span className="text-[10px] font-bold tracking-wider text-slate-900 dark:text-slate-100 font-mono">
                                        {plateNumber}
                                      </span>
                                    </div>
                                  )
                                }

                                return (
                                  <Badge variant="outline" className="text-[10px] h-4 px-1">
                                    <Car className="w-2.5 h-2.5 mr-0.5" />
                                    {getVehicleLabel(event.vin)}
                                  </Badge>
                                )
                              })()}
                            </div>
                            {isExpanded && event.event_description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {event.event_description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col items-end gap-1">
                            <Badge
                              className={severityColors[event.severity]}
                              variant="secondary"
                            >
                              <SeverityIcon className="w-3 h-3 mr-1" />
                              <span className="text-[10px]">{event.severity}</span>
                            </Badge>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {formatTimestamp(event.created_at)}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleEventExpanded(event.id)
                            }}
                            className="p-1 hover:bg-muted/50 rounded transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {isExpanded && event.metadata && Object.keys(event.metadata).length > 0 && (
                      <div className="px-4 pb-3">
                        <div className="bg-muted/50 rounded-md p-3 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Metadata</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {Object.entries(event.metadata).map(([key, value]) => (
                              <div key={key} className="flex items-baseline gap-2 text-xs">
                                <span className="text-muted-foreground font-medium">{key}:</span>
                                <span className="font-mono break-all">
                                  {typeof value === 'object'
                                    ? JSON.stringify(value)
                                    : String(value)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                            {formatDateTime(event.created_at)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
