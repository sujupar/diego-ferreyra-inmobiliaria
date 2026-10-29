import { describe, it, expect } from 'vitest'
import {
  estadoDeConsulta, accionDeAgendar, contarRepetidas, armarBandeja, agruparPorDia, consultasEnBandeja,
  contarPorPortal, contarPorPropiedad,
} from './bandeja'
import { leerTelefono } from './telefono'
import type { ConsultaFila, ConsultaEnBandeja, VisitaDeConsulta } from './tipos'

const PROP = 'prop-1'

function consulta(p: Partial<ConsultaFila> = {}): ConsultaFila {
  return {
    id: 'c-1', tipo: 'portal', numero: 1, recibida_at: '2026-10-28T15:00:00Z', canal: 'mail',
    portal: 'zonaprop', nombre: 'Ana', telefono: '+5491161400496', email: null, mensaje: null,
    property_id: PROP, assigned_to: null, asesor_propiedad: null, aviso_codigo: null, aviso_url: null,
    aviso_direccion: null, aviso_titulo: null, utm: null, ...p,
  }
}

function visita(p: Partial<VisitaDeConsulta> = {}): VisitaDeConsulta {
  return {
    id: 'v-1', property_id: PROP, portal_inquiry_id: null, lead_id: null, client_phone: null,
    status: 'scheduled', scheduled_at: '2026-10-30T15:00:00Z', ...p,
  }
}

function enBandeja(p: Partial<ConsultaEnBandeja> = {}): ConsultaEnBandeja {
  const base = consulta(p)
  return {
    ...base, estado: { tipo: 'sin_visita' }, tel: leerTelefono(base.telefono), repetidas: 1,
    accion: 'agendar', propiedad: null, asesor_nombre: null, ...p,
  }
}

describe('estadoDeConsulta', () => {
  it('sin visitas → sin_visita', () => {
    expect(estadoDeConsulta(consulta(), [])).toEqual({ tipo: 'sin_visita' })
  })

  it('coincide por portal_inquiry_id', () => {
    const e = estadoDeConsulta(consulta(), [visita({ portal_inquiry_id: 'c-1', property_id: 'otra' })])
    expect(e).toEqual({ tipo: 'con_visita', visitaId: 'v-1', scheduled_at: '2026-10-30T15:00:00Z' })
  })

  it('una visita cancelada no cuenta', () => {
    expect(estadoDeConsulta(consulta(), [visita({ portal_inquiry_id: 'c-1', status: 'cancelled' })]))
      .toEqual({ tipo: 'sin_visita' })
  })

  it('coincide por propiedad + teléfono aunque estén escritos distinto', () => {
    const c = consulta({ telefono: '011 15 6140-0496' })
    const e = estadoDeConsulta(c, [visita({ client_phone: '+5491161400496' })])
    expect(e.tipo).toBe('con_visita')
  })

  it('mismo teléfono en OTRA propiedad no cuenta', () => {
    expect(estadoDeConsulta(consulta(), [visita({ property_id: 'otra', client_phone: '+5491161400496' })]))
      .toEqual({ tipo: 'sin_visita' })
  })

  it('sin propiedad en la consulta no se empareja por teléfono', () => {
    expect(estadoDeConsulta(consulta({ property_id: null }), [visita({ client_phone: '+5491161400496' })]))
      .toEqual({ tipo: 'sin_visita' })
  })

  it('teléfonos inválidos no se emparejan entre sí', () => {
    const c = consulta({ telefono: '4941-0027' })
    expect(estadoDeConsulta(c, [visita({ client_phone: '4941-0027' })])).toEqual({ tipo: 'sin_visita' })
  })

  it('landing con teléfono corregido: coincide por lead_id aunque el teléfono guardado sea inválido', () => {
    const c = consulta({ id: 'lead-1', tipo: 'landing', portal: 'landing', canal: 'landing', telefono: '4941-0027' })
    const e = estadoDeConsulta(c, [visita({ lead_id: 'lead-1', client_phone: '+5491161400496' })])
    expect(e).toEqual({ tipo: 'con_visita', visitaId: 'v-1', scheduled_at: '2026-10-30T15:00:00Z' })
  })

  it('landing con visita realizada por lead_id → visito', () => {
    const c = consulta({ id: 'lead-1', tipo: 'landing', portal: 'landing', canal: 'landing', telefono: '4941-0027' })
    expect(estadoDeConsulta(c, [visita({ lead_id: 'lead-1', status: 'completed' })]).tipo).toBe('visito')
  })

  it('el lead_id no empareja una consulta de PORTAL con el mismo id', () => {
    const c = consulta({ id: 'x-1', telefono: '4941-0027' })
    expect(estadoDeConsulta(c, [visita({ lead_id: 'x-1' })])).toEqual({ tipo: 'sin_visita' })
  })

  it('completed → visito', () => {
    const e = estadoDeConsulta(consulta(), [visita({ portal_inquiry_id: 'c-1', status: 'completed' })])
    expect(e.tipo).toBe('visito')
  })

  it('con muchas consultas y visitas responde rápido y sigue encontrando la correcta', () => {
    const visitas = Array.from({ length: 2000 }, (_, i) =>
      visita({ id: `v-${i}`, property_id: `p-${i % 50}`, client_phone: `+54911${String(50000000 + i)}` }))
    const inicio = performance.now()
    let conVisita = 0
    for (let i = 0; i < 500; i++) {
      const c = consulta({ id: `c-${i}`, property_id: `p-${i % 50}`, telefono: `+54911${String(50000000 + i)}` })
      if (estadoDeConsulta(c, visitas).tipo === 'con_visita') conVisita++
    }
    expect(conVisita).toBe(500)
    expect(performance.now() - inicio).toBeLessThan(3000)
  })

  it('entre varias gana la más reciente', () => {
    const e = estadoDeConsulta(consulta(), [
      visita({ id: 'v-vieja', portal_inquiry_id: 'c-1', status: 'completed', scheduled_at: '2026-10-01T15:00:00Z' }),
      visita({ id: 'v-nueva', client_phone: '1161400496', scheduled_at: '2026-11-02T15:00:00Z' }),
    ])
    expect(e).toMatchObject({ tipo: 'con_visita', visitaId: 'v-nueva' })
  })
})

