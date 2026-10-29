import { describe, it, expect } from 'vitest'
import {
  textoTelefono, etiquetaCanal, textoVisita, unirSinRepetir, inicioRapidoDe, otrasDeLaPersona,
  contarFiltrosActivos, enlaceSeguro, textoPropiedad, nombreVisible,
} from './pantalla'
import { leerTelefono } from './telefono'
import { FILTROS_DEFECTO_CONSULTAS } from './filtros'
import type { ConsultaEnBandeja } from './tipos'

function c(p: Partial<ConsultaEnBandeja> = {}): ConsultaEnBandeja {
  const telefono = p.telefono === undefined ? '541161400496' : p.telefono
  return {
    id: 'c-1', tipo: 'portal', numero: 640, recibida_at: '2026-10-29T12:24:00Z', canal: 'whatsapp',
    portal: 'zonaprop', nombre: 'Martina Gómez', telefono, email: null, mensaje: null,
    property_id: 'p-1', assigned_to: null, asesor_propiedad: null, aviso_codigo: null, aviso_url: null,
    aviso_direccion: null, aviso_titulo: null, utm: null,
    estado: { tipo: 'sin_visita' }, tel: leerTelefono(telefono), repetidas: 1, accion: 'agendar',
    propiedad: { address: 'Entre Ríos 2333', neighborhood: 'Martínez' }, asesor_nombre: null,
    ...p,
  }
}

describe('textoTelefono', () => {
  it('un teléfono que sirve se muestra formateado', () => {
    expect(textoTelefono(c())).toEqual({ texto: '+54 9 11 6140-0496', revisar: false })
  })
  it('uno que no sirve dice "Teléfono a revisar" con lo que dejó adelante', () => {
    expect(textoTelefono(c({ telefono: '4941-0027' }))).toEqual({ texto: '4941-0027 · Teléfono a revisar', revisar: true })
  })
  it('vacío fuera de MercadoLibre: solo "Teléfono a revisar"', () => {
    expect(textoTelefono(c({ telefono: null }))).toEqual({ texto: 'Teléfono a revisar', revisar: true })
  })
  it('MercadoLibre sin teléfono no es algo a revisar: el portal no lo comparte', () => {
    expect(textoTelefono(c({ telefono: null, portal: 'mercadolibre' })))
      .toEqual({ texto: 'MercadoLibre no comparte el contacto', revisar: false })
  })
})

describe('nombreVisible', () => {
  it('el nombre que dejó; sin nombre, lo dice; MercadoLibre sin nombre es una pregunta', () => {
    expect(nombreVisible(c())).toBe('Martina Gómez')
    expect(nombreVisible(c({ nombre: '  ' }))).toBe('Sin nombre')
    expect(nombreVisible(c({ nombre: null, portal: 'mercadolibre' }))).toBe('Pregunta en MercadoLibre')
  })
})

describe('etiquetaCanal', () => {
  it('MercadoLibre es una pregunta; el resto, por su canal', () => {
    expect(etiquetaCanal(c({ portal: 'mercadolibre', canal: 'mail' }))).toBe('Pregunta')
    expect(etiquetaCanal(c({ canal: 'whatsapp' }))).toBe('WhatsApp')
    expect(etiquetaCanal(c({ canal: 'mail' }))).toBe('Mail')
    expect(etiquetaCanal(c({ canal: 'landing', tipo: 'landing', portal: 'landing' }))).toBe('Landing')
  })
})

describe('textoVisita', () => {
  it('sin visita no hay texto', () => {
    expect(textoVisita(c())).toBeNull()
  })
  it('con visita: "Visita vie 30 · 17:00" (hora de Argentina)', () => {
    expect(textoVisita(c({ estado: { tipo: 'con_visita', visitaId: 'v', scheduled_at: '2026-10-30T20:00:00Z' } })))
      .toBe('Visita vie 30 · 17:00')
  })
  it('ya visitó: "Visitó …", y el día no lleva cero adelante', () => {
    expect(textoVisita(c({ estado: { tipo: 'visito', visitaId: 'v', scheduled_at: '2026-11-05T13:00:00Z' } })))
      .toBe('Visitó jue 5 · 10:00')
  })
})

