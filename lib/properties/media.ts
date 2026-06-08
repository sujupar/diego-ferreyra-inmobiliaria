// Helpers puros + constantes para la multimedia de propiedades.
// Mantener sin dependencias de runtime para que sea testeable y usable
// tanto en el cliente como en las API routes.

export const PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'] as const
export const VIDEO_EXTS = ['mp4', 'mov', 'webm', 'm4v'] as const
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024 // 15 MB
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024 // 200 MB

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
  return path ? decodeURIComponent(path) : null
}