describe('accionDeAgendar', () => {
  const de = (c: ConsultaFila) => accionDeAgendar(c, leerTelefono(c.telefono))

  it('teléfono válido y con propiedad → agendar', () => {
    expect(de(consulta())).toBe('agendar')
  })

  it('MercadoLibre sin teléfono → pedir_telefono', () => {
    expect(de(consulta({ portal: 'mercadolibre', telefono: null }))).toBe('pedir_telefono')
  })

  it('teléfono inválido → revisar_telefono', () => {
    expect(de(consulta({ telefono: '4941-0027' }))).toBe('revisar_telefono')
  })

  it('sin propiedad va primero, aunque el teléfono esté mal', () => {
    expect(de(consulta({ property_id: null, telefono: '4941-0027' }))).toBe('elegir_propiedad')
  })
})

describe('contarRepetidas', () => {
  it('cuenta por persona: mismo teléfono en formatos distintos', () => {
    const m = contarRepetidas([
      consulta({ id: 'a', telefono: '011 15 6140-0496' }),
      consulta({ id: 'b', telefono: '+5491161400496' }),
      consulta({ id: 'c', telefono: '+5491158234521' }),
    ])
    expect(m.get('a')).toBe(2)
    expect(m.get('b')).toBe(2)
    expect(m.get('c')).toBe(1)
  })

  it('sin teléfono válido usa el email (sin distinguir mayúsculas)', () => {
    const m = contarRepetidas([
      consulta({ id: 'a', telefono: null, email: ' Ana@Mail.com ' }),
      consulta({ id: 'b', telefono: 'xx', email: 'ana@mail.com' }),
    ])
    expect(m.get('a')).toBe(2)
    expect(m.get('b')).toBe(2)
  })

  it('sin teléfono ni email cuenta 1', () => {
    const m = contarRepetidas([
      consulta({ id: 'a', telefono: null, email: null }),
      consulta({ id: 'b', telefono: null, email: '  ' }),
    ])
    expect(m.get('a')).toBe(1)
    expect(m.get('b')).toBe(1)
  })
})

