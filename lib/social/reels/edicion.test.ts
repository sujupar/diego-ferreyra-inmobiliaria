import { describe, it, expect } from 'vitest'
import { camposEditables, validarProgramacion, type CamposEditablesReel } from './edicion'

describe('camposEditables', () => {
  it('deja pasar solo los campos permitidos', () => {
    const entrada = {
      descripcion: 'hola',
      palabra_clave: 'propiedad',
      dm_texto: 'texto',
      dm_boton: 'Sí',
      dm_seguimiento: 'acá va',
      simulacro: false,
      automatizacion_activa: true,
      programado_para: '2026-09-25T19:00:00Z',
    }
    expect(Object.keys(camposEditables(entrada)).sort()).toEqual(Object.keys(entrada).sort())
  })

  it('DESCARTA cualquier campo que no esté en la lista', () => {
    // Sin lista blanca, un PATCH podría escribir ig_media_id, estado o
    // property_id y reapuntar un reel a otra propiedad. Es el mismo agujero que
    // ya tiene el PUT genérico de propiedades y que está documentado.
    const entrada = {
      descripcion: 'hola',
      estado: 'publicado',
      ig_media_id: '999',
      property_id: 'otra-propiedad',
      created_by: 'otro-usuario',
    } as unknown as CamposEditablesReel
    expect(camposEditables(entrada)).toEqual({ descripcion: 'hola' })
  })

  it('no inventa campos que no vinieron', () => {
    expect(camposEditables({ descripcion: 'hola' })).toEqual({ descripcion: 'hola' })
  })

  it('un objeto vacío no produce ninguna escritura', () => {
    expect(camposEditables({})).toEqual({})
  })

  it('respeta el valor false, que no es lo mismo que ausente', () => {
    // Con un filtro por "truthy", apagar el simulacro sería imposible: el
    // interruptor se quedaría prendido para siempre.
    expect(camposEditables({ simulacro: false })).toEqual({ simulacro: false })
  })

  it('recorta la palabra clave y descarta la que queda vacía', () => {
    expect(camposEditables({ palabra_clave: '  propiedad  ' })).toEqual({ palabra_clave: 'propiedad' })
    expect(camposEditables({ palabra_clave: '   ' })).toEqual({ palabra_clave: null })
  })

  it('guarda la lista de palabras limpia: sin repetidas ni vacías', () => {
    expect(camposEditables({ palabra_clave: 'doblas, DOBLAS, , info' })).toEqual({ palabra_clave: 'doblas, info' })
  })

  it('una lista de solo comas se guarda como null', () => {
    expect(camposEditables({ palabra_clave: ' , , ' })).toEqual({ palabra_clave: null })
  })
})

describe('validarProgramacion', () => {
  const AHORA = new Date('2026-09-22T12:00:00Z')

  it('acepta una fecha futura', () => {
    expect(validarProgramacion('2026-09-25T19:00:00Z', AHORA)).toEqual({ ok: true })
  })

  it('rechaza una fecha pasada', () => {
    // Programar para atrás haría que el cron lo publique en la corrida
    // siguiente, o sea "ya", que no es lo que el asesor pidió.
    const r = validarProgramacion('2026-09-20T19:00:00Z', AHORA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/futura|pasada/i)
  })

  it('rechaza una fecha ilegible', () => {
    const r = validarProgramacion('el jueves', AHORA)
    expect(r.ok).toBe(false)
  })

  it('rechaza una fecha absurdamente lejana', () => {
    // Un error de tipeo en el año dejaría un reel colgado para siempre sin que
    // nadie entienda por qué nunca se publicó.
    const r = validarProgramacion('2126-09-25T19:00:00Z', AHORA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/lejana|año/i)
  })

  it('sin fecha significa "publicar ahora" y es válido', () => {
    expect(validarProgramacion(null, AHORA)).toEqual({ ok: true })
  })
})
