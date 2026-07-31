'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap } from 'leaflet'

interface Props {
  lat: number
  lng: number
  /** Texto del globo del pin (dirección de la propiedad). */
  label: string
}

/**
 * Mapa de SOLO LECTURA de la ficha. Leaflet se importa dentro del efecto
 * (nunca en el módulo) porque toca `window` y rompería el render de servidor.
 */
export function PropertyLocationMap({ lat, lng, label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !ref.current || mapRef.current) return

      const map = L.map(ref.current, { scrollWheelZoom: false }).setView([lat, lng], 16)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map)

      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41],
      })
      L.marker([lat, lng], { icon }).addTo(map).bindTooltip(label)

      mapRef.current = map
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Si las coordenadas cambian (edición en otra pestaña), recentra.
  useEffect(() => {
    mapRef.current?.setView([lat, lng], 16)
  }, [lat, lng])

  return <div ref={ref} className="h-[260px] w-full rounded-2xl border z-0" />
}
