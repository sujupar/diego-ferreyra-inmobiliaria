/**
 * Los números de plata del negocio y el planificador.
 *
 * Definiciones (spec bloque 5):
 *  - Facturación = honorarios cobrados de las ventas RESERVADAS en el período
 *    (Diego cuenta la venta en el mes de la reserva).
 *  - Margen bruto = facturación − reparto (asesor, Julián, referidor) − gastos
 *    de cada propiedad vendida. Es lo que le queda a Diego de las ventas.
 *  - Margen neto = margen bruto − gastos fijos − impuestos − toda la publicidad
 *    (captación y anuncios de propiedades).
 *  - Costo de adquisición = publicidad de captación ÷ captaciones del embudo.
 *  - Costo de adquisición máximo = beneficio bruto por captación ÷ 3 (el piso
 *    3:1 del manual: cada dólar para conseguir un cliente tiene que volver tres).
 */

import { calcularVenta, type VentaCalculada, type VentaRow } from './reparto'
import { diasEntre, enRango, type Rango } from './rango'

export interface GastoFijo {
  concepto: string
  tipo: 'fijo' | 'impuesto'
  monto_usd: number
  desde: string
  hasta: string | null
  a_confirmar: boolean
}

/** Gasto del período: el monto mensual prorrateado por los días que se solapan. */
export function gastoDelPeriodo(g: GastoFijo[], r: Rango): { fijos: number; impuestos: number; aConfirmar: boolean; sinImpuestos: boolean } {
  let fijos = 0, impuestos = 0, aConfirmar = false
  for (const x of g) {
    const desde = x.desde > r.desde ? x.desde : r.desde
    const hasta = x.hasta && x.hasta < r.hasta ? x.hasta : r.hasta
    if (desde > hasta) continue
    const monto = x.monto_usd * diasEntre({ desde, hasta }) * 12 / 365
    if (x.tipo === 'impuesto') impuestos += monto; else fijos += monto
    if (x.a_confirmar) aConfirmar = true
  }
  return { fijos, impuestos, aConfirmar, sinImpuestos: !g.some(x => x.tipo === 'impuesto') }
}

export interface VentaConCalculo { venta: VentaRow; calc: VentaCalculada }

export interface Plata {
  ventas: number
  ventasIncompletas: number
  ventasAConfirmar: number
  volumenUsd: number
  facturacionUsd: number
  repartoUsd: { asesor: number; julian: number; referidor: number }
  gastosPropiedadesUsd: number
  margenBrutoUsd: number
  gastosFijosUsd: number
  impuestosUsd: number
  publicidadCaptacionUsd: number
  publicidadPropiedadesUsd: number
  margenNetoUsd: number
  margenBrutoPct: number | null
  margenNetoPct: number | null
  limpioPromedioPorVentaUsd: number | null
  gastosAConfirmar: boolean
  sinImpuestos: boolean
}

export function calcularPlata(i: {
  ventas: VentaRow[]
  tasaArs?: (fecha: string) => number | null
  gastos: GastoFijo[]
  publicidadCaptacionUsd: number
  publicidadPropiedadesUsd: number
  rango: Rango
}): { plata: Plata; detalle: VentaConCalculo[] } {
  const detalle = i.ventas
    .filter(v => v.estado !== 'caida' && enRango(v.reservada_en, i.rango))
    .map(v => ({ venta: v, calc: calcularVenta(v, v.reservada_en && i.tasaArs ? i.tasaArs(v.reservada_en) : null) }))
    .sort((a, b) => (a.venta.reservada_en ?? '').localeCompare(b.venta.reservada_en ?? ''))
  const s = (f: (x: VentaConCalculo) => number | null) => detalle.reduce((acc, x) => acc + (f(x) ?? 0), 0)
  const facturacionUsd = s(x => x.calc.cobradoUsd)
  const reparto = { asesor: s(x => x.calc.asesorUsd), julian: s(x => x.calc.julianUsd), referidor: s(x => x.calc.referidorUsd) }
  const gastosPropiedadesUsd = s(x => x.venta.gastos_propiedad_usd)
  const margenBrutoUsd = facturacionUsd - reparto.asesor - reparto.julian - reparto.referidor - gastosPropiedadesUsd
  const g = gastoDelPeriodo(i.gastos, i.rango)
  const margenNetoUsd = margenBrutoUsd - g.fijos - g.impuestos - i.publicidadCaptacionUsd - i.publicidadPropiedadesUsd
  const conLimpio = detalle.filter(x => x.calc.limpioDiegoUsd != null)
  return {
    detalle,
    plata: {
      ventas: detalle.length,
      ventasIncompletas: detalle.filter(x => x.calc.faltan.length).length,
      ventasAConfirmar: detalle.filter(x => x.venta.a_confirmar).length,
      volumenUsd: s(x => x.calc.precioUsd),
      facturacionUsd,
      repartoUsd: reparto,
      gastosPropiedadesUsd,
      margenBrutoUsd,
      gastosFijosUsd: g.fijos,
      impuestosUsd: g.impuestos,
      publicidadCaptacionUsd: i.publicidadCaptacionUsd,
      publicidadPropiedadesUsd: i.publicidadPropiedadesUsd,
      margenNetoUsd,
      margenBrutoPct: facturacionUsd ? margenBrutoUsd / facturacionUsd : null,
      margenNetoPct: facturacionUsd ? margenNetoUsd / facturacionUsd : null,
      limpioPromedioPorVentaUsd: conLimpio.length ? conLimpio.reduce((a, x) => a + x.calc.margenUsd!, 0) / conLimpio.length : null,
      gastosAConfirmar: g.aConfirmar,
      sinImpuestos: g.sinImpuestos,
    },
  }
}

