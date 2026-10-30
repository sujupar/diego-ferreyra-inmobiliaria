import { describe, expect, it } from 'vitest'
import { etiquetaEtapa, reintentar, siguienteAccion } from './preparacion'

const base = { video_path: 'tandas/t/v/video.mp4', audio_path: null, miniatura_path: null }

describe('siguienteAccion', () => {
  it('subiendo y extrayendo esperan al navegador', () => {
    expect(siguienteAccion({ ...base, etapa: 'subiendo' })).toBe('esperar_navegador')
    expect(siguienteAccion({ ...base, etapa: 'extrayendo' })).toBe('esperar_navegador')
  })

  it('transcribiendo sin audio espera al navegador', () => {
    expect(siguienteAccion({ ...base, etapa: 'transcribiendo' })).toBe('esperar_navegador')
  })

  it('transcribiendo con audio transcribe', () => {
    expect(siguienteAccion({ ...base, etapa: 'transcribiendo', audio_path: 'tandas/t/v/audio.wav' })).toBe('transcribir')
  })

  it('describiendo describe', () => {
    expect(siguienteAccion({ ...base, etapa: 'describiendo' })).toBe('describir')
  })

  it('listo y error no hacen nada', () => {
    expect(siguienteAccion({ ...base, etapa: 'listo' })).toBe('nada')
    expect(siguienteAccion({ ...base, etapa: 'error' })).toBe('nada')
  })
})

describe('etiquetaEtapa', () => {
  it('textos exactos', () => {
    expect(etiquetaEtapa('subiendo', 42)).toBe('Subiendo 42 %')
    expect(etiquetaEtapa('subiendo')).toBe('Subiendo')
    expect(etiquetaEtapa('extrayendo')).toBe('Preparando el audio')
    expect(etiquetaEtapa('transcribiendo')).toBe('Escuchando el audio')
    expect(etiquetaEtapa('describiendo')).toBe('Escribiendo la descripción')
    expect(etiquetaEtapa('listo')).toBe('Listo')
    expect(etiquetaEtapa('error')).toBe('No se pudo preparar')
  })

  it('redondea el progreso', () => {
    expect(etiquetaEtapa('subiendo', 41.6)).toBe('Subiendo 42 %')
  })
})

describe('reintentar', () => {
  it('vuelve a la etapa que falló', () => {
    expect(reintentar({ etapa: 'error', error_etapa: 'transcribiendo' })).toBe('transcribiendo')
  })

  it('sin etapa registrada vuelve a extraer', () => {
    expect(reintentar({ etapa: 'error', error_etapa: null })).toBe('extrayendo')
  })

  it('un video que no está en error queda igual', () => {
    expect(reintentar({ etapa: 'describiendo', error_etapa: null })).toBe('describiendo')
  })
})
