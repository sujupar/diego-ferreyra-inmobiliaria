import { describe, it, expect } from 'vitest'
import { vistaBandeja, coincideBusqueda, filtrarConsultas, SIN_FILTROS } from './vista'
import { leerTelefono } from './telefono'
import type { ConsultaEnBandeja } from './tipos'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const LUCAS = '33333333-3333-4333-8333-333333333333'
const PAULA = '44444444-4444-4444-8444-444444444444'

function c(p: Partial<ConsultaEnBandeja> = {}): ConsultaEnBandeja {
  const telefono = p.telefono === undefined ? '+5491161400496' : p.telefono
  return {
    id: 'x', tipo: 'portal', numero: 1, recibida_at: '2026-10-28T15:00:00Z', canal: 'mail', portal: 'zonaprop',
    nombre: 'Ana', telefono, email: null, mensaje: null, property_id: P1, assigned_to: null, asesor_propiedad: LUCAS,
    aviso_codigo: null, aviso_url: null, aviso_direccion: null, aviso_titulo: null, utm: null,
    estado: { tipo: 'sin_visita' }, tel: leerTelefono(telefono), repetidas: 1, accion: 'agendar',
    propiedad: { address: 'Doblas 248', neighborhood: 'Caballito' }, asesor_nombre: 'Lucas',
    ...p,
  }
}

const opciones = { verTodo: true, visibles: 25 }

describe('filtrarConsultas', () => {
  const filas = [
    c({ id: 'a', portal: 'zonaprop' }),
    c({ id: 'b', portal: 'argenprop', property_id: null, propiedad: null, asesor_propiedad: null }),
    c({ id: 'c', portal: 'argenprop', property_id: P2, asesor_propiedad: PAULA, propiedad: { address: 'Amenábar 1500', neighborhood: 'Colegiales' } }),
    c({ id: 'd', portal: 'landing', asesor_propiedad: null, assigned_to: null }),
  ]

  it('portal, propiedad y "sin" propiedad', () => {
    expect(filtrarConsultas(filas, { ...SIN_FILTROS, portal: 'argenprop' }, true).map((f) => f.id)).toEqual(['b', 'c'])
    expect(filtrarConsultas(filas, { ...SIN_FILTROS, propiedad: P2 }, true).map((f) => f.id)).toEqual(['c'])
    expect(filtrarConsultas(filas, { ...SIN_FILTROS, propiedad: 'sin' }, true).map((f) => f.id)).toEqual(['b'])
  })

  it('asesor = el de la propiedad, o el de la consulta si la propiedad no tiene; "sin" = ninguno', () => {
    const conAsignada = [...filas, c({ id: 'e', asesor_propiedad: null, assigned_to: PAULA })]
    expect(filtrarConsultas(conAsignada, { ...SIN_FILTROS, asesor: PAULA }, true).map((f) => f.id)).toEqual(['c', 'e'])
    expect(filtrarConsultas(conAsignada, { ...SIN_FILTROS, asesor: 'sin' }, true).map((f) => f.id)).toEqual(['b', 'd'])
  })

  it('quien no ve todo: el filtro de asesor se ignora', () => {
    expect(filtrarConsultas(filas, { ...SIN_FILTROS, asesor: PAULA }, false)).toHaveLength(4)
  })
})

