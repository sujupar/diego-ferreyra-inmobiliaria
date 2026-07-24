'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, Marker } from 'leaflet'

interface Props {
  lat: number | null
  lng: number | null
  defaultCenter: [number, number]
  onChange: (lat: number, lng: number) => void
}

/** Mini-mapa OSM con pin arrastrable. Se muestra SIEMPRE: si no hay lat/lng,
 *  centra en defaultCenter y el asesor coloca el pin con un click o arrastrándolo. */
export function GeoPinMap({ lat, lng, defaultCenter, onChange }: Props) {
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
      const hasPin = lat != null && lng != null
      const center: [number, number] = hasPin ? [lat!, lng!] : defaultCenter
      const map = L.map(ref.current).setView(center, hasPin ? 16 : 14)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map)
      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41],
      })
      if (hasPin) {
        const marker = L.marker([lat!, lng!], { draggable: true, icon }).addTo(map)
        marker.on('dragend', () => { const p = marker.getLatLng(); onChangeRef.current(p.lat, p.lng) })
        markerRef.current = marker
      }
      // Click en el mapa: coloca/mueve el pin (clave cuando el geocode falló).
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        const { lat: la, lng: ln } = e.latlng
        if (!markerRef.current) {
          const marker = L.marker([la, ln], { draggable: true, icon }).addTo(map)
          marker.on('dragend', () => { const p = marker.getLatLng(); onChangeRef.current(p.lat, p.lng) })
          markerRef.current = marker
        } else {
          markerRef.current.setLatLng([la, ln])
        }
        onChangeRef.current(la, ln)
      })
      mapRef.current = map
    })()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza el pin si lat/lng cambian desde afuera (ej. geocoding).
  useEffect(() => {
    const map = mapRef.current
    if (!map || lat == null || lng == null) return
    if (!markerRef.current) return // se creará por click/drag; evitamos duplicar en el mount
    const cur = markerRef.current.getLatLng()
    if (Math.abs(cur.lat - lat) < 1e-7 && Math.abs(cur.lng - lng) < 1e-7) return
    markerRef.current.setLatLng([lat, lng])
    map.setView([lat, lng], 16)
  }, [lat, lng])

  return <div ref={ref} className="h-56 w-full rounded-lg border z-0" />
}
