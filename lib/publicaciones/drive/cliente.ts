/**
 * Lectura de Google Drive con la clave de API (`GOOGLE_API_KEY`).
 *
 * Solo ve lo compartido como "Cualquier persona con el enlace": leer carpetas
 * privadas exigiría el permiso de Drive que Google clasifica como restringido
 * (revisión de seguridad paga). Por eso cada "no lo veo" le dice a la persona
 * exactamente qué compartir.
 *
 * Todo error sale como `ErrorHttp` con un mensaje para mostrar tal cual.
 */
import { ErrorHttp } from '../servidor/http'
import { clasificarArchivo, type ArchivoCrudoDrive, type ArchivoDrive } from './archivos'
import type { EnlaceDrive } from './enlace'

const API = 'https://www.googleapis.com/drive/v3/files'
const CARPETA = 'application/vnd.google-apps.folder'
const TECHO_MS = 8_000
const MAX_PAGINAS = 5

export const NO_LO_VEO =
  "No puedo ver ese enlace. En Drive, tocá Compartir y elegí \"Cualquier persona con el enlace\"."
const SIN_CONFIGURAR = 'La conexión con Google Drive no está configurada. Avisale al administrador.'

export interface ListadoDrive {
  /** Nombre de la carpeta, o null si el enlace era a un archivo suelto. */
  nombre: string | null
  archivos: ArchivoDrive[]
  subcarpetas: number
}

export interface ClienteDrive {
  listar(enlace: EnlaceDrive): Promise<ListadoDrive>
  leerArchivo(id: string, resourceKey?: string): Promise<ArchivoDrive>
  descargarParte(id: string, desde: number, hasta: number, resourceKey?: string, techoMs?: number): Promise<Uint8Array<ArrayBuffer>>
}

interface ErrorDeGoogle {
  error?: { code?: number; message?: string; errors?: { reason?: string }[] }
}

async function errorLegible(res: Response): Promise<ErrorHttp> {
  const cuerpo = (await res.json().catch(() => ({}))) as ErrorDeGoogle
  const motivo = cuerpo.error?.errors?.[0]?.reason ?? ''
  if (res.status === 404) return new ErrorHttp(404, NO_LO_VEO)
  if (/rateLimit|quotaExceeded|dailyLimit/i.test(motivo) || res.status === 429) {
    return new ErrorHttp(503, 'Google pidió esperar un momento. Probá de nuevo en un minuto.')
  }
  if (motivo === 'cannotDownloadFile' || motivo === 'downloadQuotaExceeded') {
    return new ErrorHttp(403, 'El dueño de ese archivo no permite descargarlo. Pedile que habilite la descarga.')
  }
  // Un 403 "forbidden" a secas es un archivo que la clave no puede ver: va al NO_LO_VEO de abajo.
  if (res.status === 400 || /keyInvalid|accessNotConfigured|keyExpired/i.test(motivo)) {
    console.error('[publicaciones/drive] Google rechazó la clave:', res.status, motivo, cuerpo.error?.message)
    return new ErrorHttp(503, SIN_CONFIGURAR)
  }
  if (res.status === 403) return new ErrorHttp(404, NO_LO_VEO)
  console.error('[publicaciones/drive]', res.status, motivo, cuerpo.error?.message)
  return new ErrorHttp(503, 'Drive no respondió bien. Probá de nuevo.')
}

export function clienteDrive(clave: string, f: typeof fetch = fetch): ClienteDrive {
  const pedir = async (params: Record<string, string>, ruta = '', init: RequestInit = {}, techoMs = TECHO_MS): Promise<Response> => {
    if (!clave) throw new ErrorHttp(503, SIN_CONFIGURAR)
    const url = new URL(`${API}${ruta}`)
    for (const [k, v] of Object.entries({ ...params, key: clave, supportsAllDrives: 'true' })) url.searchParams.set(k, v)
    let res: Response
    try {
      res = await f(url.toString(), { ...init, signal: AbortSignal.timeout(techoMs) })
    } catch (e) {
      console.error('[publicaciones/drive] sin respuesta', e)
      throw new ErrorHttp(503, 'Drive no respondió. Probá de nuevo.')
    }
    if (!res.ok) throw await errorLegible(res)
    return res
  }
  const cabeceras = (id: string, resourceKey?: string): HeadersInit =>
    resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${id}/${resourceKey}` } : {}

  const metadata = async (id: string, resourceKey?: string) =>
    (await (await pedir({ fields: 'id,name,mimeType,size' }, `/${id}`, { headers: cabeceras(id, resourceKey) })).json()) as ArchivoCrudoDrive

  return {
    async listar(enlace) {
      const raiz = await metadata(enlace.id, enlace.resourceKey)
      if (raiz.mimeType !== CARPETA) return { nombre: null, archivos: [clasificarArchivo(raiz)], subcarpetas: 0 }

      const archivos: ArchivoDrive[] = []
      let subcarpetas = 0
      let pagina: string | undefined
      for (let i = 0; i < MAX_PAGINAS; i++) {
        const params: Record<string, string> = {
          // El id ya se validó contra el alfabeto de Drive (enlace.ts): no puede cerrar la comilla.
          q: `'${enlace.id}' in parents and trashed = false`,
          fields: 'nextPageToken,files(id,name,mimeType,size)',
          pageSize: '100',
          orderBy: 'name',
          includeItemsFromAllDrives: 'true',
        }
        if (pagina) params.pageToken = pagina
        const r = (await (await pedir(params, '', { headers: cabeceras(enlace.id, enlace.resourceKey) })).json()) as {
          nextPageToken?: string
          files?: ArchivoCrudoDrive[]
        }
        for (const a of r.files ?? []) {
          if (a.mimeType === CARPETA) subcarpetas++
          else archivos.push(clasificarArchivo(a))
        }
        pagina = r.nextPageToken
        if (!pagina) break
      }
      return { nombre: raiz.name ?? null, archivos, subcarpetas }
    },

    async leerArchivo(id, resourceKey) {
      return clasificarArchivo(await metadata(id, resourceKey))
    },

    async descargarParte(id, desde, hasta, resourceKey, techoMs = TECHO_MS) {
      const res = await pedir(
        { alt: 'media', acknowledgeAbuse: 'false' },
        `/${id}`,
        { headers: { ...cabeceras(id, resourceKey), Range: `bytes=${desde}-${hasta}` } },
        techoMs,
      )
      if (res.status !== 206 && desde !== 0) throw new Error('Drive ignoró el rango pedido')
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (bytes.length !== hasta - desde + 1) throw new Error('Drive devolvió una parte incompleta del video')
      return bytes
    },
  }
}