describe('coincideBusqueda', () => {
  const ana = c({ nombre: 'Ana Díaz', email: 'ana@x.com', mensaje: 'Me interesa el balcón', aviso_direccion: 'Alvarez Jonte 3500' })

  it('ignora tildes y mayúsculas, en las dos direcciones, y con tildes descompuestas (NFD)', () => {
    expect(coincideBusqueda(ana, 'diaz')).toBe(true)
    expect(coincideBusqueda(ana, 'BALCON')).toBe(true)
    expect(coincideBusqueda(c({ nombre: 'Ana Diaz' }), 'díaz')).toBe(true)
    expect(coincideBusqueda(ana, 'Díaz')).toBe(true)
  })

  it('todas las palabras tienen que aparecer, en cualquier campo', () => {
    expect(coincideBusqueda(ana, 'ana jonte')).toBe(true)
    expect(coincideBusqueda(ana, 'ana palermo')).toBe(false)
  })

  it('busca en la dirección de la propiedad y en el email', () => {
    expect(coincideBusqueda(ana, 'doblas')).toBe(true)
    expect(coincideBusqueda(ana, 'ana@x.com')).toBe(true)
  })

  it('los números se comparan contra los dígitos del teléfono, escrito como sea', () => {
    expect(coincideBusqueda(c({ telefono: '+54 9 11 6140-0496' }), '61400496')).toBe(true)
    expect(coincideBusqueda(c({ telefono: '011 15 6140-0496' }), '1161400496')).toBe(true)
    expect(coincideBusqueda(c({ telefono: '+5491161400496' }), '99999999')).toBe(false)
  })

  it('los caracteres de expresión regular son texto común', () => {
    expect(coincideBusqueda(c({ mensaje: 'depto 2*D' }), '2*D')).toBe(true)
    expect(coincideBusqueda(c({ mensaje: 'depto 2AD' }), '2*D')).toBe(false)
    expect(coincideBusqueda(c(), '(')).toBe(false)
  })

  it('búsqueda vacía coincide con todo; campos nulos no rompen', () => {
    expect(coincideBusqueda(c({ nombre: null, propiedad: null, telefono: null }), '')).toBe(true)
    expect(coincideBusqueda(c({ nombre: null, propiedad: null, telefono: null }), 'ana')).toBe(false)
  })
})

describe('vistaBandeja', () => {
  it('los selectores se cuentan SIN su propio filtro; las tarjetas, antes del filtro de estado', () => {
    const filas = [
      c({ id: 'a', portal: 'zonaprop' }),
      c({ id: 'b', portal: 'argenprop', estado: { tipo: 'visito', visitaId: 'v', scheduled_at: '2026-10-29T15:00:00Z' } }),
      c({ id: 'c', portal: 'argenprop', property_id: null, propiedad: null }),
    ]
    const v = vistaBandeja(filas, { ...SIN_FILTROS, portal: 'argenprop', estado: 'visito' }, opciones)
    expect(v.filas.map((f) => f.id)).toEqual(['b'])
    expect(v.total).toBe(1)
    expect(v.porPortal).toEqual([
      { valor: 'argenprop', etiqueta: 'Argenprop', n: 2 },
      { valor: 'zonaprop', etiqueta: 'ZonaProp', n: 1 },
    ])
    // Propiedad: cuenta con el filtro de portal puesto (2 de argenprop).
    expect(v.porPropiedad).toEqual([
      { valor: 'sin', etiqueta: 'Sin propiedad identificada', n: 1 },
      { valor: P1, etiqueta: 'Doblas 248', n: 1 },
    ])
    expect(v.tarjetas).toEqual({ sinVisita: 1, sinPropiedad: 1, telefonoRevisar: 0 })
  })

  it('la búsqueda también achica los conteos', () => {
    const v = vistaBandeja([c({ id: 'a', nombre: 'Ana' }), c({ id: 'b', nombre: 'Beto', portal: 'argenprop' })],
      { ...SIN_FILTROS, q: 'beto' }, opciones)
    expect(v.porPortal).toEqual([{ valor: 'argenprop', etiqueta: 'Argenprop', n: 1 }])
  })

  it('"Ver más" agrega de a 25 sin volver a pedir', () => {
    const muchas = Array.from({ length: 60 }, (_, i) => c({ id: `id-${String(i).padStart(2, '0')}` }))
    expect(vistaBandeja(muchas, SIN_FILTROS, { verTodo: true, visibles: 25 }).filas).toHaveLength(25)
    expect(vistaBandeja(muchas, SIN_FILTROS, { verTodo: true, visibles: 50 }).filas).toHaveLength(50)
    expect(vistaBandeja(muchas, SIN_FILTROS, { verTodo: true, visibles: 75 }).filas).toHaveLength(60)
  })

  it('3.000 consultas se filtran y cuentan en menos de 50 ms', () => {
    const muchas = Array.from({ length: 3000 }, (_, i) => c({
      id: `id-${i}`, nombre: `Persona ${i}`, portal: i % 2 ? 'zonaprop' : 'argenprop',
      property_id: i % 5 ? P1 : null, mensaje: 'Hola, me interesa la propiedad, ¿sigue disponible?',
    }))
    vistaBandeja(muchas, { ...SIN_FILTROS, q: 'persona 29' }, opciones) // calienta
    const t = performance.now()
    vistaBandeja(muchas, { ...SIN_FILTROS, portal: 'zonaprop', q: 'persona 29' }, opciones)
    expect(performance.now() - t).toBeLessThan(50)
  })
})
