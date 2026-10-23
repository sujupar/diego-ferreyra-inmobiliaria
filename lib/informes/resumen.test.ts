import { describe, it, expect } from 'vitest'
import { resumenDeMetricas, valorDelM2, paginasDelInforme, faltantes, textoDeConsultas } from './resumen'
import type { Fuentes, Informe, Manual } from './tipos'

const ok = <T,>(datos: T) => ({ estado: 'ok' as const, actualizadoEn: '2026-10-16T12:00:00Z', datos, error: null })
const sinDatos = { estado: 'sin_datos' as const, actualizadoEn: '2026-10-16T12:00:00Z', datos: null, error: null }
const error = { estado: 'error' as const, actualizadoEn: '2026-10-16T12:00:00Z', datos: null, error: 'Meta no respondió' }

const FICHA_VACIA = { respuestas: 0, leGusto: { si: 0, no: 0 }, precio: { correcto: 0, alto: 0, bajo: 0 }, ofertas: [], moneda: null, menosGusto: [], masGusto: [], comentariosMenosGusto: [] }

// Roque Pérez 3059 (informe de ejemplo): ZP 930/62, AP 125, ML 84 → 1.139 vieron, 271 entraron.
const FUENTES_ROQUE: Fuentes = {
  consultas: ok({ total: 3, porPortal: { zonaprop: 1, argenprop: 0, mercadolibre: 2, redes: 0, otros: 0 } }),
  visitas: ok({ realizadas: 0, ficha: FICHA_VACIA }),
  reserva: ok({ reservada: false, fecha: null }),
  mercadolibre: ok({ avisos: [{ id: 'MLA1', titulo: null, url: null, origen: 'plataforma' as const }], visitas: 84 }),
  meta: ok({ campanas: 1, alcance: 3026, impresiones: 4136, resultados: 3, gasto: 12678, edadSexo: [], plataformas: [] }),
  instagram: sinDatos,
}
const MANUAL_ROQUE: Manual = {
  zonaprop: { exposicion: 930, visualizaciones: 62, interesados: 1 },
  argenprop: { visualizaciones: 125 },
  textos: { accionesRealizadas: 'Se publicó en todos los portales', accionesARealizar: 'Seguir con la máxima difusión' },
}

describe('resumenDeMetricas: la regla de los informes de ejemplo', () => {
  it('Roque Pérez: vieron 1.139 (930 + 125 + 84) y entraron 271 (62 + 125 + 84)', () => {
    const r = resumenDeMetricas(FUENTES_ROQUE, MANUAL_ROQUE)
    expect(r.vieron).toEqual({ valor: 1139, faltan: [] })
    expect(r.entraron).toEqual({ valor: 271, faltan: [] })
    expect(r.consultas).toBe(3)
    expect(r.visitas).toBe(0)
    expect(r.reserva).toBe(false)
  })
  it('un portal que no está publicado no suma ni falta', () => {
    const r = resumenDeMetricas(FUENTES_ROQUE, { ...MANUAL_ROQUE, argenprop: { publicado: false } })
    expect(r.vieron).toEqual({ valor: 1014, faltan: [] })
  })
  it('sin aviso en MercadoLibre (sin_datos) tampoco suma ni falta', () => {
    const r = resumenDeMetricas({ ...FUENTES_ROQUE, mercadolibre: sinDatos }, MANUAL_ROQUE)
    expect(r.vieron).toEqual({ valor: 1055, faltan: [] })
  })
  it('lo que falta cargar o no se pudo traer NO cuenta como 0: el total queda sin valor y dice qué falta', () => {
    const r = resumenDeMetricas({ ...FUENTES_ROQUE, mercadolibre: error }, { ...MANUAL_ROQUE, zonaprop: { visualizaciones: 62 } })
    expect(r.vieron).toEqual({ valor: null, faltan: ['Exposición de Zonaprop', 'Visitas de MercadoLibre (no se pudo traer)'] })
    expect(r.entraron).toEqual({ valor: null, faltan: ['Visitas de MercadoLibre (no se pudo traer)'] })
  })
  it('un 0 cargado a mano SÍ es un 0', () => {
    const r = resumenDeMetricas(FUENTES_ROQUE, { ...MANUAL_ROQUE, argenprop: { visualizaciones: 0 } })
    expect(r.vieron.valor).toBe(1014)
  })
  it('consultas, visitas y reserva con error quedan en null (nunca 0)', () => {
    const r = resumenDeMetricas({ ...FUENTES_ROQUE, consultas: error, visitas: error, reserva: error }, MANUAL_ROQUE)
    expect([r.consultas, r.visitas, r.reserva]).toEqual([null, null, null])
  })
})

