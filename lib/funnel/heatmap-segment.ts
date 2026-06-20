/**
 * Marca al visitante como 'registrado' para el mapa de calor (Clarity), tras un
 * submit exitoso. Persiste con sessionStorage (sesión) + cookie liviana `df_reg=1`
 * (boolean, SIN PII, 2 años) para que el segmento sobreviva entre visitas, y
 * actualiza el tag de Clarity si ya cargó. Client-only, best-effort.
 */
export function markRegisteredForHeatmap(contactId?: string | null): void {
  if (typeof window === 'undefined') return
  try {
    if (contactId) sessionStorage.setItem('registered_contact_id', contactId)
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `df_reg=1; Max-Age=${60 * 60 * 24 * 365 * 2}; Path=/; SameSite=Lax${secure}`
    window.clarity?.('set', 'segment', 'registrado')
  } catch {
    /* best-effort */
  }
}
