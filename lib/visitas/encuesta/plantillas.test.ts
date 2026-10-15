import { describe, it, expect } from 'vitest'
import {
  PLANTILLAS_ENCUESTA, PLANTILLAS_REGALO, CUERPO_ENCUESTA_V1, CUERPO_REGALO_V1, BOTON_ENCUESTA_V1,
  cantidadDeVariables, armarEnvioEncuesta, armarEnvioRegalo, nombreDePila, paramSeguro,
} from './plantillas'

const TOKEN = 'Ab3xK9pQ2rTz8LmN4vWq1Y'

describe('catálogo de plantillas', () => {
  it('cada definición declara exactamente las variables de su cuerpo', () => {
    for (const d of [...Object.values(PLANTILLAS_ENCUESTA), ...Object.values(PLANTILLAS_REGALO)]) {
      expect(cantidadDeVariables(d.cuerpo)).toBe(d.variables)
    }
  })
  it('sin vocabulario de venta (Meta las reclasifica a MARKETING y deja de entregarlas)', () => {
    for (const cuerpo of [CUERPO_ENCUESTA_V1, CUERPO_REGALO_V1]) {
      expect(cuerpo).not.toMatch(/regalo|gratis|gratuit|oferta|descuento|promo|sin costo|sin compromiso/i)
    }
  })
  it('el link también va en el cuerpo (en WhatsApp de computadora el botón no abre)', () => {
    expect(CUERPO_ENCUESTA_V1).toContain('https://inmodf.com.ar/encuesta/{{4}}')
    expect(BOTON_ENCUESTA_V1.url).toBe('https://inmodf.com.ar/encuesta/{{1}}')
    expect(BOTON_ENCUESTA_V1.texto.length).toBeLessThanOrEqual(25)
  })
})

describe('armarEnvioEncuesta', () => {
  it('cuatro datos, el botón lleva el token y el texto guardado es el que recibe la persona', () => {
    const e = armarEnvioEncuesta('encuesta_visita_v1', { nombre: 'Mariana Gómez', direccion: 'Doblas 248', fecha: '14/10', token: TOKEN })
    expect(e).toEqual({
      templateName: 'encuesta_visita_v1',
      bodyParams: ['Mariana', 'Doblas 248', '14/10', TOKEN],
      urlButtonParam: TOKEN,
      necesitaDocumento: false,
      bodyText: `Hola Mariana. Registramos tu visita a Doblas 248 del 14/10. Para completar la ficha de la visita, entrá acá: https://inmodf.com.ar/encuesta/${TOKEN}`,
    })
  })
  it('una plantilla que no está en el catálogo no se arma (no se adivinan datos ni botón)', () => {
    expect(armarEnvioEncuesta('encuesta_visita_v2', { nombre: 'A', direccion: 'B', fecha: '1/1', token: TOKEN })).toBeNull()
    expect(armarEnvioEncuesta('constructor', { nombre: 'A', direccion: 'B', fecha: '1/1', token: TOKEN })).toBeNull()
    expect(armarEnvioEncuesta(null, { nombre: 'A', direccion: 'B', fecha: '1/1', token: TOKEN })).toBeNull()
  })
  it('sin dirección dice "la propiedad"; datos sin saltos de línea (Meta los rechaza)', () => {
    const e = armarEnvioEncuesta('encuesta_visita_v1', { nombre: null, direccion: 'Av.\nCorrientes\t 1500', fecha: '14/10', token: TOKEN })
    expect(e?.bodyParams.slice(0, 2)).toEqual(['de nuevo', 'Av. Corrientes 1500'])
    expect(armarEnvioEncuesta('encuesta_visita_v1', { nombre: 'A', direccion: '  ', fecha: '14/10', token: TOKEN })?.bodyParams[1]).toBe('la propiedad')
  })
})

describe('armarEnvioRegalo', () => {
  it('dos datos, sin botón y con documento obligatorio', () => {
    expect(armarEnvioRegalo('regalo_visita_v1', { nombre: 'Mariana', direccion: 'Doblas 248' })).toEqual({
      templateName: 'regalo_visita_v1',
      bodyParams: ['Mariana', 'Doblas 248'],
      urlButtonParam: null,
      necesitaDocumento: true,
      bodyText: 'Hola Mariana. Acá tenés el material de Doblas 248 que pediste.',
    })
  })
})

describe('nombreDePila y paramSeguro', () => {
  it('NFD → NFC y solo el primer nombre', () => {
    expect(nombreDePila('María José Pérez')).toBe('María')
    expect(nombreDePila('   ')).toBe('de nuevo')
    expect(nombreDePila('', '')).toBe('')
  })
  it('tope de largo sin cortar en un espacio', () => {
    expect(paramSeguro('a '.repeat(100), 9)).toBe('a a a a a')
  })
})
