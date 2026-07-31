/**
 * Multimedia ENTRANTE de WhatsApp (Cloud API): descarga + guardado en Storage.
 *
 * Meta NO expone el binario directo del adjunto. `GET /{media-id}` (con el
 * `Bearer` del `WHATSAPP_ACCESS_TOKEN`) devuelve metadata + una URL temporal
 * (dura minutos), y esa URL a su vez EXIGE el mismo Bearer para bajar los
 * bytes — no es pública. Hasta esta tarea (2026-07-31) esto no se hacía: una
 * foto que mandaba un cliente quedaba solo como el texto "[imagen]" en
 * `whatsapp_messages.body_preview`, sin el archivo real en ningún lado.
 *
 * SIN 'server-only' (mismo criterio que `./core.ts`/`./log.ts`): solo lo
 * importa la ruta del webhook, pero se mantiene el patrón del módulo para
 * poder reutilizarlo desde un script de diagnóstico si hiciera falta.
 *
 * Bucket `whatsapp-media` (privado, migración `20260731000003_whatsapp_media.sql`):
 * el binario de un cliente no es apto para un bucket público. El chat lee vía
 * `signedMediaUrl` (URL firmada de corta duración) al traer el hilo.
 */
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const BUCKET = 'whatsapp-media'

/** Corre DENTRO del webhook — tiene que responder rápido (Meta reintenta / puede deshabilitar un webhook lento). */
const TIMEOUT_MS = 8000

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
}

/**
 * Extensión de archivo para un mime type de WhatsApp. Pura (sin red) para
 * poder testearla sin mocks — el resto del módulo hace I/O real (fetch a
 * Meta + Storage) y no se testea unitariamente, mismo criterio que
 * `sendWhatsappTemplate`/`sendWhatsappText` en `./core.ts`.
 */
export function mediaFileExtension(mimeType: string | null | undefined, filenameHint?: string | null): string {
  if (mimeType) {
    const clean = mimeType.split(';')[0].trim().toLowerCase()
    if (EXT_BY_MIME[clean]) return EXT_BY_MIME[clean]
  }
  if (filenameHint) {
    const m = filenameHint.match(/\.([a-zA-Z0-9]+)$/)
    if (m) return m[1].toLowerCase()
  }
  return 'bin'
}

export interface DownloadInboundMediaInput {
  mediaId: string
  /** `messages[].id` del mensaje — se usa como nombre de archivo (único, y facilita debug cruzando con `whatsapp_messages`). */
  waMessageId: string
  /** Solo documentos: `document.filename` que manda Meta. */
  filenameHint?: string | null
}

export interface DownloadInboundMediaResult {
  /** Path DENTRO del bucket (no es una URL pública — el bucket es privado). */
  storagePath: string
  mimeType: string
  filename: string | null
}

/**
 * Descarga un adjunto entrante y lo sube a Storage. Nunca lanza: cualquier
 * fallo (token vencido, media que Meta ya purgó, Storage caído) devuelve
 * `null` — el mensaje entrante se guarda igual con el fallback de texto
 * (`describeNonTextMessage` en `./webhook.ts`). Perder el ARCHIVO es
 * aceptable; perder el MENSAJE no lo es.
 */
