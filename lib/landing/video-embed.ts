/**
 * URL de video externo → URL de embed reproducible en <iframe>.
 *
 * Compartido entre `HeroLuxury.tsx` (landing pública) y `app/v/[token]/page.tsx`
 * (recorrido por token) — ambos reciben una URL de video que puede venir de
 * YouTube, Vimeo, o directo de Storage (en ese caso NO hay embed: se sirve como
 * <video> nativo). Extraído de `HeroLuxury.tsx` (2026-07-28) para no duplicar la
 * lógica de parseo.
 *
 * Soporta: youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/embed/<id>,
 * youtube.com/shorts/<id>, vimeo.com/<id numérico>.
 */
export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]
      if (id) return `https://www.youtube.com/embed/${id}`
    }
    if (host.endsWith('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube.com/embed/${v}`
      const m = u.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/)
      if (m) return `https://www.youtube.com/embed/${m[1]}`
    }
    if (host.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
    }
  } catch {
    /* url inválida */
  }
  return null
}
