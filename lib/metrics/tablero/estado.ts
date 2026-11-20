/**
 * Etiqueta de estado de cada franja del Tablero. Módulo puro.
 *
 * REGLA (una sola, igual para las cinco franjas): se toma el NÚMERO PRINCIPAL de
 * la franja y se lo compara con el mismo número del período de comparación.
 *  - Sin dato de alguno de los dos lados → "Sin datos".
 *  - Diferencia menor al 10 % (o los dos en cero) → "Igual".
 *  - Si no, "Mejoró" o "Empeoró" según para qué lado es bueno ese número
 *    (registros: subir es bueno; costo por registro: bajar es bueno).
 *  - Antes en cero y ahora no: el cambio cuenta entero (0 → 3 agendadas = Mejoró).
 *
 * Número principal de cada franja (lo usa `servidor.ts`):
 *  - Anuncios: costo por registro de tasación (bajar es bueno).
 *  - Comercial: tasaciones agendadas (subir es bueno).
 *  - Página y video: conversión de la versión publicada (subir es bueno).
 *  - Propiedades: propiedades captadas (subir es bueno).
 *  - Plata: margen neto (subir es bueno).
 */

export type Estado = 'mejoro' | 'igual' | 'empeoro' | 'sin_datos'

export const UMBRAL_IGUAL = 0.1

export function estadoFranja(actual: number | null | undefined, antes: number | null | undefined, bueno: 'sube' | 'baja'): Estado {
  if (actual == null || antes == null || !Number.isFinite(actual) || !Number.isFinite(antes)) return 'sin_datos'
  if (actual === antes) return 'igual'
  const base = Math.abs(antes)
  const cambio = base === 0 ? Math.sign(actual - antes) : (actual - antes) / base
  if (Math.abs(cambio) < UMBRAL_IGUAL) return 'igual'
  const subio = cambio > 0
  return subio === (bueno === 'sube') ? 'mejoro' : 'empeoro'
}

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  mejoro: 'Mejoró',
  igual: 'Igual',
  empeoro: 'Empeoró',
  sin_datos: 'Sin datos',
}
