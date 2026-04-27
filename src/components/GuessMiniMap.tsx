/// <reference types="google.maps" />

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../lib/googleMapsLoader'

type GuessMiniMapProps = {
  onGuessChange?: (coords: { lat: number; lng: number } | null) => void
}

export function GuessMiniMap({ onGuessChange }: GuessMiniMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const googleMapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.Marker | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)

  function toRoundedPosition(latLng: google.maps.LatLng) {
    return {
      lat: Number(latLng.lat().toFixed(5)),
      lng: Number(latLng.lng().toFixed(5)),
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadMap() {
      if (!mapRef.current) {
        return
      }

      try {
        await loadGoogleMaps()

        if (cancelled || !mapRef.current) {
          return
        }

        const map = new google.maps.Map(mapRef.current, {
          center: { lat: 20, lng: 0 },
          zoom: 2,
          minZoom: 2,
          maxZoom: 20,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          rotateControl: false,
          zoomControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          scrollwheel: true,
          disableDoubleClickZoom: false,
          keyboardShortcuts: false,
          styles: [
            {
              featureType: 'poi',
              stylers: [{ visibility: 'off' }],
            },
            {
              featureType: 'transit',
              stylers: [{ visibility: 'off' }],
            },
          ],
        })

        googleMapRef.current = map

        map.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (!event.latLng) {
            return
          }

          const position = toRoundedPosition(event.latLng)

          if (!markerRef.current) {
            markerRef.current = new google.maps.Marker({
              position,
              map,
              draggable: true,
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 9,
                fillColor: '#f7e29a',
                fillOpacity: 1,
                strokeColor: '#0f1720',
                strokeWeight: 2,
              },
            })

            markerRef.current.addListener('dragend', () => {
              const markerPosition = markerRef.current?.getPosition()

              if (!markerPosition) {
                return
              }

              onGuessChange?.(toRoundedPosition(markerPosition))
            })
          } else {
            markerRef.current.setPosition(position)
          }

          onGuessChange?.(position)
        })

        setMapError(null)
      } catch {
        if (!cancelled) {
          setMapError('Guess map could not be loaded.')
        }
      }
    }

    loadMap()

    return () => {
      cancelled = true
    }
  }, [onGuessChange])

  if (mapError) {
    return <div className="guess-map-fallback">{mapError}</div>
  }

  return <div ref={mapRef} className="guess-map-frame" />
}
