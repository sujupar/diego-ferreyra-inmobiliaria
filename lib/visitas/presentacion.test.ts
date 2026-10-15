import { describe, it, expect } from 'vitest'
import { textoPorcentaje, textoDuracion, textoDeTiempo, textoDeBase, etiquetaDeOrigen, resumenDelDia, formatearFechaCorta } from './presentacion'
import { cifra, porcentaje } from './metricas'

const VISITAS = { uno: 'visita', varios: 'visitas' }

describe('presentación de cifras', () => {
  it('sin datos ⇒ null (la tarjeta dice "Sin datos"), nunca "0 %"', () => {
    expect(textoPorcentaje(porcentaje(0, 0))).toBeNull()
    expect(textoDeTiempo(cifra(0, 0))).toBeNull()
    expect(textoDeBase(cifra(0, 0), VISITAS)).toBe('sin visitas para calcularlo')
  })
  it('porcentaje y base con "orientativo"', () => {
    expect(textoPorcentaje(porcentaje(1, 2))).toBe('50 %')
    expect(textoDeBase(porcentaje(1, 1), VISITAS)).toBe('de 1 visita · orientativo')
    expect(textoDeBase(porcentaje(10, 40), VISITAS)).toBe('de 40 visitas')
  })
  it('duraciones legibles', () => {
    expect(textoDuracion(20_000)).toBe('menos de 1 min')
    expect(textoDuracion(45 * 60_000)).toBe('45 min')
    expect(textoDuracion(59.6 * 60_000)).toBe('1 h')
    expect(textoDuracion(6 * 3_600_000)).toBe('6 h')
    expect(textoDuracion(3 * 86_400_000)).toBe('3 días')
  })
  it('origen con su detalle', () => {
    expect(etiquetaDeOrigen('portal', 'zonaprop')).toBe('Consulta de portal · Zonaprop')
    expect(etiquetaDeOrigen('otro', 'Recomendación')).toBe('Otro · Recomendación')
    expect(etiquetaDeOrigen('cartel', null)).toBe('Cartel en la propiedad')
    expect(etiquetaDeOrigen(null, null)).toBe('Sin origen')
  })
  it('resumen del día en singular y plural', () => {
    expect(resumenDelDia(0, 0)).toBe('Sin visitas hoy · nada para resolver')
    expect(resumenDelDia(1, 1)).toBe('1 visita hoy · 1 cosa para resolver')
    expect(resumenDelDia(3, 5)).toBe('3 visitas hoy · 5 cosas para resolver')
  })
  it('fecha corta en hora ARGENTINA, con año y reloj de 24 h', () => {
    expect(formatearFechaCorta('2026-08-01T15:00:00Z')).toBe('01/08/26, 12:00')
    expect(formatearFechaCorta('2026-11-01T02:30:00Z')).toBe('31/10/26, 23:30')
  })
})
