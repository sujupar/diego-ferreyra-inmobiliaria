import { describe, expect, it, vi } from 'vitest'
import {
  avanzarFacebook,
  avanzarInstagram,
  PLAZO_MAXIMO_MS,
  type Contexto,
  type DepsFacebook,
  type DepsInstagram,
} from './redes'

const AHORA = new Date('2026-10-30T15:00:00Z')
const pieza = { videoUrl: 'https://x.supabase.co/storage/v1/object/public/contenido-videos/tandas/t/v/video.mp4', descripcion: 'Hola', duracionSeg: 30 }

function ctx(): Contexto & { marcas: string[] } {
  const marcas: string[] = []
  return { marcas, ahora: AHORA, antes: async (etapa) => void marcas.push(etapa) }
}

function depsIg(estado: 'LISTO' | 'EN_PROCESO' | 'YA_PUBLICADO' | 'ERROR' | 'VENCIDO' = 'LISTO'): DepsInstagram {
  return {
    crearContenedor: vi.fn(async () => 'c1'),
    estadoContenedor: vi.fn(async () => estado),
    publicarContenedor: vi.fn(async () => ({ igMediaId: 'm1', permalink: 'https://www.instagram.com/reel/abc/' })),
  }
}

const enContenedor = { etapa: 'contenedor', ids_externos: { creation_id: 'c1', inicio_at: AHORA.toISOString() } }

describe('avanzarInstagram', () => {
  it('sin etapa crea el contenedor, anota cuándo empezó y espera', async () => {
    const d = depsIg()
    const r = await avanzarInstagram({ etapa: null, ids_externos: {} }, pieza, d, ctx())
    expect(r).toMatchObject({ etapa: 'contenedor', ids: { creation_id: 'c1', inicio_at: AHORA.toISOString() }, estado: 'en_curso' })
  })

  it('con el contenedor listo publica y guarda el enlace', async () => {
    const r = await avanzarInstagram(enContenedor, pieza, depsIg('LISTO'), ctx())
    expect(r).toMatchObject({ estado: 'publicado', enlace: 'https://www.instagram.com/reel/abc/', ids: { creation_id: 'c1', media_id: 'm1' } })
  })

  it('si el contenedor YA está publicado no publica otra vez', async () => {
    const d = depsIg('YA_PUBLICADO')
    const r = await avanzarInstagram(enContenedor, pieza, d, ctx())
    expect(r.estado).toBe('publicado')
    expect(d.publicarContenedor).not.toHaveBeenCalled()
  })

  it('un contenedor con error falla; tras Reintentar arranca uno nuevo', async () => {
    const r1 = await avanzarInstagram(enContenedor, pieza, depsIg('ERROR'), ctx())
    expect(r1.estado).toBe('fallido')
    const r2 = await avanzarInstagram({ ...enContenedor, ids_externos: { ...enContenedor.ids_externos, reintento: true } }, pieza, depsIg('ERROR'), ctx())
    expect(r2).toMatchObject({ etapa: null, ids: {}, estado: 'en_curso' })
  })

  it('Reintentar sobre un contenedor que en realidad salió no publica de nuevo', async () => {
    const d = depsIg('YA_PUBLICADO')
    const r = await avanzarInstagram({ ...enContenedor, ids_externos: { ...enContenedor.ids_externos, reintento: true } }, pieza, d, ctx())
    expect(r.estado).toBe('publicado')
    expect(d.crearContenedor).not.toHaveBeenCalled()
  })

  it('un contenedor vencido arranca de cero, pero no más de 2 veces', async () => {
    const r1 = await avanzarInstagram(enContenedor, pieza, depsIg('VENCIDO'), ctx())
    expect(r1).toMatchObject({ etapa: null, ids: { recreados: 1 }, estado: 'en_curso' })
    const r2 = await avanzarInstagram({ ...enContenedor, ids_externos: { ...enContenedor.ids_externos, recreados: 2 } }, pieza, depsIg('VENCIDO'), ctx())
    expect(r2.estado).toBe('fallido')
  })

  it('si Meta no termina en el plazo máximo, falla con motivo', async () => {
    const viejo = new Date(AHORA.getTime() - PLAZO_MAXIMO_MS - 1000).toISOString()
    const r = await avanzarInstagram({ etapa: 'contenedor', ids_externos: { creation_id: 'c1', inicio_at: viejo } }, pieza, depsIg('EN_PROCESO'), ctx())
    expect(r.estado).toBe('fallido')
    expect(r.error).toMatch(/12 horas/)
  })
})

type EstadoFb = Awaited<ReturnType<DepsFacebook['estado']>>
function depsFb(estado: Partial<EstadoFb> = {}): DepsFacebook {
  const e: EstadoFb = { estado: 'procesando', enlace: null, listoParaPublicar: true, publicacionPedida: false, ...estado }
  return {
    iniciar: vi.fn(async () => 'f1'),
    subir: vi.fn(async () => {}),
    publicar: vi.fn(async () => {}),
    videoComun: vi.fn(async () => 'v-comun'),
    estado: vi.fn(async () => e),
  }
}
const ids = (extra: Record<string, unknown> = {}) => ({ video_id: 'f1', inicio_at: AHORA.toISOString(), ...extra })

