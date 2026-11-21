import { describe, expect, it } from 'vitest'
import { resumenReels, type ComentarioReelRow, type ReelRow } from './reels'
import type { LeadRow } from './comercial'

const reel = (id: string, o: Partial<ReelRow> = {}): ReelRow => ({ id, property_id: 'p-' + id, automatizacion_activa: true, simulacro: false, publicado_en: '2026-10-16T10:00:00Z', ig_media_id: 'm-' + id, ...o })
const com = (reel_id: string, o: Partial<ComentarioReelRow> = {}): ComentarioReelRow => ({ reel_id, coincide: true, simulado: false, dm_enviado_en: null, created_at: '2026-10-20T12:00:00Z', ig_user_id: 'u1', ...o })
const lead = (o: Partial<LeadRow>): LeadRow => ({ property_id: 'p-42661eee', source: 'landing', utm: { utm_source: 'instagram', utm_medium: 'reel', utm_content: 'reel_42661eee' }, created_at: '2026-10-25T12:00:00Z', suspected_bot: false, deleted_at: null, email: 'a@x.com', ...o })
const nov = { desde: '2026-11-01', hasta: '2026-11-20' }

describe('resumenReels', () => {
  const R = '42661eee-6558-4e53-b36b-ceb2f45339aa'
  it('cuenta comentarios, personas, privados, visitas y registros desde que se publicó', () => {
    const r = resumenReels({
      reels: [reel(R)],
      comentarios: [
        com(R, { ig_user_id: 'u1', dm_enviado_en: '2026-10-20T12:01:00Z' }), com(R, { ig_user_id: 'u1' }), com(R, { ig_user_id: 'u2', dm_enviado_en: '2026-11-02T12:01:00Z', created_at: '2026-11-02T12:00:00Z' }),
        com(R, { ig_user_id: 'u3', simulado: true }), // un comentario simulado (modo prueba) no cuenta
      ],
      visitas: [{ utm_content: 'reel_42661eee', visited_at: '2026-10-21T12:00:00Z' }, { utm_content: 'reel_42661eee', visited_at: '2026-11-03T12:00:00Z' }, { utm_content: 'reel_otro', visited_at: '2026-11-03T12:00:00Z' }],
      leads: [lead({}), lead({ created_at: '2026-11-04T12:00:00Z' }), lead({ email: 'b@x.com', created_at: '2026-11-05T12:00:00Z' }), lead({ suspected_bot: true, email: 'c@x.com' })],
      direcciones: new Map([['p-' + R, 'Jean Jaures 1185']]),
      vistas: new Map([['m-' + R, 10_607]]),
      rango: nov,
    })
    expect(r.filas[0]).toMatchObject({
      direccion: 'Jean Jaures 1185', conRespuesta: true, vistas: 10_607,
      comentarios: 3, personasComentaron: 2, privados: 2, visitas: 2, registros: 3, personasRegistradas: 2,
      comentariosPorRegistro: 1.5, privadosPorRegistro: 1,
      periodo: { comentarios: 1, privados: 1, visitas: 1, registros: 2 },
    })
  })
  it('un reel sin respuesta automática se marca y no tiene "por registro"', () => {
    const r = resumenReels({ reels: [reel('9949eac4', { automatizacion_activa: false, simulacro: true })], comentarios: [com('9949eac4', { simulado: false })], visitas: [], leads: [], direcciones: new Map(), vistas: new Map(), rango: nov })
    expect(r.filas[0]).toMatchObject({ conRespuesta: false, vistas: null, comentarios: 1, registros: 0, comentariosPorRegistro: null })
  })
  it('el total suma solo los reels con respuesta automática', () => {
    const r = resumenReels({
      reels: [reel('a'), reel('b', { automatizacion_activa: false })],
      comentarios: [com('a'), com('b'), com('b')], visitas: [], leads: [], direcciones: new Map(), vistas: new Map([['m-a', 100], ['m-b', 50]]), rango: nov,
    })
    expect(r.total).toMatchObject({ comentarios: 1, vistas: 100 })
  })
})
