import { describe, it, expect } from 'vitest'
import { fotosPublicables, MOTIVO_INCRUSTADA, MOTIVO_NO_SEGURO, MOTIVO_NO_ENLACE } from './fotos-publicables'

const OK = 'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/property-files/p/1.jpg'

describe('fotosPublicables', () => {
  it('deja pasar solo enlaces https y conserva el orden', () => {
    const r = fotosPublicables([OK, 'https://cdn.example.com/2.jpg'])
    expect(r.validas).toEqual([OK, 'https://cdn.example.com/2.jpg'])
    expect(r.descartadas).toEqual([])
  })

  it('descarta una imagen incrustada (base64) y dice en qué posición estaba', () => {
    const r = fotosPublicables([OK, 'data:image/png;base64,iVBORw0KGgo='])
    expect(r.validas).toEqual([OK])
    expect(r.descartadas).toEqual([{ indice: 1, motivo: MOTIVO_INCRUSTADA }])
  })

  it('descarta http sin s (los portales exigen https) y lo que no es un enlace', () => {
    const r = fotosPublicables(['http://a/1.jpg', 'foto.jpg', OK])
    expect(r.validas).toEqual([OK])
    expect(r.descartadas).toEqual([
      { indice: 0, motivo: MOTIVO_NO_SEGURO },
      { indice: 1, motivo: MOTIVO_NO_ENLACE },
    ])
  })

  it('descarta un enlace absurdamente largo (un base64 disfrazado)', () => {
    const r = fotosPublicables([`https://a/${'x'.repeat(2500)}.jpg`])
    expect(r.validas).toEqual([])
    expect(r.descartadas[0].motivo).toBe(MOTIVO_NO_ENLACE)
  })

  it('null/undefined/vacío → nada válido, nada descartado', () => {
    expect(fotosPublicables(null)).toEqual({ validas: [], descartadas: [] })
    expect(fotosPublicables(undefined)).toEqual({ validas: [], descartadas: [] })
    expect(fotosPublicables([])).toEqual({ validas: [], descartadas: [] })
  })

  it('un valor que no es string se descarta como "no es un enlace"', () => {
    const r = fotosPublicables([123 as unknown as string, OK])
    expect(r.validas).toEqual([OK])
    expect(r.descartadas).toEqual([{ indice: 0, motivo: MOTIVO_NO_ENLACE }])
  })
})
