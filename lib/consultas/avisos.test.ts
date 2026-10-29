import { describe, it, expect } from 'vitest'
import { codigoAgrupable, tituloDelAviso, agruparAvisos, resumenSinPropiedad, sugerirPropiedades, type FilaSinPropiedad } from './avisos'
import { leerTelefono } from './telefono'
import type { ConsultaEnBandeja } from './tipos'

describe('codigoAgrupable', () => {
  it('códigos reales de aviso agrupan', () => {
    expect(codigoAgrupable('zonaprop', '2DLPOM')).toBe(true)
    expect(codigoAgrupable('zonaprop', 'DHO6481365')).toBe(true)
    expect(codigoAgrupable('argenprop', '20538824')).toBe(true)
    expect(codigoAgrupable('mercadolibre', 'MLA3853548186')).toBe(true)
  })

  it('no agrupan: vacío, nulo, un pedazo de enlace, o la REF de ZonaProp (cambia en cada mail)', () => {
    expect(codigoAgrupable('zonaprop', null)).toBe(false)
    expect(codigoAgrupable('argenprop', '   ')).toBe(false)
    expect(codigoAgrupable('zonaprop', 'https')).toBe(false)
    expect(codigoAgrupable('zonaprop', 'HTTP')).toBe(false)
    expect(codigoAgrupable('zonaprop', 'https://www.zonaprop.com.ar/x')).toBe(false)
    expect(codigoAgrupable('zonaprop', '309710959')).toBe(false)
    expect(codigoAgrupable('zonaprop', '3097109591')).toBe(false)
  })

  it('un número largo en Argenprop SÍ es el código del aviso', () => {
    expect(codigoAgrupable('argenprop', '309710959')).toBe(true)
  })
})

describe('tituloDelAviso', () => {
  it('ZonaProp: el título entre "aviso" y "CÓD"', () => {
    expect(tituloDelAviso('zonaprop',
      '📱 ¡Consultaron tu WhatsApp en el aviso Departamento 2 Ambientes en Excelente Estado! CÓD:2DLPOM - REF:#308570#', null))
      .toBe('Departamento 2 Ambientes en Excelente Estado')
    expect(tituloDelAviso('zonaprop', '📩 ¡Recibiste una nueva consulta por el aviso Alquiler de Excelente Casa en Olivos, Casi Mar ...! CÓD:2DLFJ0 - REF:#1#', null))
      .toBe('Alquiler de Excelente Casa en Olivos, Casi Mar')
  })

  it('ZonaProp "Vieron tu teléfono" no trae título', () => {
    expect(tituloDelAviso('zonaprop', '📞 ¡Vieron tu teléfono, Diego Ferreyra Inmobiliaria! CÓD:2DHPMK - REF:#308135267#', null)).toBeNull()
  })

  it('Argenprop: lo que sigue a "contactó por", con los espacios dobles limpios', () => {
    expect(tituloDelAviso('argenprop', 'ana@x.com contactó por Alvarez Jonte  3500 en Villa del Parque', null))
      .toBe('Alvarez Jonte 3500 en Villa del Parque')
  })

  it('sin título en el asunto usa la dirección; sin nada, null', () => {
    expect(tituloDelAviso('argenprop', 'matias te ha enviado un mensaje', 'Paraná 1500')).toBe('Paraná 1500')
    expect(tituloDelAviso('argenprop', null, null)).toBeNull()
  })
})

function fila(p: Partial<FilaSinPropiedad>): FilaSinPropiedad {
  return { portal: 'zonaprop', codigo: '2DLPOM', asunto: null, direccion: null, url: null, recibida_at: '2026-10-01T10:00:00Z', ...p }
}

