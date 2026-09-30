import { describe, it, expect } from 'vitest'
import { nextStateAfterError, stripFlag, setFlag, swapFlag, estadoTrasFalloActualizacion, metadataTrasExito } from './worker-logic'
import { PortalAdapterError } from './types'

describe('nextStateAfterError', () => {
  it('retries with 60s backoff on first attempt with generic error', () => {
    const state = nextStateAfterError(0, new Error('Network down'))
    expect(state.status).toBe('pending')
    expect(state.attempts).toBe(1)
    expect(state.last_error).toBe('Network down')
    expect(state.next_attempt_at).not.toBeNull()
    // ~60s from now
    const delta = new Date(state.next_attempt_at!).getTime() - Date.now()
    expect(delta).toBeGreaterThan(55_000)
    expect(delta).toBeLessThan(65_000)
  })

  it('fails immediately if PortalAdapterError.retryable=false', () => {
    const err = new PortalAdapterError('Bad validation', 'mercadolibre', 'validation', false)
    const state = nextStateAfterError(0, err)
    expect(state.status).toBe('failed')
    expect(state.attempts).toBe(1)
    expect(state.next_attempt_at).toBeNull()
    expect(state.last_error).toContain('Bad validation')
  })

  it('retries when PortalAdapterError.retryable=true', () => {
    const err = new PortalAdapterError('Rate limited', 'mercadolibre', 'rate_limit', true)
    const state = nextStateAfterError(1, err)
    expect(state.status).toBe('pending')
    expect(state.attempts).toBe(2)
    // attempt 2 → backoff index 1 = 300s
    const delta = new Date(state.next_attempt_at!).getTime() - Date.now()
    expect(delta).toBeGreaterThan(295_000)
    expect(delta).toBeLessThan(305_000)
  })

  it('fails after exhausting all 5 attempts', () => {
    const state = nextStateAfterError(5, new Error('Still down'))
    expect(state.status).toBe('failed')
    expect(state.attempts).toBe(6)
    expect(state.next_attempt_at).toBeNull()
  })

  it('handles non-Error throws (string, undefined)', () => {
    const stringState = nextStateAfterError(0, 'just a string')
    expect(stringState.last_error).toBe('just a string')
    expect(stringState.status).toBe('pending')

    const undefState = nextStateAfterError(0, undefined)
    expect(undefState.last_error).toBe('undefined')
  })
})

describe('stripFlag', () => {
  it('removes a key from an object', () => {
    const result = stripFlag({ a: 1, b: 2, needs_update: true }, 'needs_update')
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('returns empty object when metadata is null', () => {
    expect(stripFlag(null, 'foo')).toEqual({})
  })

  it('returns empty object when metadata is undefined', () => {
    expect(stripFlag(undefined, 'foo')).toEqual({})
  })

  it('does not mutate the input', () => {
    const input = { needs_update: true, other: 'x' }
    stripFlag(input, 'needs_update')
    expect(input).toEqual({ needs_update: true, other: 'x' })
  })
})

describe('setFlag', () => {
  it('sets a key in an object', () => {
    const result = setFlag({ a: 1 }, 'b', 2)
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('overrides existing key', () => {
    const result = setFlag({ a: 1 }, 'a', 99)
    expect(result).toEqual({ a: 99 })
  })

  it('does not mutate input', () => {
    const input = { a: 1 }
    setFlag(input, 'b', 2)
    expect(input).toEqual({ a: 1 })
  })
})

describe('swapFlag', () => {
  it('removes one flag and adds another', () => {
    const result = swapFlag(
      { needs_update: true, other: 'x' },
      'needs_update',
      'update_in_progress',
    )
    expect(result).toEqual({ other: 'x', update_in_progress: true })
  })

  it('works when source flag is missing', () => {
    const result = swapFlag({ other: 'x' }, 'needs_update', 'update_in_progress')
    expect(result).toEqual({ other: 'x', update_in_progress: true })
  })
})

describe('estadoTrasFalloActualizacion', () => {
  it('reintenta hasta 3 y después deja el fallo visible', () => {
    const m1 = estadoTrasFalloActualizacion({ cambios_ficha: ['precio'] }, 'ML 400')
    expect(m1).toMatchObject({ needs_update: true, intentos_actualizacion: 1 })
    const m3 = estadoTrasFalloActualizacion({ ...m1, intentos_actualizacion: 2 }, 'ML 400')
    expect(m3.needs_update).toBe(false)
    expect(m3.actualizacion_fallida).toMatchObject({ motivo: 'ML 400', cambios_ficha: ['precio'] })
  })

  it('limpia update_in_progress y no arrastra un actualizacion_fallida viejo si vuelve a reintentar', () => {
    const m1 = estadoTrasFalloActualizacion({ update_in_progress: true, cambios_ficha: ['fotos'] }, 'timeout')
    expect(m1).not.toHaveProperty('update_in_progress')
    expect(m1.needs_update).toBe(true)
    expect(m1.intentos_actualizacion).toBe(1)
  })
})

describe('metadataTrasExito', () => {
  it('limpia todas las marcas de actualización y conserva lo demás', () => {
    expect(metadataTrasExito({ needs_update: true, cambios_ficha: ['precio'], intentos_actualizacion: 2, ml_attributes: { A: 1 } }))
      .toEqual({ ml_attributes: { A: 1 } })
  })

  it('metadata null → objeto vacío', () => {
    expect(metadataTrasExito(null)).toEqual({})
  })
})
