import { describe, expect, it } from 'vitest'
import { BloqueoInstagram, detectarBloqueo } from './bloqueo'

const normal = { url: 'https://www.instagram.com/api/v1/media/1/info/', status: 200, cuerpo: '{"items":[]}' }

describe('detectarBloqueo', () => {
  it('null para una respuesta normal', () => {
    expect(detectarBloqueo(normal)).toBeNull()
  })
  it('login si terminó en la pantalla de login', () => {
    expect(detectarBloqueo({ ...normal, url: 'https://www.instagram.com/accounts/login/?next=/' })).toBe('login')
  })
  it('login si el cuerpo pide iniciar sesión', () => {
    expect(detectarBloqueo({ ...normal, status: 401, cuerpo: '{"message":"x","require_login":true,"status":"fail"}' })).toBe('login')
  })
  it('desafio ante checkpoint o challenge', () => {
    expect(detectarBloqueo({ ...normal, status: 400, cuerpo: '{"message":"checkpoint_required"}' })).toBe('desafio')
    expect(detectarBloqueo({ ...normal, url: 'https://www.instagram.com/challenge/?next=/' })).toBe('desafio')
  })
  it('limite ante 429, "Please wait" o feedback_required', () => {
    expect(detectarBloqueo({ ...normal, status: 429 })).toBe('limite')
    expect(detectarBloqueo({ ...normal, status: 400, cuerpo: '{"message":"Please wait a few minutes before you try again."}' })).toBe('limite')
    expect(detectarBloqueo({ ...normal, status: 400, cuerpo: '{"message":"feedback_required"}' })).toBe('limite')
  })
  it('un perfil llamado challengeinmobiliario NO es un desafío', () => {
    expect(detectarBloqueo({ ...normal, url: 'https://www.instagram.com/challengeinmobiliario/' })).toBeNull()
    expect(detectarBloqueo({ ...normal, url: 'https://www.instagram.com/checkpointprop/reels/' })).toBeNull()
    expect(detectarBloqueo({ ...normal, url: 'https://www.instagram.com/loginmaster/accounts/login' })).toBeNull()
  })
  it('desafío por el primer segmento del path', () => {
    expect(detectarBloqueo({ ...normal, url: 'https://www.instagram.com/checkpoint/123/' })).toBe('desafio')
    expect(detectarBloqueo({ ...normal, url: 'https://www.instagram.com/challenge/action/?next=/x' })).toBe('desafio')
  })
  it('un 200 cuyo caption o comentario dice "Please wait a few minutes" NO es un límite', () => {
    const cuerpo = JSON.stringify({
      items: [{ caption: { text: 'Please wait a few minutes... checkpoint_required "challenge" require_login' } }],
      status: 'ok',
    })
    expect(detectarBloqueo({ ...normal, cuerpo })).toBeNull()
  })
  it('un 200 con los campos de primer nivel de un freno SÍ cuenta', () => {
    expect(detectarBloqueo({ ...normal, cuerpo: '{"message":"Please wait a few minutes before you try again.","status":"fail"}' })).toBe('limite')
    expect(detectarBloqueo({ ...normal, cuerpo: '{"message":"x","checkpoint_url":"https://i.instagram.com/challenge/1/","status":"fail"}' })).toBe('desafio')
  })
  it('un 401/403 pelado no es sesión vencida (lo decide el que llama como error de la cuenta)', () => {
    expect(detectarBloqueo({ ...normal, status: 401, cuerpo: '' })).toBeNull()
    expect(detectarBloqueo({ ...normal, status: 403, cuerpo: '{"message":"","status":"fail"}' })).toBeNull()
  })
  it('texto libre solo en respuestas no-200 que no son JSON', () => {
    expect(detectarBloqueo({ ...normal, status: 400, cuerpo: '<html>Please wait a few minutes</html>' })).toBe('limite')
    expect(detectarBloqueo({ ...normal, status: 200, cuerpo: '<html>Please wait a few minutes</html>' })).toBeNull()
  })
  it('BloqueoInstagram lleva el tipo', () => {
    const e = new BloqueoInstagram('desafio', 'x')
    expect(e).toBeInstanceOf(Error)
    expect(e.tipo).toBe('desafio')
  })
})
