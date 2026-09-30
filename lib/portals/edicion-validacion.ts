/**
 * Validación de lo que la persona manda al editar un aviso YA publicado.
 * Puro: sin red ni base. Separado de `edicion-comun.ts` (que calcula QUÉ
 * cambió) porque acá se valida el INPUT crudo del POST antes de tocar nada.
 */
import { z } from 'zod'
import type { CambiosDeValores, Valor } from './edicion-comun'

const valor = z.object({ value_name: z.string().max(500).optional(), value_id: z.string().max(100).optional() }).strict()

export const esquemaCambios = (tituloMax: number) => z.object({
  cambios: z.object({
    titulo: z.string().trim().min(1).max(tituloMax).optional(),
    descripcion: z.string().max(5000).optional(),
    valores: z.record(z.string().regex(/^[A-Z0-9_]{1,60}$/), valor.nullable()),
  }).strict(),
})

/** Mensaje de error o `null` si todos los ids son válidos para esta categoría/portal. */
export function validarIds(valores: CambiosDeValores, aceptados: ReadonlySet<string>, permiteVaciar: boolean): string | null {
  for (const [id, v] of Object.entries(valores)) {
    if (!aceptados.has(id)) return `El dato "${id}" no existe para esta categoría del portal.`
    if (v === null && !permiteVaciar) return `Este portal no deja vaciar un dato ya cargado ("${id}"); cambialo por otro valor.`
  }
  return null
}

/** Las expensas en pesos, como número; "600.000 ARS" → 600000. `undefined` = no tocar la ficha. */
export function expensasDesdeCambio(v: Valor | null | undefined): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  const n = Number((v.value_name ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}
