import { describe, expect, it } from 'vitest'
import { crearEstado, verificarEstado } from './estado'

const SECRETO = 'secreto-de-prueba-largo'
const AHORA = new Date('2026-11-04T15:00:00Z')

describe('estado de OAuth', () => {
  it('lo que se firma se verifica y devuelve quién lo pidió', () => {
    const { estado, nonce } = crearEstado(SECRETO, { plataforma: 'youtube', usuarioId: 'u1', ahora: AHORA })
    expect(verificarEstado(estado, SECRETO, { plataforma: 'youtube', nonce, ahora: AHORA })).toEqual({ ok: true, usuarioId: 'u1' })
  })

  it('un estado alterado no pasa', () => {
    const { estado, nonce } = crearEstado(SECRETO, { plataforma: 'youtube', usuarioId: 'u1', ahora: AHORA })
    const [cuerpo, firma] = estado.split('.')
    const otro = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cuerpo, 'base64url').toString()), u: 'intruso' })).toString('base64url')
    expect(verificarEstado(`${otro}.${firma}`, SECRETO, { plataforma: 'youtube', nonce, ahora: AHORA }).ok).toBe(false)
  })

  it('sin la cookie del mismo navegador no pasa (un enlace armado por otro)', () => {
    const { estado } = crearEstado(SECRETO, { plataforma: 'youtube', usuarioId: 'u1', ahora: AHORA })
    expect(verificarEstado(estado, SECRETO, { plataforma: 'youtube', nonce: 'otra', ahora: AHORA }).ok).toBe(false)
    expect(verificarEstado(estado, SECRETO, { plataforma: 'youtube', nonce: null, ahora: AHORA }).ok).toBe(false)
  })

  it('vence a los 10 minutos', () => {
    const { estado, nonce } = crearEstado(SECRETO, { plataforma: 'youtube', usuarioId: 'u1', ahora: AHORA })
    const despues = new Date(AHORA.getTime() + 11 * 60_000)
    expect(verificarEstado(estado, SECRETO, { plataforma: 'youtube', nonce, ahora: despues })).toMatchObject({ ok: false, motivo: 'vencido' })
  })

  it('un estado de TikTok no sirve para YouTube', () => {
    const { estado, nonce } = crearEstado(SECRETO, { plataforma: 'tiktok', usuarioId: 'u1', ahora: AHORA })
    expect(verificarEstado(estado, SECRETO, { plataforma: 'youtube', nonce, ahora: AHORA }).ok).toBe(false)
  })

  it('basura no explota', () => {
    for (const x of ['', 'a.b', 'sin-punto', '...']) {
      expect(verificarEstado(x, SECRETO, { plataforma: 'youtube', nonce: 'n', ahora: AHORA }).ok).toBe(false)
    }
  })

  it('sin secreto no se firma nada', () => {
    expect(() => crearEstado('', { plataforma: 'youtube', usuarioId: 'u1', ahora: AHORA })).toThrow()
  })
})
