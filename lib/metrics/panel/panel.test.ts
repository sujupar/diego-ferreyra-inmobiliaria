import { describe, expect, it } from 'vitest'
import { armarPersonas, contactosDePrueba, type ContactoRow, type DealRow } from './personas'
import { armarBlue, contarPasos, embudoDeCampania, porVariante, resumirCanal, serie } from './embudo'
import { calcularVenta, partesSugeridas, validarVenta } from './reparto'
import { adquisicion, calcularPlata, gastoDelPeriodo, planificar } from './economia'
import { claves, rangoComparado, rangoDeAtajo, lunes } from './rango'
import { VENTAS_INICIALES } from './datos-iniciales'

const deal = (p: Partial<DealRow> & { id: string; created_at: string }): DealRow => ({
  contact_id: null, origin: 'embudo', stage: 'request', notes: null, appraisal_id: null, landing_variant: null,
  scheduled_at: null, visited_at: null, visit_completed_at: null, delivered_at: null, captured_at: null, ...p,
})
const ct = (id: string, full_name: string, phone: string | null = null, email: string | null = null): ContactoRow => ({ id, full_name, phone, email })
const envio = (deal_id: string, funnel = 'tasacion') => ({ deal_id, funnel })

describe('personas', () => {
  it('detecta las pruebas de Julián por email, nombre y su teléfono', () => {
    const p = contactosDePrueba([
      ct('j', 'Julian Parra', '+57 310 782 2955', 'contacto.julianparra@gmail.com'),
      ct('k', 'Cualquiera', '3107822955'),
      ct('t', '[TEST] Fulano'),
      ct('ok', 'María López', '1144445555', 'maria@gmail.com'),
    ])
    expect([...p.ids].sort()).toEqual(['j', 'k', 't'])
    expect(p.tels.has('3107822955')).toBe(true)
  })

  it('una persona que pide dos veces cuenta una sola solicitud', () => {
    const r = armarPersonas({
      contactos: [ct('a', 'Ana', '11 4444-5555'), ct('b', 'Ana otra ficha', '+54 9 11 4444 5555')],
      deals: [deal({ id: 'd1', contact_id: 'a', created_at: '2026-08-01T10:00:00Z' }), deal({ id: 'd2', contact_id: 'b', created_at: '2026-08-05T10:00:00Z' })],
      historia: [], informes: [], envios: [envio('d1'), envio('d2')],
    })
    expect(r.personas).toHaveLength(1)
    expect(r.excluidas.repetidas).toBe(1)
  })

  it('una agendada cuenta como solicitud Y como agendada, no como dos personas', () => {
    const r = armarPersonas({
      contactos: [ct('a', 'Ana', '1144445555')],
      deals: [
        deal({ id: 'd1', contact_id: 'a', created_at: '2026-08-01T10:00:00Z' }),
        // "Coordinar tasación" crea un segundo proceso para la misma persona.
        deal({ id: 'd2', contact_id: 'a', created_at: '2026-08-03T10:00:00Z', stage: 'scheduled', scheduled_at: '2026-08-03T10:00:00Z' }),
      ],
      historia: [], informes: [], envios: [envio('d1')],
    })
    expect(r.personas).toHaveLength(1)
    expect(r.personas[0].fechas).toMatchObject({ solicitud: '2026-08-01', agendada: '2026-08-03', realizada: null })
  })

  it('excluye pruebas y colegas', () => {
    const r = armarPersonas({
      contactos: [ct('j', 'Julian Parra', null, 'contacto.julianparra@gmail.com'), ct('c', 'Colega')],
      deals: [
        deal({ id: 'd1', contact_id: 'j', created_at: '2026-08-01T10:00:00Z' }),
        deal({ id: 'd2', contact_id: 'c', created_at: '2026-03-01T10:00:00Z', notes: 'Importado de GHL. Contact source: Form - [Tasación] Stage GHL: Colega Source GHL x' }),
      ],
      historia: [], informes: [], envios: [envio('d1')],
    })
    expect(r.personas).toHaveLength(0)
    expect(r.excluidas).toMatchObject({ pruebas: 1, colegas: 1 })
  })

  it('el sistema viejo toma la etapa de las notas y la fecha de la solicitud', () => {
    const r = armarPersonas({
      contactos: [ct('a', 'Ana', '1144445555')],
      deals: [deal({ id: 'd1', contact_id: 'a', created_at: '2026-02-10T10:00:00Z', stage: 'captured', captured_at: '2026-07-01T00:00:00Z',
        notes: 'Importado de GHL. Contact source: Form - [Tasación Gratuita] Stage GHL: Seguimiento para Captación Source GHL y' })],
      historia: [], informes: [], envios: [],
    })
    const p = r.personas[0]
    expect(p.historico).toBe(true)
    // "Seguimiento para Captación" = hecha y entregada, NO captada (el captured_at es un artefacto).
    expect(p.fechas).toEqual({ solicitud: '2026-02-10', agendada: '2026-02-10', realizada: '2026-02-10', entregada: '2026-02-10', captada: null })
  })

  it('llegar a un paso implica los anteriores, y ninguno es anterior a la solicitud', () => {
    const r = armarPersonas({
      contactos: [ct('a', 'Ana', '1144445555')],
      deals: [deal({ id: 'd1', contact_id: 'a', created_at: '2026-08-10T10:00:00Z', stage: 'captured', captured_at: '2026-08-01T00:00:00Z' })],
      historia: [{ deal_id: 'd1', to_stage: 'captured', changed_at: '2026-09-01T00:00:00Z' }], informes: [], envios: [envio('d1')],
    })
    expect(r.personas[0].fechas).toEqual({ solicitud: '2026-08-10', agendada: '2026-08-10', realizada: '2026-08-10', entregada: '2026-08-10', captada: '2026-08-10' })
  })

  it('separa tasación y clase: la misma persona puede estar en los dos', () => {
    const r = armarPersonas({
      contactos: [ct('a', 'Ana', '1144445555')],
      deals: [deal({ id: 'd1', contact_id: 'a', created_at: '2026-08-01T10:00:00Z', origin: 'clase_gratuita' }), deal({ id: 'd2', contact_id: 'a', created_at: '2026-08-02T10:00:00Z' })],
      historia: [], informes: [], envios: [envio('d1', 'clase'), envio('d2')],
    })
    expect(r.personas.map(p => p.embudo).sort()).toEqual(['clase', 'tasacion'])
  })
})

