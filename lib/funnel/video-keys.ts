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
  /**
   * El video ya no está en ninguna landing, pero sus datos siguen en la base con
   * esta clave: se conserva para que Embudos los muestre con nombre y no como
   * texto crudo. Ninguna landing puede volver a usarla (lo vigila la prueba).
   */
  retirada?: boolean
}

export const VIDEO_KEYS = {
  'hero-tasacion': { label: 'Video de la Versión A (actual)', orden: 10 },
  // El 2026-11-06 la B cambió el VSL largo (11:51) por uno corto (7:30). Son dos
  // videos distintos: con la misma clave, la retención por % de los dos se
  // mezclaría en un solo bloque (el mismo error que separó A y B el 19/9).
  'hero-tasacion-neta-corto': { label: 'Video de la Versión B — VSL corto (desde el 6/11/2026)', orden: 18 },
  'hero-tasacion-neta': { label: 'Video de la Versión B — VSL largo (hasta el 6/11/2026)', orden: 20, retirada: true },
  'hero-clase': { label: 'Video del hero', orden: 30 },
  'clase-completa': { label: 'Clase completa (página de gracias)', orden: 40 },
} as const satisfies Record<string, VideoKeyDef>

/** Claves que alguna landing usa HOY (las retiradas quedan solo para nombrar datos viejos). */
export function clavesVigentes(): string[] {
  return Object.entries(VIDEO_KEYS as Record<string, VideoKeyDef>)
    .filter(([, d]) => !d.retirada)
    .map(([k]) => k)
}

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
