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

/**
 * ¿Esta dirección es la landing abierta DENTRO del visor del mapa de calor?
 *
 * Versión pura (sin `window`) para el SERVIDOR: `POST /api/funnel/submit` la usa para
 * rechazar envíos que vengan del visor. El formulario ya se frena solo en el navegador
 * (`FunnelLeadForm`), pero un navegador con el código viejo en caché, o alguien
 * pegándole a la ruta a mano, crearían un lead real con su aviso al equipo y su
 * conversión a Meta.
 *
 * Se parsea la URL en vez de buscar el texto: `?utm_content=hm_preview=1` o
 * `?xhm_preview=1` no son el visor. Ante cualquier duda responde `false`: es
 * preferible dejar pasar un envío del visor que rechazarle el formulario a un
 * cliente de verdad que llegó por un anuncio.
 */
export function esVistaPreviaDelMapa(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !url.trim()) return false
  try {
    // La base solo sirve para direcciones relativas ("/tasacion-directa?…").
    return new URL(url.trim(), 'https://base.invalid').searchParams.get('hm_preview') === '1'
  } catch {
    return false
  }
}
