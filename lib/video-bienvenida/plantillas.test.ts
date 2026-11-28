import { describe, it, expect } from 'vitest'
import {
  PLANTILLAS_CON_VIDEO, PLANTILLA_SIN_VIDEO, esPlantillaConVideo, parametrosDelEnvio,
  esRechazoDePlantilla, esErrorDeParametros,
} from './plantillas'
import { modoDePlantilla } from '@/lib/ai/tasacion-agent'

describe('plantillas con video', () => {
  it('son la del ahorro, la del caso y la sobria; la de respaldo es tasacion_llamada_v1', () => {
    expect(PLANTILLAS_CON_VIDEO).toEqual(['tasacion_video_ahorro_v1', 'tasacion_video_caso_v1', 'tasacion_video_sobria_v1'])
    expect(PLANTILLA_SIN_VIDEO).toBe('tasacion_llamada_v1')
    expect(esPlantillaConVideo('tasacion_video_caso_v1')).toBe(true)
    expect(esPlantillaConVideo('tasacion_llamada_v1')).toBe(false)
    expect(esPlantillaConVideo(undefined)).toBe(false)
  })

  it('el agente de tasación las trata como plantillas que solo avisan', () => {
    for (const p of PLANTILLAS_CON_VIDEO) expect(modoDePlantilla(p)).toBe('solo_avisa')
  })

  it('arma nombre + URL en el cuerpo y el código en el botón', () => {
    expect(parametrosDelEnvio('tasacion_video_caso_v1', 'Ana', 'https://inmodf.com.ar/t/k7Hq2mXb9T', 'k7Hq2mXb9T'))
      .toEqual({ bodyParams: ['Ana', 'https://inmodf.com.ar/t/k7Hq2mXb9T'], urlButtonParam: 'k7Hq2mXb9T' })
    expect(parametrosDelEnvio('tasacion_llamada_v1', 'Ana', 'x', 'y')).toBeNull()
  })
})

describe('qué errores de Meta hacen la vuelta atrás en el envío', () => {
  it('plantilla pausada, deshabilitada o inexistente (132xxx)', () => {
    for (const c of ['132015', '132016', '132001', 132000, '132012']) expect(esRechazoDePlantilla(c)).toBe(true)
  })

  it('los límites de volumen siguen reintentando', () => {
    for (const c of ['131048', '131056', '130429', '80007']) expect(esRechazoDePlantilla(c)).toBe(false)
  })

  it('los frenos de marketing NO se atrapan en el envío (llegan por el webhook)', () => {
    expect(esRechazoDePlantilla('131049')).toBe(false)
    expect(esRechazoDePlantilla('131050')).toBe(false)
  })

  it('sin código no hay vuelta atrás', () => {
    expect(esRechazoDePlantilla(null)).toBe(false)
    expect(esRechazoDePlantilla(undefined)).toBe(false)
    expect(esRechazoDePlantilla('abc')).toBe(false)
  })

  it('132000 y 132012 son errores nuestros de parámetros', () => {
    expect(esErrorDeParametros('132000')).toBe(true)
    expect(esErrorDeParametros('132012')).toBe(true)
    expect(esErrorDeParametros('132015')).toBe(false)
  })
})