describe('embudo', () => {
  const personas = armarPersonas({
    contactos: [ct('a', 'A', '1111111111'), ct('b', 'B', '2222222222')],
    deals: [
      deal({ id: 'd1', contact_id: 'a', created_at: '2026-08-30T10:00:00Z', stage: 'visited', scheduled_at: '2026-09-02T00:00:00Z', visited_at: '2026-09-05T00:00:00Z' }),
      deal({ id: 'd2', contact_id: 'b', created_at: '2026-09-03T10:00:00Z', landing_variant: 'B' }),
    ],
    historia: [], informes: [], envios: [envio('d1'), envio('d2')],
  }).personas
  const sep = { desde: '2026-09-01', hasta: '2026-09-30' }

  it('eventos cuenta cada paso en su fecha; cohorte sigue a los que pidieron en el período', () => {
    expect(contarPasos(personas, sep, 'eventos')).toMatchObject({ solicitud: 1, agendada: 1, realizada: 1 })
    expect(contarPasos(personas, sep, 'cohorte')).toMatchObject({ solicitud: 1, agendada: 0, realizada: 0 })
  })

  it('clasifica campañas por nombre', () => {
    expect(embudoDeCampania('🟡 CONV: [Tasación Gratuita] | Primer Nivel')).toBe('tasacion')
    expect(embudoDeCampania('🟢 CONV PREMIUM: [Tasación Directa] | HNWI')).toBe('tasacion')
    expect(embudoDeCampania('🟢 RMK: [Clase Gratuita] | Segundo Nivel')).toBe('clase')
    expect(embudoDeCampania('[Auto] Roque Pérez 3059')).toBe('propiedad')
  })

  it('pasa la inversión a dólares con el blue de cada día y calcula costos y conversión', () => {
    const blue = armarBlue([{ date: '2026-09-01', source: 'Blue', value_buy: 990, value_sell: 1010 }])
    const r = resumirCanal('tasacion', {
      personas, rango: sep, vista: 'eventos', blue,
      meta: [{ fecha: '2026-09-03', campania: '[Tasación] x', gasto: 100000, impresiones: 1000, clics: 50, visitasMeta: 40 },
        { fecha: '2026-09-03', campania: '[Clase] x', gasto: 999999, impresiones: 1, clics: 1, visitasMeta: 1 }],
      visitas: [{ fecha: '2026-09-03', embudo: 'tasacion', variante: 'B', visitas: 20 }],
    })
    expect(r.inversionUsd).toBeCloseTo(100)
    expect(r.visitas).toBe(20) // visitas propias, no las de Meta
    expect(r.conversionLanding).toBeCloseTo(1 / 20)
    expect(r.pasos[0]).toMatchObject({ etapa: 'solicitud', cantidad: 1, costoUsd: 100 })
    expect(r.pasos[1]).toMatchObject({ etapa: 'agendada', cantidad: 1, pctPaso: 1 })
  })

  it('tasación nov-25 a mar-26 no tiene dato de visitas (no cuenta como 0)', () => {
    const r = resumirCanal('tasacion', {
      personas: [], rango: { desde: '2026-02-01', hasta: '2026-02-28' }, vista: 'eventos', blue: () => 1000,
      meta: [{ fecha: '2026-02-03', campania: 'Tasación', gasto: 1000, impresiones: 1, clics: 1, visitasMeta: 30 }], visitas: [],
    })
    expect(r.visitas).toBeNull()
    expect(r.conversionLanding).toBeNull()
  })

  it('serie y conversión por variante', () => {
    const s = serie('tasacion', { personas, rango: sep, meta: [], visitas: [{ fecha: '2026-09-03', embudo: 'tasacion', variante: 'B', visitas: 10 }], blue: () => 1000 }, 'mes')
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ clave: '2026-09', solicitudes: 1, agendadas: 1, realizadas: 1, visitas: 10 })
    const v = porVariante(personas, [{ fecha: '2026-09-03', embudo: 'tasacion', variante: 'B', visitas: 10 }], sep)
    expect(v[0]).toMatchObject({ variante: 'B', solicitudes: 1, conversion: 0.1 })
  })

  it('el blue de un fin de semana es el del último día hábil', () => {
    const b = armarBlue([{ date: '2026-09-04', source: 'Blue', value_buy: 1000, value_sell: 1000 }, { date: '2026-09-04', source: 'Oficial', value_buy: 1, value_sell: 1 }])
    expect(b('2026-09-06')).toBe(1000)
    expect(b('2026-09-01')).toBeNull()
  })
})