describe('unirSinRepetir', () => {
  it('agrega al final lo nuevo y no repite un id que ya estaba', () => {
    const r = unirSinRepetir([c({ id: 'a' }), c({ id: 'b' })], [c({ id: 'b' }), c({ id: 'c' })])
    expect(r.map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })
  it('un id repetido DENTRO de la página nueva también entra una sola vez', () => {
    expect(unirSinRepetir([], [c({ id: 'a' }), c({ id: 'a' })]).map((f) => f.id)).toEqual(['a'])
  })
})

describe('inicioRapidoDe', () => {
  it('consulta de portal: persona "consulta", origen portal y el teléfono canónico', () => {
    const r = inicioRapidoDe(c())
    expect(r).toEqual({
      origen: 'portal',
      persona: { tipo: 'consulta', id: 'c-1', nombre: 'Martina Gómez', telefono: '541161400496', detalle: 'ZonaProp · 09:24' },
      telefono: '+5491161400496',
      telefonoMostrado: '+54 9 11 6140-0496',
      telefonoValido: true,
    })
  })
  it('registro de landing: persona "registro" y el origen sale del UTM, con su detalle', () => {
    const r = inicioRapidoDe(c({ tipo: 'landing', portal: 'landing', canal: 'landing', nombre: null, utm: null }))
    expect(r.persona).toMatchObject({ tipo: 'registro', nombre: 'Sin nombre', detalle: 'Landing · 09:24' })
    expect(r.origen).toBe('otro')
    expect(r.origenDetalle).toBe('Landing')
  })
  it('landing con fbclid: publicidad de Meta', () => {
    expect(inicioRapidoDe(c({ tipo: 'landing', portal: 'landing', utm: { fbclid: 'x' } })).origen).toBe('publicidad_meta')
  })
  it('teléfono inválido: no viaja canónico y el botón rápido queda bloqueado', () => {
    const r = inicioRapidoDe(c({ telefono: '4941-0027' }))
    expect(r.telefono).toBeUndefined()
    expect(r.telefonoValido).toBe(false)
    expect(r.telefonoMostrado).toBe('4941-0027')
  })
  it('con el teléfono corregido en Consultas: viaja ese canónico y el botón queda habilitado', () => {
    const corregido = leerTelefono('1149410027')
    if (!corregido.ok) throw new Error('el teléfono de prueba tendría que servir')
    const r = inicioRapidoDe(c({ telefono: '4941-0027' }), { telefono: corregido })
    expect(r.telefono).toBe('+5491149410027')
    expect(r.telefonoMostrado).toBe('+54 9 11 4941-0027')
    expect(r.telefonoValido).toBe(true)
  })
})

describe('otrasDeLaPersona', () => {
  it('las filas con el mismo WhatsApp, sin la propia', () => {
    const yo = c({ id: 'a', telefono: '+5491161400496' })
    const otra = c({ id: 'b', telefono: '011 15 6140-0496' })
    const ajena = c({ id: 'c', telefono: '+5491137320916' })
    expect(otrasDeLaPersona(yo, [yo, otra, ajena]).map((f) => f.id)).toEqual(['b'])
  })
  it('sin teléfono válido no se junta con nadie', () => {
    const yo = c({ id: 'a', telefono: '4941-0027' })
    expect(otrasDeLaPersona(yo, [yo, c({ id: 'b', telefono: '4941-0027' })])).toEqual([])
  })
})

describe('contarFiltrosActivos', () => {
  it('los defectos no cuentan', () => {
    expect(contarFiltrosActivos(FILTROS_DEFECTO_CONSULTAS)).toBe(0)
  })
  it('cada filtro puesto cuenta uno; el rango de fechas cuenta como el período', () => {
    expect(contarFiltrosActivos({ ...FILTROS_DEFECTO_CONSULTAS, portal: 'zonaprop', q: 'ana' })).toBe(2)
    expect(contarFiltrosActivos({ ...FILTROS_DEFECTO_CONSULTAS, periodo: 'personalizado', from: '2026-10-01', to: '2026-10-05' })).toBe(1)
  })
})

describe('enlaceSeguro', () => {
  it('solo https y del dominio exacto del portal (o un subdominio suyo)', () => {
    expect(enlaceSeguro('https://www.zonaprop.com.ar/x', 'zonaprop')).toBe('https://www.zonaprop.com.ar/x')
    expect(enlaceSeguro('https://www.argenprop.com/aviso--1', 'argenprop')).toBe('https://www.argenprop.com/aviso--1')
    expect(enlaceSeguro('https://departamento.mercadolibre.com.ar/MLA-1', 'mercadolibre')).toBe('https://departamento.mercadolibre.com.ar/MLA-1')
  })

  it('rechaza: otro esquema, otro dominio, un dominio que solo lo CONTIENE, y el portal equivocado', () => {
    expect(enlaceSeguro('javascript:alert(1)', 'zonaprop')).toBeNull()
    expect(enlaceSeguro('http://www.zonaprop.com.ar/x', 'zonaprop')).toBeNull()
    expect(enlaceSeguro('https://mandrillapp.com/track/click/1', 'mercadolibre')).toBeNull()
    expect(enlaceSeguro('https://zonaprop.com.ar.estafa.com/x', 'zonaprop')).toBeNull()
    expect(enlaceSeguro('https://falsozonaprop.com.ar/x', 'zonaprop')).toBeNull()
    expect(enlaceSeguro('https://www.argenprop.com/x', 'zonaprop')).toBeNull()
    expect(enlaceSeguro('https://www.zonaprop.com.ar/x', 'landing')).toBeNull()
    expect(enlaceSeguro(null, 'zonaprop')).toBeNull()
  })
})

describe('textoPropiedad', () => {
  it('con propiedad: dirección y barrio', () => {
    expect(textoPropiedad(c())).toEqual({ texto: 'Entre Ríos 2333, Martínez', sinPropiedad: false })
  })
  it('sin propiedad: el aviso y su código', () => {
    expect(textoPropiedad(c({ property_id: null, propiedad: null, aviso_codigo: '2CBSS6' })))
      .toEqual({ texto: '⚠ Sin propiedad identificada · aviso CÓD 2CBSS6', sinPropiedad: true })
    expect(textoPropiedad(c({ property_id: null, propiedad: null })))
      .toEqual({ texto: '⚠ Sin propiedad identificada', sinPropiedad: true })
  })
})
