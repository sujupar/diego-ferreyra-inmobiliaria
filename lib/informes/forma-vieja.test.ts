import { describe, expect, it } from 'vitest'
import { actualizarFormaVieja } from './forma-vieja'
import type { Fuentes, Manual } from './tipos'

// Las filas viejas NO cumplen los tipos de hoy: llegan de la base como datos sin tipo, igual que acá.
const deLaBase = <T,>(x: unknown) => x as T

describe('actualizarFormaVieja', () => {
  it('la fuente de ML de la Entrega 1 ({avisoId, visitas}) pasa a la lista de avisos', () => {
    const r = actualizarFormaVieja(deLaBase<Fuentes>({ mercadolibre: { estado: 'ok', actualizadoEn: 'x', error: null, datos: { avisoId: 'MLA123456789', visitas: 15 } } }), {})
    expect(r.fuentes.mercadolibre?.datos).toEqual({ avisos: [{ id: 'MLA123456789', titulo: null, url: null, origen: 'plataforma' }], visitas: 15 })
  })

  it('una fuente vieja sin aviso queda con la lista vacía, nunca sin lista', () => {
    const r = actualizarFormaVieja(deLaBase<Fuentes>({ mercadolibre: { estado: 'ok', actualizadoEn: 'x', error: null, datos: { visitas: 3 } } }), {})
    expect(r.fuentes.mercadolibre?.datos).toEqual({ avisos: [], visitas: 3 })
  })

  it('la forma nueva y una fuente sin datos no se tocan', () => {
    const nueva = { estado: 'ok' as const, actualizadoEn: 'x', error: null, datos: { avisos: [], visitas: 0 } }
    expect(actualizarFormaVieja({ mercadolibre: nueva }, {}).fuentes.mercadolibre).toBe(nueva)
    const error = { estado: 'error' as const, actualizadoEn: 'x', error: 'caído', datos: null }
    expect(actualizarFormaVieja({ mercadolibre: error }, {}).fuentes.mercadolibre).toBe(error)
  })

  it('saca del manual de ML los campos que ahora trae la API (si no, ningún guardado pasaría la validación)', () => {
    const r = actualizarFormaVieja({}, deLaBase<Manual>({ mercadolibre: { aviso: 'MLA1', contactos: 3, llamadas: 1, whatsapp: 2, preguntas: 0 }, tiktok: { visualizaciones: 4 } }))
    expect(r.manual.mercadolibre).toEqual({ aviso: 'MLA1' })
    expect(r.manual.tiktok).toEqual({ visualizaciones: 4 })
  })
})
