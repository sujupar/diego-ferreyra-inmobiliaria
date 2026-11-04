import { describe, expect, it } from 'vitest'
import { MB } from '@/lib/integrations/tiktok/subida'
import { avanzarTiktok, type DepsTiktok } from './tiktok'

const AHORA = new Date('2026-11-04T15:00:00Z')
const URL_SUBIDA = 'https://open-upload.tiktokapis.com/video/?upload_id=1'

function escenario(opciones: { msPorParte?: number; status?: string; motivo?: string } = {}) {
  let reloj = AHORA.getTime()
  let iniciadas = 0
  const subidas: number[] = []
  const deps: DepsTiktok = {
    ahora: () => reloj,
    iniciar: async () => ({ publishId: `P${++iniciadas}`, uploadUrl: URL_SUBIDA }),
    estado: async () => ({ status: opciones.status ?? 'PROCESSING_UPLOAD', motivo: opciones.motivo ?? null }),
    leerParte: async (_u, desde, hasta) => {
      reloj += (opciones.msPorParte ?? 1000) / 2
      return new Uint8Array(hasta - desde + 1)
    },
    subirParte: async (_u, desde, bytes, total) => {
      reloj += (opciones.msPorParte ?? 1000) / 2
      subidas.push(desde)
      return desde + bytes.length >= total ? 'completa' : 'parcial'
    },
  }
  return { deps, iniciadas: () => iniciadas, subidas }
}

const pieza = (total: number) => ({ videoUrl: 'https://x/v.mp4', descripcion: 'd', tamanoBytes: total })
const ctx = (plazoMs = 12_000) => ({ ahora: AHORA, antes: async () => undefined, plazo: AHORA.getTime() + plazoMs })

describe('avanzarTiktok', () => {
  it('inicia, sube todas las partes que entran y queda esperando que TikTok lo pase a borradores', async () => {
    const e = escenario({ msPorParte: 200 })
    const r = await avanzarTiktok({ etapa: null, ids_externos: {} }, pieza(20 * MB), e.deps, ctx())
    expect(e.subidas).toEqual([0, 8 * MB])
    expect(r).toMatchObject({ estado: 'en_curso', etapa: 'procesando', ids: { publish_id: 'P1', siguiente: 2 } })
  })

  it('cuando TikTok lo mandó a la bandeja queda como borrador listo', async () => {
    const e = escenario({ status: 'SEND_TO_USER_INBOX' })
    const r = await avanzarTiktok({ etapa: 'procesando', ids_externos: { publish_id: 'P1', siguiente: 2, upload_url: URL_SUBIDA, iniciado_at: AHORA.toISOString() } }, pieza(20 * MB), e.deps, ctx())
    expect(r).toMatchObject({ estado: 'publicado', enlace: null })
  })

  it('con poco tiempo sube lo que entra y sigue desde la parte siguiente', async () => {
    const e = escenario({ msPorParte: 5000 })
    const r1 = await avanzarTiktok({ etapa: null, ids_externos: {} }, pieza(30 * MB), e.deps, ctx(8000))
    expect(r1).toMatchObject({ etapa: 'subiendo', ids: { siguiente: 1 } })
    const r2 = await avanzarTiktok({ etapa: r1.etapa, ids_externos: r1.ids }, pieza(30 * MB), e.deps, { ...ctx(), plazo: e.deps.ahora() + 8000 })
    expect(r2.ids.siguiente).toBe(2)
    expect(e.iniciadas()).toBe(1)
  })

  it('si la dirección de subida venció (1 hora) antes de terminar, arranca otra', async () => {
    const e = escenario({ msPorParte: 100 })
    const viejo = new Date(AHORA.getTime() - 2 * 3600_000).toISOString()
    const r = await avanzarTiktok({ etapa: 'subiendo', ids_externos: { publish_id: 'P0', siguiente: 1, upload_url: URL_SUBIDA, iniciado_at: viejo } }, pieza(20 * MB), e.deps, ctx())
    expect(e.iniciadas()).toBe(1)
    expect(r.ids.publish_id).toBe('P1')
  })

  it('un rechazo de TikTok se explica', async () => {
    const e = escenario({ status: 'FAILED', motivo: 'duration_check_failed' })
    const r = await avanzarTiktok({ etapa: 'procesando', ids_externos: { publish_id: 'P1', siguiente: 2, upload_url: URL_SUBIDA, iniciado_at: AHORA.toISOString() } }, pieza(20 * MB), e.deps, ctx())
    expect(r).toMatchObject({ estado: 'fallido', error: expect.stringMatching(/TikTok no aceptó el video.*duration_check_failed/) })
  })

  it('con "Reintentar" sobre un rechazo, arranca de nuevo', async () => {
    const e = escenario({ status: 'FAILED', motivo: 'x' })
    const r = await avanzarTiktok(
      { etapa: 'procesando', ids_externos: { publish_id: 'P1', siguiente: 2, upload_url: URL_SUBIDA, iniciado_at: AHORA.toISOString(), reintento: true } },
      pieza(1 * MB),
      e.deps,
      ctx(),
    )
    expect(e.iniciadas()).toBe(1)
    expect(r.ids.publish_id).toBe('P1')
  })
})
