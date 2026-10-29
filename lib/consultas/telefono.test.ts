import { describe, expect, it } from 'vitest'
import { armarDesdePartes, leerTelefono, MOTIVO_TEXTO } from './telefono'
import { FORMATOS_REALES } from './telefono.formatos'

describe('leerTelefono — la regla del 549', () => {
  it.each([
    ['541161400496', '5491161400496'],
    ['5401162653949', '5491162653949'],
    ['540111556335717', '5491156335717'],
    ['1561956411', '5491161956411'],
    ['011 15 5823-4521', '5491158234521'],
    ['+54 9 11 6140-0496', '5491161400496'],
    ['(011) 6140-0496', '5491161400496'],
  ])('%s → %s', (crudo, wa) => expect(leerTelefono(crudo)).toMatchObject({ ok: true, whatsapp: wa }))

  it('mostrado con espacios y guion', () =>
    expect(leerTelefono('541161400496')).toMatchObject({
      mostrado: '+54 9 11 6140-0496',
      canonico: '+5491161400496',
    }))

  it('el área de 3 y 4 dígitos sale de la metadata, no de una tabla propia', () => {
    expect(leerTelefono('3516788146')).toMatchObject({ ok: true, mostrado: '+54 9 351 678-8146' })
    expect(leerTelefono('2224 15 512345')).toMatchObject({ ok: true, whatsapp: '5492224512345' })
  })

  it('corregido: false si ya venía en E.164, true si hubo que arreglarlo', () => {
    expect(leerTelefono('+5491161400496')).toMatchObject({ ok: true, corregido: false })
    expect(leerTelefono('541161400496')).toMatchObject({ ok: true, corregido: true })
  })

  it('sin + y no argentino → revisar, nunca extranjero', () => {
    expect(leerTelefono('4571430985').ok).toBe(false)
    expect(leerTelefono('33652765622').ok).toBe(false)
  })

  it('+ con otro país se acepta', () =>
    expect(leerTelefono('+598 94 123 456')).toMatchObject({ ok: true, whatsapp: '59894123456' }))

  it('8 dígitos → falta la característica', () =>
    expect(leerTelefono('4941-0027')).toEqual({ ok: false, motivo: 'falta_caracteristica', crudo: '4941-0027' }))

  it('9 dígitos → muy corto', () => expect(leerTelefono('112611114')).toMatchObject({ ok: false, motivo: 'muy_corto' }))

  it('dígitos de más → muy largo', () =>
    expect(leerTelefono('11614004961234')).toMatchObject({ ok: false, motivo: 'muy_largo' }))

  it('vacío', () => {
    expect(leerTelefono('  ')).toMatchObject({ ok: false, motivo: 'vacio' })
    expect(leerTelefono(null)).toMatchObject({ ok: false, motivo: 'vacio', crudo: '' })
    expect(leerTelefono(undefined)).toMatchObject({ ok: false, motivo: 'vacio' })
  })

  it('sin dígitos (letras, símbolos de regex) → revisar sin explotar', () => {
    expect(leerTelefono('no tengo').ok).toBe(false)
    expect(leerTelefono('.*+?()[]').ok).toBe(false)
  })

  it('todo motivo tiene su texto', () => {
    expect(MOTIVO_TEXTO.falta_caracteristica).toBe('Tiene 8 números: le falta la característica.')
    expect(MOTIVO_TEXTO.vacio).toBe('No dejó teléfono.')
  })

  it('partes con 0 y 15 que se limpian', () =>
    expect(armarDesdePartes('011', '15 4941-0027')).toMatchObject({ ok: true, whatsapp: '5491149410027' }))

  it('partes sin característica → falta la característica', () =>
    expect(armarDesdePartes('', '4941-0027')).toMatchObject({ ok: false, motivo: 'falta_caracteristica' }))

  it('los formatos reales', () => {
    expect(FORMATOS_REALES.length).toBeGreaterThan(100)
    for (const f of FORMATOS_REALES) {
      const leido = leerTelefono(f.crudo)
      expect(leido.ok ? leido.whatsapp : null, f.crudo).toBe(f.esperado)
    }
  })
})
