import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

let mapsConfigured = false

export async function loadGoogleMaps() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    throw new Error('Google Maps API key is missing.')
  }

  if (!mapsConfigured) {
    setOptions({
      key: apiKey,
      v: 'weekly',
    })
    mapsConfigured = true
  }

  await importLibrary('maps')
}
