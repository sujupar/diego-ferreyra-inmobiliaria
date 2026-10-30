import { describe, it, expect, vi } from 'vitest'
import { leerSesion, type ClienteConSesion } from './sesion'

function cliente(resultado: Awaited<ReturnType<ClienteConSesion['auth']['getClaims']>>): ClienteConSesion {
  return { auth: { getClaims: vi.fn().mockResolvedValue(resultado) } }
}

describe('leerSesion', () => {
  it('devuelve id y email de la sesión firmada', async () => {
    const s = await leerSesion(cliente({ data: { claims: { sub: 'u-1', email: 'ana@x.com' } }, error: null }))
    expect(s).toEqual({ id: 'u-1', email: 'ana@x.com' })
  })

  it('sin sesión → null', async () => {
    expect(await leerSesion(cliente({ data: null, error: null }))).toBeNull()
  })

  it('firma inválida o token vencido (error de Supabase) → null', async () => {
    expect(await leerSesion(cliente({ data: null, error: { message: 'Invalid JWT signature' } }))).toBeNull()
  })

  it('claims sin sub (token anónimo de la clave anon) → null', async () => {
    expect(await leerSesion(cliente({ data: { claims: { role: 'anon' } }, error: null }))).toBeNull()
  })

  it('sub vacío o que no es texto → null', async () => {
    expect(await leerSesion(cliente({ data: { claims: { sub: '' } }, error: null }))).toBeNull()
    expect(await leerSesion(cliente({ data: { claims: { sub: 42 } }, error: null }))).toBeNull()
  })

  it('sin email en los claims → email vacío, no se cae', async () => {
    expect(await leerSesion(cliente({ data: { claims: { sub: 'u-1' } }, error: null }))).toEqual({ id: 'u-1', email: '' })
  })

  it('si Supabase tira (red caída), no deja pasar: null', async () => {
    const c: ClienteConSesion = { auth: { getClaims: vi.fn().mockRejectedValue(new Error('fetch failed')) } }
    expect(await leerSesion(c)).toBeNull()
  })
})
