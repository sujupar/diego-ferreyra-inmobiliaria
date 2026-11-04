/**
 * Cuánto deja cada venta y a quién.
 *
 * Regla del dueño (2026-11-04), la misma con la que Diego anotó sus ventas:
 * TODAS las partes salen del mismo honorario cobrado (lo que quedó para
 * nosotros, ya descontada la otra inmobiliaria si la hubo), y cada una aplica
 * solo si corresponde:
 *   - asesor: 20% si mostró/vendió, 50% si captó él
 *   - Julián: 20% si el dueño llegó por embudo
 *   - referidor (ej. la abogada): 20% si hubo
 * Lo limpio de Diego es el resto. Se calcula siempre: nunca se tipea.
 *
 * Comprobación: Tupac Amaru 110.000 × 4% = 4.400 → −20% −20% = 2.640.
 */

export type OrigenDueno = 'referido' | 'embudo' | 'clase' | 'portal' | 'redes' | 'otro'
export type EstadoVenta = 'reservada' | 'vendida' | 'caida'

export interface VentaRow {
  id?: string
  property_id?: string | null
  direccion: string
  estado: EstadoVenta
  captada_en: string | null
  reservada_en: string | null
  escriturada_en: string | null
  precio: number | null
  moneda: 'USD' | 'ARS'
  pct_vendedor: number | null
  pct_comprador: number | null
  otra_inmobiliaria_usd: number
  honorario_cobrado_usd: number | null
  capto: string | null
  vendio: string | null
  asesor_pct: number
  julian_pct: number
  referidor_nombre: string | null
  referidor_pct: number
  gastos_propiedad_usd: number
  origen_dueno: OrigenDueno | null
  a_confirmar: boolean
  notas: string | null
}

export const ASESOR_PCT_MUESTRA = 20
export const ASESOR_PCT_CAPTA = 50
export const JULIAN_PCT_EMBUDO = 20
export const REFERIDOR_PCT = 20

/** Los % sugeridos para una venta nueva según quién captó, quién vendió y el origen. */
export function partesSugeridas(i: { capto: string | null; vendio: string | null; origen: OrigenDueno | null; hayReferidor: boolean }) {
  const esDiego = (s: string | null) => !s || /diego/i.test(s)
  const asesor = !esDiego(i.capto) ? ASESOR_PCT_CAPTA : !esDiego(i.vendio) ? ASESOR_PCT_MUESTRA : 0
  return {
    asesor_pct: asesor,
    julian_pct: i.origen === 'embudo' ? JULIAN_PCT_EMBUDO : 0,
    referidor_pct: i.hayReferidor ? REFERIDOR_PCT : 0,
  }
}