describe('avanzarFacebook', () => {
  it('sin etapa inicia la subida', async () => {
    const r = await avanzarFacebook({ etapa: null, ids_externos: {} }, pieza, depsFb(), ctx())
    expect(r).toMatchObject({ etapa: 'iniciado', ids: { video_id: 'f1' }, estado: 'en_curso' })
  })

  it('iniciado sube el archivo por URL', async () => {
    const d = depsFb()
    const r = await avanzarFacebook({ etapa: 'iniciado', ids_externos: ids() }, pieza, d, ctx())
    expect(d.subir).toHaveBeenCalledWith('f1', pieza.videoUrl)
    expect(r.etapa).toBe('subido')
  })

  it('subido y con la subida completa: anota ANTES y después pide publicar', async () => {
    const d = depsFb()
    const c = ctx()
    const r = await avanzarFacebook({ etapa: 'subido', ids_externos: ids() }, pieza, d, c)
    expect(c.marcas).toEqual(['publicando'])
    expect(d.publicar).toHaveBeenCalledWith('f1', 'Hola')
    expect(r.etapa).toBe('publicando')
  })

  it('subido pero Facebook todavía baja el archivo: espera sin pedir publicar', async () => {
    const d = depsFb({ listoParaPublicar: false })
    const r = await avanzarFacebook({ etapa: 'subido', ids_externos: ids() }, pieza, d, ctx())
    expect(d.publicar).not.toHaveBeenCalled()
    expect(r).toMatchObject({ etapa: 'subido', estado: 'en_curso' })
  })

  it('si la publicación ya se había pedido (la función murió), no la pide de nuevo', async () => {
    const d = depsFb({ listoParaPublicar: false, publicacionPedida: true })
    const r = await avanzarFacebook({ etapa: 'subido', ids_externos: ids() }, pieza, d, ctx())
    expect(d.publicar).not.toHaveBeenCalled()
    expect(r.etapa).toBe('publicando')
  })

  it('si ya figura publicado no vuelve a publicar', async () => {
    const d = depsFb({ estado: 'publicado', enlace: 'https://www.facebook.com/reel/f1/' })
    const r = await avanzarFacebook({ etapa: 'subido', ids_externos: ids() }, pieza, d, ctx())
    expect(d.publicar).not.toHaveBeenCalled()
    expect(r).toMatchObject({ estado: 'publicado', enlace: 'https://www.facebook.com/reel/f1/' })
  })

  it('un error de procesamiento falla; tras Reintentar arranca de cero', async () => {
    const r1 = await avanzarFacebook({ etapa: 'publicando', ids_externos: ids() }, pieza, depsFb({ estado: 'error' }), ctx())
    expect(r1.estado).toBe('fallido')
    const r2 = await avanzarFacebook({ etapa: 'publicando', ids_externos: ids({ reintento: true }) }, pieza, depsFb({ estado: 'error' }), ctx())
    expect(r2).toMatchObject({ etapa: null, ids: {}, estado: 'en_curso' })
  })

  it('Reintentar sobre un reel que en realidad salió no publica de nuevo', async () => {
    const d = depsFb({ estado: 'publicado', enlace: 'https://www.facebook.com/reel/f1/' })
    const r = await avanzarFacebook({ etapa: 'publicando', ids_externos: ids({ reintento: true }) }, pieza, d, ctx())
    expect(r.estado).toBe('publicado')
    expect(d.iniciar).not.toHaveBeenCalled()
  })

  describe('video de más de 90 segundos (video normal de la Página)', () => {
    const largo = { ...pieza, duracionSeg: 103 }

    it('anota ANTES de mandarlo, porque ese pedido publica de una', async () => {
      const d = depsFb()
      const c = ctx()
      const r = await avanzarFacebook({ etapa: null, ids_externos: {} }, largo, d, c)
      expect(c.marcas).toEqual(['video_comun_enviado'])
      expect(d.videoComun).toHaveBeenCalledWith(pieza.videoUrl, 'Hola')
      expect(r).toMatchObject({ etapa: 'publicando', ids: { video_id: 'v-comun', tipo: 'video' }, estado: 'en_curso' })
    })

    it('si el pedido falla, NO se reintenta solo: puede haber salido', async () => {
      const d = depsFb()
      ;(d.videoComun as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error('x'), { httpStatus: 503 }))
      const r = await avanzarFacebook({ etapa: null, ids_externos: {} }, largo, d, ctx())
      expect(r.estado).toBe('fallido')
      expect(r.error).toMatch(/revisá la Página/i)
    })

    it('si la función murió después de mandarlo, falla pidiendo revisar la Página (nunca lo vuelve a mandar)', async () => {
      const d = depsFb()
      const r = await avanzarFacebook({ etapa: 'video_comun_enviado', ids_externos: {} }, largo, d, ctx())
      expect(d.videoComun).not.toHaveBeenCalled()
      expect(r.estado).toBe('fallido')
    })

    it('con Reintentar (la persona revisó la Página y no salió) se manda de nuevo', async () => {
      const d = depsFb()
      const r = await avanzarFacebook({ etapa: 'video_comun_enviado', ids_externos: { reintento: true } }, largo, d, ctx())
      expect(d.videoComun).toHaveBeenCalled()
      expect(r.etapa).toBe('publicando')
    })
  })

  it('una etapa sin el identificador que necesita arranca de cero', async () => {
    const r = await avanzarFacebook({ etapa: 'subido', ids_externos: {} }, pieza, depsFb(), ctx())
    expect(r).toMatchObject({ etapa: null, ids: {}, estado: 'en_curso' })
  })

  it('si Facebook no termina en el plazo máximo, falla con motivo', async () => {
    const viejo = new Date(AHORA.getTime() - PLAZO_MAXIMO_MS - 1000).toISOString()
    const r = await avanzarFacebook({ etapa: 'publicando', ids_externos: ids({ inicio_at: viejo }) }, pieza, depsFb(), ctx())
    expect(r.estado).toBe('fallido')
  })
})