describe('valorDelM2 (competidoras)', () => {
  it('precio / m², redondeado', () => {
    expect(valorDelM2(695000, 436)).toBe(1594)
    expect(valorDelM2(798000, 600)).toBe(1330)
  })
  it('sin precio o sin m², null', () => {
    expect(valorDelM2(null, 436)).toBeNull()
    expect(valorDelM2(695000, 0)).toBeNull()
  })
})

const INFORME: Informe = {
  id: 'i', propertyId: 'p', desde: '2026-10-01', hasta: '2026-10-15', origen: 'ciclo', estado: 'borrador',
  fuentes: FUENTES_ROQUE, manual: MANUAL_ROQUE, competidoras: [], candidatas: { detalles: {} }, capturas: {}, pdfPath: null, listoAt: null, createdAt: '', updatedAt: '',
}

describe('paginasDelInforme: qué páginas salen', () => {
  it('Roque Pérez (con Meta, sin reel, sin competidoras, sin análisis)', () => {
    expect(paginasDelInforme(INFORME)).toEqual([
      'portada', 'resumen', 'comencemos', 'divisor-publicidad', 'portales', 'meta',
      'divisor-consultas', 'consultas', 'divisor-visitas', 'ficha-visitas', 'gracias', 'contacto',
    ])
  })
  it('con reel o con TikTok cargado sale la página de orgánico', () => {
    const conReel = { ...INFORME, fuentes: { ...FUENTES_ROQUE, instagram: ok({ reels: [{ permalink: null, publicadoEn: null, reproducciones: 1, alcance: 1, meGusta: 0, comentarios: 0, guardados: 0, compartidos: 0 }] }) } }
    expect(paginasDelInforme(conReel)).toContain('organico')
    const conTiktok = { ...INFORME, manual: { ...MANUAL_ROQUE, tiktok: { visualizaciones: 264 } } }
    expect(paginasDelInforme(conTiktok)).toContain('organico')
  })
  it('sin campaña (o con Meta caído) no sale la página de Meta', () => {
    expect(paginasDelInforme({ ...INFORME, fuentes: { ...FUENTES_ROQUE, meta: sinDatos } })).not.toContain('meta')
  })
  it('competidoras: el divisor y una página cada 2', () => {
    const c = { url: 'https://x', direccion: 'A', barrio: null, precio: 1, moneda: 'USD' as const, m2: 1, valorM2: 1, ambientes: 1, banos: 1, dormitorios: 1, antiguedad: 1, cocheras: 0, foto: null, publicadoHace: null, visualizaciones: null, bajoDePrecio: false }
    const p = paginasDelInforme({ ...INFORME, competidoras: [c, c, c], manual: { ...MANUAL_ROQUE, textos: { ...MANUAL_ROQUE.textos, analisisFinal: 'x' } } })
    expect(p.slice(p.indexOf('divisor-competencia'))).toEqual(['divisor-competencia', 'competidoras-1', 'competidoras-2', 'analisis', 'gracias', 'contacto'])
  })
})

describe('faltantes: qué tiene que completar Paula antes de "listo"', () => {
  it('Roque completo: no falta nada', () => {
    expect(faltantes(INFORME)).toEqual([])
  })
  it('fuente pendiente o con error, números de portales y acciones', () => {
    const f = faltantes({
      ...INFORME,
      fuentes: { ...FUENTES_ROQUE, meta: error, instagram: { estado: 'pendiente', actualizadoEn: null, datos: null, error: null } },
      manual: { zonaprop: { exposicion: 930 }, textos: {} },
    })
    expect(f).toEqual([
      'Meta Ads: no se pudo traer (reintentar)',
      'Instagram: todavía no se trajo',
      'Zonaprop: visualizaciones',
      'Argenprop: visualizaciones (o marcar que no está publicada)',
      'Acciones realizadas',
      'Acciones a realizar',
    ])
  })
})

describe('textoDeConsultas (resumen de la página de consultas cuando Paula no escribió uno)', () => {
  it('cero se dice como "no se obtuvieron", no "0 consultas"', () => {
    expect(textoDeConsultas(0)).toBe('En este último periodo no se obtuvieron consultas.')
  })
  it('singular y plural', () => {
    expect(textoDeConsultas(1)).toBe('En este último periodo se obtuvo 1 consulta.')
    expect(textoDeConsultas(9)).toBe('En este último periodo se obtuvieron 9 consultas.')
  })
  it('sin el dato (la fuente falló) no inventa un cero', () => {
    expect(textoDeConsultas(null)).toBe('No se pudieron contar las consultas de este período.')
  })
})