export async function downloadAndStoreInboundMedia(
  input: DownloadInboundMediaInput,
): Promise<DownloadInboundMediaResult | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) return null
  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0'

  try {
    // 1) Metadata + URL temporal de descarga.
    const metaRes = await fetch(`https://graph.facebook.com/${version}/${input.mediaId}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!metaRes.ok) {
      console.warn(`[whatsapp-media] GET /${input.mediaId} devolvió ${metaRes.status}`)
      return null
    }
    const meta = (await metaRes.json().catch(() => ({}))) as { url?: string; mime_type?: string }
    if (!meta.url) return null

    // 2) Descarga de los bytes — la URL temporal TAMBIÉN exige el mismo Bearer.
    const fileRes = await fetch(meta.url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!fileRes.ok) {
      console.warn(`[whatsapp-media] descarga del binario devolvió ${fileRes.status}`)
      return null
    }
    const bytes = new Uint8Array(await fileRes.arrayBuffer())
    const mimeType = meta.mime_type ?? fileRes.headers.get('content-type') ?? 'application/octet-stream'
    const ext = mediaFileExtension(mimeType, input.filenameHint)
    const safeId = input.waMessageId.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `inbound/${safeId}.${ext}`

    const { error } = await admin()
      .storage.from(BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: true })
    if (error) {
      console.warn('[whatsapp-media] no se pudo subir a Storage (continuando):', error.message)
      return null
    }

    return { storagePath: path, mimeType, filename: input.filenameHint ?? null }
  } catch (err) {
    console.warn('[whatsapp-media] excepción descargando/guardando el adjunto (continuando):', err)
    return null
  }
}

/** URL firmada de lectura para un path guardado por `downloadAndStoreInboundMedia`. `null` si falla (nunca lanza). */
export async function signedMediaUrl(storagePath: string, expiresInSeconds = 3600): Promise<string | null> {
  try {
    const { data, error } = await admin().storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch (err) {
    console.warn('[whatsapp-media] no se pudo firmar la URL (continuando):', err)
    return null
  }
}

/**
 * Cache en memoria de URLs firmadas, keyeada por storage path. Pura y
 * testeable (recibe el reloj como parámetro) — separada de `signedMediaUrls`
 * para poder probar la lógica de vencimiento sin tocar Storage.
 *
 * Por qué existe (hallazgo #6, revisión adversarial 2026-07-31): el hilo del
 * chat hace polling cada 15s (`WhatsappClient.tsx`, POLL_MS). Antes, cada
 * poll firmaba una URL NUEVA para cada adjunto → el `src` del <img>/<audio>
 * cambiaba en cada poll → el navegador volvía a descargar el archivo entero
 * → parpadeo. Ahora la URL se reusa mientras esté "fresca" (con margen antes
 * del vencimiento real), así que entre polls consecutivos el `src` es
 * idéntico y el navegador sirve desde cache HTTP/memoria.
 */
export class SignedUrlCache {
  private entries = new Map<string, { url: string; expiresAtMs: number }>()

  /** URL cacheada si todavía está fresca en `nowMs`, si no `null`. */
  getFresh(path: string, nowMs: number): string | null {
    const entry = this.entries.get(path)
    if (!entry) return null
    if (entry.expiresAtMs <= nowMs) {
      this.entries.delete(path)
      return null
    }
    return entry.url
  }

  /** Guarda una URL firmada con vencimiento efectivo = `nowMs + ttlMs` (con margen respecto al vencimiento real de Storage). */
  set(path: string, url: string, nowMs: number, ttlMs: number): void {
    this.entries.set(path, { url, expiresAtMs: nowMs + ttlMs })
  }

  clear(): void {
    this.entries.clear()
  }
}

/**
 * Vencimiento REAL que se le pide a Storage (1h — igual que antes).
 * Vencimiento EFECTIVO del cache: bastante más corto (55min) para nunca
 * servir una URL que Storage ya rechazó, pero mucho más largo que el
 * intervalo de polling (15s) — así la URL es estable entre polls.
 */
const SIGN_TTL_SECONDS = 3600
const CACHE_TTL_MS = 55 * 60 * 1000

const moduleCache = new SignedUrlCache()

/**
 * Firma en lote (`createSignedUrls`, UNA llamada HTTP a Storage en vez de N
 * en paralelo) las URLs de lectura para varios paths, reusando el cache de
 * módulo para los que siguen frescos. `null` para los paths que fallan al
 * firmar (nunca lanza) — el front cae al `body_preview` de texto.
 */
export async function signedMediaUrls(
  storagePaths: readonly string[],
  expiresInSeconds = SIGN_TTL_SECONDS,
): Promise<Record<string, string | null>> {
  const now = Date.now()
  const result: Record<string, string | null> = {}
  const toFetch: string[] = []

  const unique = Array.from(new Set(storagePaths))
  for (const path of unique) {
    const cached = moduleCache.getFresh(path, now)
    if (cached) {
      result[path] = cached
    } else {
      toFetch.push(path)
    }
  }

  if (toFetch.length === 0) return result

  try {
    const { data, error } = await admin().storage.from(BUCKET).createSignedUrls(toFetch, expiresInSeconds)
    if (error || !data) {
      for (const path of toFetch) result[path] = null
      return result
    }
    for (const entry of data) {
      const path = entry.path ?? ''
      if (!path) continue
      if (entry.error || !entry.signedUrl) {
        result[path] = null
        continue
      }
      moduleCache.set(path, entry.signedUrl, now, CACHE_TTL_MS)
      result[path] = entry.signedUrl
    }
    // Cualquier path pedido que Storage no haya devuelto (no debería pasar, pero por las dudas).
    for (const path of toFetch) {
      if (!(path in result)) result[path] = null
    }
    return result
  } catch (err) {
    console.warn('[whatsapp-media] no se pudieron firmar las URLs en lote (continuando):', err)
    for (const path of toFetch) result[path] = null
    return result
  }
}
