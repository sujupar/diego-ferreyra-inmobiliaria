/**
 * ¿Una dirección es la landing abierta DENTRO del visor del mapa de calor?
 *
 * Lo usa el servidor para rechazar envíos del formulario que vengan del visor. Hasta
 * el 2026-09-19 el visor apagaba la visita, el calor, el video y el Píxel… pero el
 * formulario seguía vivo: si el dueño lo llenaba "para probar" desde el mapa de calor,
 * se creaba un lead REAL, con su aviso al equipo y su conversión a Meta, y contaba
 * como registro de esa versión en el test A/B.
 */
import { describe, it, expect } from 'vitest'
import { esVistaPreviaDelMapa } from './heatmap-preview'

describe('esVistaPreviaDelMapa', () => {
  it('reconoce la dirección que arma el visor, con el parámetro en cualquier posición', () => {
    expect(esVistaPreviaDelMapa('https://inmobiliariadiegoferreyra.com/tasacion-directa?hm_preview=1&lp=B')).toBe(true)
    expect(esVistaPreviaDelMapa('https://inmodf.com.ar/tasacion-directa?lp=A&hm_preview=1')).toBe(true)
    expect(esVistaPreviaDelMapa('https://inmodf.com.ar/vsl-clase-propietarios?hm_preview=1')).toBe(true)
    expect(esVistaPreviaDelMapa('/tasacion-directa?hm_preview=1&lp=B')).toBe(true)
    expect(esVistaPreviaDelMapa('https://inmodf.com.ar/tasacion-directa?hm_preview=1#formulario')).toBe(true)
  })

  it('una visita normal NO es vista previa (ahí el formulario tiene que andar siempre)', () => {
    expect(esVistaPreviaDelMapa('https://inmobiliariadiegoferreyra.com/tasacion-directa')).toBe(false)
    expect(esVistaPreviaDelMapa('https://inmobiliariadiegoferreyra.com/tasacion-directa?utm_source=meta&fbclid=abc')).toBe(false)
    expect(esVistaPreviaDelMapa('https://inmobiliariadiegoferreyra.com/tasacion-directa?lp=B')).toBe(false)
  })

  it('no se deja engañar por parecidos: otro valor, otro nombre, o el texto adentro de otro parámetro', () => {
    expect(esVistaPreviaDelMapa('https://x.com/p?hm_preview=0')).toBe(false)
    expect(esVistaPreviaDelMapa('https://x.com/p?hm_preview=11')).toBe(false)
    expect(esVistaPreviaDelMapa('https://x.com/p?xhm_preview=1')).toBe(false)
    expect(esVistaPreviaDelMapa('https://x.com/p?utm_content=hm_preview=1')).toBe(false)
    expect(esVistaPreviaDelMapa('https://x.com/hm_preview=1')).toBe(false)
  })

  it('sin dirección, o con basura, responde que no: ante la duda el formulario funciona', () => {
    for (const v of [null, undefined, '', '   ', 'no es una url', 'http://[::1', '?']) {
      expect(esVistaPreviaDelMapa(v as string | null | undefined)).toBe(false)
    }
  })
})
