/**
 * Subir un video a los BORRADORES de TikTok (Content Posting API, "inbox").
 * El video llega a la bandeja de la app y desde ahí se termina de publicar: es
 * lo que permite la app mientras no tenga aprobada la publicación directa.
 *
 * TikTok no baja el video de una URL de Supabase (exigiría verificar ese
 * dominio en TikTok): se manda en partes (`FILE_UPLOAD`). Reglas de TikTok: las
 * partes miden lo mismo (5 a 64 MB) salvo la última, que se queda con el resto;
 * un video de menos de 5 MB va entero.
 */
export const MB = 1024 * 1024
const PARTE = 8 * MB
const MINIMO = 5 * MB
const API = 'https://open.tiktokapis.com/v2'
const TECHO_MS = 8_000

export class ErrorTiktok extends Error {
  constructor(
    mensaje: string,
    public httpStatus: number,
    public motivo: string | null,
  ) {
    super(mensaje)
    this.name = 'ErrorTiktok'
  }
}

export interface PlanPartes {
  tamanoParte: number
  cantidad: number
  partes: { desde: number; hasta: number }[]
}

export function planDePartes(total: number): PlanPartes {
  if (total < MINIMO) return { tamanoParte: total, cantidad: 1, partes: [{ desde: 0, hasta: total - 1 }] }
  const cantidad = Math.max(1, Math.floor(total / PARTE))
  const partes = Array.from({ length: cantidad }, (_, i) => ({
    desde: i * PARTE,
    hasta: i === cantidad - 1 ? total - 1 : (i + 1) * PARTE - 1,
  }))
  return { tamanoParte: cantidad === 1 ? total : PARTE, cantidad, partes }
}

export type EstadoTiktok = 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'SEND_TO_USER_INBOX' | 'PUBLISH_COMPLETE' | 'FAILED' | string

export interface ClienteTiktok {
  iniciar(a: { total: number; tamanoParte: number; cantidad: number }): Promise<{ publishId: string; uploadUrl: string }>
  subirParte(url: string, desde: number, bytes: Uint8Array<ArrayBuffer>, total: number, techoMs: number): Promise<'parcial' | 'completa'>
  estado(publishId: string): Promise<{ status: EstadoTiktok; motivo: string | null }>
}

function esSubidaDeTiktok(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && (u.hostname === 'tiktokapis.com' || u.hostname.endsWith('.tiktokapis.com'))
  } catch {
    return false
  }
}

interface Respuesta<T> {
  data?: T
  error?: { code?: string; message?: string }
}

async function leer<T>(res: Response, que: string): Promise<T> {
  const j = (await res.json().catch(() => ({}))) as Respuesta<T>
  const codigo = j.error?.code ?? null
  // TikTok puede responder 200 con un error adentro: manda el código, no el número.
  if (!res.ok || (codigo && codigo !== 'ok') || !j.data) {
    throw new ErrorTiktok(`TikTok ${res.status} al ${que}: ${j.error?.message || codigo || 'sin detalle'}`.slice(0, 300), res.status, codigo)
  }
  return j.data
}

export function clienteTiktok(llave: () => Promise<string>, f: typeof fetch = fetch): ClienteTiktok {
  const pedir = async (ruta: string, cuerpo: unknown) =>
    f(`${API}${ruta}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await llave()}`, 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(TECHO_MS),
    })

  return {
    async iniciar(a) {
      const res = await pedir('/post/publish/inbox/video/init/', {
        source_info: { source: 'FILE_UPLOAD', video_size: a.total, chunk_size: a.tamanoParte, total_chunk_count: a.cantidad },
      })
      const d = await leer<{ publish_id?: string; upload_url?: string }>(res, 'iniciar la subida')
      if (!d.publish_id || !d.upload_url || !esSubidaDeTiktok(d.upload_url)) {
        throw new ErrorTiktok('TikTok devolvió una dirección de subida inesperada', res.status, null)
      }
      return { publishId: d.publish_id, uploadUrl: d.upload_url }
    },

    async subirParte(url, desde, bytes, total, techoMs) {
      if (!esSubidaDeTiktok(url)) throw new ErrorTiktok('Dirección de subida inesperada', 0, null)
      const res = await f(url, {
        method: 'PUT',
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(bytes.length),
          'content-range': `bytes ${desde}-${desde + bytes.length - 1}/${total}`,
        },
        body: bytes,
        signal: AbortSignal.timeout(techoMs),
      })
      if (res.status === 206) return 'parcial'
      if (res.status === 201 || res.status === 200) return 'completa'
      throw new ErrorTiktok(`TikTok ${res.status} al subir una parte`, res.status, null)
    },

    async estado(publishId) {
      const res = await pedir('/post/publish/status/fetch/', { publish_id: publishId })
      const d = await leer<{ status?: string; fail_reason?: string }>(res, 'consultar la publicación')
      return { status: d.status ?? 'PROCESSING_UPLOAD', motivo: d.fail_reason ?? null }
    },
  }
}
