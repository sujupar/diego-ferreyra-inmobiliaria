import { describe, it, expect } from 'vitest'
import { limpiarTextoLibre, cuerpoPatch, patchDelPaso, cuerpoFinal, contactoFinal, esHoneypot, faltaParaTerminar, MAX_TEXTO_LIBRE } from './respuestas'
import { opcionesDeLaEncuesta } from './opciones'
import { RESPUESTAS_VACIAS } from './tipos'

const opciones = opcionesDeLaEncuesta({ property_type: 'departamento', amenities: [], garages: 1, floor: 2, expensas: 0 })
const ctx = { opciones, moneda: 'USD' as const }
const normalizar = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length >= 10 ? `549${d.slice(-10)}` : null
}
function patch(cuerpo: unknown) {
  const c = cuerpoPatch.safeParse(cuerpo)
  if (!c.success || c.data.paso === 'abierta') throw new Error('cuerpo inválido')
  return patchDelPaso(c.data, ctx)
}

describe('limpiarTextoLibre', () => {
  it('NFC, sin caracteres de control, espacios colapsados, con tope', () => {
    expect(limpiarTextoLibre('  El balcón\u0007 \n\n  enorme ')).toBe('El balcón enorme')
    expect(limpiarTextoLibre('x'.repeat(500))).toHaveLength(MAX_TEXTO_LIBRE)
    expect(limpiarTextoLibre(null)).toBe('')
  })
  it('deja el texto como texto: no saca ni interpreta HTML (React lo escapa al mostrarlo)', () => {
    expect(limpiarTextoLibre('</script><b>hola</b>')).toBe('</script><b>hola</b>')
  })
})

describe('cuerpoPatch (Zod estricto por paso)', () => {
  it.each([
    { paso: 'gusto', valor: 'si' },
    { paso: 'gusto', valor: true, extra: 1 },
    { paso: 'precio', valor: 'carisimo' },
    { paso: 'oferta', monto: -5, declina: false },
    { paso: 'oferta', monto: 1.5, declina: false },
    { paso: 'inventado' },
  ])('rechaza %o', cuerpo => {
    expect(cuerpoPatch.safeParse(cuerpo).success).toBe(false)
  })
})

describe('patchDelPaso', () => {
  it('gusto', () => {
    expect(patch({ paso: 'gusto', valor: false })).toEqual({ ok: true, patch: { liked: false, last_step: 'gusto' } })
  })
  it('etiquetas: solo las de ESTA propiedad, sin repetidas', () => {
    expect(patch({ paso: 'mas_gusto', etiquetas: ['luz', 'cochera'] })).toEqual({
      ok: true, patch: { most_liked_tags: ['luz', 'cochera'], most_liked_other: null, last_step: 'mas_gusto' },
    })
    expect(patch({ paso: 'mas_gusto', etiquetas: ['vista'] })).toEqual({ ok: false, error: 'Elegí una de las opciones' })
    expect(patch({ paso: 'mas_gusto', etiquetas: ['luz', 'luz'] })).toEqual({ ok: false, error: 'Elegí una de las opciones' })
    expect(patch({ paso: 'mas_gusto', etiquetas: [] })).toEqual({ ok: false, error: 'Elegí al menos una opción' })
  })
  it('"Otra cosa" exige el texto y lo limpia; sin "Otra cosa" el texto se descarta', () => {
    expect(patch({ paso: 'menos_gusto', etiquetas: ['otra'], otra: '  ' })).toEqual({ ok: false, error: 'Contanos qué otra cosa' })
    expect(patch({ paso: 'menos_gusto', etiquetas: ['otra'], otra: 'El ascensor\u0007' })).toEqual({
      ok: true, patch: { least_liked_tags: ['otra'], least_liked_other: 'El ascensor', last_step: 'menos_gusto' },
    })
    expect(patch({ paso: 'menos_gusto', etiquetas: ['ruido'], otra: 'algo' })).toEqual({
      ok: true, patch: { least_liked_tags: ['ruido'], least_liked_other: null, last_step: 'menos_gusto' },
    })
  })
  it('"Nada en especial" va sola', () => {
    expect(patch({ paso: 'menos_gusto', etiquetas: ['nada', 'ruido'] })).toEqual({ ok: false, error: '"Nada en especial" va sola' })
  })
  it('oferta: monto en la moneda publicada, o "prefiero no decirlo"', () => {
    expect(patch({ paso: 'oferta', monto: 135000, declina: false })).toEqual({
      ok: true, patch: { offer_amount: 135000, offer_currency: 'USD', offer_declined: false, last_step: 'oferta' },
    })
    expect(patch({ paso: 'oferta', monto: null, declina: true })).toEqual({
      ok: true, patch: { offer_amount: null, offer_currency: null, offer_declined: true, last_step: 'oferta' },
    })
    expect(patch({ paso: 'oferta', monto: null, declina: false })).toEqual({ ok: false, error: 'Escribí un monto o tocá "Prefiero no decirlo"' })
    expect(patch({ paso: 'oferta', monto: 500_000_000, declina: false })).toEqual({ ok: false, error: 'Revisá el monto' })
  })
})

describe('final', () => {
  it('cuerpoFinal es estricto', () => {
    expect(cuerpoFinal.safeParse({ similares: true, otro: 1 }).success).toBe(false)
    expect(cuerpoFinal.safeParse({ similares: true }).success).toBe(true)
  })
  it('sin teléfono nuevo usa el de la visita; con uno nuevo lo valida', () => {
    expect(contactoFinal({ similares: false }, '+54 9 11 5823-4521', normalizar)).toEqual({
      ok: true, contacto: { contact_phone: '5491158234521', contact_email: null, wants_similar: false },
    })
    expect(contactoFinal({ telefono: '11 4444-5555', similares: true }, '+5491158234521', normalizar)).toEqual({
      ok: true, contacto: { contact_phone: '5491144445555', contact_email: null, wants_similar: true },
    })
    expect(contactoFinal({ telefono: '123', similares: true }, '+5491158234521', normalizar)).toEqual({
      ok: false, error: 'Revisá tu WhatsApp: no parece un número válido',
    })
  })
  it('si la visita no tenía teléfono (MercadoLibre lo oculta) hay que escribirlo', () => {
    expect(contactoFinal({ similares: false }, null, normalizar)).toEqual({ ok: false, error: 'Dejanos tu WhatsApp' })
  })
  it('email opcional: vacío → null; mal escrito → error; se guarda en minúsculas', () => {
    expect(contactoFinal({ email: ' ', similares: false }, '+5491158234521', normalizar)).toMatchObject({ ok: true, contacto: { contact_email: null } })
    expect(contactoFinal({ email: 'Ana@Mail.COM', similares: false }, '+5491158234521', normalizar)).toMatchObject({ ok: true, contacto: { contact_email: 'ana@mail.com' } })
    expect(contactoFinal({ email: 'ana@', similares: false }, '+5491158234521', normalizar)).toEqual({ ok: false, error: 'Revisá el email' })
  })
  it('honeypot', () => {
    expect(esHoneypot({ hp_campo_x: 'ACME' })).toBe(true)
    expect(esHoneypot({ hp_campo_x: '' })).toBe(false)
    expect(esHoneypot({})).toBe(false)
  })
  it('faltaParaTerminar devuelve el primer paso sin responder', () => {
    expect(faltaParaTerminar(RESPUESTAS_VACIAS)).toBe('gusto')
  })
})