describe('armarBandeja', () => {
  const filas = [
    enBandeja({ id: 'a', estado: { tipo: 'sin_visita' }, property_id: null }),
    enBandeja({ id: 'b', estado: { tipo: 'con_visita', visitaId: 'v', scheduled_at: 'x' }, telefono: '4941-0027' }),
    enBandeja({ id: 'c', estado: { tipo: 'visito', visitaId: 'v', scheduled_at: 'x' } }),
    enBandeja({ id: 'd', portal: 'mercadolibre', telefono: null }),
    enBandeja({ id: 'e', portal: 'argenprop', telefono: null }),
  ].map((f) => ({ ...f, tel: leerTelefono(f.telefono) }))

  it('las tarjetas no cambian al filtrar por estado', () => {
    const todo = armarBandeja(filas, { estado: null, telefonoRevisar: false, pagina: 1 })
    const filtrado = armarBandeja(filas, { estado: 'visito', telefonoRevisar: false, pagina: 1 })
    expect(filtrado.tarjetas).toEqual(todo.tarjetas)
    expect(filtrado.total).toBe(1)
    expect(todo.tarjetas).toEqual({ sinVisita: 3, sinPropiedad: 1, telefonoRevisar: 2 })
  })

  it('MercadoLibre sin teléfono no cuenta ni filtra como "teléfono a revisar"', () => {
    const r = armarBandeja(filas, { estado: null, telefonoRevisar: true, pagina: 1 })
    expect(r.filas.map((f) => f.id).sort()).toEqual(['b', 'e'])
  })

  it('con_visita filtra solo con_visita (no visito)', () => {
    const r = armarBandeja(filas, { estado: 'con_visita', telefonoRevisar: false, pagina: 1 })
    expect(r.filas.map((f) => f.id)).toEqual(['b'])
  })

  it('ordena por recibida_at descendente y, a igualdad, por id descendente', () => {
    const r = armarBandeja([
      enBandeja({ id: 'x1', recibida_at: '2026-10-27T10:00:00Z' }),
      enBandeja({ id: 'x2', recibida_at: '2026-10-28T10:00:00Z' }),
      enBandeja({ id: 'x3', recibida_at: '2026-10-28T10:00:00Z' }),
    ], { estado: null, telefonoRevisar: false, pagina: 1 })
    expect(r.filas.map((f) => f.id)).toEqual(['x3', 'x2', 'x1'])
  })

  it('página 2 de 30 filas → 5 filas y total 30', () => {
    const treinta = Array.from({ length: 30 }, (_, i) => enBandeja({ id: `id-${String(i).padStart(2, '0')}` }))
    const r = armarBandeja(treinta, { estado: null, telefonoRevisar: false, pagina: 2 })
    expect(r.filas).toHaveLength(5)
    expect(r.total).toBe(30)
  })

  it('una página después del final viene vacía, con el total correcto', () => {
    const r = armarBandeja(filas, { estado: null, telefonoRevisar: false, pagina: 9 })
    expect(r.filas).toEqual([])
    expect(r.total).toBe(5)
  })
})

describe('agruparPorDia', () => {
  const HOY = '2026-10-29'

  it('una consulta de las 23:30 de Argentina cae en ese día, no en el siguiente (UTC)', () => {
    const g = agruparPorDia([enBandeja({ recibida_at: '2026-10-28T02:30:00Z' })], HOY)
    expect(g).toHaveLength(1)
    expect(g[0].dia).toBe('2026-10-27')
    expect(g[0].etiqueta).toBe('mar 27 oct')
  })

  it('rotula Hoy, Ayer y el resto con día y mes cortos, sin puntos', () => {
    const g = agruparPorDia([
      enBandeja({ id: 'h', recibida_at: '2026-10-29T12:00:00Z' }),
      enBandeja({ id: 'a', recibida_at: '2026-10-28T12:00:00Z' }),
      enBandeja({ id: 'v', recibida_at: '2026-10-27T12:00:00Z' }),
    ], HOY)
    expect(g.map((d) => d.etiqueta)).toEqual(['Hoy', 'Ayer', 'mar 27 oct'])
    const otro = agruparPorDia([enBandeja({ recibida_at: '2026-10-28T12:00:00Z' })], '2026-11-02')
    expect(otro[0].etiqueta).toBe('mié 28 oct')
  })

  it('mantiene el orden recibido y junta las del mismo día', () => {
    const g = agruparPorDia([
      enBandeja({ id: '1', recibida_at: '2026-10-29T20:00:00Z' }),
      enBandeja({ id: '2', recibida_at: '2026-10-29T10:00:00Z' }),
      enBandeja({ id: '3', recibida_at: '2026-10-28T10:00:00Z' }),
    ], HOY)
    expect(g.map((d) => d.filas.map((f) => f.id))).toEqual([['1', '2'], ['3']])
  })
})

