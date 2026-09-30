import { describe, it, expect } from 'vitest'
import { leerCambiosFicha, cambiosMlDesdeFicha, cambiosApDesdeFicha } from './cambios-ficha'

const p = { asking_price: 210000, photos: ['https://a/1.jpg', 'data:image/png;base64,xx', 'https://a/2.jpg'], expensas: 600000 }

describe('leerCambiosFicha', () => {
  it('solo campos conocidos y sin repetir', () => {
    expect(leerCambiosFicha({ cambios_ficha: ['precio', 'precio', 'titulo', 'expensas'] })).toEqual(['precio', 'expensas'])
  })
  it('marca vieja sin cambios_ficha → lista vacía (no se envía nada)', () => {
    expect(leerCambiosFicha({ needs_update: true })).toEqual([])
  })
  it('metadata null/no objeto → lista vacía', () => {
    expect(leerCambiosFicha(null)).toEqual([])
    expect(leerCambiosFicha(undefined)).toEqual([])
  })
})

describe('desde la ficha', () => {
  it('ML: solo lo marcado; expensas con ARS; fotos sin base64', () => {
    expect(cambiosMlDesdeFicha(['expensas'], p)).toEqual({ valores: { MAINTENANCE_FEE: { value_name: '600000 ARS' } } })
    expect(cambiosMlDesdeFicha(['precio', 'fotos'], p)).toEqual({ valores: {}, precio: 210000, fotos: ['https://a/1.jpg', 'https://a/2.jpg'] })
  })

  it('ML: expensas borradas en la ficha vacían el dato (ML_VALOR_VACIO no es null, así que se manda null igual)', () => {
    expect(cambiosMlDesdeFicha(['expensas'], { ...p, expensas: null })).toEqual({ valores: { MAINTENANCE_FEE: null } })
  })

  it('expensas borradas en la ficha vacían el dato', () => {
    expect(cambiosApDesdeFicha(['expensas'], { ...p, expensas: null })).toEqual({ valores: { EXPENSAS: null } })
  })

  it('AP: precio y fotos', () => {
    expect(cambiosApDesdeFicha(['precio', 'fotos'], p)).toEqual({ valores: {}, precio: 210000, fotos: ['https://a/1.jpg', 'https://a/2.jpg'] })
  })

  it('sin campos marcados → objeto sin nada que enviar', () => {
    expect(cambiosMlDesdeFicha([], p)).toEqual({ valores: {} })
    expect(cambiosApDesdeFicha([], p)).toEqual({ valores: {} })
  })

  it('sin fotos publicables (todas borradas o base64) → NO manda fotos, para no vaciar el aviso', () => {
    const sinFotos = { ...p, photos: ['data:image/png;base64,xx', 'http://inseguro/1.jpg'] }
    expect(cambiosMlDesdeFicha(['fotos'], sinFotos)).toEqual({ valores: {} })
    expect(cambiosApDesdeFicha(['fotos'], sinFotos)).toEqual({ valores: {} })
  })

  it('sin fotos publicables con photos vacío/null → tampoco manda fotos', () => {
    expect(cambiosMlDesdeFicha(['fotos'], { ...p, photos: [] })).toEqual({ valores: {} })
    expect(cambiosMlDesdeFicha(['fotos'], { ...p, photos: null })).toEqual({ valores: {} })
    expect(cambiosApDesdeFicha(['fotos'], { ...p, photos: null })).toEqual({ valores: {} })
  })
})
