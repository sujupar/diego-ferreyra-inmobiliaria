/**
 * Curva de la barra de retención de las VSL. Lógica PURA (sin DOM).
 *
 * El problema que resuelve: en un video de doce minutos, una barra lineal casi
 * no se mueve en el primer minuto. El espectador la mira, concluye que le falta
 * una eternidad y se va. Esta curva avanza rápido al principio y se va frenando,
 * así el arranque se siente con envión.
 *
 * NO miente sobre el final: `f(1) = 1`, o sea que la barra llega al tope
 * exactamente cuando termina el video, nunca antes. Tampoco retrocede: es
 * monótona creciente.
 *
 * Solo afecta lo que se DIBUJA. La medición de retención (`video-progress.ts`)
 * sigue usando el progreso real del `<video>`, sin tocar — si las dos cosas se
 * mezclaran, las métricas del panel de Embudos quedarían deformadas.
 */

/** Exponente de la curva. <1 = rápida al principio. Con 0.55: 10%→29%, 50%→68%, 90%→94%. */
export const VSL_BAR_EXP = 0.55

/**
 * Fracción a DIBUJAR (0..1) para un progreso real (0..1).
 * Tolera basura (NaN, negativos, >1) porque `currentTime/duration` puede dar
 * cualquier cosa mientras el video todavía no cargó la metadata.
 */
export function vslBarFraction(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0) return 0
  if (progress >= 1) return 1
  return Math.pow(progress, VSL_BAR_EXP)
}
