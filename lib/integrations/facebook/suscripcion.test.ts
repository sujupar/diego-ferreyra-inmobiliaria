import { describe, expect, it } from 'vitest'
import { escuchaComentariosDeFacebook, paginaRecibeFeed } from './suscripcion'

const DIRECCION = 'https://inmodf.com.ar/api/webhooks/instagram'

describe('escuchaComentariosDeFacebook', () => {
  it('sí, si la app tiene el objeto page con feed, activo y a nuestra dirección', () => {
    const data = [
      { object: 'instagram', callback_url: DIRECCION, active: true, fields: [{ name: 'comments' }] },
      { object: 'page', callback_url: DIRECCION, active: true, fields: [{ name: 'feed' }, { name: 'messages' }] },
    ]
    expect(escuchaComentariosDeFacebook(data, DIRECCION)).toBe(true)
  })

  it('no, si solo está el objeto instagram (lo que pasaba hasta ahora)', () => {
    expect(escuchaComentariosDeFacebook([{ object: 'instagram', callback_url: DIRECCION, active: true, fields: [{ name: 'comments' }] }], DIRECCION)).toBe(false)
  })

  it('no, si el objeto page apunta a otra dirección', () => {
    const data = [{ object: 'page', callback_url: 'https://otro.com/x', active: true, fields: [{ name: 'feed' }] }]
    expect(escuchaComentariosDeFacebook(data, DIRECCION)).toBe(false)
  })

  it('no, si el objeto page no tiene feed o está inactivo', () => {
    expect(escuchaComentariosDeFacebook([{ object: 'page', callback_url: DIRECCION, active: true, fields: [{ name: 'messages' }] }], DIRECCION)).toBe(false)
    expect(escuchaComentariosDeFacebook([{ object: 'page', callback_url: DIRECCION, active: false, fields: [{ name: 'feed' }] }], DIRECCION)).toBe(false)
  })

  it('acepta los campos como texto (otra forma en que Meta los devuelve)', () => {
    expect(escuchaComentariosDeFacebook([{ object: 'page', callback_url: DIRECCION, active: true, fields: ['feed'] }], DIRECCION)).toBe(true)
  })

  it('no, con una respuesta vacía o rara', () => {
    expect(escuchaComentariosDeFacebook(undefined, DIRECCION)).toBe(false)
    expect(escuchaComentariosDeFacebook('nada', DIRECCION)).toBe(false)
  })
})

describe('paginaRecibeFeed', () => {
  it('sí, si nuestra app está suscrita a la página con feed', () => {
    expect(paginaRecibeFeed([{ id: '123', subscribed_fields: ['feed', 'messages'] }], '123')).toBe(true)
  })

  it('no, si es otra app o no tiene feed', () => {
    expect(paginaRecibeFeed([{ id: '999', subscribed_fields: ['feed'] }], '123')).toBe(false)
    expect(paginaRecibeFeed([{ id: '123', subscribed_fields: ['messages'] }], '123')).toBe(false)
    expect(paginaRecibeFeed(null, '123')).toBe(false)
  })
})
