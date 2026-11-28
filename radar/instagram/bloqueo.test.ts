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
  it('BloqueoInstagram lleva el tipo', () => {
    const e = new BloqueoInstagram('desafio', 'x')
    expect(e).toBeInstanceOf(Error)
    expect(e.tipo).toBe('desafio')
  })
})
