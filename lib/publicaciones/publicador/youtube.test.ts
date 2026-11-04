import { describe, expect, it } from 'vitest'
import type { EstadoSubidaYt } from '@/lib/integrations/youtube/subida'
import { avanzarYoutube, PARTE_YT, tituloParaYoutube, type DepsYoutube } from './youtube'

const AHORA = new Date('2026-11-04T15:00:00Z')

function escenario(total: number, opciones: { msPorParte?: number; vencida?: boolean; yaTerminada?: string } = {}) {
  let reloj = AHORA.getTime()
  let subido = 0
  let sesiones = 0
  const deps: DepsYoutube = {
    ahora: () => reloj,
    crearSesion: async () => `https://www.googleapis.com/upload/youtube/v3/videos?upload_id=${++sesiones}`,
    estadoSubida: async (): Promise<EstadoSubidaYt> => {
      if (opciones.yaTerminada) return { tipo: 'terminada', videoId: opciones.yaTerminada }
      if (opciones.vencida && sesiones === 0) return { tipo: 'vencida' }
      return { tipo: 'parcial', offset: subido }
    },
    leerParte: async (_u, desde, hasta) => {
      reloj += (opciones.msPorParte ?? 1000) / 2
      return new Uint8Array(hasta - desde + 1)
    },
    subirParte: async (_u, desde, bytes) => {
      reloj += (opciones.msPorParte ?? 1000) / 2
      expect(desde).toBe(subido)
      subido = desde + bytes.length
      return subido >= total ? { tipo: 'terminada', videoId: 'VID' } : { tipo: 'parcial', offset: subido }
    },
  }
  return { deps, sesiones: () => sesiones, subido: () => subido }
}

const pieza = (total: number) => ({ videoUrl: 'https://x/video.mp4', descripcion: 'Desc', titulo: 'Título', tamanoBytes: total, duracionSeg: 40 })
const ctx = (plazoMs = 12_000) => ({ ahora: AHORA, antes: async () => undefined, plazo: AHORA.getTime() + plazoMs })

