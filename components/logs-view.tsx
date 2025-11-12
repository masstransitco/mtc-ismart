"use client"

import { useState, useMemo } from "react"
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
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

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
  const { events, loading, refetch } = useVehicleEvents(500)
  const { vehicles } = useVehicles()
  const [refreshing, setRefreshing] = useState(false)
  const [selectedVin, setSelectedVin] = useState<string>("all")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedSeverity, setSelectedSeverity] = useState<string>("all")

  const handleRefresh = async () => {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
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
      <div className="sticky top-0 z-10 bg-background border-b p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Title and Event Count */}
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Event Logs</h2>
            <p className="text-sm text-muted-foreground">
              {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Filters and Refresh Button */}
          <div className="flex items-center gap-2">
            <Select value={selectedVin} onValueChange={setSelectedVin}>
              <SelectTrigger className="w-[160px]">
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
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSeverity} onValueChange={setSelectedSeverity}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
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

              return (
                <Card key={event.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-1">
                          <CategoryIcon className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-base">{event.event_title}</CardTitle>
                            {(() => {
                              const vehicle = vehicles.find(v => v.vin === event.vin)
                              const plateNumber = vehicle?.vehicles?.plate_number

                              if (plateNumber) {
                                return (
                                  <div className="inline-flex items-center justify-center px-2 py-0.5 bg-gradient-to-b from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border border-slate-800 dark:border-slate-600 rounded shadow-sm">
                                    <span className="text-xs font-bold tracking-wider text-slate-900 dark:text-slate-100 font-mono">
                                      {plateNumber}
                                    </span>
                                  </div>
                                )
                              }

                              return (
                                <Badge variant="outline" className="text-xs">
                                  <Car className="w-3 h-3 mr-1" />
                                  {getVehicleLabel(event.vin)}
                                </Badge>
                              )
                            })()}
                          </div>
                          {event.event_description && (
                            <CardDescription className="mt-1">
                              {event.event_description}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge
                          className={severityColors[event.severity]}
                          variant="secondary"
                        >
                          <SeverityIcon className="w-3 h-3 mr-1" />
                          {event.severity}
                        </Badge>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimestamp(event.created_at)}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  {event.metadata && Object.keys(event.metadata).length > 0 && (
                    <CardContent className="pt-0">
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
                    </CardContent>
                  )}
                </Card>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
