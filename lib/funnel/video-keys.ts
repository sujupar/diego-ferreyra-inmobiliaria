/**
 * Catálogo de las CLAVES con las que cada landing registra las estadísticas de su
 * video (`<FunnelClickToPlayVideo trackKey="…">`). Módulo puro.
 *
 * POR QUÉ EXISTE: las estadísticas se guardan una fila por (persona, clave) en
 * `video_view_state`, y Embudos arma UN bloque por clave. Del 15 al 19/9/2026 las
 * landings A y B de tasación usaron la MISMA clave (`hero-tasacion`) para dos videos
 * distintos —196 s el de la A, 711 s el de la B—: la B se había armado copiando la A.
 * Embudos mostraba un solo "Video del hero" con la retención de los dos mezclada, que
 * es justo el dato que más sirve para comparar las dos versiones del test.
 *
 * `video-keys.test.ts` recorre `app/(funnels)` y exige que ninguna clave se repita
 * entre dos landings y que toda clave usada esté acá. Al sumar un video nuevo esa
 * prueba se pone roja: se arregla agregando la clave acá, no aflojando la prueba.
 *
 * La clave es el valor de la columna `video_key` en la base: no se renombra sin
 * migrar los datos ya guardados.
 */

export interface VideoKeyDef {
  /** Nombre que ve el dueño en Embudos. */
  label: string
  /** Posición del bloque en pantalla: la Versión A antes que la B. */
  orden: number
}

export const VIDEO_KEYS = {
  'hero-tasacion': { label: 'Video de la Versión A (actual)', orden: 10 },
  'hero-tasacion-neta': { label: 'Video de la Versión B (Tasación Neta)', orden: 20 },
  'hero-clase': { label: 'Video del hero', orden: 30 },
  'clase-completa': { label: 'Clase completa (página de gracias)', orden: 40 },
} as const satisfies Record<string, VideoKeyDef>

/** Propiedad PROPIA (no `in`, no `Object.hasOwn`): la clave viene de la base y esto corre en el navegador. */
const tiene = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key)

const def = (clave: string): VideoKeyDef | null =>
  tiene(VIDEO_KEYS, clave) ? VIDEO_KEYS[clave as keyof typeof VIDEO_KEYS] : null

/** Nombre en castellano de un video; si no lo conoce, devuelve la clave tal cual. */
export function videoLabel(clave: string): string {
  return def(clave)?.label ?? clave
}

/** Ordena las claves como van en pantalla. Las desconocidas quedan al final, en su orden de llegada. */
export function ordenarClavesDeVideo(claves: readonly string[]): string[] {
  return claves
    .map((clave, i) => ({ clave, i, orden: def(clave)?.orden ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.orden - b.orden || a.i - b.i)
    .map((x) => x.clave)
}
