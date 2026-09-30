import type { CambiosDeValores, Valor, Valores } from '@/lib/portals/edicion-comun'
import type { CampoAtributo } from './AttrField'

function legible(campo: CampoAtributo | undefined, v: Valor | null | undefined): string {
  if (!v || (!v.value_id && !v.value_name)) return 'vacío'
  if (v.value_id && campo?.allowedValues) return campo.allowedValues.find(a => a.id === v.value_id)?.name ?? v.value_id
  return v.value_name ?? v.value_id ?? 'vacío'
}

export function resumenDeCambios(cambios: CambiosDeValores, campos: readonly CampoAtributo[], antes: Valores): string[] {
  const porId = new Map(campos.map(c => [c.id, c]))
  return Object.entries(cambios).map(([id, v]) => `${porId.get(id)?.name ?? id}: ${legible(porId.get(id), antes[id])} → ${legible(porId.get(id), v)}`)
}

/**
 * `property_listings.metadata.actualizacion_fallida` viaja como `Record<string, unknown> | null`
 * (columna Json sin schema) — este guard evita el `as` al leerlo en el panel de gestión.
 */
export function esFalloActualizacion(x: unknown): x is { motivo: string } {
  return typeof x === 'object' && x !== null && typeof (x as { motivo?: unknown }).motivo === 'string'
}
