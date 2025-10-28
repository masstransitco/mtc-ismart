// Google Maps Geocoding utilities

interface GeocodingResult {
  formattedAddress: string
  shortAddress: string
  city?: string
  country?: string
}

const geocodeCache = new Map<string, GeocodingResult>()

export async function reverseGeocode(lat: number, lon: number): Promise<GeocodingResult | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.error('Google Maps API key not configured')
    return null
  }

  // Create cache key
  const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`

  // Check cache first
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}&language=en`
    const response = await fetch(url)
    const data = await response.json()

    if (data.status === 'OK' && data.results.length > 0) {
      const result = data.results[0]

      // Extract city and country
      let city: string | undefined
      let country: string | undefined

      for (const component of result.address_components) {
        if (component.types.includes('locality')) {
          city = component.long_name
        }
        if (component.types.includes('country')) {
          country = component.long_name
        }
      }

      // Create short address (street + area or just area)
      let shortAddress = result.formatted_address

      // Try to get just the relevant parts (not full address)
      const parts = result.formatted_address.split(',')
      if (parts.length >= 2) {
        shortAddress = parts.slice(0, 2).join(',').trim()
      }

      const geocodingResult: GeocodingResult = {
        formattedAddress: result.formatted_address,
        shortAddress,
        city,
        country,
      }

      // Cache the result
      geocodeCache.set(cacheKey, geocodingResult)

      return geocodingResult
    }

    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}

export function formatLocation(lat?: number, lon?: number): string {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return 'Location unknown'
  }

  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`
}
