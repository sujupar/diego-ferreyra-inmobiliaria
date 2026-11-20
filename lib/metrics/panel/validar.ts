/** Validación de gastos fijos e hitos que llegan por la API. */
import type { GastoFijo } from './economia'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export function validarGasto(b: Record<string, unknown>): { gasto: GastoFijo & { notas: string | null } } | { error: string } {
  const concepto = typeof b.concepto === 'string' ? b.concepto.trim() : ''
  if (!concepto) return { error: 'Falta el concepto.' }
  const monto = Number(b.monto_usd)
  if (!Number.isFinite(monto) || monto < 0) return { error: 'El monto tiene que ser un número mayor o igual a cero.' }
  if (typeof b.desde !== 'string' || !FECHA.test(b.desde)) return { error: 'Falta la fecha desde la que rige.' }
  const hasta = b.hasta == null || b.hasta === '' ? null : String(b.hasta)
  if (hasta && (!FECHA.test(hasta) || hasta < b.desde)) return { error: 'La fecha "hasta" no es válida.' }
  const tipo = b.tipo === 'impuesto' ? 'impuesto' : 'fijo'
  return { gasto: { concepto, tipo, monto_usd: monto, desde: b.desde, hasta, a_confirmar: !!b.a_confirmar, notas: typeof b.notas === 'string' && b.notas.trim() ? b.notas.trim() : null } }
}

export interface HitoValido {
  fecha: string
  embudo: 'tasacion' | 'clase' | null
  titulo: string
  detalle: string | null
}

/** Campos del ajuste de campaña (columnas de la migración 20261120000001). Solo los que vinieron. */
export interface AjusteValido {
  resultado_buscado?: string | null
  meta_costo_registro_ars?: number | null
  fecha_decision?: string | null
}

export function validarHito(b: Record<string, unknown>): { hito: HitoValido; ajuste: AjusteValido } | { error: string } {
  if (typeof b.fecha !== 'string' || !FECHA.test(b.fecha)) return { error: 'Falta la fecha.' }
  const titulo = typeof b.titulo === 'string' ? b.titulo.trim() : ''
  if (!titulo) return { error: 'Falta qué cambió.' }
  const embudo = b.embudo === 'tasacion' || b.embudo === 'clase' ? b.embudo : null
  const ajuste: AjusteValido = {}
  if (typeof b.resultado_buscado === 'string' && b.resultado_buscado.trim()) ajuste.resultado_buscado = b.resultado_buscado.trim().slice(0, 300)
  if (b.meta_costo_registro_ars != null && b.meta_costo_registro_ars !== '') {
    const m = Number(b.meta_costo_registro_ars)
    if (!Number.isFinite(m) || m <= 0) return { error: 'La meta de costo por registro tiene que ser un número mayor a cero.' }
    ajuste.meta_costo_registro_ars = m
  }
  if (b.fecha_decision != null && b.fecha_decision !== '') {
    if (typeof b.fecha_decision !== 'string' || !FECHA.test(b.fecha_decision) || b.fecha_decision < b.fecha) return { error: 'La fecha de decisión no es válida.' }
    ajuste.fecha_decision = b.fecha_decision
  }
  return { hito: { fecha: b.fecha, embudo, titulo: titulo.slice(0, 120), detalle: typeof b.detalle === 'string' && b.detalle.trim() ? b.detalle.trim().slice(0, 500) : null }, ajuste }
}