export interface VentaCalculada {
  /** precio × % (vendedor + comprador), en USD. null si falta precio o %. */
  honorarioBrutoUsd: number | null
  /** Lo que quedó para nosotros: el real si se cargó, si no el bruto − otra inmobiliaria. */
  cobradoUsd: number | null
  asesorUsd: number
  julianUsd: number
  referidorUsd: number
  limpioDiegoUsd: number | null
  /** Limpio de Diego menos los gastos de esa propiedad. */
  margenUsd: number | null
  /** Qué datos faltan para que la venta cuente completa. */
  faltan: string[]
  /** Precio en USD. */
  precioUsd: number | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** `tasaArs` = ARS por USD del día de la reserva (solo si la venta es en pesos). */
export function calcularVenta(v: VentaRow, tasaArs?: number | null): VentaCalculada {
  const faltan: string[] = []
  const precioUsd = v.precio == null ? null : v.moneda === 'ARS' ? (tasaArs ? v.precio / tasaArs : null) : v.precio
  const pct = (v.pct_vendedor ?? 0) + (v.pct_comprador ?? 0)
  const tienePct = v.pct_vendedor != null || v.pct_comprador != null
  const honorarioBrutoUsd = precioUsd != null && tienePct ? r2(precioUsd * pct / 100) : null
  const cobradoUsd = v.honorario_cobrado_usd ?? (honorarioBrutoUsd == null ? null : r2(Math.max(0, honorarioBrutoUsd - v.otra_inmobiliaria_usd)))

  if (v.precio == null) faltan.push('precio')
  if (!v.reservada_en) faltan.push('fecha de reserva')
  if (cobradoUsd == null) faltan.push('honorario (% o monto cobrado)')
  if (!v.origen_dueno) faltan.push('cómo llegó el dueño')
  if (!v.capto) faltan.push('quién captó')
  if (v.estado === 'vendida' && v.honorario_cobrado_usd == null) faltan.push('honorario cobrado real')

  const parte = (p: number) => (cobradoUsd == null ? 0 : r2(cobradoUsd * p / 100))
  const asesorUsd = parte(v.asesor_pct), julianUsd = parte(v.julian_pct), referidorUsd = parte(v.referidor_pct)
  const limpioDiegoUsd = cobradoUsd == null ? null : r2(cobradoUsd - asesorUsd - julianUsd - referidorUsd)
  return {
    honorarioBrutoUsd, cobradoUsd, asesorUsd, julianUsd, referidorUsd, limpioDiegoUsd,
    margenUsd: limpioDiegoUsd == null ? null : r2(limpioDiegoUsd - v.gastos_propiedad_usd),
    faltan, precioUsd,
  }
}

/** Validación de lo que llega por la API (los CHECK de la base repiten lo esencial). */
export function validarVenta(v: Partial<VentaRow>): string | null {
  if (!v.direccion?.trim()) return 'Falta la dirección.'
  const num = (x: unknown) => x == null || (typeof x === 'number' && Number.isFinite(x))
  for (const k of ['precio', 'pct_vendedor', 'pct_comprador', 'otra_inmobiliaria_usd', 'honorario_cobrado_usd', 'asesor_pct', 'julian_pct', 'referidor_pct', 'gastos_propiedad_usd'] as const) {
    if (!num(v[k])) return `El campo ${k} tiene que ser un número.`
    if (typeof v[k] === 'number' && (v[k] as number) < 0) return 'Los montos y porcentajes no pueden ser negativos.'
  }
  if ((v.precio ?? 1) <= 0) return 'El precio tiene que ser mayor a cero.'
  if ((v.pct_vendedor ?? 0) > 20 || (v.pct_comprador ?? 0) > 20) return 'Un % de honorario mayor a 20 parece un error de carga.'
  if ((v.asesor_pct ?? 0) + (v.julian_pct ?? 0) + (v.referidor_pct ?? 0) > 100) return 'Las partes del reparto suman más de 100%.'
  const fecha = /^\d{4}-\d{2}-\d{2}$/
  for (const k of ['captada_en', 'reservada_en', 'escriturada_en'] as const) {
    if (v[k] != null && !fecha.test(v[k] as string)) return `La fecha ${k} no es válida.`
  }
  if (v.estado && !['reservada', 'vendida', 'caida'].includes(v.estado)) return 'Estado inválido.'
  if (v.moneda && !['USD', 'ARS'].includes(v.moneda)) return 'Moneda inválida.'
  if (v.origen_dueno != null && !['referido', 'embudo', 'clase', 'portal', 'redes', 'otro'].includes(v.origen_dueno)) return 'Origen inválido.'
  return null
}

export const CAMPOS_VENTA = [
  'property_id', 'direccion', 'estado', 'captada_en', 'reservada_en', 'escriturada_en', 'precio', 'moneda',
  'pct_vendedor', 'pct_comprador', 'otra_inmobiliaria_usd', 'honorario_cobrado_usd', 'capto', 'vendio',
  'asesor_pct', 'julian_pct', 'referidor_nombre', 'referidor_pct', 'gastos_propiedad_usd', 'origen_dueno',
  'a_confirmar', 'notas',
] as const

/** Solo los campos conocidos (lo demás que llegue en el body se ignora). */
export function limpiarVenta(body: Record<string, unknown>): Partial<VentaRow> {
  const out: Record<string, unknown> = {}
  for (const k of CAMPOS_VENTA) if (k in body) out[k] = body[k] === '' ? null : body[k]
  return out as Partial<VentaRow>
}
