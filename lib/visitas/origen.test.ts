import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ORIGENES_VISITA, ORIGEN_INFO, esOrigenVisita, origenDesdeLead, fuenteDelComprador, validarDetalleDeOrigen,
} from './origen'

describe('catálogo de orígenes', () => {
  it('es EXACTAMENTE el del CHECK de la base (se tocan juntos)', () => {
    const sql = readFileSync('supabase/migrations/20261010000002_visitas_origen_e_historial.sql', 'utf8')
    const m = /property_visits_origin_check\s+CHECK \(origin IS NULL OR origin IN \(([^)]*)\)\)/.exec(sql)
    expect(m).not.toBeNull()
    const enLaBase = (m?.[1] ?? '').split(',').map(s => s.trim().replace(/'/g, ''))
    expect(enLaBase).toEqual([...ORIGENES_VISITA])
  })
  it('cada origen tiene etiqueta y ayuda en castellano', () => {
    for (const o of ORIGENES_VISITA) {
      expect(ORIGEN_INFO[o].etiqueta.length).toBeGreaterThan(2)
      expect(ORIGEN_INFO[o].ayuda.length).toBeGreaterThan(2)
    }
  })
  it('reconoce valores válidos y rechaza el resto', () => {
    expect(esOrigenVisita('cartel')).toBe(true)
    expect(esOrigenVisita('tasacion')).toBe(false)
    expect(esOrigenVisita(null)).toBe(false)
  })
})

describe('origenDesdeLead', () => {
  it('una consulta de portal es portal, con el portal como detalle', () => {
    expect(origenDesdeLead({ source: 'portal:zonaprop', utm: null })).toEqual({ origen: 'portal', detalle: 'zonaprop' })
  })
  it('un registro creado desde la ventana conserva el origen elegido', () => {
    expect(origenDesdeLead({ source: 'visita:cartel', utm: null })).toEqual({ origen: 'cartel', detalle: null })
  })
  it('landing con utm de Meta pago es publicidad de Meta', () => {
    expect(origenDesdeLead({ source: 'landing', utm: { utm_source: 'meta', utm_medium: 'paid_social' } }).origen).toBe('publicidad_meta')
    expect(origenDesdeLead({ source: 'landing', utm: { fbclid: 'abc' } }).origen).toBe('publicidad_meta')
  })
  it('un reel de Instagram NO es publicidad paga', () => {
    expect(origenDesdeLead({ source: 'landing', utm: { utm_source: 'instagram', utm_medium: 'reel' } }))
      .toEqual({ origen: 'otro', detalle: 'Reel de Instagram' })
  })
  it('Google es otra publicidad paga', () => {
    expect(origenDesdeLead({ source: 'landing', utm: { gclid: 'x' } })).toEqual({ origen: 'publicidad_paga', detalle: 'Google' })
    expect(origenDesdeLead({ source: 'landing', utm: { utm_source: 'tiktok', utm_medium: 'cpc' } }))
      .toEqual({ origen: 'publicidad_paga', detalle: 'tiktok' })
  })
  it('landing sin publicidad es "otro · Landing"', () => {
    expect(origenDesdeLead({ source: 'landing', utm: {} })).toEqual({ origen: 'otro', detalle: 'Landing' })
    expect(origenDesdeLead({ source: 'landing', utm: 'basura' })).toEqual({ origen: 'otro', detalle: 'Landing' })
  })
  it('un reinicio de prueba es "otro · Prueba"', () => {
    expect(origenDesdeLead({ source: 'prueba:reinicio', utm: null })).toEqual({ origen: 'otro', detalle: 'Prueba' })
  })
  it('una fuente desconocida cae en "otro" sin inventar detalle', () => {
    expect(origenDesdeLead({ source: 'algo-raro', utm: null })).toEqual({ origen: 'otro', detalle: null })
  })
})

describe('fuenteDelComprador', () => {
  it('portal con portal conocido usa el formato de las consultas', () => {
    expect(fuenteDelComprador('portal', 'argenprop')).toBe('portal:argenprop')
  })
  it('el resto queda marcado como creado desde la visita', () => {
    expect(fuenteDelComprador('cartel')).toBe('visita:cartel')
    expect(fuenteDelComprador('portal')).toBe('visita:portal')
  })
})

describe('validarDetalleDeOrigen', () => {
  it('"otro" exige escribir cuál', () => {
    expect(validarDetalleDeOrigen('otro', '  ')).toEqual({ ok: false, error: 'Escribí de dónde vino la visita' })
    expect(validarDetalleDeOrigen('otro', ' Un vecino ')).toEqual({ ok: true, detalle: 'Un vecino' })
  })
  it('"otra publicidad paga" lo acepta opcional', () => {
    expect(validarDetalleDeOrigen('publicidad_paga', '')).toEqual({ ok: true, detalle: null })
    expect(validarDetalleDeOrigen('publicidad_paga', 'Google')).toEqual({ ok: true, detalle: 'Google' })
  })
  it('portal guarda el portal de la consulta; el resto no guarda detalle', () => {
    expect(validarDetalleDeOrigen('portal', 'lo que sea', 'zonaprop')).toEqual({ ok: true, detalle: 'zonaprop' })
    expect(validarDetalleDeOrigen('cartel', 'ignorado')).toEqual({ ok: true, detalle: null })
  })
  it('recorta un detalle demasiado largo a 120 caracteres', () => {
    const r = validarDetalleDeOrigen('otro', 'x'.repeat(300))
    expect(r.ok && r.detalle?.length).toBe(120)
  })
})
