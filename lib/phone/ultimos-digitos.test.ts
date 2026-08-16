/**
 * El caso que motivó esto es real: Daniel Lapadula, 2026-08-15. Registrado con
 * '+5491149372737', contacto guardado desde mayo como '+541149372737', y un
 * tercer duplicado del CSV como '1149372737'. El agente lo buscó por igualdad
 * exacta, no lo encontró, y un cliente de campaña paga quedó sin respuesta.
 */
import { describe, it, expect } from 'vitest'
import { ultimos10Digitos, mismoTelefono } from './ultimos-digitos'

describe('los tres formatos reales del mismo número convergen', () => {
  it.each([
    ['+5491149372737', 'E.164 móvil con 9 (WhatsApp/formulario)'],
    ['5491149372737', 'WhatsApp sin +'],
    ['+541149372737', 'E.164 sin el 9 (imports viejos)'],
    ['1149372737', 'pelado (CSV histórico)'],
    ['11 4937-2737', 'con espacios y guiones'],
    ['+54 9 11 4937 2737', 'E.164 con espacios'],
  ])('%s (%s) → 1149372737', (formato) => {
    expect(ultimos10Digitos(formato)).toBe('1149372737')
  })

  it('mismoTelefono cruza cualquier par de formatos', () => {
    expect(mismoTelefono('+5491149372737', '1149372737')).toBe(true)
    expect(mismoTelefono('5491149372737', '+541149372737')).toBe(true)
  })
})

describe('no inventa matches', () => {
  it('menos de 10 dígitos → null (no identifica un número completo)', () => {
    expect(ultimos10Digitos('4937 2737')).toBeNull()
    expect(ultimos10Digitos('')).toBeNull()
    expect(ultimos10Digitos(null)).toBeNull()
    expect(ultimos10Digitos(undefined)).toBeNull()
  })

  it('dos números cortos iguales NO matchean (null nunca matchea)', () => {
    expect(mismoTelefono('12345', '12345')).toBe(false)
  })

  it('números distintos no matchean', () => {
    expect(mismoTelefono('+5491149372737', '+5491149372738')).toBe(false)
  })

  it('un número extranjero conserva su identidad (Colombia)', () => {
    expect(ultimos10Digitos('+573107822955')).toBe('3107822955')
    expect(mismoTelefono('+573107822955', '573107822955')).toBe(true)
  })
})
