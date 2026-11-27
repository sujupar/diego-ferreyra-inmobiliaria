import { describe, it, expect } from 'vitest'
import { esVisitaDelEquipo } from './equipo'

describe('las visitas del equipo no se miden', () => {
  it('con sesión válida, es del equipo', () => {
    expect(esVisitaDelEquipo({ haySesionValida: true, nombresDeCookies: [] })).toBe(true)
  })

  it('con la cookie de sesión aunque esté vencida (o partida en pedazos), es del equipo', () => {
    expect(esVisitaDelEquipo({ haySesionValida: false, nombresDeCookies: ['sb-mncsnastmcjdjxrehdep-auth-token'] })).toBe(true)
    expect(esVisitaDelEquipo({ haySesionValida: false, nombresDeCookies: ['df_anon', 'sb-mncsnastmcjdjxrehdep-auth-token.0'] })).toBe(true)
  })

  it('un cliente que llega desde WhatsApp no tiene esas cookies', () => {
    expect(esVisitaDelEquipo({ haySesionValida: false, nombresDeCookies: [] })).toBe(false)
    expect(esVisitaDelEquipo({ haySesionValida: false, nombresDeCookies: ['df_anon', '_fbp', 'sb-otra-cosa'] })).toBe(false)
  })
})
