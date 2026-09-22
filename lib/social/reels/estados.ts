/**
 * En qué estado está un reel y qué se puede hacer desde ahí.
 *
 * El catálogo `ESTADOS_REEL` y el CHECK de `property_reels.estado` en la
 * migración `20260922000001` son LA MISMA LISTA y se tocan juntos. Si acá
 * aparece un estado nuevo y allá no, Postgres rechaza la escritura con un 23514
 * que nadie está esperando — es la trampa que ya documentó el repo con
 * `commercial_status`.
 */

export const ESTADOS_REEL = [
  'borrador',
  'programado',
  'procesando',
  'publicado',
  'fallido',
] as const

export type EstadoReel = (typeof ESTADOS_REEL)[number]

const ETIQUETAS: Record<EstadoReel, string> = {
  borrador: 'Sin publicar',
  programado: 'Programado',
  procesando: 'Instagram lo está procesando',
  publicado: 'Publicado',
  fallido: 'Falló',
}

/**
 * Etiqueta en castellano. Nunca devuelve el valor crudo de la base.
 *
 * El respaldo existe porque este valor llega de la base: si alguien agrega un
 * estado y se olvida de esta lista, la ficha tiene que seguir cargando igual.
 */
export function etiquetaEstado(estado: EstadoReel): string {
  return ETIQUETAS[estado] ?? 'Estado desconocido'
}

/**
 * Solo desde `borrador` o `fallido`.
 *
 * `procesando` queda afuera a propósito: el contenedor ya existe del lado de
 * Instagram y pedirlo otra vez crearía un SEGUNDO contenedor, o sea dos reels
 * iguales publicados en la cuenta.
 */
export function puedePedirPublicacion(estado: EstadoReel): boolean {
  return estado === 'borrador' || estado === 'fallido'
}

/**
 * Solo lo `programado`, que todavía vive únicamente de nuestro lado.
 *
 * Una vez que el cron creó el contenedor (`procesando`), Instagram ya tiene el
 * video: ofrecer "cancelar" ahí sería prometer algo que no podemos cumplir.
 */
export function puedeCancelar(estado: EstadoReel): boolean {
  return estado === 'programado'
}

/** Solo lo `fallido`. Lo demás o está en curso o ya salió. */
export function puedeReintentar(estado: EstadoReel): boolean {
  return estado === 'fallido'
}
