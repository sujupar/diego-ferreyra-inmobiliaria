// Helpers puros + constantes para la multimedia de propiedades.
// Mantener sin dependencias de runtime para que sea testeable y usable
// tanto en el cliente como en las API routes.

export const PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const
export const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'm4v'] as const
export const PLAN_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024 // 15 MB
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200 MB
// La subida es directa a Storage (URL firmada) — un PDF grande nunca pasa por
// el body de Next.js. El bucket ya acepta 200 MB (video) por el mismo camino.
export const MAX_PLAN_BYTES = 100 * 1024 * 1024 // 100 MB

/**
 * Dada una URL pública de Supabase Storage del bucket `property-files`,
 * devuelve el path del objeto dentro del bucket (para borrarlo con
 * `bucket.remove([path])`). Devuelve null si la URL no pertenece al bucket.
 */
export function storagePathFromPublicUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/property-files/'
  const i = url.indexOf(marker)
  if (i === -1) return null
  const path = url.slice(i + marker.length)
  if (!path) return null
  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}

/**
 * Sanea el nombre original de un archivo (sin extensión) para usarlo dentro
 * del path de Storage y poder mostrar una etiqueta legible después.
 * Solo [a-z0-9-], máx 40 chars; fallback 'plano' si no queda nada.
 */
export function sanitizeFileBase(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '')
  const clean = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // saca tildes (combining marks tras NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return clean || 'plano'
}

const UUID_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i

/**
 * Deriva una etiqueta legible desde la URL pública de un plano
 * (`.../plans/{uuid}-{nombre-saneado}.{ext}` → "nombre-saneado.ext").
 */
export function planLabelFromUrl(url: string): string {
  const segment = url.split('/').pop() || ''
  let name: string
  try {
    name = decodeURIComponent(segment)
  } catch {
    name = segment
  }
  return name.replace(UUID_PREFIX_RE, '') || 'plano'
}
