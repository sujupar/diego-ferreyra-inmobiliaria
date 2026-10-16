import { describe, it, expect } from 'vitest'
import { sanearAjustes, estadoDePlantillas } from './ajustes'

const normalizar = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length >= 10 ? `549${d.slice(-10)}` : null
}

describe('sanearAjustes', () => {
  it('interruptores y teléfonos normalizados, sin repetidos por últimos 10 dígitos', () => {
    expect(sanearAjustes({ envio_automatico: true, telefonos_prueba: ['11 5823-4521', '+5491158234521', '11 4444-5555'] }, normalizar))
      .toEqual({ ok: true, cambios: { envio_automatico: true, telefonos_prueba: ['5491158234521', '5491144445555'] } })
  })
  it('un teléfono inválido se nombra en el error', () => {
    expect(sanearAjustes({ telefonos_prueba: ['123', '11 5823-4521'] }, normalizar)).toEqual({ ok: false, error: 'Revisá estos teléfonos: 123' })
  })
  it('estricto: campos desconocidos, tipos raros, más de 10 teléfonos o nada para cambiar → error', () => {
    expect(sanearAjustes({ envio_automatico: 'si' }, normalizar).ok).toBe(false)
    expect(sanearAjustes({ regalo: {} }, normalizar).ok).toBe(false)
    expect(sanearAjustes({ telefonos_prueba: Array.from({ length: 11 }, (_, i) => `11 5823-45${String(i).padStart(2, '0')}`) }, normalizar).ok).toBe(false)
    expect(sanearAjustes({}, normalizar)).toEqual({ ok: false, error: 'No hay cambios' })
  })
})

describe('estadoDePlantillas', () => {
  it('configurada y conocida, sin configurar, o configurada pero desconocida', () => {
    expect(estadoDePlantillas({ encuesta: 'encuesta_visita_v1', regalo: undefined })).toEqual([
      { uso: 'encuesta', variable: 'WHATSAPP_TEMPLATE_ENCUESTA_VISITA', configurada: 'encuesta_visita_v1', conocida: true, conBoton: true, conDocumento: false },
      { uso: 'regalo', variable: 'WHATSAPP_TEMPLATE_REGALO_VISITA', configurada: null, conocida: false, conBoton: false, conDocumento: false },
    ])
    expect(estadoDePlantillas({ encuesta: 'otra_v9', regalo: 'regalo_visita_v1' })[0]).toMatchObject({ configurada: 'otra_v9', conocida: false })
    expect(estadoDePlantillas({ encuesta: '  ', regalo: 'regalo_visita_v1' })[1]).toMatchObject({ conocida: true, conDocumento: true })
  })
})
