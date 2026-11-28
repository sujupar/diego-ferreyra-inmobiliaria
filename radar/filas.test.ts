import { describe, expect, it } from 'vitest'
import { armarFilaVideoRef } from './filas'
import type { Analisis, Clasificacion, CuentaPerfil, ReelCrudo } from './tipos'

const reel: ReelCrudo & { multiplicador: number } = {
  shortcode: 'ABC', pk: '1', cuenta: 'inmo', publicadoAt: '2026-11-20T01:30:00Z',
  vistas: 65_000, likes: 3_000, comentarios: 120, caption: 'x', duracionSeg: 30, urlPortada: null,
  esReel: true, multiplicador: 6.46,
}
const perfil: CuentaPerfil = { usuario: 'inmo', igUserId: '9', seguidores: 12_000 }
const clas: Clasificacion = { categoria: 'inmobiliario_ar', tema: 'impuestos', puntaje: 8, razon: 'r' }
const an: Analisis = {
  tema: 'Sellos', gancho: 'g', formato: 'f', por_que: 'p', comentarios_analisis: 'c',
  adaptacion_diego: 'a', transcripcion: 't',
}
const armar = (r = reel, p = perfil) =>
  armarFilaVideoRef(r, 10_000, 24, p, clas, an, { videoPath: 'v/ABC.mp4', portadaPath: 'p/ABC.jpg' }, 'run-1')

describe('armarFilaVideoRef', () => {
  it('campos fijos y derivados', () => {
    const f = armar()
    expect(f).toMatchObject({
      fuente: 'radar', plataforma: 'instagram', tipo: 'video_cuenta', ficha_slug: 'ig-ABC',
      ig_shortcode: 'ABC', url_video: 'https://www.instagram.com/reel/ABC/', cuenta: '@inmo',
      multiplicador: 6.5, baseline_cuenta: 'mediana de 24 reels: 10.000 vistas',
      oculta: false, radar_run_id: 'run-1', vistas: 65_000, likes: 3_000, comentarios: 120, seguidores: 12_000,
      video_storage_path: 'v/ABC.mp4', portada_storage_path: 'p/ABC.jpg',
      categoria: 'inmobiliario_ar', tema_categoria: 'impuestos', puntaje: 8,
    })
  })

  it('fecha en zona Buenos Aires (01:30Z del 20 es el 19 a la noche)', () => {
    expect(armar().fecha_video).toBe('2026-11-19')
  })

  it('el análisis se mapea 1 a 1', () => {
    expect(armar()).toMatchObject(an)
  })

  it('no incluye estado_uso', () => {
    expect('estado_uso' in armar()).toBe(false)
  })

  it('métricas null quedan null, nunca 0', () => {
    const f = armar({ ...reel, vistas: null, likes: null, comentarios: null }, { ...perfil, seguidores: null })
    expect(f.vistas).toBeNull()
    expect(f.likes).toBeNull()
    expect(f.comentarios).toBeNull()
    expect(f.seguidores).toBeNull()
  })
})
