import { describe, it, expect } from 'vitest'
import { marcaVideo } from './marca'

const tramos = (n: number) => '1'.repeat(n) + '0'.repeat(100 - n)
const enviado = { enviadoAt: '2026-11-28T10:00:00Z', envioFallidoAt: null, aperturas: 0 }

describe('marca del video en la fila de la cartera', () => {
  it('vio: muestra el porcentaje de tramos vistos', () => {
    expect(marcaVideo({ ...enviado, aperturas: 2 }, { playbackStarted: true, watchedBuckets: tramos(63) }))
      .toEqual({ texto: '▶ Vio 63 %', estado: 'vio' })
  })

  it('abrió sin play', () => {
    expect(marcaVideo({ ...enviado, aperturas: 1 }, null)).toEqual({ texto: 'Abrió el video', estado: 'abrio' })
    expect(marcaVideo({ ...enviado, aperturas: 1 }, { playbackStarted: false, watchedBuckets: null }))
      .toEqual({ texto: 'Abrió el video', estado: 'abrio' })
  })

  it('no lo abrió', () => {
    expect(marcaVideo(enviado, null)).toEqual({ texto: 'No abrió el video', estado: 'no_abrio' })
  })

  it('sin enlace, sin enviar o con envío fallido: sin marca', () => {
    expect(marcaVideo(null, null)).toBeNull()
    expect(marcaVideo({ ...enviado, enviadoAt: null }, null)).toBeNull()
    expect(marcaVideo({ ...enviado, envioFallidoAt: '2026-11-28T10:05:00Z' }, null)).toBeNull()
  })

  it('un enlace manual que la persona abrió igual muestra lo que hizo', () => {
    expect(marcaVideo({ enviadoAt: null, envioFallidoAt: null, aperturas: 1 }, { playbackStarted: true, watchedBuckets: tramos(10) }))
      .toEqual({ texto: '▶ Vio 10 %', estado: 'vio' })
  })

  it('tocó play pero sin tramos guardados todavía: Vio 0 %', () => {
    expect(marcaVideo({ ...enviado, aperturas: 1 }, { playbackStarted: true, watchedBuckets: null }))
      .toEqual({ texto: '▶ Vio 0 %', estado: 'vio' })
  })
})
