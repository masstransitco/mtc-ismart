import { VehicleStatus } from "@/hooks/use-vehicle"

export type VehicleStatusType = "charging" | "charged" | "driving" | "parked"

export function getVehicleStatus(vehicle: VehicleStatus): VehicleStatusType {
  // Priority 1: Charging states
  if (vehicle.charging_state === "Charging") {
    return "charging"
  }
  if (vehicle.charging_state === "Complete") {
    return "charged"
  }

  // Priority 2: Movement state based on speed
  const speed = vehicle.speed || 0
  if (speed > 5) {
    return "driving"
  }

  // Priority 3: Parked (low/no speed, not charging)
  return "parked"
}
