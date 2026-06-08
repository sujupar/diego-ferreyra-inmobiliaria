'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, Marker } from 'leaflet'

interface Props {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
}

/** Mini-mapa OSM con pin arrastrable. Carga Leaflet dinámicamente (sin SSR). */
export function GeoPinMap({ lat, lng, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !ref.current || mapRef.current) return
      const map = L.map(ref.current).setView([lat, lng], 16)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)
      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      })
      const marker = L.marker([lat, lng], { draggable: true, icon }).addTo(map)
      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onChangeRef.current(p.lat, p.lng)
      })
      mapRef.current = map
      markerRef.current = marker
    })()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza el pin SOLO si lat/lng cambian desde afuera (ej. geocoding).
  // Si el cambio vino del drag del propio marker, éste ya está en esa posición
  // → evitamos re-centrar/re-zoomear y pelear con el pan/zoom del usuario.
  useEffect(() => {
    const m = markerRef.current
    const map = mapRef.current
    if (!m || !map) return
    const cur = m.getLatLng()
    if (Math.abs(cur.lat - lat) < 1e-7 && Math.abs(cur.lng - lng) < 1e-7) return
    m.setLatLng([lat, lng])
    map.setView([lat, lng], 16)
  }, [lat, lng])

  return <div ref={ref} className="h-56 w-full rounded-lg border z-0" />
}
