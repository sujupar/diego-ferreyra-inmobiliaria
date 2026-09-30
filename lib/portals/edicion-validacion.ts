/**
 * Validación de lo que la persona manda al editar un aviso YA publicado.
 * Puro: sin red ni base. Separado de `edicion-comun.ts` (que calcula QUÉ
 * cambió) porque acá se valida el INPUT crudo del POST antes de tocar nada.
 */
import { z } from 'zod'
import { numeroArgentino, type CambiosDeValores, type Valor } from './edicion-comun'

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

/**
 * Las expensas en pesos, como número entero. `undefined` = no tocar la ficha
 * (nada que interpretar: sin cambio, o el dato llegó solo por `value_id` o no
 * se pudo leer como número). `null` = la persona vació el dato explícitamente
 * (v===null, `value_name` vacío -- forma de `ML_VALOR_VACIO` -- o "0", que acá
 * también significa "sin expensas"). Usa el mismo parser argentino que
 * Argenprop ("600.000" → 600000, no 600; "600.000,50" → 600001, redondeado a
 * pesos enteros) para no repetir el bug de perder 3 ceros por leer el punto
 * de miles como decimal.
 */
export function expensasDesdeCambio(v: Valor | null | undefined): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  if (v.value_name === undefined) return undefined // solo value_id: no hay texto que interpretar
  const texto = v.value_name.trim()
  if (texto === '') return null
  const n = numeroArgentino(texto)
  if (!Number.isFinite(n)) return undefined
  return n <= 0 ? null : Math.round(n)
}
