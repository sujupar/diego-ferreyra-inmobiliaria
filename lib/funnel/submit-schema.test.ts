/**
 * Cada caso de acá FALLÓ contra producción el 2026-08-15 (batería `battery.sh`,
 * reproduciendo el "me sale datos inválidos" de una clienta real del
 * 2026-08-14). Si uno de estos tests se rompe, se está por repetir el bug de
 * rechazar leads pagos por metadatos.
 */
import { describe, it, expect } from 'vitest'
import { SubmitSchema, resolverCanales, emailUsable, telefonoUsable } from './submit-schema'

const BASE = {
  funnel: 'tasacion',
  name: 'Prueba Batería',
  email: 'prueba@gmail.com',
  phone: '+5491155554444',
}

function parse(extra: Record<string, unknown>) {
  return SubmitSchema.safeParse({ ...BASE, ...extra })
}

describe('caso real: el clic del anuncio no puede costar el lead', () => {
  it('B: fbc de 410 chars (fbclid real de Instagram) ENTRA, con el fbc entero', () => {
    const fbc = `fb.1.1755200000000.${'IwAR'.repeat(100)}`
    const r = parse({ fbc })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.fbc).toBe(fbc) // entero: truncado no sirve para Meta
  })

  it('fbc demencial (5000 chars) entra igual, con el fbc DESCARTADO (no recortado)', () => {
    const r = parse({ fbc: 'x'.repeat(5000) })
    expect(r.success).toBe(true)
    // Entero o nada: un fbc truncado no matchea ningún clic en Meta — mandarlo
    // recortado sería reportar basura como si fuera dato.
    if (r.success) expect(r.data.fbc).toBeNull()
  })

  it('fbc que no es ni string (un objeto) entra igual, como null', () => {
    const r = parse({ fbc: { raro: true } })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.fbc).toBeNull()
  })

  it('I: utm_content de 250 chars entra, recortado a 200', () => {
    const r = parse({ attribution: { utm_content: 'c'.repeat(250) } })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.attribution?.utm_content).toHaveLength(200)
  })

  it('attribution corrupta entera (un string) entra, como null', () => {
    const r = parse({ attribution: 'basura' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.attribution).toBeNull()
  })

  it('eventId/anonId rotos no tumban nada', () => {
    const r = parse({ eventId: 12345, anonId: '' })
    expect(r.success).toBe(true)
  })
})

describe('casos reales: typos de celular en el email, con el WhatsApp perfecto', () => {
  it.each([
    ['D: punto doble', 'juan..perez@gmail.com'],
    ['E: punto antes de la arroba', 'juan.@gmail.com'],
  ])('%s → entra por teléfono, email degradado a la vista del CRM', (_caso, email) => {
    // El schema ya no valida el email (eso lo decide resolverCanales)…
    const r = parse({ email })
    expect(r.success).toBe(true)
    // …pero estos DOS igual son emails usables para el criterio permisivo
    // (coincide con el formulario): entran con email y todo.
    expect(emailUsable(email)).toBe(true)
  })

  it('F: email con acento entra (autocorrector móvil; el canal real es WhatsApp)', () => {
    expect(emailUsable('josé@gmail.com')).toBe(true)
  })

  it('email verdaderamente inservible + teléfono bueno → entra por teléfono', () => {
    const res = resolverCanales('no-es-un-email', '+5491155554444')
    expect(res.ok).toBe(true)
    expect(res.email).toBeNull()
    expect(res.phone).toBe('+5491155554444')
    expect(res.descartado.email).toBe('no-es-un-email')
  })

  it('teléfono inservible + email bueno → entra por email', () => {
    const res = resolverCanales('prueba@gmail.com', '123')
    expect(res.ok).toBe(true)
    expect(res.phone).toBeNull()
    expect(res.descartado.phone).toBe('123')
  })

  it('los dos inservibles → ahí sí se rechaza: no hay a quién contactar', () => {
    const res = resolverCanales('basura', '12')
    expect(res.ok).toBe(false)
    expect(res.motivo).toMatch(/ningún canal/)
  })
})

describe('campos de negocio', () => {
  it('G: nombre de 1 letra entra (es una persona con contacto al lado)', () => {
    expect(parse({ name: 'J' }).success).toBe(true)
  })

  it('nombre vacío NO entra (no es nadie)', () => {
    expect(parse({ name: '   ' }).success).toBe(false)
  })

  it('H: teléfono de 5 dígitos se degrada, no rechaza (el email sigue vivo)', () => {
    expect(telefonoUsable('12345')).toBe(false)
    const res = resolverCanales('prueba@gmail.com', '12345')
    expect(res.ok).toBe(true)
  })

  it('teléfono con espacios y guiones cuenta dígitos reales', () => {
    expect(telefonoUsable('+54 9 11 5555-4444')).toBe(true)
  })

  it('funnel desconocido NO entra (eso sí es un request roto, no un cliente)', () => {
    expect(parse({ funnel: 'otro' }).success).toBe(false)
  })

  it('K: eventSourceUrl no-URL no molesta (es tracking)', () => {
    expect(parse({ eventSourceUrl: 'about:blank#x y' }).success).toBe(true)
  })
})
