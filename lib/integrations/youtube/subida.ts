/**
 * Subida reanudable de YouTube (`videos.insert` con `uploadType=resumable`).
 *
 * YouTube no baja el video desde una URL como Instagram: hay que mandarle los
 * bytes. Se abre una sesión (vale una semana), se mandan pedazos con
 * `Content-Range` y, ante la duda, se le pregunta en qué byte quedó
 * (`bytes * /total` → 308 con `Range`). Cuando llega el último pedazo responde
 * el video creado: si la función se murió justo ahí, la próxima pregunta
 * devuelve ese mismo video, así que nunca se sube dos veces.
 */
const SUBIDA = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status'
const TECHO_MS = 8_000

/** Error de YouTube con lo necesario para decidir si se espera o se rinde. */
export class ErrorYoutube extends Error {
  constructor(
    mensaje: string,
    public httpStatus: number,
    public motivo: string | null,
  ) {
    super(mensaje)
    this.name = 'ErrorYoutube'
  }
}

export type EstadoSubidaYt = { tipo: 'parcial'; offset: number } | { tipo: 'terminada'; videoId: string } | { tipo: 'vencida' }

export interface ClienteYoutube {
  crearSesion(a: { titulo: string; descripcion: string; total: number; tipo: string }): Promise<string>
  estadoSubida(url: string, total: number): Promise<EstadoSubidaYt>
  subirParte(url: string, desde: number, bytes: Uint8Array<ArrayBuffer>, total: number, techoMs: number): Promise<Exclude<EstadoSubidaYt, { tipo: 'vencida' }>>
}

function esSesionDeGoogle(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'www.googleapis.com' && u.pathname === '/upload/youtube/v3/videos'
  } catch {
    return false
  }
}

async function error(res: Response, que: string): Promise<ErrorYoutube> {
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; errors?: { reason?: string }[] } }
  const motivo = j.error?.errors?.[0]?.reason ?? null
  return new ErrorYoutube(`YouTube ${res.status} al ${que}: ${j.error?.message ?? motivo ?? 'sin detalle'}`.slice(0, 300), res.status, motivo)
}

/** `Range: bytes=0-N` → N+1. Sin Range, YouTube no tiene nada todavía. */
function offsetDe(res: Response): number {
  const m = /bytes=0-(\d+)/.exec(res.headers.get('range') ?? '')
  return m ? Number(m[1]) + 1 : 0
}

async function terminada(res: Response): Promise<{ tipo: 'terminada'; videoId: string }> {
  const j = (await res.json().catch(() => ({}))) as { id?: string }
  if (!j.id) throw new ErrorYoutube('YouTube terminó la subida pero no devolvió el video', res.status, null)
  return { tipo: 'terminada', videoId: j.id }
}

export function clienteYoutube(llave: () => Promise<string>, f: typeof fetch = fetch): ClienteYoutube {
  return {
    async crearSesion(a) {
      const res = await f(SUBIDA, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await llave()}`,
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-length': String(a.total),
          'x-upload-content-type': a.tipo,
        },
        body: JSON.stringify({
          // 22 = "Gente y blogs". `selfDeclaredMadeForKids` es obligatorio: sin él YouTube lo pregunta en Studio.
          snippet: { title: a.titulo, description: a.descripcion, categoryId: '22' },
          status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
        }),
        signal: AbortSignal.timeout(TECHO_MS),
      })
      if (!res.ok) throw await error(res, 'abrir la subida')
      const url = res.headers.get('location')
      // La sesión viaja a la base y se reusa con la llave: solo puede ser de Google.
      if (!url || !esSesionDeGoogle(url)) throw new ErrorYoutube('YouTube devolvió una dirección de subida inesperada', res.status, null)
      return url
    },

    async estadoSubida(url, total) {
      if (!esSesionDeGoogle(url)) return { tipo: 'vencida' }
      const res = await f(url, {
        method: 'PUT',
        headers: { authorization: `Bearer ${await llave()}`, 'content-range': `bytes */${total}`, 'content-length': '0' },
        signal: AbortSignal.timeout(TECHO_MS),
      })
      if (res.status === 308) return { tipo: 'parcial', offset: offsetDe(res) }
      if (res.status === 200 || res.status === 201) return terminada(res)
      if (res.status === 404 || res.status === 410) return { tipo: 'vencida' }
      throw await error(res, 'consultar la subida')
    },

    async subirParte(url, desde, bytes, total, techoMs) {
      if (!esSesionDeGoogle(url)) throw new ErrorYoutube('Dirección de subida inesperada', 0, null)
      const hasta = desde + bytes.length - 1
      const res = await f(url, {
        method: 'PUT',
        headers: { authorization: `Bearer ${await llave()}`, 'content-range': `bytes ${desde}-${hasta}/${total}` },
        body: bytes,
        signal: AbortSignal.timeout(techoMs),
      })
      if (res.status === 308) return { tipo: 'parcial', offset: offsetDe(res) }
      if (res.status === 200 || res.status === 201) return terminada(res)
      throw await error(res, 'subir una parte')
    },
  }
}
