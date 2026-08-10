/**
 * Cuándo el hilo baja solo y cuándo NO — y cuántos mensajes se perdió el
 * asesor mientras leía para arriba.
 *
 * POR QUÉ hace falta una regla: el hilo se refresca cada 15 segundos. Hasta
 * ahora, cada vez que entraba un mensaje el hilo saltaba al final. Si el asesor
 * estaba releyendo lo que el cliente había dicho tres días atrás —que es
 * exactamente lo que uno hace antes de contestar algo importante—, el chat se
 * lo arrancaba de las manos sin aviso.
 *
 * La regla nueva: baja solo cuando el asesor YA estaba mirando el final. Si no,
 * el mensaje nuevo no le mueve la pantalla y aparece un botón que dice cuántos
 * hay. Puro cálculo, sin DOM, para poder probarlo.
 */

/**
 * Cuántos píxeles de distancia al fondo siguen contando como "está mirando el
 * final". No es cero: nadie deja el hilo clavado al píxel exacto, y con cero el
 * hilo dejaría de bajar solo apenas el dedo lo roza.
 */
export const MARGEN_CERCA_DEL_FINAL_PX = 120

export interface MedidasDelScroller {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

/** ¿El asesor está mirando el final del hilo? */
export function estaCercaDelFinal(
  { scrollTop, scrollHeight, clientHeight }: MedidasDelScroller,
  margen: number = MARGEN_CERCA_DEL_FINAL_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= margen
}

/**
 * El contador de mensajes nuevos sin ver, mientras el asesor lee para arriba.
 *
 * Solo ACUMULA. Ponerlo en cero es otra cosa y pasa en otro momento —cuando el
 * scroll vuelve al final, en el manejador de `scroll`— y por eso no está acá:
 * si esta función también supiera "volver a cero", habría dos lugares capaces
 * de borrar el contador y el día que uno cambie el otro quedaría mintiendo.
 *
 * `llegaron <= 0` es el caso de todos los días: el hilo se re-consulta cada 15
 * segundos y la enorme mayoría de las veces no trajo nada nuevo.
 */
export function nuevosSinVer(acumulado: number, llegaron: number): number {
  if (llegaron <= 0) return acumulado
  return acumulado + llegaron
}

/**
 * ¿El hilo tiene que bajar solo?
 *
 * `primeraPintura` es la vez que se abre la conversación: ahí SIEMPRE baja, sin
 * importar nada, porque un chat que abre mostrando el mensaje más viejo se lee
 * como "no hay nada nuevo" (ese fue un defecto real de esta pantalla).
 */
export function debeBajarSolo(primeraPintura: boolean, cercaDelFinal: boolean): boolean {
  return primeraPintura || cercaDelFinal
}
