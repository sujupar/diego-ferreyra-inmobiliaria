import { describe, it, expect } from 'vitest'
import { mapTestimonialRow, type FunnelTestimonialRow } from './testimonials'

const row: FunnelTestimonialRow = {
  id: 'uuid-1',
  key: 'federico',
  client_name: 'Federico',
  location: 'Propietario en Zona Norte',
  title: 'Venta Récord en 25 Días',
  result_badge: 'Vendió en 25 días',
  quote: 'Vendimos 3 propiedades...',
  video_url: 'https://x/v.mp4',
  poster_url: 'https://x/p.jpg',
  is_vertical: true,
  sort_order: 1,
  active: true,
}

describe('mapTestimonialRow', () => {
  it('mapea la fila al modelo de UI', () => {
    const t = mapTestimonialRow(row)
    expect(t).toEqual({
      key: 'federico',
      clientName: 'Federico',
      location: 'Propietario en Zona Norte',
      title: 'Venta Récord en 25 Días',
      resultBadge: 'Vendió en 25 días',
      quote: 'Vendimos 3 propiedades...',
      videoUrl: 'https://x/v.mp4',
      posterUrl: 'https://x/p.jpg',
      isVertical: true,
    })
  })

  it('result_badge null → resultBadge null', () => {
    expect(mapTestimonialRow({ ...row, result_badge: null }).resultBadge).toBeNull()
  })
})
