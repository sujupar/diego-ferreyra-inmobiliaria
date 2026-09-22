import { describe, it, expect } from 'vitest'
import {
  ESTADOS_REEL,
  etiquetaEstado,
  puedeCancelar,
  puedePedirPublicacion,
  puedeReintentar,
  type EstadoReel,
} from './estados'

describe('puedePedirPublicacion', () => {
  it('se publica desde borrador', () => {
    expect(puedePedirPublicacion('borrador')).toBe(true)
  })

  it('se vuelve a publicar lo que falló', () => {
    expect(puedePedirPublicacion('fallido')).toBe(true)
  })

  it('NO se publica lo que ya está publicado', () => {
    expect(puedePedirPublicacion('publicado')).toBe(false)
  })

  it('NO se publica mientras Instagram procesa', () => {
    // Pedirlo de nuevo acá crearía un SEGUNDO contenedor y saldrían dos reels
    // iguales en la cuenta.
    expect(puedePedirPublicacion('procesando')).toBe(false)
  })

  it('NO se publica lo que ya está programado', () => {
    expect(puedePedirPublicacion('programado')).toBe(false)
  })
})

describe('puedeCancelar', () => {
  it('solo se cancela lo programado', () => {
    expect(puedeCancelar('programado')).toBe(true)
  })

  it('no se cancela lo que Instagram ya está procesando', () => {
    // El contenedor ya existe del lado de Instagram: "cancelar" acá sería
    // mentir, el reel puede salir igual.
    expect(puedeCancelar('procesando')).toBe(false)
  })

  it('no se cancela lo publicado ni el borrador', () => {
    expect(puedeCancelar('publicado')).toBe(false)
    expect(puedeCancelar('borrador')).toBe(false)
  })
})

describe('puedeReintentar', () => {
  it('solo se reintenta lo fallido', () => {
    expect(puedeReintentar('fallido')).toBe(true)
    for (const estado of ['borrador', 'programado', 'procesando', 'publicado'] as const) {
      expect(puedeReintentar(estado)).toBe(false)
    }
  })
})

describe('etiquetaEstado', () => {
  it('cada estado tiene una etiqueta en castellano, no el valor crudo', () => {
    for (const estado of ESTADOS_REEL) {
      const etiqueta = etiquetaEstado(estado)
      expect(etiqueta.length).toBeGreaterThan(0)
      expect(etiqueta).not.toBe(estado)
    }
  })

  it('el catálogo tiene los cinco estados que acepta la base', () => {
    // Si acá aparece uno nuevo hay que tocar TAMBIÉN el CHECK de la migración,
    // o Postgres rechaza la escritura con un 23514 que nadie espera.
    expect([...ESTADOS_REEL].sort()).toEqual(
      ['borrador', 'fallido', 'procesando', 'programado', 'publicado'],
    )
  })

  it('un estado desconocido no rompe la pantalla', () => {
    // Llega de la base: si alguien agrega un valor y se olvida de acá, la ficha
    // tiene que seguir cargando.
    expect(etiquetaEstado('lo_que_sea' as EstadoReel)).toBeTruthy()
  })
})
