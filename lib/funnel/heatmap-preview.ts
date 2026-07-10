/**
 * Modo PREVIEW del mapa de calor: cuando la landing se abre con ?hm_preview=1
 * (embebida en el visor del panel Embudos), TODO el tracking se apaga —
 * visitas, heatmap, video y Meta Pixel — para que mirar el mapa de calor no
 * ensucie las métricas ni dispare conversiones.
 */
export function isHeatmapPreview(): boolean {
  if (typeof window === 'undefined') return false
  return /[?&]hm_preview=1/.test(window.location.search)
}
