const BUCKET = 'funnel-media'

/** URL pública de un objeto del bucket funnel-media (Supabase Storage). */
export function funnelMediaUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const clean = path.replace(/^\/+/, '')
  return `${base}/storage/v1/object/public/${BUCKET}/${clean}`
}

// Cloudflare R2 (bucket df-media, Public Development URL). Egress gratis → lo
// usamos para videos grandes que no entran en el plan free de Supabase (>50MB),
// ej. el video completo de la clase. Mismo tracking propio que los heros.
const R2_PUBLIC_BASE = 'https://pub-ad118957781f4b61854b12a3a7696fb9.r2.dev'

/** URL pública de un objeto en Cloudflare R2 (df-media). */
export function r2MediaUrl(path: string): string {
  return `${R2_PUBLIC_BASE}/${path.replace(/^\/+/, '')}`
}
