/**
 * Subida de los PNG de los carruseles a Supabase Storage (bucket privado
 * social-carousels) + signed URLs para servir en la UI.
 */
import { createClient } from '@supabase/supabase-js'

export function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const BUCKET = 'social-carousels'

async function upload(path: string, buf: Buffer): Promise<string> {
  const { error } = await admin().storage.from(BUCKET).upload(path, buf, { contentType: 'image/png', upsert: true })
  if (error) throw new Error(`storage upload ${path}: ${error.message}`)
  return path
}

/** PNG compuesto final del slide. */
export const uploadSlidePng = (carouselId: string, position: number, buf: Buffer) =>
  upload(`${carouselId}/slide-${position}.png`, buf)

/** Escena cruda (para re-render de texto sin re-generar la imagen). */
export const uploadRawScene = (carouselId: string, position: number, buf: Buffer) =>
  upload(`${carouselId}/scene-${position}.png`, buf)

export async function signedUrl(path: string | null, expiresSec = 3600): Promise<string | null> {
  if (!path) return null
  const { data } = await admin().storage.from(BUCKET).createSignedUrl(path, expiresSec)
  return data?.signedUrl ?? null
}

export async function downloadPng(path: string): Promise<Buffer> {
  const { data, error } = await admin().storage.from(BUCKET).download(path)
  if (error || !data) throw new Error(`storage download ${path}: ${error?.message}`)
  return Buffer.from(await data.arrayBuffer())
}

// ---- Cache de fotos "mejoradas" de campañas Meta (E2.5) ----
// La mejora fotográfica con OpenAI (gpt-image-2) es cara y lenta (~26s). Como
// las 12 piezas de una campaña reutilizan la MISMA foto mejorada por cada foto
// de origen (distintos estilos/formatos solo cambian el overlay vectorial),
// la cacheamos por (jobId, índice real de foto). Así:
//  - Solo se llama a OpenAI 1 vez por foto de origen (no 1 vez por pieza).
//  - Si el proceso se corta y se reintenta, NO se regenera lo ya hecho.
const adEnhancedPath = (jobId: string, realPhotoIdx: number) =>
  `ad-enhanced/${jobId}/r${realPhotoIdx}.jpg`

/** Guarda una foto ya mejorada (JPG) para reutilizarla en otras piezas del job. */
export async function uploadAdEnhanced(jobId: string, realPhotoIdx: number, buf: Buffer): Promise<void> {
  const { error } = await admin().storage
    .from(BUCKET)
    .upload(adEnhancedPath(jobId, realPhotoIdx), buf, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(`storage upload ad-enhanced ${jobId}/${realPhotoIdx}: ${error.message}`)
}

/** Devuelve la foto mejorada cacheada, o null si todavía no existe (no tira). */
export async function downloadAdEnhanced(jobId: string, realPhotoIdx: number): Promise<Buffer | null> {
  const { data, error } = await admin().storage.from(BUCKET).download(adEnhancedPath(jobId, realPhotoIdx))
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}
