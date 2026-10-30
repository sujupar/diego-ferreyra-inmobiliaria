/**
 * Reels de la Página de Facebook (la conectada a la cuenta de Instagram).
 *
 * Son TRES pasos con el token de la PÁGINA, y Facebook procesa el video por su
 * cuenta entre uno y otro:
 *   1. iniciar  → `POST /{página}/video_reels?upload_phase=start` → id del video
 *   2. subir    → `POST rupload.facebook.com/...` con el header `file_url`:
 *                 Facebook baja el archivo desde nuestra URL pública
 *   3. publicar → `POST /{página}/video_reels?upload_phase=finish&video_state=PUBLISHED`
 * Después se consulta `GET /{video}?fields=status` hasta que la fase de
 * publicación diga `complete`. Cada paso es una etapa del cron, nunca dos juntas.
 */
import { ErrorInstagram, paginaDeLaCuenta, paginaFetch, TECHO_META_MS } from '@/lib/integrations/instagram/client'

const RUPLOAD = 'https://rupload.facebook.com/video-upload/v21.0'

export type EstadoReelFb = 'procesando' | 'publicado' | 'error'

interface Fase {
  status?: string
}
interface CuerpoEstado {
  status?: {
    video_status?: string
    uploading_phase?: Fase
    processing_phase?: Fase
    publishing_phase?: Fase & { publish_status?: string }
  }
}

/** Lo desconocido es "procesando": dar por publicado algo que no entendemos sería peor. */
export function interpretarEstadoFb(json: unknown): EstadoReelFb {
  const s = (json as CuerpoEstado | null)?.status
  if (!s) return 'procesando'
  if (
    s.video_status === 'error' ||
    s.uploading_phase?.status === 'error' ||
    s.processing_phase?.status === 'error' ||
    s.publishing_phase?.status === 'error'
  ) {
    return 'error'
  }
  if (s.publishing_phase?.status === 'complete') return 'publicado'
  return 'procesando'
}

/**
 * ¿Se puede pedir publicar? Solo con la subida completa y la publicación SIN
 * empezar. Pedirlo mientras Facebook todavía baja el archivo da un error que no
 * significa nada; pedirlo dos veces (la función murió después del primer pedido)
 * puede marcar como fallido algo que sí salió.
 */
export function fasesFb(json: unknown): { listoParaPublicar: boolean; publicacionPedida: boolean } {
  const s = (json as CuerpoEstado | null)?.status
  const publicacion = s?.publishing_phase?.status
  const publicacionPedida = !!publicacion && publicacion !== 'not_started'
  return {
    listoParaPublicar: s?.uploading_phase?.status === 'complete' && !publicacionPedida,
    publicacionPedida,
  }
}

/** Facebook a veces devuelve el enlace relativo ("/reel/123/"). Solo https. */
export function enlaceAbsoluto(enlace: string | undefined | null): string | null {
  if (!enlace) return null
  if (enlace.startsWith('/')) return `https://www.facebook.com${enlace}`
  return enlace.startsWith('https://') ? enlace : null
}

export async function iniciarReel(): Promise<string> {
  const { pageId } = await paginaDeLaCuenta()
  const r = await paginaFetch<{ video_id?: string }>(`/${pageId}/video_reels`, {
    method: 'POST',
    body: JSON.stringify({ upload_phase: 'start' }),
  })
  if (!r.video_id) throw new Error('Facebook aceptó el pedido pero no devolvió el identificador del video.')
  return r.video_id
}

/** Facebook baja el archivo desde la URL. Tiene que ser https y pública. */
export async function subirPorUrl(videoId: string, url: string): Promise<void> {
  if (!url.startsWith('https://')) throw new Error('La URL del video tiene que ser https:// para que Facebook la descargue.')
  const { pageToken } = await paginaDeLaCuenta()
  const res = await fetch(`${RUPLOAD}/${encodeURIComponent(videoId)}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${pageToken}`, file_url: url },
    // Antes del corte de Netlify. Subir por URL es repetible: si se corta, se vuelve a pedir.
    signal: AbortSignal.timeout(TECHO_META_MS),
  })
  const texto = await res.text()
  let cuerpo: { success?: boolean; error?: { message?: string; code?: number } } = {}
  try {
    cuerpo = JSON.parse(texto) as typeof cuerpo
  } catch {
    // Queda el texto crudo en el error.
  }
  if (!res.ok || cuerpo.success !== true) {
    throw new ErrorInstagram(
      `Facebook ${res.status}: ${cuerpo.error?.message ?? texto.slice(0, 200)}`,
      res.status,
      texto,
      cuerpo.error?.code,
    )
  }
}

export async function publicarReel(videoId: string, descripcion: string): Promise<void> {
  const { pageId } = await paginaDeLaCuenta()
  const r = await paginaFetch<{ success?: boolean }>(`/${pageId}/video_reels`, {
    method: 'POST',
    body: JSON.stringify({ upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED', description: descripcion }),
  })
  if (r.success !== true) throw new Error('Facebook no confirmó la publicación del reel.')
}

/**
 * Video normal de la Página, para los de más de 90 segundos (la API de Reels no
 * los acepta). Un solo pedido: Facebook baja el archivo de la URL y lo procesa
 * solo; su estado se consulta igual que el de un reel.
 */
export async function publicarVideoComun(url: string, descripcion: string): Promise<string> {
  if (!url.startsWith('https://')) throw new Error('La URL del video tiene que ser https:// para que Facebook la descargue.')
  const { pageId } = await paginaDeLaCuenta()
  const r = await paginaFetch<{ id?: string }>(`/${pageId}/videos`, {
    method: 'POST',
    body: JSON.stringify({ file_url: url, description: descripcion, published: true }),
  })
  if (!r.id) throw new Error('Facebook aceptó el video pero no devolvió su identificador.')
  return r.id
}

export interface EstadoCompletoFb {
  estado: EstadoReelFb
  enlace: string | null
  listoParaPublicar: boolean
  publicacionPedida: boolean
}

export async function estadoReel(videoId: string): Promise<EstadoCompletoFb> {
  const r = await paginaFetch<CuerpoEstado & { permalink_url?: string }>(
    `/${encodeURIComponent(videoId)}?fields=status,permalink_url`,
  )
  return { estado: interpretarEstadoFb(r), enlace: enlaceAbsoluto(r.permalink_url), ...fasesFb(r) }
}
