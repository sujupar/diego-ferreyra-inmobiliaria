import { describe, it, expect } from 'vitest'
import { explicarErrorMl } from './client'
import { PortalAdapterError, mensajeYDetalle, soloElMensaje } from '../types'

/**
 * El 2026-08-06, publicando en vivo, la pantalla mostró el JSON crudo de
 * MercadoLibre. Estos tests fijan las dos garantías del arreglo: (1) lo que ve
 * una persona está en castellano, (2) el detalle técnico no se pierde — queda
 * guardado, separado, para poder diagnosticar.
 */

describe('explicarErrorMl', () => {
  it('traduce el rechazo por categoría que apareció en la demo', () => {
    const cuerpo = JSON.stringify({
      message: 'Validation error',
      error: 'validation_error',
      status: 400,
      cause: [{
        code: 'item.category_id.invalid',
        message: "Is not allowed to post in category MLA1472. Make sure you're posting in a leaf category",
      }],
    })
    const texto = explicarErrorMl(400, cuerpo)
    expect(texto).toMatch(/categoría/i)
    expect(texto).not.toMatch(/leaf category|MLA1472|\{|"/)
  })

  it('distingue credenciales, límite de pedidos y caída de ML', () => {
    expect(explicarErrorMl(401, '')).toMatch(/credenciales/i)
    expect(explicarErrorMl(403, '')).toMatch(/credenciales/i)
    expect(explicarErrorMl(429, '')).toMatch(/limitando/i)
    expect(explicarErrorMl(500, '')).toMatch(/problema de su lado/i)
    expect(explicarErrorMl(503, '')).toMatch(/problema de su lado/i)
  })

  it('traduce el tier sin cupo', () => {
    const cuerpo = JSON.stringify({ cause: [{ code: 'item.listing_type.not_available_quota', message: 'Not available quota' }] })
    expect(explicarErrorMl(400, cuerpo)).toMatch(/tipo de publicación/i)
  })

  it('no repite la misma explicación cuando ML manda varias causas iguales', () => {
    const cuerpo = JSON.stringify({
      cause: [
        { code: 'item.attributes.invalid', message: 'a' },
        { code: 'item.attributes.missing', message: 'b' },
      ],
    })
    const texto = explicarErrorMl(400, cuerpo)
    // Dos causas del mismo tipo, pero el mensaje de ML difiere → se conservan
    // ambas; lo que no queremos es la MISMA frase dos veces.
    const frases = texto.split('. ').filter(Boolean)
    expect(new Set(frases).size).toBe(frases.length)
  })

  it('un cuerpo que no es JSON no rompe: da un mensaje entendible igual', () => {
    const texto = explicarErrorMl(400, '<html><body>Bad Request</body></html>')
    expect(texto).toMatch(/rechazó el aviso/i)
    expect(texto).not.toContain('<html>')
  })
})

describe('mensajeYDetalle / soloElMensaje', () => {
  const err = new PortalAdapterError(
    'La categoría de MercadoLibre no es válida para este tipo de propiedad.',
    'mercadolibre',
    'unknown',
    false,
    'ML 400 /items: {"cause":[{"code":"item.category_id.invalid"}]}',
  )

  it('separa lo que ve una persona de lo que se guarda para diagnosticar', () => {
    const { mensaje, paraElLog } = mensajeYDetalle(err)
    expect(mensaje).not.toMatch(/\{|cause|ML 400/)
    expect(paraElLog).toContain(mensaje)
    expect(paraElLog).toContain('item.category_id.invalid')
  })

  it('soloElMensaje deshace el pegado: de la base a la pantalla, sin JSON', () => {
    const { mensaje, paraElLog } = mensajeYDetalle(err)
    expect(soloElMensaje(paraElLog)).toBe(mensaje)
  })

  it('soloElMensaje no rompe con errores viejos, sin detalle, ni con null', () => {
    expect(soloElMensaje('Un error viejo cualquiera')).toBe('Un error viejo cualquiera')
    expect(soloElMensaje(null)).toBeNull()
    expect(soloElMensaje('')).toBeNull()
  })

  it('un Error común (sin detalle del portal) pasa igual por los dos caminos', () => {
    const { mensaje, paraElLog } = mensajeYDetalle(new Error('boom'))
    expect(mensaje).toBe('boom')
    expect(paraElLog).toBe('boom')
  })

  it('el detalle crudo sigue estando para los matchers que dependen de él', () => {
    // El descenso de tier y el "pausar cuando ML lo active" buscan códigos
    // literales de ML. Si alguna vez dejaran de estar en `paraElLog`, esas dos
    // funciones se romperían en silencio.
    const notYet = new PortalAdapterError(
      'MercadoLibre rechazó el aviso.', 'mercadolibre', 'unknown', false,
      'ML 400 /items/X: {"message":"Item in status not_yet_active is not possible to change"}',
    )
    expect(/not_yet_active/i.test(mensajeYDetalle(notYet).paraElLog)).toBe(true)

    const sinCupo = new PortalAdapterError(
      'El tipo de publicación elegido no está disponible.', 'mercadolibre', 'unknown', false,
      'ML 400 /items: {"message":"Not available quota"}',
    )
    expect(/available quota/i.test(mensajeYDetalle(sinCupo).paraElLog)).toBe(true)
  })
})
