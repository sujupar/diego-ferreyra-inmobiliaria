import { describe, it, expect } from 'vitest'
import { decidirRespaldoBienvenida } from './respaldo'

const base = { estado: 'failed', codigoError: '131049', plantillaDelMensaje: 'tasacion_video_caso_v1' }

describe('respaldo tardío: Meta frena por marketing después de aceptar', () => {
  it('manda tasacion_llamada_v1 ante 131049 o 131050 sobre una plantilla con video', () => {
    expect(decidirRespaldoBienvenida(base)).toBe(true)
    expect(decidirRespaldoBienvenida({ ...base, codigoError: '131050' })).toBe(true)
    expect(decidirRespaldoBienvenida({ ...base, plantillaDelMensaje: 'tasacion_video_sobria_v1' })).toBe(true)
  })

  it('no manda si no falló', () => {
    expect(decidirRespaldoBienvenida({ ...base, estado: 'delivered' })).toBe(false)
  })

  it('no manda por otros errores (número inválido, etc.)', () => {
    expect(decidirRespaldoBienvenida({ ...base, codigoError: '131026' })).toBe(false)
    expect(decidirRespaldoBienvenida({ ...base, codigoError: null })).toBe(false)
  })

  it('no manda si el mensaje no era de una plantilla con video', () => {
    expect(decidirRespaldoBienvenida({ ...base, plantillaDelMensaje: 'encuesta_visita_v1' })).toBe(false)
    expect(decidirRespaldoBienvenida({ ...base, plantillaDelMensaje: null })).toBe(false)
  })
})
