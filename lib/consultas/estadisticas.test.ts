import { describe, it, expect } from 'vitest'
import { calcularEstadisticas } from './estadisticas'
import { leerTelefono } from './telefono'
import type { ConsultaEnBandeja, EstadoConsulta } from './tipos'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const CON_VISITA: EstadoConsulta = { tipo: 'con_visita', visitaId: 'v1', scheduled_at: '2026-10-30T15:00:00Z' }
const VISITO: EstadoConsulta = { tipo: 'visito', visitaId: 'v2', scheduled_at: '2026-10-20T15:00:00Z' }

function c(p: Partial<ConsultaEnBandeja> = {}): ConsultaEnBandeja {
  const telefono = p.telefono === undefined ? '+5491161400496' : p.telefono
  return {
    id: 'x', tipo: 'portal', numero: 1, recibida_at: '2026-10-28T15:00:00Z', canal: 'mail', portal: 'zonaprop',
    nombre: 'Ana', telefono, email: null, mensaje: null, property_id: P1, assigned_to: null, asesor_propiedad: null,
    aviso_codigo: null, aviso_url: null, aviso_direccion: null, aviso_titulo: null, utm: null,
    estado: { tipo: 'sin_visita' }, tel: leerTelefono(telefono), repetidas: 1, accion: 'agendar',
    propiedad: { address: 'Doblas 248', neighborhood: null }, asesor_nombre: 'Lucas', ...p,
  }
}

const periodo = { desde: '2026-10-22', hasta: '2026-10-28' }

