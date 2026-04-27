/// <reference types="google.maps" />

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '../lib/googleMapsLoader'
import type { PartyTargetView } from '../lib/party'

type StreetViewPanelProps = {
  mode: 'moving' | 'non-moving'
  view: PartyTargetView & {
    id?: string
    name?: string
  }
}

export function StreetViewPanel({ mode, view }: StreetViewPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStreetView() {
      if (!containerRef.current) {
        return
      }

      try {
        await loadGoogleMaps()

        if (cancelled || !containerRef.current) {
          return
        }

        let panoramaResult: google.maps.StreetViewResponse | null = null

        if (!view.panoId) {
          const streetViewService = new google.maps.StreetViewService()
          const searchRadii = [300, 1200, 5000]

          for (const radius of searchRadii) {
            try {
              panoramaResult = await streetViewService.getPanorama({
                location: { lat: view.lat, lng: view.lng },
                radius,
                preference: google.maps.StreetViewPreference.NEAREST,
              })

              if (panoramaResult?.data.location?.pano) {
                break
              }
            } catch {
              panoramaResult = null
            }
          }
        }

        if (cancelled || !containerRef.current) {
          return
        }

        const panoId = view.panoId ?? panoramaResult?.data.location?.pano
        const panoPosition =
          panoramaResult?.data.location?.latLng ??
          new google.maps.LatLng(view.lat, view.lng)
        const panoHeading = panoramaResult?.data.tiles?.centerHeading ?? 34

        if (!panoId || !panoPosition) {
          setError(`Street View is not available for ${view.name ?? 'this round'}.`)
          return
        }

        containerRef.current.innerHTML = ''
        panoramaRef.current = new google.maps.StreetViewPanorama(containerRef.current, {
          pano: panoId,
          position: panoPosition,
          pov: {
            heading: view.heading || panoHeading,
            pitch: view.pitch,
          },
          zoom: 1,
          addressControl: false,
          disableDefaultUI: true,
          enableCloseButton: false,
          fullscreenControl: false,
          linksControl: mode === 'moving',
          panControl: false,
          clickToGo: mode === 'moving',
          scrollwheel: true,
          showRoadLabels: false,
          zoomControl: false,
          motionTracking: false,
        })

        panoramaRef.current.setVisible(true)

        setError(null)
      } catch (loadError) {
        console.error('Street View error:', loadError)

        if (!cancelled) {
          setError(`Street View could not be loaded for ${view.name ?? 'this round'}.`)
        }
      }
    }

    loadStreetView()

    return () => {
      cancelled = true
    }
  }, [mode, view.heading, view.id, view.lat, view.lng, view.name, view.pitch])

  if (error) {
    return (
      <div className="streetview-fallback moving-fallback-image">
        <div className="moving-fallback-copy">
          <p className="game-label">Moving Mode</p>
          <h2>{view.name ?? 'Current location'}</h2>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return <div ref={containerRef} className="streetview-canvas" />
}
