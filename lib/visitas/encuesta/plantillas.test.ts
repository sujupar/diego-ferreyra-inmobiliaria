import { describe, it, expect } from 'vitest'
import {
  PLANTILLAS_ENCUESTA, PLANTILLAS_REGALO, CUERPO_ENCUESTA_V1, CUERPO_REGALO_V1, BOTON_ENCUESTA_V1,
  CUERPO_ENCUESTA_V2, CUERPO_REGALO_V3, BOTON_ENCUESTA_V2, CUERPO_ENCUESTA_V3, BOTON_ENCUESTA_V3, CUERPO_ENCUESTA_V4, BOTON_ENCUESTA_V4, CUERPO_ENCUESTA_V5, RESPALDO_DE_ENCUESTA,
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
    for (const cuerpo of [CUERPO_ENCUESTA_V1, CUERPO_REGALO_V1, CUERPO_ENCUESTA_V2, CUERPO_REGALO_V3, CUERPO_ENCUESTA_V3, CUERPO_ENCUESTA_V4, CUERPO_ENCUESTA_V5]) {
      expect(cuerpo).not.toMatch(/regalo|gratis|gratuit|oferta|descuento|promo|sin costo|sin compromiso/i)
    }
  })
  it('el link también va en el cuerpo (en WhatsApp de computadora el botón no abre)', () => {
    expect(CUERPO_ENCUESTA_V1).toContain('https://inmodf.com.ar/encuesta/{{4}}')
    expect(BOTON_ENCUESTA_V1.url).toBe('https://inmodf.com.ar/encuesta/{{1}}')
    expect(BOTON_ENCUESTA_V1.texto.length).toBeLessThanOrEqual(25)
    expect(CUERPO_ENCUESTA_V2).toContain('https://inmodf.com.ar/encuesta/{{4}}')
    expect(BOTON_ENCUESTA_V2.url).toBe('https://inmodf.com.ar/encuesta/{{1}}')
    expect(BOTON_ENCUESTA_V2.texto.length).toBeLessThanOrEqual(25)
    expect(CUERPO_ENCUESTA_V3).toContain('https://inmodf.com.ar/encuesta/{{4}}')
    expect(BOTON_ENCUESTA_V3.url).toBe('https://inmodf.com.ar/encuesta/{{1}}')
    expect(CUERPO_ENCUESTA_V4).toContain('https://inmodf.com.ar/encuesta/{{4}}')
    expect(BOTON_ENCUESTA_V4.url).toBe('https://inmodf.com.ar/encuesta/{{1}}')
    expect(BOTON_ENCUESTA_V4.texto.length).toBeLessThanOrEqual(25)
  })
  it('ningún cuerpo empieza ni termina con una variable (Meta rechaza el cuerpo así)', () => {
    for (const d of [...Object.values(PLANTILLAS_ENCUESTA), ...Object.values(PLANTILLAS_REGALO)]) {
      expect(d.cuerpo).not.toMatch(/^\s*\{\{|\}\}\s*$/)
    }
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
      bodyText: `Hola Mariana. Registramos tu visita a Doblas 248 del 14/10. Para completar la ficha de la visita, entrá acá: https://inmodf.com.ar/encuesta/${TOKEN}\n\nDiego Ferreyra Inmobiliaria`,
    })
  })
  it('una plantilla que no está en el catálogo no se arma (no se adivinan datos ni botón)', () => {
    expect(armarEnvioEncuesta('encuesta_visita_v9', { nombre: 'A', direccion: 'B', fecha: '1/1', token: TOKEN })).toBeNull()
    expect(armarEnvioEncuesta('constructor', { nombre: 'A', direccion: 'B', fecha: '1/1', token: TOKEN })).toBeNull()
    expect(armarEnvioEncuesta(null, { nombre: 'A', direccion: 'B', fecha: '1/1', token: TOKEN })).toBeNull()
  })
  it('sin dirección dice "la propiedad"; datos sin saltos de línea (Meta los rechaza)', () => {
    const e = armarEnvioEncuesta('encuesta_visita_v1', { nombre: null, direccion: 'Av.\nCorrientes\t 1500', fecha: '14/10', token: TOKEN })
    expect(e?.bodyParams.slice(0, 2)).toEqual(['de nuevo', 'Av. Corrientes 1500'])
    expect(armarEnvioEncuesta('encuesta_visita_v1', { nombre: 'A', direccion: '  ', fecha: '14/10', token: TOKEN })?.bodyParams[1]).toBe('la propiedad')
  })
})

