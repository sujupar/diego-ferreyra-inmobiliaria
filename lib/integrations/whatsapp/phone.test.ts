import { describe, it, expect } from 'vitest'
import { normalizeWhatsappPhone, isWhatsappUsable } from './phone'

describe('normalizeWhatsappPhone', () => {
  it('respeta el indicativo explícito del exterior (el bug que rompió la prueba real)', () => {
    // Este número colombiano se convertía en 543107822955 (argentino inexistente).
    expect(normalizeWhatsappPhone('+57 310 782 2955')).toBe('573107822955')
    expect(normalizeWhatsappPhone('+573107822955')).toBe('573107822955')
  })

  it('asume Argentina cuando NO hay indicativo', () => {
    expect(normalizeWhatsappPhone('11 6123 4567')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('1161234567')).toBe('5491161234567')
  })

  it('emite el 9 canónico de los móviles argentinos', () => {
    expect(normalizeWhatsappPhone('+54 11 6123 4567')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('+54 9 11 6123 4567')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('+54 351 555 1234')).toBe('5493515551234')
  })

  it('saca el 15 de los móviles escritos a la vieja usanza', () => {
    expect(normalizeWhatsappPhone('011 15 6123 4567')).toBe('5491161234567')
  })

  it('devuelve null en vez de inventar cuando no es un número válido', () => {
    expect(normalizeWhatsappPhone('3107822955')).toBeNull() // 10 dígitos que no son AR válido
  })

  it('NO detecta números de relleno que encajan en el plan de numeración', () => {
    // `+54 11 1234 5678` es el teléfono que dejó un lead de prueba llamado "John
    // Doe". Encaja en el patrón de un móvil porteño válido, así que la librería lo
    // acepta y le agrega el 9. Es un LÍMITE conocido y aceptado: libphonenumber
    // valida contra el plan de numeración del país, no contra las líneas realmente
    // asignadas — eso último no lo sabe nadie más que la operadora.
    // Por eso la visibilidad importa: el registro de mensajes y el estado que
    // devuelve Meta son los que van a mostrar que ese número no recibe nada.
    expect(normalizeWhatsappPhone('+54 11 1234 5678')).toBe('5491112345678')
    expect(normalizeWhatsappPhone('123')).toBeNull()
    expect(normalizeWhatsappPhone('no es un teléfono')).toBeNull()
    expect(normalizeWhatsappPhone('')).toBeNull()
    expect(normalizeWhatsappPhone(null)).toBeNull()
  })

  it('isWhatsappUsable es el mismo criterio', () => {
    expect(isWhatsappUsable('+57 310 782 2955')).toBe(true)
    expect(isWhatsappUsable('3107822955')).toBe(false)
  })

  it('isWhatsappUsable trata vacío/null/undefined como "no aplica", nunca error', () => {
    // Contrato que usan el popup de la landing (no valida si el campo está
    // vacío — la regla de nombre + email O teléfono ya cubre ese caso) y el
    // Inbox (la insignia solo se muestra si `lead.phone` existe).
    expect(isWhatsappUsable(null)).toBe(false)
    expect(isWhatsappUsable(undefined)).toBe(false)
    expect(isWhatsappUsable('')).toBe(false)
    expect(isWhatsappUsable('   ')).toBe(false)
  })
})

describe('normalizeWhatsappPhone con región explícita (Task 5 — selector de país)', () => {
  it('Argentina: 11 / 9 11 / 15 / 011 15 dan SIEMPRE el mismo canónico (los 4 casos del brief)', () => {
    expect(normalizeWhatsappPhone('11 6123 4567', 'AR')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('9 11 6123 4567', 'AR')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('15 6123 4567', 'AR')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('011 15 6123 4567', 'AR')).toBe('5491161234567')
  })

  it('sin segundo argumento sigue asumiendo Argentina (no rompe a los llamadores existentes)', () => {
    expect(normalizeWhatsappPhone('11 6123 4567')).toBe('5491161234567')
    expect(isWhatsappUsable('11 6123 4567')).toBe(true)
  })

  it('usa la región elegida para un número local del exterior (sin "+")', () => {
    // Colombia: celular local tal cual lo tipearía alguien que YA eligió
    // Colombia en la bandera (sin indicativo, porque el indicativo lo
    // muestra el selector aparte).
    expect(normalizeWhatsappPhone('310 782 2955', 'CO')).toBe('573107822955')
    // El mismo número leído con la región por defecto (AR) no da un
    // argentino válido — se rechaza en vez de inventar.
    expect(normalizeWhatsappPhone('310 782 2955', 'AR')).toBeNull()
  })

  it('un "+" explícito manda por sobre la región elegida (pegar un número completo nunca se rompe)', () => {
    expect(normalizeWhatsappPhone('+57 310 782 2955', 'AR')).toBe('573107822955')
    expect(normalizeWhatsappPhone('+54 11 6123 4567', 'CO')).toBe('5491161234567')
  })

  it('el "15 sin área" NO se expande para otros países (la heurística es solo AR)', () => {
    // Con región no-AR, "15 6123 4567" no matchea ningún plan válido: se
    // rechaza en vez de aplicar la suposición de área 11 (que es específica
    // de Argentina).
    expect(normalizeWhatsappPhone('15 6123 4567', 'MX')).toBeNull()
  })
})

describe('E.164 sin "+" (formato de phone_e164 y del `from` de Meta)', () => {
  it('resuelve números del EXTERIOR guardados sin "+"', () => {
    // Sin esto era imposible contestarle por el chat a un cliente del exterior:
    // el hilo se identifica por `phone_e164`, que se guarda sin '+'.
    expect(normalizeWhatsappPhone('573107822955')).toBe('573107822955')   // Colombia
    expect(normalizeWhatsappPhone('5511912345678')).toBe('5511912345678') // Brasil
    expect(normalizeWhatsappPhone('34612345678')).toBe('34612345678')     // España
  })

  it('sigue resolviendo los argentinos guardados sin "+"', () => {
    expect(normalizeWhatsappPhone('5491161234567')).toBe('5491161234567')
  })

  it('el reintento NO rompe los móviles argentinos pelados', () => {
    // `1161234567` con '+' adelante caería en el plan de EE.UU.; por eso el
    // intento "como lo escribió una persona" va PRIMERO.
    expect(normalizeWhatsappPhone('1161234567')).toBe('5491161234567')
    expect(normalizeWhatsappPhone('11 6123 4567')).toBe('5491161234567')
  })

  it('el reintento no resucita basura', () => {
    expect(normalizeWhatsappPhone('3107822955')).toBeNull() // ambiguo, se rechaza
    expect(normalizeWhatsappPhone('000000000000')).toBeNull()
    expect(normalizeWhatsappPhone('999999999999999')).toBeNull()
  })
})
