import { describe, expect, it } from 'vitest'
import { agruparAnunciosDelPeriodo, enlaceDeMeta, nombreBaseAnuncio, type FichaAnuncio, type FilaInsightAnuncio } from './anuncios-periodo'

const REG = 'offsite_conversion.fb_pixel_complete_registration'
const fila = (ad_id: string, ad_name: string, o: Partial<FilaInsightAnuncio> = {}): FilaInsightAnuncio => ({
  ad_id, ad_name, adset_name: 'Viejo', date_start: '2026-11-01', spend: '1500', impressions: '1000', inline_link_clicks: '40',
  actions: [{ action_type: 'landing_page_view', value: '20' }, { action_type: REG, value: '1' }], ...o,
})
const ficha = (id: string, estado: string, o: Partial<FichaAnuncio> = {}): FichaAnuncio => ({
  id, effective_status: estado, conjunto: 'Validados', preview_shareable_link: `https://fb.me/${id}`, instagram_permalink_url: `https://www.instagram.com/p/${id}/`,
  thumbnail_url: 'https://scontent-bog2-2.xx.fbcdn.net/v/x.jpg', texto: 'Texto', titulo: 'Título', ...o,
})
const blue = () => 1500

describe('nombreBaseAnuncio: las versiones de un mismo anuncio se agrupan', () => {
  it('saca sufijos de versión y espacios dobles', () => {
    expect(nombreBaseAnuncio('AD01 - VID01 - Propio RMKN -NEW 3')).toBe('AD01 - VID01 - Propio RMKN')
    expect(nombreBaseAnuncio('AD01 - VID01 - Propio RMKN - VERSIÓN B')).toBe('AD01 - VID01 - Propio RMKN')
    expect(nombreBaseAnuncio('AD01 - VID01 - Propio RMKN - Nuevo')).toBe('AD01 - VID01 - Propio RMKN')
    expect(nombreBaseAnuncio('AD-N01 - Hoja - Casi pierde 16.000 [a5e11b71-0000]')).toBe('AD-N01 - Hoja - Casi pierde 16.000')
    expect(nombreBaseAnuncio('AD04 - VID06  - Priopio RMKN')).toBe('AD04 - VID06 - Priopio RMKN')
    expect(nombreBaseAnuncio('AD04 - VID10 CORTO 28s')).toBe('AD04 - VID10 CORTO 28s')
  })
  it('saca marcas encadenadas, como vienen de Meta (nombres reales del 2026-11-21)', () => {
    expect(nombreBaseAnuncio('AD01 - VID01  - Priopio RMKN -NEW 1 - Copia')).toBe('AD01 - VID01 - Priopio RMKN')
    expect(nombreBaseAnuncio('AD01 - VID01  - Priopio RMKN - VERSIÓN B - Copia 2')).toBe('AD01 - VID01 - Priopio RMKN')
    expect(nombreBaseAnuncio('AD01 - VID01  - Priopio RMKN - Nuevo - Copia')).toBe('AD01 - VID01 - Priopio RMKN')
  })
})

describe('agruparAnunciosDelPeriodo', () => {
  it('suma todas las versiones y conjuntos; activo si alguna versión está activa', () => {
    const r = agruparAnunciosDelPeriodo(
      [fila('1', 'AD-N01 - Hoja [x]'), fila('2', 'AD-N01 - Hoja [y]', { adset_name: 'Pruebas' }), fila('3', 'AD-N14 - Hoja')],
      [ficha('1', 'ADSET_PAUSED'), ficha('2', 'ACTIVE', { conjunto: 'Pruebas' }), ficha('3', 'PAUSED')],
      REG, blue,
    )
    expect(r.activos).toHaveLength(1)
    expect(r.activos[0]).toMatchObject({ nombre: 'AD-N01 - Hoja', versiones: 2, conjuntosActivos: ['Pruebas'], gasto: 3000, gastoUsd: 2, impresiones: 2000, clics: 80, visitas: 40, registros: 2, costoPorRegistro: 1500 })
    // El enlace es el de la versión ACTIVA.
    expect(r.activos[0].vistaPrevia).toBe('https://fb.me/2')
    expect(r.apagados.map(a => a.nombre)).toEqual(['AD-N14 - Hoja'])
    expect(r.totales.activos).toMatchObject({ gasto: 3000, registros: 2 })
    expect(r.totales.campania).toMatchObject({ gasto: 4500, registros: 3 })
  })
  it('activos ordenados: primero los que registraron, por menor costo por registro', () => {
    const r = agruparAnunciosDelPeriodo(
      [fila('1', 'Caro', { spend: '9000' }), fila('2', 'Barato'), fila('3', 'Sin registros', { actions: [] })],
      [ficha('1', 'ACTIVE'), ficha('2', 'ACTIVE'), ficha('3', 'ACTIVE')],
      REG, blue,
    )
    expect(r.activos.map(a => a.nombre)).toEqual(['Barato', 'Caro', 'Sin registros'])
    expect(r.activos[2].costoPorRegistro).toBeNull()
  })
  it('un anuncio sin ficha (borrado en Meta) cuenta como apagado', () => {
    const r = agruparAnunciosDelPeriodo([fila('9', 'Borrado')], [], REG, blue)
    expect(r.activos).toHaveLength(0)
    expect(r.apagados[0]).toMatchObject({ nombre: 'Borrado', vistaPrevia: null })
  })
  it('sin blue de un día el USD queda sin dato', () => {
    const r = agruparAnunciosDelPeriodo([fila('1', 'A')], [ficha('1', 'ACTIVE')], REG, () => null)
    expect(r.activos[0].gastoUsd).toBeNull()
  })
})

describe('enlaceDeMeta: solo dominios de Meta, por host exacto', () => {
  it('acepta los dominios esperados', () => {
    expect(enlaceDeMeta('https://fb.me/abc', 'vista')).toBe('https://fb.me/abc')
    expect(enlaceDeMeta('https://www.instagram.com/p/x/', 'instagram')).toBe('https://www.instagram.com/p/x/')
    expect(enlaceDeMeta('https://scontent-bog2-2.xx.fbcdn.net/v/x.jpg', 'imagen')).toBe('https://scontent-bog2-2.xx.fbcdn.net/v/x.jpg')
  })
  it('rechaza otros dominios, http y basura', () => {
    expect(enlaceDeMeta('http://fb.me/abc', 'vista')).toBeNull()
    expect(enlaceDeMeta('https://fb.me.evil.com/abc', 'vista')).toBeNull()
    expect(enlaceDeMeta('https://evil.com/fbcdn.net/x.jpg', 'imagen')).toBeNull()
    expect(enlaceDeMeta('https://evilfbcdn.net/x.jpg', 'imagen')).toBeNull()
    expect(enlaceDeMeta('javascript:alert(1)', 'vista')).toBeNull()
    expect(enlaceDeMeta(undefined, 'vista')).toBeNull()
  })
})
