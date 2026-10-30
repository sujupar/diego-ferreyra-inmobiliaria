import { describe, expect, it } from 'vitest'
import { enlaceAbsoluto, fasesFb, interpretarEstadoFb } from './reels'

describe('interpretarEstadoFb', () => {
  it('publicado cuando la fase de publicación terminó', () => {
    expect(
      interpretarEstadoFb({ status: { video_status: 'ready', publishing_phase: { status: 'complete', publish_status: 'published' } } }),
    ).toBe('publicado')
  })

  it('procesando mientras sube o procesa', () => {
    expect(
      interpretarEstadoFb({
        status: { video_status: 'processing', processing_phase: { status: 'in_progress' }, publishing_phase: { status: 'not_started' } },
      }),
    ).toBe('procesando')
  })

  it('error si alguna fase dio error', () => {
    expect(interpretarEstadoFb({ status: { video_status: 'error', processing_phase: { status: 'error' } } })).toBe('error')
    expect(interpretarEstadoFb({ status: { video_status: 'ready', uploading_phase: { status: 'error' } } })).toBe('error')
  })

  it('lo desconocido se trata como procesando, nunca como publicado', () => {
    expect(interpretarEstadoFb({})).toBe('procesando')
    expect(interpretarEstadoFb(null)).toBe('procesando')
  })
})

describe('fasesFb', () => {
  it('se puede pedir publicar solo con la subida completa y la publicación sin empezar', () => {
    expect(
      fasesFb({ status: { uploading_phase: { status: 'complete' }, publishing_phase: { status: 'not_started' } } }),
    ).toEqual({ listoParaPublicar: true, publicacionPedida: false })
  })

  it('mientras Facebook todavía baja el archivo no se pide publicar', () => {
    expect(fasesFb({ status: { uploading_phase: { status: 'in_progress' }, publishing_phase: { status: 'not_started' } } }).listoParaPublicar).toBe(false)
  })

  it('si la publicación ya arrancó, ya se pidió (no se pide de nuevo)', () => {
    expect(fasesFb({ status: { uploading_phase: { status: 'complete' }, publishing_phase: { status: 'in_progress' } } })).toEqual({
      listoParaPublicar: false,
      publicacionPedida: true,
    })
  })
})

describe('enlaceAbsoluto', () => {
  it('completa un enlace relativo de Facebook', () => {
    expect(enlaceAbsoluto('/reel/123/')).toBe('https://www.facebook.com/reel/123/')
  })

  it('deja uno absoluto como está y descarta lo que no es https', () => {
    expect(enlaceAbsoluto('https://www.facebook.com/reel/1')).toBe('https://www.facebook.com/reel/1')
    expect(enlaceAbsoluto('javascript:alert(1)')).toBeNull()
    expect(enlaceAbsoluto(undefined)).toBeNull()
  })
})