describe('calcularEstadisticas', () => {
  it('sin consultas: todo "Sin datos" (valor null), nunca 0', () => {
    const e = calcularEstadisticas([], periodo, true)
    expect(e.tarjetas.consultas.valor).toBeNull()
    expect(e.tarjetas.conversion.valor).toBeNull()
    expect(e.tarjetas.conPropiedad.valor).toBeNull()
    expect(e.porPortal).toEqual([])
  })

  it('tarjetas: consultas, por día, personas distintas (mismo WhatsApp = una), % con propiedad, visitas y conversión', () => {
    const e = calcularEstadisticas([
      c({ id: '1', telefono: '+5491161400496', estado: CON_VISITA }),
      c({ id: '2', telefono: '011 15 6140-0496' }), // la misma persona que la 1
      c({ id: '3', telefono: '+5491158234521', property_id: null, propiedad: null }),
      c({ id: '4', telefono: null, email: 'b@x.com' }),
    ], periodo, true)
    expect(e.tarjetas.consultas).toMatchObject({ valor: 4 })
    expect(e.tarjetas.porDia.valor).toBeCloseTo(4 / 7, 1)
    expect(e.tarjetas.personas.valor).toBe(3)
    expect(e.tarjetas.conPropiedad).toMatchObject({ valor: 75, base: 4, orientativo: true })
    expect(e.tarjetas.visitas.valor).toBe(1)
    // 1 persona con visita de 2 con WhatsApp válido (la del email no cuenta en la base).
    expect(e.tarjetas.conversion).toMatchObject({ valor: 50, base: 2 })
  })

  it('el recorrido nunca sube y marca el paso más angosto', () => {
    const e = calcularEstadisticas([
      c({ id: '1', telefono: '+5491161400491', estado: VISITO }),
      c({ id: '2', telefono: '+5491161400492', estado: CON_VISITA }),
      c({ id: '3', telefono: '+5491161400493' }),
      c({ id: '4', telefono: '+5491161400494' }),
      c({ id: '5', telefono: '4941-0027' }),
    ], periodo, true)
    expect(e.recorrido.map((p) => [p.clave, p.cantidad])).toEqual([
      ['personas', 5], ['contactables', 4], ['con_visita', 2], ['visito', 1],
    ])
    for (let i = 1; i < e.recorrido.length; i++) expect(e.recorrido[i].cantidad).toBeLessThanOrEqual(e.recorrido[i - 1].cantidad)
    expect(e.recorrido.filter((p) => p.masAngosto).map((p) => p.clave)).toEqual(['con_visita'])
  })

  it('una persona con visita cuyo teléfono no se pudo leer igual cuenta como contactable (el recorrido no sube)', () => {
    const e = calcularEstadisticas([c({ id: '1', telefono: '4941-0027', estado: CON_VISITA })], periodo, true)
    expect(e.recorrido.map((p) => p.cantidad)).toEqual([1, 1, 1, 0])
  })

  it('por portal: consultas, % del total, visitas y conversión, de mayor a menor', () => {
    const e = calcularEstadisticas([
      c({ id: '1', portal: 'zonaprop', telefono: '+5491161400491', estado: CON_VISITA }),
      c({ id: '2', portal: 'zonaprop', telefono: '+5491161400492' }),
      c({ id: '3', portal: 'argenprop', telefono: '+5491161400493' }),
    ], periodo, true)
    expect(e.porPortal.map((f) => [f.clave, f.etiqueta, f.consultas, f.porcentaje.valor, f.visitas, f.conversion.valor])).toEqual([
      ['zonaprop', 'ZonaProp', 2, 67, 1, 50],
      ['argenprop', 'Argenprop', 1, 33, 0, 0],
    ])
  })

  it('por propiedad: "Sin propiedad identificada" primero, reparto por portal y última consulta', () => {
    const e = calcularEstadisticas([
      c({ id: '1', property_id: P1, portal: 'zonaprop', recibida_at: '2026-10-25T10:00:00Z' }),
      c({ id: '2', property_id: P1, portal: 'argenprop', recibida_at: '2026-10-27T10:00:00Z' }),
      c({ id: '3', property_id: P2, propiedad: { address: 'Amenábar 1500', neighborhood: null } }),
      c({ id: '4', property_id: null, propiedad: null }),
    ], periodo, true)
    expect(e.porPropiedad[0]).toMatchObject({ clave: 'sin', etiqueta: 'Sin propiedad identificada', consultas: 1 })
    expect(e.porPropiedad[1]).toMatchObject({
      clave: P1, etiqueta: 'Doblas 248', consultas: 2, ultima: '2026-10-27T10:00:00Z',
      portales: [{ etiqueta: 'Argenprop', n: 1 }, { etiqueta: 'ZonaProp', n: 1 }],
    })
  })

  it('por mes (hora argentina), por canal (ML = Pregunta) y por asesor; el asesor no ve la de asesor', () => {
    const filas = [
      c({ id: '1', recibida_at: '2026-10-01T02:00:00Z', canal: 'whatsapp', asesor_propiedad: 'a1' }), // 30/9 23:00 en Argentina
      c({ id: '2', recibida_at: '2026-10-05T12:00:00Z', portal: 'mercadolibre', asesor_nombre: null }),
    ]
    const e = calcularEstadisticas(filas, { desde: '2026-09-01', hasta: '2026-10-28' }, true)
    expect(e.porMes.map((m) => [m.clave, m.consultas])).toEqual([['2026-09', 1], ['2026-10', 1]])
    expect(e.porCanal.map((f) => f.etiqueta).sort()).toEqual(['Pregunta', 'WhatsApp'])
    expect(e.porAsesor?.map((f) => f.etiqueta).sort()).toEqual(['Lucas', 'Sin asesor'])
    expect(calcularEstadisticas(filas, periodo, false).porAsesor).toBeNull()
  })
})

describe('por asesor: por persona, no por nombre', () => {
  it('dos asesores con el mismo nombre no se suman; uno sin nombre no cae en "Sin asesor"', () => {
    const e = calcularEstadisticas([
      c({ id: '1', asesor_propiedad: 'a1', asesor_nombre: 'Lucas' }),
      c({ id: '2', asesor_propiedad: 'a2', asesor_nombre: 'Lucas' }),
      c({ id: '3', asesor_propiedad: 'a3', asesor_nombre: null }),
      c({ id: '4', asesor_propiedad: null, assigned_to: null, asesor_nombre: null }),
    ], periodo, true)
    expect(e.porAsesor?.map((f) => [f.clave, f.etiqueta, f.consultas]).sort()).toEqual([
      ['a1', 'Lucas', 1], ['a2', 'Lucas', 1], ['a3', 'Asesor sin nombre', 1], ['sin', 'Sin asesor', 1],
    ])
  })
})