/** % de las captaciones que terminan vendidas. Supuesto editable (planilla: 6 de cada 11). */
export const TASA_VENTA_DEFAULT = 6 / 11

export interface Adquisicion {
  costoPorCaptacionUsd: number | null
  beneficioBrutoPorCaptacionUsd: number | null
  costoMaximoUsd: number | null
  /** Cuántas veces vuelve cada dólar de publicidad (beneficio por captación ÷ costo por captación). */
  retorno: number | null
}

export function adquisicion(i: { publicidadCaptacionUsd: number; captaciones: number; limpioPromedioPorVentaUsd: number | null; tasaVenta: number }): Adquisicion {
  const costo = i.captaciones ? i.publicidadCaptacionUsd / i.captaciones : null
  const beneficio = i.limpioPromedioPorVentaUsd == null ? null : i.limpioPromedioPorVentaUsd * i.tasaVenta
  return {
    costoPorCaptacionUsd: costo,
    beneficioBrutoPorCaptacionUsd: beneficio,
    costoMaximoUsd: beneficio == null ? null : beneficio / 3,
    retorno: costo && beneficio != null ? beneficio / costo : null,
  }
}

export interface TasasPlan {
  /** Realizadas ÷ solicitudes. */
  realizadaPorSolicitud: number
  /** USD por solicitud. */
  costoPorSolicitudUsd: number
  /** Captadas ÷ realizadas. */
  captadaPorRealizada: number
  tasaVenta: number
  limpioPorVentaUsd: number
}

export const SEMANAS_POR_MES = 52 / 12

export interface Plan {
  tasacionesSemana: number
  solicitudesSemana: number | null
  inversionSemanaUsd: number | null
  inversionMesUsd: number | null
  captacionesMes: number | null
  ventasMes: number | null
  limpioMesUsd: number | null
  /** Limpio de las ventas ÷ inversión: cuántos dólares vuelven por cada uno invertido. */
  retorno: number | null
}

export function planificar(n: number, t: TasasPlan): Plan {
  const ok = (x: number) => Number.isFinite(x) && x > 0
  const solicitudesSemana = ok(t.realizadaPorSolicitud) ? n / t.realizadaPorSolicitud : null
  const inversionSemanaUsd = solicitudesSemana != null && ok(t.costoPorSolicitudUsd) ? solicitudesSemana * t.costoPorSolicitudUsd : null
  const inversionMesUsd = inversionSemanaUsd == null ? null : inversionSemanaUsd * SEMANAS_POR_MES
  const captacionesMes = n * SEMANAS_POR_MES * (t.captadaPorRealizada || 0)
  const ventasMes = captacionesMes * (t.tasaVenta || 0)
  const limpioMesUsd = ventasMes * (t.limpioPorVentaUsd || 0)
  return {
    tasacionesSemana: n,
    solicitudesSemana,
    inversionSemanaUsd,
    inversionMesUsd,
    captacionesMes,
    ventasMes,
    limpioMesUsd,
    retorno: inversionMesUsd ? limpioMesUsd / inversionMesUsd : null,
  }
}
