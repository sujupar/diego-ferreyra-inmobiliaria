/**
 * Cuándo una sección de la landing cuenta como "vista" para el mapa de calor.
 * Módulo puro: `FunnelHeatmapTracker` le pasa lo que mide el navegador.
 *
 * La regla tiene DOS caminos, y el segundo no es un adorno:
 *  1. Se ve al menos la MITAD de la sección  → vale para secciones normales.
 *  2. Lo que se ve ocupa al menos MEDIA PANTALLA → vale para secciones altas.
 *
 * Con solo la regla 1 (como estaba hasta el 2026-09-19), una sección más alta que
 * dos pantallas nunca contaba: es imposible ver su mitad de una vez. En celular
 * "Testimonios" marcaba 0% de llegada con gente haciéndole clic adentro, y el
 * embudo de secciones mostraba caídas en rojo que eran un artefacto de la altura,
 * no de la gente. Las sesiones anteriores a esa fecha quedaron medidas con la regla
 * vieja: en un rango que la cruce, las secciones largas salen subestimadas.
 */

/**
 * Umbrales del IntersectionObserver. Cada 5%: con `[0, 0.5, 1]` el navegador solo
 * avisa al cruzar esos tres puntos, y una sección alta llega a "media pantalla"
 * en un punto intermedio en el que nadie preguntaba.
 */
export const UMBRALES_DE_VISTA: readonly number[] = Array.from({ length: 21 }, (_, i) => Math.round(i * 5) / 100)

export function seccionEnVista(m: {
  /** Fracción de la sección que se ve (0–1). `entry.intersectionRatio`. */
  ratio: number
  /** Alto en px de la parte visible. `entry.intersectionRect.height`. */
  altoVisible: number
  /** Alto en px de la pantalla. `entry.rootBounds?.height ?? window.innerHeight`. */
  altoPantalla: number
}): boolean {
  if (Number.isFinite(m.ratio) && m.ratio >= 0.5) return true
  if (!Number.isFinite(m.altoVisible) || !Number.isFinite(m.altoPantalla) || m.altoPantalla <= 0) return false
  return m.altoVisible >= m.altoPantalla * 0.5
}
