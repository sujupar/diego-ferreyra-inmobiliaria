import { describe, it, expect } from 'vitest'
import { firmaFotos, firmaDireccion } from './firmas'

describe('firmaFotos', () => {
  it('es la misma para el mismo array', () => {
    expect(firmaFotos(['a', 'b'])).toBe(firmaFotos(['a', 'b']))
  })
  it('cambia si cambia el orden (la portada importa)', () => {
    expect(firmaFotos(['a', 'b'])).not.toBe(firmaFotos(['b', 'a']))
  })
  it('cambia si cambia una URL', () => {
    expect(firmaFotos(['a', 'b'])).not.toBe(firmaFotos(['a', 'c']))
  })
  it('no confunde ["ab"] con ["a","b"]', () => {
    expect(firmaFotos(['ab'])).not.toBe(firmaFotos(['a', 'b']))
  })
  it('es estable con array vacío', () => {
    expect(firmaFotos([])).toBe(firmaFotos([]))
  })
})

describe('firmaDireccion', () => {
  it('ignora mayúsculas, espacios de más y la forma de la tilde', () => {
    const nfd = 'Díaz Colodrero 2327'
    expect(firmaDireccion({ address: 'Díaz Colodrero 2327', neighborhood: 'Villa Urquiza', city: 'CABA' }))
      .toBe(firmaDireccion({ address: `  ${nfd.toLowerCase()}  `, neighborhood: 'villa  urquiza', city: 'caba' }))
  })
  it('cambia si cambia el barrio', () => {
    expect(firmaDireccion({ address: 'X 1', neighborhood: 'Almagro' }))
      .not.toBe(firmaDireccion({ address: 'X 1', neighborhood: 'Boedo' }))
  })
})