describe('reparto (regla del dueño)', () => {
  const v = (dir: string) => VENTAS_INICIALES.find(x => x.direccion === dir)!
  it('Tupac Amaru y Díaz Vélez dan lo que anotó Diego', () => {
    expect(calcularVenta(v('Tupac Amaru')).limpioDiegoUsd).toBe(2640)
    expect(calcularVenta(v('Díaz Vélez')).limpioDiegoUsd).toBe(4956)
    expect(calcularVenta(v('Piedras')).limpioDiegoUsd).toBe(1632)
  })

  it('las 16 ventas de dic-25 a ago-26 dan USD 136.851 cobrados', () => {
    const hastaAgosto = VENTAS_INICIALES.filter(x => x.reservada_en! <= '2026-08-31')
    expect(hastaAgosto).toHaveLength(16)
    const c = hastaAgosto.map(x => calcularVenta(x))
    expect(c.reduce((a, x) => a + x.cobradoUsd!, 0)).toBe(136851)
    // Diego anotó 124.177; la diferencia de +8 son las cuentas a revisar (Maure +108, Santo Tomé −100).
    expect(c.reduce((a, x) => a + x.limpioDiegoUsd!, 0)).toBe(124185)
  })

  it('Agüero se calcula con el 5% supuesto y queda a confirmar', () => {
    const a = v('Agüero')
    expect(a.a_confirmar).toBe(true)
    expect(calcularVenta(a)).toMatchObject({ cobradoUsd: 7500, limpioDiegoUsd: 4500, faltan: [] })
  })

  it('si no hay honorario real, cobrado = precio × % − otra inmobiliaria; y avisa qué falta', () => {
    const c = calcularVenta({ ...v('Caracas'), honorario_cobrado_usd: null, otra_inmobiliaria_usd: 300, origen_dueno: null })
    expect(c.cobradoUsd).toBe(7000)
    expect(c.faltan).toContain('cómo llegó el dueño')
    expect(c.faltan).toContain('honorario cobrado real')
  })

  it('una venta en pesos se pasa a dólares con el blue de la reserva', () => {
    const c = calcularVenta({ ...v('Caracas'), moneda: 'ARS', precio: 146_000_000, honorario_cobrado_usd: null }, 1000)
    expect(c.precioUsd).toBe(146000)
    expect(c.cobradoUsd).toBe(7300)
  })

  it('sugiere los % según quién captó, quién vendió y el origen', () => {
    expect(partesSugeridas({ capto: 'Diego', vendio: 'Lucas', origen: 'embudo', hayReferidor: false })).toEqual({ asesor_pct: 20, julian_pct: 20, referidor_pct: 0 })
    expect(partesSugeridas({ capto: 'Lucas', vendio: 'Lucas', origen: 'referido', hayReferidor: true })).toEqual({ asesor_pct: 50, julian_pct: 0, referidor_pct: 20 })
    expect(partesSugeridas({ capto: 'Diego', vendio: 'Diego', origen: 'portal', hayReferidor: false })).toEqual({ asesor_pct: 0, julian_pct: 0, referidor_pct: 0 })
  })

  it('valida lo que llega', () => {
    expect(validarVenta({ direccion: '' })).toMatch(/dirección/)
    expect(validarVenta({ direccion: 'x', asesor_pct: 60, julian_pct: 30, referidor_pct: 20 })).toMatch(/100/)
    expect(validarVenta({ direccion: 'x', pct_vendedor: 30 })).toMatch(/20/)
    expect(validarVenta({ direccion: 'x', reservada_en: '1/2/2026' })).toMatch(/fecha/)
    expect(validarVenta({ direccion: 'x', precio: 100000, pct_vendedor: 3 })).toBeNull()
  })
})

