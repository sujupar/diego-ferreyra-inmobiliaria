import { describe, it, expect } from 'vitest'
import { errorDeRespuestaArgenprop } from './client'
import { PortalAdapterError, mensajeYDetalle, soloElMensaje } from '../types'

/**
 * El 2026-09-14, en vivo, la pantalla mostró el error crudo de Argenprop con un
 * base64 de 4 MB adentro. Estas pruebas fijan que (1) lo que ve una persona es
 * castellano corto, (2) el detalle técnico se guarda aparte y recortado, y
 * (3) `soloElMensaje` recupera exactamente la parte legible.
 */
describe('errorDeRespuestaArgenprop', () => {
  it('el rechazo real por Multimedia.Url: frase corta, base64 afuera, detalle recortado', () => {
    const base64 = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(1000)
    const cuerpo = JSON.stringify({ ErrorCode: 'PUB001', Detail: 'Error', Errors: { 'Multimedia.Url': `Valor inválido: ${base64}` } })
    const e = errorDeRespuestaArgenprop(400, cuerpo, '/v1/avisos')

    expect(e).toBeInstanceOf(PortalAdapterError)
    expect(e.message).toMatch(/fotos o videos/i)
    expect(e.message).toMatch(/imagen incrustada/i)
    expect(e.message.length).toBeLessThan(400)
    expect(e.retryable).toBe(false)

    const { paraElLog } = mensajeYDetalle(e)
    expect(soloElMensaje(paraElLog)).toBe(e.message)
    expect(paraElLog.length).toBeLessThan(2000)
    expect(paraElLog).toMatch(/PUB001/)
    expect(paraElLog).not.toMatch(/iVBORw0KGgoiVBOR/)
  })

  it('un 500 se marca reintentable y se explica como problema del portal, sin HTML', () => {
    const e = errorDeRespuestaArgenprop(500, '<html>Bad Gateway</html>', '/v1/avisos')
    expect(e.retryable).toBe(true)
    expect(e.message).toMatch(/de su lado/i)
    expect(e.message).not.toContain('<')
  })

  it('401 es un error de credenciales', () => {
    const e = errorDeRespuestaArgenprop(401, '', '/v1/avisos')
    expect(e.code).toBe('auth')
    expect(e.message).toMatch(/credenciales/i)
  })
})
