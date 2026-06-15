const BUCKET = 'funnel-media'

/** URL pública de un objeto del bucket funnel-media. */
export function funnelMediaUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const clean = path.replace(/^\/+/, '')
  return `${base}/storage/v1/object/public/${BUCKET}/${clean}`
}
