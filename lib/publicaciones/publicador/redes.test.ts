import { describe, expect, it, vi } from 'vitest'
import { avanzarFacebook, avanzarInstagram, type DepsFacebook, type DepsInstagram } from './redes'

const pieza = { videoUrl: 'https://x.supabase.co/storage/v1/object/public/contenido-videos/tandas/t/v/video.mp4', descripcion: 'Hola' }

function depsIg(estado: 'LISTO' | 'EN_PROCESO' | 'YA_PUBLICADO' | 'ERROR' | 'VENCIDO' = 'LISTO'): DepsInstagram {
  return {
    crearContenedor: vi.fn(async () => 'c1'),
    estadoContenedor: vi.fn(async () => estado),
    publicarContenedor: vi.fn(async () => ({ igMediaId: 'm1', permalink: 'https://www.instagram.com/reel/abc/' })),
  }
}

describe('avanzarInstagram', () => {
  it('sin etapa crea el contenedor y espera', async () => {
    const d = depsIg()
    const r = await avanzarInstagram({ etapa: null, ids_externos: {} }, pieza, d)
    expect(r).toMatchObject({ etapa: 'contenedor', ids: { creation_id: 'c1' }, estado: 'en_curso' })
    expect(r.esperarMs).toBeGreaterThan(0)
    expect(d.crearContenedor).toHaveBeenCalledWith({ videoUrl: pieza.videoUrl, descripcion: 'Hola' })
  })

  it('con el contenedor listo publica y guarda el enlace', async () => {
    const d = depsIg('LISTO')
    const r = await avanzarInstagram({ etapa: 'contenedor', ids_externos: { creation_id: 'c1' } }, pieza, d)
    expect(r).toMatchObject({ estado: 'publicado', enlace: 'https://www.instagram.com/reel/abc/', ids: { creation_id: 'c1', media_id: 'm1' } })
  })

  it('si el contenedor YA está publicado (la función murió antes de guardar) no publica otra vez', async () => {
    const d = depsIg('YA_PUBLICADO')
    const r = await avanzarInstagram({ etapa: 'contenedor', ids_externos: { creation_id: 'c1' } }, pieza, d)
    expect(r.estado).toBe('publicado')
    expect(d.publicarContenedor).not.toHaveBeenCalled()
  })

  it('mientras procesa sigue esperando', async () => {
    const r = await avanzarInstagram({ etapa: 'contenedor', ids_externos: { creation_id: 'c1' } }, pieza, depsIg('EN_PROCESO'))
    expect(r).toMatchObject({ etapa: 'contenedor', estado: 'en_curso' })
  })

  it('un contenedor con error falla con motivo legible', async () => {
    const r = await avanzarInstagram({ etapa: 'contenedor', ids_externos: { creation_id: 'c1' } }, pieza, depsIg('ERROR'))
    expect(r.estado).toBe('fallido')
    expect(r.error).toMatch(/Instagram no pudo procesar/)
  })

  it('un contenedor vencido arranca de cero', async () => {
    const r = await avanzarInstagram({ etapa: 'contenedor', ids_externos: { creation_id: 'c1' } }, pieza, depsIg('VENCIDO'))
    expect(r).toMatchObject({ etapa: null, ids: {}, estado: 'en_curso', esperarMs: 0 })
  })
})

function depsFb(estado: 'procesando' | 'publicado' | 'error' = 'procesando'): DepsFacebook {
  return {
    iniciar: vi.fn(async () => 'f1'),
    subir: vi.fn(async () => {}),
    publicar: vi.fn(async () => {}),
    videoComun: vi.fn(async () => 'v-comun'),
    estado: vi.fn(async () => ({ estado, enlace: estado === 'publicado' ? 'https://www.facebook.com/reel/f1/' : null })),
  }
}

describe('avanzarFacebook', () => {
  it('sin etapa inicia la subida', async () => {
    const r = await avanzarFacebook({ etapa: null, ids_externos: {} }, pieza, depsFb())
    expect(r).toMatchObject({ etapa: 'iniciado', ids: { video_id: 'f1' }, estado: 'en_curso' })
  })

  it('iniciado sube el archivo por URL', async () => {
    const d = depsFb()
    const r = await avanzarFacebook({ etapa: 'iniciado', ids_externos: { video_id: 'f1' } }, pieza, d)
    expect(d.subir).toHaveBeenCalledWith('f1', pieza.videoUrl)
    expect(r.etapa).toBe('subido')
  })

  it('subido publica con la descripción', async () => {
    const d = depsFb('procesando')
    const r = await avanzarFacebook({ etapa: 'subido', ids_externos: { video_id: 'f1' } }, pieza, d)
    expect(d.publicar).toHaveBeenCalledWith('f1', 'Hola')
    expect(r.etapa).toBe('publicando')
  })

  it('si ya figura publicado no vuelve a publicar', async () => {
    const d = depsFb('publicado')
    const r = await avanzarFacebook({ etapa: 'subido', ids_externos: { video_id: 'f1' } }, pieza, d)
    expect(d.publicar).not.toHaveBeenCalled()
    expect(r).toMatchObject({ estado: 'publicado', enlace: 'https://www.facebook.com/reel/f1/' })
  })

  it('publicando termina cuando Facebook dice publicado', async () => {
    const r = await avanzarFacebook({ etapa: 'publicando', ids_externos: { video_id: 'f1' } }, pieza, depsFb('publicado'))
    expect(r).toMatchObject({ estado: 'publicado', enlace: 'https://www.facebook.com/reel/f1/' })
  })

  it('un error de procesamiento falla con motivo legible', async () => {
    const r = await avanzarFacebook({ etapa: 'publicando', ids_externos: { video_id: 'f1' } }, pieza, depsFb('error'))
    expect(r.estado).toBe('fallido')
    expect(r.error).toMatch(/Facebook no pudo procesar/)
  })

  it('un video de más de 90 segundos sale como video normal de la Página (los Reels no lo aceptan)', async () => {
    const d = depsFb()
    const r = await avanzarFacebook({ etapa: null, ids_externos: {} }, { ...pieza, duracionSeg: 103 }, d)
    expect(d.videoComun).toHaveBeenCalledWith(pieza.videoUrl, 'Hola')
    expect(d.iniciar).not.toHaveBeenCalled()
    expect(r).toMatchObject({ etapa: 'publicando', ids: { video_id: 'v-comun', tipo: 'video' }, estado: 'en_curso' })
  })

  it('una etapa sin el identificador que necesita arranca de cero', async () => {
    const r = await avanzarFacebook({ etapa: 'subido', ids_externos: {} }, pieza, depsFb())
    expect(r).toMatchObject({ etapa: null, ids: {}, estado: 'en_curso' })
  })
})
