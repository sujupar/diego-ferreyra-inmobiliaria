/**
 * Cliente service role de Publicaciones. Sin genérico Database: las tablas
 * publicacion_* no están en los types generados (patrón de lib/contenido/db.ts).
 * Toda ruta que lo usa pasa ANTES por `contenidoAuth`.
 */
import { createClient } from '@supabase/supabase-js'

export const BUCKET = 'contenido-videos'

export function publicacionesDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** URL pública de un objeto del bucket (el bucket es público a propósito). */
export function urlPublica(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`
}
