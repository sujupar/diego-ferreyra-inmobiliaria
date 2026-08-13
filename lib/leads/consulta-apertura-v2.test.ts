import { describe, it, expect } from 'vitest'
import {
  elegirAperturaV2,
  enlaceUtilizable,
  escaleraDeApertura,
  PLANTILLAS_V2,
  CUERPO_V2_CON_ENLACE,
  CUERPO_V2_SIN_ENLACE,
} from './consulta-apertura-v2'

const v1 = {
  plantilla: 'consulta_video',
  plantillaUtil: 'consulta_video_util',
  params: ['Martín', 'un video', 'la casa de Pico 4690'],
  cuerpo: 'viejo cálido {{1}}',
  cuerpoUtil: 'viejo trámite {{1}}',
  header: { tipo: 'video' as const, link: 'https://x/v.mp4' },
}

describe('enlaceUtilizable — un parámetro vacío hace que Meta rechace el envío entero', () => {
  it('acepta http y https', () => {
    expect(enlaceUtilizable('https://www.argenprop.com/aviso--19963489')).toBe('https://www.argenprop.com/aviso--19963489')
    expect(enlaceUtilizable('http://x.com/a')).toBe('http://x.com/a')
  })

  it('descarta lo que no es un enlace', () => {
    expect(enlaceUtilizable(null)).toBeNull()
    expect(enlaceUtilizable(undefined)).toBeNull()
    expect(enlaceUtilizable('')).toBeNull()
    expect(enlaceUtilizable('   ')).toBeNull()
    expect(enlaceUtilizable('javascript:alert(1)')).toBeNull()
    expect(enlaceUtilizable('www.argenprop.com/aviso')).toBeNull()
  })

  it('recorta los espacios de los costados', () => {
    expect(enlaceUtilizable('  https://x.com/a  ')).toBe('https://x.com/a')
  })
})

describe('elegirAperturaV2', () => {
  it('con enlace usa la plantilla de tres variables', () => {
    const a = elegirAperturaV2({
      nombre: 'Martín Pérez',
      propiedad: 'la casa de Pico 4690, Saavedra',
      enlace: 'https://www.argenprop.com/aviso--19963489',
    })
    expect(a.plantilla).toBe(PLANTILLAS_V2.conEnlace)
    expect(a.plantillaUtil).toBe(PLANTILLAS_V2.conEnlaceUtil)
    expect(a.cuerpo).toBe(CUERPO_V2_CON_ENLACE)
    expect(a.params).toEqual(['Martín', 'la casa de Pico 4690, Saavedra', 'https://www.argenprop.com/aviso--19963489'])
  })

  it('SIN enlace usa la de dos variables — es el caso de ZonaProp, el 83% del volumen', () => {
    const a = elegirAperturaV2({ nombre: 'Martín', propiedad: 'la casa de Pico 4690', enlace: null })
    expect(a.plantilla).toBe(PLANTILLAS_V2.sinEnlace)
    expect(a.cuerpo).toBe(CUERPO_V2_SIN_ENLACE)
    expect(a.params).toHaveLength(2)
    // Que NO viaje un tercer parámetro vacío es el punto: Meta rechazaría todo.
    expect(a.params.every(p => p.trim().length > 0)).toBe(true)
  })

  it('un enlace basura cae en la variante sin enlace, no manda basura', () => {
    const a = elegirAperturaV2({ nombre: 'Martín', propiedad: 'la casa', enlace: '   ' })
    expect(a.plantilla).toBe(PLANTILLAS_V2.sinEnlace)
    expect(a.params).toHaveLength(2)
  })

  it('solo el nombre de pila', () => {
    expect(elegirAperturaV2({ nombre: 'María Fernanda Gómez', propiedad: 'x' }).params[0]).toBe('María')
  })

  it('sin nombre no deja el saludo colgado', () => {
    expect(elegirAperturaV2({ nombre: '   ', propiedad: 'x' }).params[0]).toBe('Hola')
  })

  it('el cuerpo con enlace tiene TRES marcadores y el otro DOS', () => {
    // Si el cuerpo y los parámetros se desajustan, Meta rechaza el envío entero.
    const marcadores = (c: string) => new Set(c.match(/\{\{\d+\}\}/g) ?? []).size
    expect(marcadores(CUERPO_V2_CON_ENLACE)).toBe(3)
    expect(marcadores(CUERPO_V2_SIN_ENLACE)).toBe(2)
  })

  it('NUNCA adjunta nada: el video se ofrece, no se manda', () => {
    const a = elegirAperturaV2({
      nombre: 'Martín', propiedad: 'la casa',
      video: 'https://x/v.mp4', fotos: ['https://x/1.jpg'],
    })
    expect(a).not.toHaveProperty('header')
    // Pero sigue sabiendo qué tiene para ofrecer después.
    expect(a.pendiente).toEqual(['video', 'fotos'])
  })

  it('pendiente refleja solo lo que existe', () => {
    expect(elegirAperturaV2({ nombre: 'M', propiedad: 'x' }).pendiente).toEqual([])
    expect(elegirAperturaV2({ nombre: 'M', propiedad: 'x', fotos: ['a'] }).pendiente).toEqual(['fotos'])
    expect(elegirAperturaV2({ nombre: 'M', propiedad: 'x', video: ' ' }).pendiente).toEqual([])
  })
})

describe('escaleraDeApertura — sostiene el servicio mientras Meta aprueba', () => {
  const a = elegirAperturaV2({ nombre: 'Martín', propiedad: 'la casa', enlace: 'https://x.com/a' })
  const e = escaleraDeApertura(a, v1)

  it('son cuatro peldaños, de la mejor a la que seguro funciona', () => {
    expect(e.map(x => x.motivo)).toEqual(['v2', 'v2-tramite', 'v1', 'v1-tramite'])
    expect(e.map(x => x.plantilla)).toEqual([
      PLANTILLAS_V2.conEnlace, PLANTILLAS_V2.conEnlaceUtil, 'consulta_video', 'consulta_video_util',
    ])
  })

  it('la v2 va primera: es lo que el dueño pidió', () => {
    expect(e[0].plantilla).toBe(PLANTILLAS_V2.conEnlace)
  })

  it('los peldaños v2 no adjuntan NADA y los v1 sí', () => {
    expect(e[0].header).toBeUndefined()
    expect(e[1].header).toBeUndefined()
    expect(e[2].header).toEqual(v1.header)
    expect(e[3].header).toEqual(v1.header)
  })

  it('cada peldaño lleva SUS propios parámetros y su propio cuerpo', () => {
    // Cruzarlos es el error que Meta castiga rechazando el envío entero: la v1
    // manda tres parámetros con otro significado que la v2.
    expect(e[0].params).toEqual(a.params)
    expect(e[0].cuerpo).toBe(a.cuerpo)
    expect(e[2].params).toEqual(v1.params)
    expect(e[2].cuerpo).toBe(v1.cuerpo)
    expect(e[3].cuerpo).toBe(v1.cuerpoUtil)
  })

  it('sin enlace, la escalera arranca por la variante sin enlace', () => {
    const sin = escaleraDeApertura(elegirAperturaV2({ nombre: 'M', propiedad: 'x' }), v1)
    expect(sin[0].plantilla).toBe(PLANTILLAS_V2.sinEnlace)
    expect(sin[1].plantilla).toBe(PLANTILLAS_V2.sinEnlaceUtil)
  })
})