describe('agruparAvisos', () => {
  it('agrupa por portal + código, ordena por cantidad y guarda la última fecha y el título más nuevo', () => {
    const r = agruparAvisos([
      fila({ codigo: '2DLPOM', recibida_at: '2026-10-01T10:00:00Z', asunto: 'en el aviso Viejo título! CÓD:2DLPOM' }),
      fila({ codigo: '2DLPOM', recibida_at: '2026-10-20T10:00:00Z', asunto: 'en el aviso Título nuevo! CÓD:2DLPOM' }),
      fila({ codigo: '2DLPOM', recibida_at: '2026-10-05T10:00:00Z', asunto: '📞 ¡Vieron tu teléfono! CÓD:2DLPOM' }),
      fila({ portal: 'argenprop', codigo: '20538824', asunto: 'x contactó por Alvarez Jonte 3500 en Villa del Parque', url: 'https://www.argenprop.com/aviso--20538824' }),
    ])
    expect(r.avisos).toEqual([
      { portal: 'zonaprop', codigo: '2DLPOM', titulo: 'Título nuevo', url: null, n: 3, ultima: '2026-10-20T10:00:00Z' },
      { portal: 'argenprop', codigo: '20538824', titulo: 'Alvarez Jonte 3500 en Villa del Parque', url: 'https://www.argenprop.com/aviso--20538824', n: 1, ultima: '2026-10-01T10:00:00Z' },
    ])
    expect(r.sueltas).toBe(0)
  })

  it('el mismo código en dos portales son dos avisos', () => {
    const r = agruparAvisos([fila({ portal: 'zonaprop', codigo: '123' }), fila({ portal: 'argenprop', codigo: '123' })])
    expect(r.avisos).toHaveLength(2)
  })

  it('lo que no agrupa (sin código, https, REF) se cuenta como sueltas', () => {
    const r = agruparAvisos([fila({ codigo: null }), fila({ codigo: 'https' }), fila({ codigo: '309710959' }), fila({ codigo: 'ABC123' })])
    expect(r.avisos.map((a) => a.codigo)).toEqual(['ABC123'])
    expect(r.sueltas).toBe(3)
  })
})

function consulta(p: Partial<ConsultaEnBandeja>): ConsultaEnBandeja {
  return {
    id: 'x', tipo: 'portal', numero: 1, recibida_at: '2026-10-28T15:00:00Z', canal: 'mail', portal: 'zonaprop',
    nombre: 'Ana', telefono: null, email: null, mensaje: null, property_id: null, assigned_to: null, asesor_propiedad: null,
    aviso_codigo: '2DLPOM', aviso_url: null, aviso_direccion: null, aviso_titulo: null, utm: null,
    estado: { tipo: 'sin_visita' }, tel: leerTelefono(null), repetidas: 1, accion: 'elegir_propiedad',
    propiedad: null, asesor_nombre: null, ...p,
  }
}

describe('resumenSinPropiedad', () => {
  it('cuenta consultas sin propiedad, avisos distintos y sueltas', () => {
    expect(resumenSinPropiedad([
      consulta({ id: '1' }), consulta({ id: '2' }), consulta({ id: '3', aviso_codigo: '2E1SO4' }),
      consulta({ id: '4', aviso_codigo: '309710959' }), consulta({ id: '5', property_id: 'p', aviso_codigo: 'ZZZ' }),
    ])).toEqual({ consultas: 4, avisos: 2, sueltas: 1 })
  })

  it('sin consultas sin propiedad: todo en cero', () => {
    expect(resumenSinPropiedad([])).toEqual({ consultas: 0, avisos: 0, sueltas: 0 })
  })
})

describe('sugerirPropiedades', () => {
  const props = [
    { id: '1', address: 'Av. Álvarez Jonte 3541', neighborhood: 'Villa del Parque' },
    { id: '2', address: 'Amenábar 1500', neighborhood: 'Colegiales' },
    { id: '3', address: 'Cuenca 3200', neighborhood: 'Villa del Parque' },
    { id: '4', address: 'Doblas 248', neighborhood: 'Caballito' },
    { id: '5', address: 'Nazca 2000', neighborhood: 'Villa del Parque' },
    { id: '6', address: 'Helguera 2100', neighborhood: 'Villa del Parque' },
  ]

  it('Argenprop: la misma calle va primero, después las del barrio, hasta 3', () => {
    const r = sugerirPropiedades('Alvarez Jonte 3500 en Villa del Parque', props)
    expect(r[0].id).toBe('1')
    expect(r).toHaveLength(3)
    expect(r.every((p) => p.neighborhood === 'Villa del Parque')).toBe(true)
  })

  it('ZonaProp: por el barrio del título', () => {
    expect(sugerirPropiedades('Monoambiente en Colegiales con Mucho Sol', props).map((p) => p.id)).toEqual(['2'])
  })

  it('sin pistas no sugiere nada (mejor nada que una sugerencia inventada)', () => {
    expect(sugerirPropiedades('Departamento 2 Ambientes en Excelente Estado', props)).toEqual([])
    expect(sugerirPropiedades(null, props)).toEqual([])
  })
})
