/**
 * Cuándo aparece "Qué pasa ahora" en la página del video (pedido del dueño: a los 30 segundos
 * de video reproducido). Puro.
 */

export const UMBRAL_SEGUNDOS = 30

/** Más de esto entre dos avisos del reproductor es un salto, no reproducción. Los navegadores
 *  avisan `timeupdate` cada 0,25 s aprox., y alguno se atrasa hasta ~1 s con el celular cargado. */
const SALTO_MAXIMO_S = 1.5

/** Suma lo de esta visita y lo visto antes: 20 s ayer + 10 s hoy ya son 30. */
export function mostrarQuePasaAhora(e: { segundosEnEstaVisita: number; segundosPrevios: number }): boolean {
  return e.segundosEnEstaVisita + e.segundosPrevios >= UMBRAL_SEGUNDOS
}

/** Segundos de reproducción real entre dos posiciones del video: adelantar o volver no suman. */
export function segundosDelAvance(anterior: number, actual: number): number {
  const delta = actual - anterior
  return delta > 0 && delta <= SALTO_MAXIMO_S ? delta : 0
}