describe('consultasEnBandeja', () => {
  const propiedades = new Map([[PROP, { address: 'Doblas 248', neighborhood: 'Caballito' }]])
  const asesores = new Map([['as-prop', 'Lucas'], ['as-consulta', 'Julián']])

  it('arma estado, teléfono, acción, propiedad y repetidas de cada fila', () => {
    const filas = [
      consulta({ id: 'a', telefono: '011 15 6140-0496' }),
      consulta({ id: 'b', telefono: '+5491161400496', property_id: null }),
    ]
    const r = consultasEnBandeja(filas, [visita({ portal_inquiry_id: 'a' })], propiedades, asesores)
    expect(r[0]).toMatchObject({
      id: 'a', estado: { tipo: 'con_visita', visitaId: 'v-1' }, accion: 'agendar', repetidas: 2,
      propiedad: { address: 'Doblas 248', neighborhood: 'Caballito' },
    })
    expect(r[0].tel.ok).toBe(true)
    expect(r[1]).toMatchObject({ estado: { tipo: 'sin_visita' }, accion: 'elegir_propiedad', propiedad: null, repetidas: 2 })
  })

  it('el asesor es el de la propiedad; sin él, el de la consulta; sin ninguno, null', () => {
    const r = consultasEnBandeja([
      consulta({ id: '1', asesor_propiedad: 'as-prop', assigned_to: 'as-consulta' }),
      consulta({ id: '2', asesor_propiedad: null, assigned_to: 'as-consulta' }),
      consulta({ id: '3' }),
      consulta({ id: '4', asesor_propiedad: 'desconocido' }),
    ], [], propiedades, asesores)
    expect(r.map((f) => f.asesor_nombre)).toEqual(['Lucas', 'Julián', null, null])
  })
})

describe('contarPorPortal', () => {
  it('cuenta por portal con el nombre de marca, de mayor a menor', () => {
    const r = contarPorPortal([
      consulta({ id: '1', portal: 'argenprop' }), consulta({ id: '2', portal: 'zonaprop' }),
      consulta({ id: '3', portal: 'zonaprop' }), consulta({ id: '4', portal: 'landing' }),
    ], null)
    expect(r).toEqual([
      { valor: 'zonaprop', etiqueta: 'ZonaProp', n: 2 },
      { valor: 'argenprop', etiqueta: 'Argenprop', n: 1 },
      { valor: 'landing', etiqueta: 'Landing', n: 1 },
    ])
  })

  it('el portal elegido aparece aunque no tenga consultas', () => {
    expect(contarPorPortal([], 'mercadolibre')).toEqual([{ valor: 'mercadolibre', etiqueta: 'MercadoLibre', n: 0 }])
  })

  it('un portal fuera del catálogo se muestra con su nombre crudo', () => {
    expect(contarPorPortal([consulta({ portal: 'properati' })], null)).toEqual([{ valor: 'properati', etiqueta: 'properati', n: 1 }])
  })
})

describe('contarPorPropiedad', () => {
  const propiedades = new Map([
    ['p1', { address: 'Doblas 248', neighborhood: null }],
    ['p2', { address: 'Roque Pérez 3059', neighborhood: null }],
  ])

  it('"Sin propiedad identificada" va primero; el resto de mayor a menor', () => {
    const r = contarPorPropiedad([
      consulta({ id: '1', property_id: 'p1' }), consulta({ id: '2', property_id: 'p2' }),
      consulta({ id: '3', property_id: 'p2' }), consulta({ id: '4', property_id: null }),
    ], propiedades, null)
    expect(r).toEqual([
      { valor: 'sin', etiqueta: 'Sin propiedad identificada', n: 1 },
      { valor: 'p2', etiqueta: 'Roque Pérez 3059', n: 2 },
      { valor: 'p1', etiqueta: 'Doblas 248', n: 1 },
    ])
  })

  it('sin consultas sin propiedad, ese renglón no aparece salvo que esté elegido', () => {
    const filas = [consulta({ property_id: 'p1' })]
    expect(contarPorPropiedad(filas, propiedades, null).map((o) => o.valor)).toEqual(['p1'])
    expect(contarPorPropiedad(filas, propiedades, 'sin')[0]).toEqual({ valor: 'sin', etiqueta: 'Sin propiedad identificada', n: 0 })
  })

  it('una propiedad sin dirección conocida no rompe la lista', () => {
    expect(contarPorPropiedad([consulta({ property_id: 'p9' })], propiedades, null))
      .toEqual([{ valor: 'p9', etiqueta: 'Propiedad sin dirección', n: 1 }])
  })
})
