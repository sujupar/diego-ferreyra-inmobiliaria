import { describe, it, expect } from 'vitest'
import { resolveDeliverMedia, needsDeliveryChoice } from './deliver-media'

const VID = 'https://youtu.be/abc'
const TOUR = 'https://tour.example/123'
const VIDEO_FILE = 'https://storage.example/videos/propiedad.mp4'
const VIDEO_LINK = 'https://youtu.be/xyz'

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

  // Video propio (fallback, 2026-08-02): sin recorrido dedicado ni tour, el
  // video "de marketing" de la propiedad pasa a ser el entregable.
  it('sin recorrido ni tour, usa el video propio de la propiedad', () => {
    expect(resolveDeliverMedia({ video_file_url: VIDEO_FILE })).toEqual({ kind: 'video_propio', url: VIDEO_FILE })
    expect(resolveDeliverMedia({ video_url: VIDEO_LINK })).toEqual({ kind: 'video_propio', url: VIDEO_LINK })
  })

  it('video propio: prefiere el archivo subido sobre el enlace externo', () => {
    expect(resolveDeliverMedia({ video_file_url: VIDEO_FILE, video_url: VIDEO_LINK }))
      .toEqual({ kind: 'video_propio', url: VIDEO_FILE })
  })

  it('el video propio NUNCA gana si hay recorrido o tour (orden de preferencia)', () => {
    expect(resolveDeliverMedia({ video_recorrido_url: VID, video_file_url: VIDEO_FILE }))
      .toEqual({ kind: 'video_recorrido', url: VID })
    expect(resolveDeliverMedia({ tour_3d_url: TOUR, video_file_url: VIDEO_FILE }))
      .toEqual({ kind: 'tour_3d', url: TOUR })
  })

  it('con recorrido/tour + video propio, respeta la elección del asesor si sigue disponible', () => {
    expect(resolveDeliverMedia({ video_recorrido_url: VID, video_file_url: VIDEO_FILE, deliver_media: 'video_propio' }))
      .toEqual({ kind: 'video_propio', url: VIDEO_FILE })
  })

  it('si la elección guardada ya no está disponible, cae al orden de preferencia (nunca vacío)', () => {
    expect(resolveDeliverMedia({ video_file_url: VIDEO_FILE, deliver_media: 'tour_3d' }))
      .toEqual({ kind: 'video_propio', url: VIDEO_FILE })
  })
})

describe('needsDeliveryChoice', () => {
  it('solo pregunta si hay dos o más candidatos disponibles', () => {
    expect(needsDeliveryChoice({ video_recorrido_url: VID, tour_3d_url: TOUR })).toBe(true)
    expect(needsDeliveryChoice({ video_recorrido_url: VID })).toBe(false)
    expect(needsDeliveryChoice({ tour_3d_url: TOUR })).toBe(false)
    expect(needsDeliveryChoice({})).toBe(false)
  })

  it('también pregunta cuando el video propio compite con recorrido/tour', () => {
    expect(needsDeliveryChoice({ video_recorrido_url: VID, video_file_url: VIDEO_FILE })).toBe(true)
    expect(needsDeliveryChoice({ tour_3d_url: TOUR, video_url: VIDEO_LINK })).toBe(true)
    expect(needsDeliveryChoice({ video_recorrido_url: VID, tour_3d_url: TOUR, video_file_url: VIDEO_FILE })).toBe(true)
  })

  it('no pregunta si el único candidato es el video propio', () => {
    expect(needsDeliveryChoice({ video_file_url: VIDEO_FILE })).toBe(false)
    expect(needsDeliveryChoice({ video_url: VIDEO_LINK })).toBe(false)
  })
})