describe('avanzarYoutube', () => {
  it('un video chico se abre y se sube en la misma vuelta, y queda publicado con su enlace de Short', async () => {
    const e = escenario(PARTE_YT + 10, { msPorParte: 200 })
    const r = await avanzarYoutube({ etapa: null, ids_externos: {} }, pieza(PARTE_YT + 10), e.deps, ctx())
    expect(r).toMatchObject({ estado: 'publicado', ids: { video_id: 'VID' }, enlace: 'https://www.youtube.com/shorts/VID' })
  })

  it('uno grande avanza lo que entra y sigue en la vuelta siguiente desde donde quedó', async () => {
    const total = PARTE_YT * 5
    const e = escenario(total, { msPorParte: 3000 })
    const r1 = await avanzarYoutube({ etapa: null, ids_externos: {} }, pieza(total), e.deps, ctx(8000))
    expect(r1).toMatchObject({ estado: 'en_curso', etapa: 'subiendo' })
    expect(e.subido()).toBeGreaterThan(0)
    expect(e.subido()).toBeLessThan(total)
    const r2 = await avanzarYoutube({ etapa: r1.etapa, ids_externos: r1.ids }, pieza(total), e.deps, { ...ctx(8000), plazo: e.deps.ahora() + 8000 })
    expect(r2.ids.upload_url).toBe(r1.ids.upload_url)
    expect(e.sesiones()).toBe(1)
  })

  it('si la subida ya había terminado (la corrida anterior murió al final), marca publicado SIN subir de nuevo', async () => {
    const e = escenario(100, { yaTerminada: 'VIEJO' })
    const r = await avanzarYoutube({ etapa: 'subiendo', ids_externos: { upload_url: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=1' } }, pieza(100), e.deps, ctx())
    expect(r).toMatchObject({ estado: 'publicado', ids: { video_id: 'VIEJO' } })
    expect(e.sesiones()).toBe(0)
  })

  it('una sesión vencida (nunca terminó) abre otra y sigue', async () => {
    const e = escenario(100, { vencida: true })
    const r = await avanzarYoutube({ etapa: 'subiendo', ids_externos: { upload_url: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=0' } }, pieza(100), e.deps, ctx())
    expect(e.sesiones()).toBe(1)
    expect(r.estado).toBe('publicado')
  })

  it('la sesión se anota ANTES de mandar bytes: si se corta la última parte, la vuelta siguiente NO sube otro video', async () => {
    const e = escenario(100)
    const anotados: Record<string, unknown>[] = []
    let llego = false
    const deps: DepsYoutube = {
      ...e.deps,
      subirParte: async () => {
        llego = true // Google recibió todo y creó el video…
        throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) // …pero la respuesta no llegó a tiempo.
      },
    }
    const c = { ...ctx(), anotarIds: async (_etapa: string, ids: Record<string, unknown>) => void anotados.push(ids) }
    await expect(avanzarYoutube({ etapa: null, ids_externos: {} }, pieza(100), deps, c)).rejects.toThrow()
    expect(llego).toBe(true)
    expect(anotados[0]).toMatchObject({ upload_url: expect.stringContaining('upload_id=1') })
    // La corrida siguiente arranca con lo anotado: le pregunta a la sesión y encuentra el video hecho.
    const despues = escenario(100, { yaTerminada: 'VID_UNICO' })
    const r = await avanzarYoutube({ etapa: 'subiendo', ids_externos: anotados[0] }, pieza(100), despues.deps, ctx())
    expect(r).toMatchObject({ estado: 'publicado', ids: { video_id: 'VID_UNICO' } })
    expect(despues.sesiones()).toBe(0)
  })

  it('pasadas 12 horas sin terminar, se avisa en vez de seguir para siempre', async () => {
    const e = escenario(PARTE_YT * 3)
    const viejo = new Date(AHORA.getTime() - 13 * 3600_000).toISOString()
    const r = await avanzarYoutube(
      { etapa: 'subiendo', ids_externos: { upload_url: 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=9', inicio_at: viejo } },
      pieza(PARTE_YT * 3),
      e.deps,
      ctx(),
    )
    expect(r).toMatchObject({ estado: 'fallido', error: expect.stringMatching(/12 horas/) })
  })

  it('si YouTube lo dejó privado (proyecto sin auditar), queda anotado para avisarlo', async () => {
    const e = escenario(10, { msPorParte: 10 })
    const r = await avanzarYoutube({ etapa: null, ids_externos: {} }, pieza(10), { ...e.deps, privacidad: async () => 'private' }, ctx())
    expect(r).toMatchObject({ estado: 'publicado', ids: { privado: true } })
  })

  it('un video de más de 3 minutos enlaza como video común, no como Short', async () => {
    const e = escenario(10, { msPorParte: 10 })
    const r = await avanzarYoutube({ etapa: null, ids_externos: {} }, { ...pieza(10), duracionSeg: 240 }, e.deps, ctx())
    expect(r.enlace).toBe('https://www.youtube.com/watch?v=VID')
  })

  it('sin el tamaño del archivo no se puede abrir la subida', async () => {
    const e = escenario(10)
    const r = await avanzarYoutube({ etapa: null, ids_externos: {} }, { ...pieza(10), tamanoBytes: 0 }, e.deps, ctx())
    expect(r).toMatchObject({ estado: 'fallido' })
  })
})

describe('tituloParaYoutube', () => {
  it('usa el título escrito', () => {
    expect(tituloParaYoutube('Mi título', 'desc', 'a.mp4')).toBe('Mi título')
  })

  it('sin título, la primera línea de la descripción (sin hashtags) y hasta 100 caracteres', () => {
    expect(tituloParaYoutube('', '¿Cuánto te queda en mano? #inmobiliaria\nResto', 'a.mp4')).toBe('¿Cuánto te queda en mano?')
    expect(tituloParaYoutube('  ', 'x'.repeat(300), 'a.mp4')).toHaveLength(100)
  })

  it('sin nada, el nombre del archivo sin extensión; YouTube no acepta < ni >', () => {
    expect(tituloParaYoutube('', '', 'video final.mp4')).toBe('video final')
    expect(tituloParaYoutube('a <b> c', '', 'x.mp4')).toBe('a b c')
  })
})