describe('economía', () => {
  it('prorratea los gastos fijos por los días del período', () => {
    const g = gastoDelPeriodo([{ concepto: 'Oficina', tipo: 'fijo', monto_usd: 1000, desde: '2026-01-01', hasta: null, a_confirmar: false }], { desde: '2026-01-01', hasta: '2026-12-31' })
    expect(g.fijos).toBeCloseTo(12000)
    expect(g.sinImpuestos).toBe(true)
  })

  it('margen bruto y neto del año', () => {
    const { plata } = calcularPlata({
      ventas: VENTAS_INICIALES, gastos: [], publicidadCaptacionUsd: 3000, publicidadPropiedadesUsd: 100,
      rango: { desde: '2026-01-01', hasta: '2026-12-31' },
    })
    expect(plata.ventas).toBe(14) // 13 de ene-ago + Agüero
    expect(plata.margenNetoUsd).toBeCloseTo(plata.margenBrutoUsd - 3100)
  })

  it('costo de adquisición máximo = beneficio por captación ÷ 3', () => {
    const a = adquisicion({ publicidadCaptacionUsd: 2400, captaciones: 10, limpioPromedioPorVentaUsd: 6000, tasaVenta: 0.5 })
    expect(a).toEqual({ costoPorCaptacionUsd: 240, beneficioBrutoPorCaptacionUsd: 3000, costoMaximoUsd: 1000, retorno: 12.5 })
  })

  it('planificador: 8 tasaciones por semana', () => {
    const p = planificar(8, { realizadaPorSolicitud: 0.2, costoPorSolicitudUsd: 10, captadaPorRealizada: 0.25, tasaVenta: 0.5, limpioPorVentaUsd: 6000 })
    expect(p.solicitudesSemana).toBe(40)
    expect(p.inversionSemanaUsd).toBe(400)
    expect(p.inversionMesUsd).toBeCloseTo(400 * 52 / 12)
    expect(p.captacionesMes).toBeCloseTo(8 * 52 / 12 * 0.25)
  })

  it('planificador sin tasas no inventa números', () => {
    const p = planificar(8, { realizadaPorSolicitud: 0, costoPorSolicitudUsd: 0, captadaPorRealizada: 0, tasaVenta: 0, limpioPorVentaUsd: 0 })
    expect(p.solicitudesSemana).toBeNull()
    expect(p.inversionMesUsd).toBeNull()
  })
})

describe('rango', () => {
  it('atajos y comparación', () => {
    expect(lunes('2026-11-04')).toBe('2026-11-02')
    expect(rangoDeAtajo('semana_pasada', '2026-11-04')).toEqual({ desde: '2026-10-26', hasta: '2026-11-01' })
    expect(rangoDeAtajo('mes_pasado', '2026-11-04')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' })
    expect(rangoComparado({ desde: '2026-11-02', hasta: '2026-11-08' }, 'anterior')).toEqual({ desde: '2026-10-26', hasta: '2026-11-01' })
    expect(rangoComparado({ desde: '2026-01-01', hasta: '2026-03-31' }, 'anio_pasado')).toEqual({ desde: '2025-01-01', hasta: '2025-03-31' })
    expect(claves({ desde: '2026-10-30', hasta: '2026-11-04' }, 'mes')).toEqual(['2026-10', '2026-11'])
  })
})