describe('plantillas v2 (guía de gastos, aprobadas por el dueño el 2026-10-17)', () => {
  it('la invitación nombra el dolor (los US$ 7.000) y lo que recibe a cambio, con el link y el cierre', () => {
    const e = armarEnvioEncuesta('encuesta_visita_v2', { nombre: 'Mariana Gómez', direccion: 'Doblas 248', fecha: '14/10', token: TOKEN })
    expect(e?.templateName).toBe('encuesta_visita_v2')
    expect(e?.bodyParams).toEqual(['Mariana', 'Doblas 248', '14/10', TOKEN])
    expect(e?.urlButtonParam).toBe(TOKEN)
    expect(e?.necesitaDocumento).toBe(false)
    expect(e?.bodyText).toBe(
      'Hola Mariana. Gracias por visitar Doblas 248 el 14/10.\n\n' +
      'Un dato que casi nadie tiene en cuenta: además del precio, escriturar cuesta cerca de un 7 %. ' +
      'En un departamento de US$ 100.000 son unos US$ 7.000 que tienen que estar el día de la firma.\n\n' +
      'Contanos en menos de un minuto qué te pareció la propiedad y te mandamos la guía de gastos que usamos con nuestros clientes: ' +
      `https://inmodf.com.ar/encuesta/${TOKEN}\n\nDiego Ferreyra Inmobiliaria`,
    )
  })
  it('la entrega (v3) lleva el PDF y dice solo lo que la persona pidió', () => {
    expect(armarEnvioRegalo('regalo_visita_v3', { nombre: 'Mariana', direccion: 'Doblas 248' })).toEqual({
      templateName: 'regalo_visita_v3',
      bodyParams: ['Mariana', 'Doblas 248'],
      urlButtonParam: null,
      necesitaDocumento: true,
      bodyText: 'Hola Mariana, gracias por contarnos qué te pareció Doblas 248. Acá tenés la guía de gastos para compradores que pediste al completar la encuesta. ' +
        'En la página 2 está la cuenta completa.',
    })
  })
  it('sin ofrecer servicios: es lo que hizo que Meta pasara la v2 a MARKETING', () => {
    expect(CUERPO_REGALO_V3).not.toMatch(/hagamos|respond|escribinos|contactanos|asesor/i)
  })
  it('regalo_visita_v2 (aprobada como MARKETING) NO está en el catálogo: configurarla no manda nada', () => {
    expect(armarEnvioRegalo('regalo_visita_v2', { nombre: 'Mariana', direccion: 'Doblas 248' })).toBeNull()
  })
  it('la invitación v3 (utilidad): primero el registro y el link, después la guía y el 7 %', () => {
    const e = armarEnvioEncuesta('encuesta_visita_v3', { nombre: 'Mariana Gómez', direccion: 'Doblas 248', fecha: '14/10', token: TOKEN })
    expect(e?.urlButtonParam).toBe(TOKEN)
    expect(e?.bodyText).toBe(
      'Hola Mariana. Registramos tu visita a Doblas 248 del 14/10. Para cerrar la ficha, contanos qué te pareció (menos de un minuto): ' +
      `https://inmodf.com.ar/encuesta/${TOKEN}\n\n` +
      'Al terminar te llega la guía de gastos de compra: además del precio, escriturar cuesta cerca de un 7 %.\n\n' +
      'Diego Ferreyra Inmobiliaria',
    )
  })
  it('la invitación v4 (marketing, texto del dueño): el dolor primero, sin el ejemplo de los US$ 100.000', () => {
    const e = armarEnvioEncuesta('encuesta_visita_v4', { nombre: 'Mariana Gómez', direccion: 'Doblas 248', fecha: '14/10', token: TOKEN })
    expect(e?.urlButtonParam).toBe(TOKEN)
    expect(e?.bodyText).toBe(
      'Hola Mariana 👋 Gracias por venir a ver Doblas 248 el 14/10.\n\n' +
      '¿Sabías que comprar un departamento te puede salir hasta US$ 7.000 más de lo que tenías presupuestado? ' +
      'Casi nadie te lo cuenta hasta que ya estás por firmar 😬\n\n' +
      'Contame qué te pareció la visita (1 minuto) y te mando la guía con la cuenta completa 👇\n' +
      `https://inmodf.com.ar/encuesta/${TOKEN}\n\nDiego Ferreyra`,
    )
    expect(CUERPO_ENCUESTA_V4).not.toContain('100.000')
  })
  it('la v5 es el respaldo de la v4: el mismo dolor, armado como utilidad (la ficha primero)', () => {
    expect(RESPALDO_DE_ENCUESTA).toEqual({ encuesta_visita_v4: 'encuesta_visita_v5' })
    const e = armarEnvioEncuesta('encuesta_visita_v5', { nombre: 'Mariana', direccion: 'Doblas 248', fecha: '14/10', token: TOKEN })
    expect(e?.urlButtonParam).toBe(TOKEN)
    expect(e?.bodyText).toBe(
      'Hola Mariana 👋 Gracias por venir a ver Doblas 248 el 14/10.\n\n' +
      'Para cerrar la ficha de tu visita, contame qué te pareció (1 minuto) 👇\n' +
      `https://inmodf.com.ar/encuesta/${TOKEN}\n\n` +
      'Al terminar te llega la guía de gastos de compra: comprar un departamento te puede salir hasta US$ 7.000 más de lo que tenías presupuestado.\n\n' +
      'Diego Ferreyra',
    )
    expect(CUERPO_ENCUESTA_V5).toContain('https://inmodf.com.ar/encuesta/{{4}}')
  })
  it('las v1 siguen en el catálogo: volver atrás es cambiar la variable de Netlify', () => {
    expect(Object.keys(PLANTILLAS_ENCUESTA).sort()).toEqual(['encuesta_visita_v1', 'encuesta_visita_v2', 'encuesta_visita_v3', 'encuesta_visita_v4', 'encuesta_visita_v5'])
    expect(Object.keys(PLANTILLAS_REGALO).sort()).toEqual(['regalo_visita_v1', 'regalo_visita_v3'])
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
