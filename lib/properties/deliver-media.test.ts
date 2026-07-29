import { describe, it, expect } from 'vitest'
import { resolveDeliverMedia, needsDeliveryChoice } from './deliver-media'

const VID = 'https://youtu.be/abc'
const TOUR = 'https://tour.example/123'

describe('resolveDeliverMedia', () => {
  it('respeta la elección del asesor cuando hay ambos', () => {
    expect(resolveDeliverMedia({ video_recorrido_url: VID, tour_3d_url: TOUR, deliver_media: 'tour_3d' }))
      .toEqual({ kind: 'tour_3d', url: TOUR })
    expect(resolveDeliverMedia({ video_recorrido_url: VID, tour_3d_url: TOUR, deliver_media: 'video_recorrido' }))
      .toEqual({ kind: 'video_recorrido', url: VID })
  })

  it('sin elección y con ambos, prefiere el video recorrido', () => {
    expect(resolveDeliverMedia({ video_recorrido_url: VID, tour_3d_url: TOUR }))
      .toEqual({ kind: 'video_recorrido', url: VID })
  })

  it('usa el único disponible aunque la elección diga otra cosa', () => {
    // El asesor eligió tour pero después se borró el tour: no puede quedar vacío.
    expect(resolveDeliverMedia({ video_recorrido_url: VID, tour_3d_url: null, deliver_media: 'tour_3d' }))
      .toEqual({ kind: 'video_recorrido', url: VID })
    expect(resolveDeliverMedia({ video_recorrido_url: null, tour_3d_url: TOUR, deliver_media: 'video_recorrido' }))
      .toEqual({ kind: 'tour_3d', url: TOUR })
  })

  it('sin nada, cae a las fotos', () => {
    expect(resolveDeliverMedia({})).toEqual({ kind: 'fotos', url: null })
  })
})

describe('needsDeliveryChoice', () => {
  it('solo pregunta si hay ambos', () => {
    expect(needsDeliveryChoice({ video_recorrido_url: VID, tour_3d_url: TOUR })).toBe(true)
    expect(needsDeliveryChoice({ video_recorrido_url: VID })).toBe(false)
    expect(needsDeliveryChoice({ tour_3d_url: TOUR })).toBe(false)
    expect(needsDeliveryChoice({})).toBe(false)
  })
})
