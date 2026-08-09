/**
 * Un "día" del filtro de fechas es un día de BUENOS AIRES, no un día UTC.
 *
 * Las pantallas de listado mandan el rango como `YYYY-MM-DD` — una fecha de
 * calendario, sin hora, que es lo correcto para un filtro que también viaja en
 * la barra de direcciones y se comparte por link. Quien tiene que decidir QUÉ
 * INSTANTE empieza y termina ese día es el SERVIDOR, por dos razones:
 *
 *  1. La misma URL tiene que devolver los mismos datos para todo el mundo. Si
 *     la conversión la hiciera el navegador, `?from=2026-08-05` mostraría un
 *     conjunto distinto según el reloj de cada máquina — y el link que un
 *     coordinador le pasa a un asesor dejaría de significar lo mismo.
 *  2. Los mismos filtros los usan procesos sin navegador (crons, scripts). Un
 *     criterio que vive en el cliente no existe para ellos.
 *
 * La zona es la del NEGOCIO, no la del usuario: Argentina, UTC−3 fijo (no tiene
 * horario de verano desde 2009). Es la misma convención que ya usan
 * `lib/leads/visit-scheduling.ts`, `app/api/v/[token]/schedule/route.ts` y
 * `lib/market-data/period.ts`.
 *
 * ANTES de esto, las cuatro fuentes de listado hacían `from + 'T00:00:00Z'` /
 * `to + 'T23:59:59Z'`: pedir "5 de agosto" traía desde las 21:00 del 4 hasta
 * las 20:59 del 5, hora argentina. O sea, mostraba la noche del día anterior y
 * perdía las últimas tres horas del día pedido.
 */

/** Argentina: UTC−3 fijo, sin horario de verano. */
export const DESFASE_ARGENTINA = '-03:00'

/** Solo una fecha de calendario: `YYYY-MM-DD`, sin hora ni zona. */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * ¿El valor es una fecha de calendario pelada (la que mandan las pantallas) o
 * ya es un instante completo (lo que manda, por ejemplo, el tablero de inicio
 * vía `/api/visits`)?
 */
export function esFechaDeCalendario(valor: string): boolean {
  return SOLO_FECHA.test(valor)
}

/**
 * Comienzo del día argentino: `2026-08-05` → `2026-08-05T00:00:00.000-03:00`
 * (= `2026-08-05T03:00:00Z`).
 *
 * Un valor que YA es un instante (trae hora y/o zona) se devuelve TAL CUAL: hay
 * llamadores que resuelven el rango por su cuenta y aplicarles la conversión
 * los rompería. Se manejan los dos formatos a propósito, no por descuido.
 */
export function inicioDelDiaArgentina(valor: string): string {
  if (!esFechaDeCalendario(valor)) return valor
  return `${valor}T00:00:00.000${DESFASE_ARGENTINA}`
}

/**
 * Fin del día argentino, para usar con un operador INCLUSIVO (`lte`):
 * `2026-08-05` → `2026-08-05T23:59:59.999999-03:00` (= `2026-08-06T02:59:59.999999Z`).
 *
 * Los microsegundos NO son adorno: `created_at` es `timestamptz`, que en
 * Postgres tiene precisión de microsegundo. `23:59:59.999` dejaría afuera una
 * fila escrita en el último milisegundo del día. Con `.999999` el borde
 * inclusivo es exactamente equivalente a "< medianoche del día siguiente", sin
 * tener que cambiar el operador de las consultas que ya existen.
 *
 * Igual que arriba, un instante completo pasa sin tocar.
 */
export function finDelDiaArgentina(valor: string): string {
  if (!esFechaDeCalendario(valor)) return valor
  return `${valor}T23:59:59.999999${DESFASE_ARGENTINA}`
}
