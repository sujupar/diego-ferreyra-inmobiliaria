import { describe, expect, it } from 'vitest'
import { sincronizarEnvios } from './envios'

const vacio = { crear: [], cancelar: [], reactivar: [] }

describe('sincronizarEnvios', () => {
  it('una red encendida sin envío se crea', () => {
    expect(sincronizarEnvios(['instagram', 'youtube'], [])).toEqual({ ...vacio, crear: ['instagram', 'youtube'] })
  })

  it('una red encendida con envío cancelado se reactiva', () => {
    expect(sincronizarEnvios(['tiktok'], [{ plataforma: 'tiktok', estado: 'cancelado' }])).toEqual({
      ...vacio,
      reactivar: ['tiktok'],
    })
  })

  it('una red apagada con envío programado se cancela', () => {
    expect(sincronizarEnvios([], [{ plataforma: 'facebook', estado: 'programado' }])).toEqual({
      ...vacio,
      cancelar: ['facebook'],
    })
  })

  it('confirmar dos veces no crea nada nuevo', () => {
    const actuales = (['instagram', 'facebook', 'youtube', 'tiktok'] as const).map((plataforma) => ({
      plataforma,
      estado: 'programado' as const,
    }))
    expect(sincronizarEnvios(['instagram', 'facebook', 'youtube', 'tiktok'], actuales)).toEqual(vacio)
  })

  it('apagar una red ya publicada no la cancela', () => {
    expect(sincronizarEnvios([], [{ plataforma: 'instagram', estado: 'publicado' }])).toEqual(vacio)
  })

  it('envíos en curso o fallidos nunca se tocan', () => {
    expect(
      sincronizarEnvios(
        ['youtube'],
        [
          { plataforma: 'youtube', estado: 'fallido' },
          { plataforma: 'tiktok', estado: 'en_curso' },
        ],
      ),
    ).toEqual(vacio)
  })
})
