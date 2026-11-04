/**
 * Videos desde Google Drive: listar un enlace, darlos de alta en la tanda y
 * copiarlos a Storage de a partes. Las rutas solo autentican y llaman acá.
 */
import { publicacionesDb } from '../db'
import type { ArchivoDrive } from '../drive/archivos'
import { clienteDrive, type ListadoDrive } from '../drive/cliente'
import { avanzarCopia } from '../drive/copia'
import { leerEnlaceDrive, leerRefDeDrive, refDeDrive } from '../drive/enlace'
import type { VideoFila } from '../tipos'
import { detectarDuplicados, MAX_VIDEOS_POR_ALTA } from '../validacion'
import { ErrorHttp } from './http'
import { crearSubida, offsetDeSubida, subirParte } from './subida-reanudable'
import { conUrls, dbError, leerTanda, leerVideo, videosDeTanda, type VideoConUrls } from './tandas'

/** Lo que una llamada a `traer` copia como mucho: deja margen al corte de Netlify (~10 s). */
const PRESUPUESTO_MS = 6_500

function cliente() {
  return clienteDrive(process.env.GOOGLE_API_KEY?.trim() ?? '')
}

export async function listarDrive(texto: string): Promise<ListadoDrive & { resourceKey: string | null }> {
  const enlace = leerEnlaceDrive(texto)
  if (!enlace) throw new ErrorHttp(400, 'Ese enlace no es de Google Drive. Copiá el enlace de la carpeta o del video desde Drive.')
  const listado = await cliente().listar(enlace)
  return { ...listado, resourceKey: enlace.resourceKey ?? null }
}

export interface AltaDrive {
  agregados: number
  repetidos: string[]
  descartados: { nombre: string; motivo: string }[]
}

/**
 * Da de alta los archivos elegidos. La metadata se vuelve a pedir a Drive: el
 * tamaño que manda el navegador no se usa (de él depende la copia entera).
 */
export async function altaVideosDrive(tandaId: string, ids: string[], resourceKey: string | null): Promise<AltaDrive> {
  const tanda = await leerTanda(tandaId)
  if (tanda.estado !== 'borrador') throw new ErrorHttp(409, 'Esta tanda ya está programada: empezá una nueva')
  const unicos = [...new Set(ids)].slice(0, MAX_VIDEOS_POR_ALTA)
  const drive = cliente()
  const leidos: ArchivoDrive[] = await Promise.all(unicos.map((id) => drive.leerArchivo(id, resourceKey ?? undefined)))

  const descartados = leidos.filter((a) => !a.apto).map((a) => ({ nombre: a.nombre, motivo: a.motivo ?? 'No se puede traer' }))
  const aptos = leidos.filter((a) => a.apto)
  const existentes = await videosDeTanda(tandaId)
  const { nuevos, repetidos } = detectarDuplicados(existentes, aptos)
  if (nuevos.length === 0) return { agregados: 0, repetidos, descartados }

  let orden = existentes.reduce((m, v) => Math.max(m, v.orden), -1)
  const filas = nuevos.map((a) => {
    const id = crypto.randomUUID()
    return {
      id,
      tanda_id: tandaId,
      orden: ++orden,
      origen: 'drive',
      drive_file_id: refDeDrive(a.id, resourceKey ?? undefined),
      nombre_archivo: a.nombre,
      tamano_bytes: a.tamano,
      video_path: `tandas/${tandaId}/${id}/video.${a.tipo === 'video/quicktime' ? 'mov' : 'mp4'}`,
      etapa: 'subiendo',
    }
  })
  const { data, error } = await publicacionesDb()
    .from('publicacion_videos')
    .upsert(filas, { onConflict: 'tanda_id,nombre_archivo,tamano_bytes', ignoreDuplicates: true })
    .select('id')
  dbError(error)
  const insertados = new Set((data ?? []).map((f) => f.id as string))
  for (const f of filas) if (!insertados.has(f.id)) repetidos.push(f.nombre_archivo)
  return { agregados: insertados.size, repetidos, descartados }
}

/** Copia lo que entra en un pedido. Al terminar, el video pasa a `extrayendo` y sigue como cualquier otro. */
export async function traerDeDrive(videoId: string): Promise<{ video: VideoConUrls; copiado: number }> {
  const v = await leerVideo(videoId)
  if (v.origen !== 'drive') throw new ErrorHttp(409, 'Este video no viene de Drive')
  if (v.etapa !== 'subiendo') return { video: conUrls(v), copiado: Number(v.tamano_bytes) }
  const ref = v.drive_file_id ? leerRefDeDrive(v.drive_file_id) : null
  if (!ref || !v.video_path) throw new ErrorHttp(409, 'Falta el archivo de Drive de este video. Quitalo y volvé a traerlo.')

  const drive = cliente()
  const total = Number(v.tamano_bytes)
  if (!v.drive_subida_url) {
    // Antes de empezar: si en Drive lo reemplazaron por otro, el tamaño dado de alta ya no sirve.
    const actual = await drive.leerArchivo(ref.id, ref.resourceKey)
    if (actual.tamano !== total) {
      throw new ErrorHttp(409, 'El archivo cambió en Drive después de elegirlo. Quitalo y volvé a traerlo.')
    }
  }
  const tipo = v.video_path.endsWith('.mov') ? 'video/quicktime' : 'video/mp4'
  let avance
  try {
    avance = await avanzarCopia(
      { total, subidaUrl: v.drive_subida_url },
      {
        ahora: () => Date.now(),
        crearSubida: (t) => crearSubida(v.video_path!, t, tipo),
        offsetDeSubida,
        descargar: (desde, hasta, techoMs) => drive.descargarParte(ref.id, desde, hasta, ref.resourceKey, techoMs),
        subirParte,
      },
      PRESUPUESTO_MS,
    )
  } catch (e) {
    if (e instanceof ErrorHttp) throw e
    console.error('[publicaciones/drive] copia', videoId, e)
    throw new ErrorHttp(502, 'Se cortó la copia desde Drive. Tocá Reintentar: sigue desde donde quedó.')
  }

  const cambios: Partial<VideoFila> & { drive_subida_url: string | null; drive_copiado_bytes: number } = avance.terminado
    ? { drive_subida_url: null, drive_copiado_bytes: avance.copiado, etapa: 'extrayendo' }
    : { drive_subida_url: avance.subidaUrl, drive_copiado_bytes: avance.copiado }
  // Solo si sigue en `subiendo`: otro pedido pudo haberlo terminado (o quitado) en el medio.
  const { data, error } = await publicacionesDb()
    .from('publicacion_videos')
    .update(cambios)
    .eq('id', videoId)
    .eq('etapa', 'subiendo')
    .select('*')
    .maybeSingle()
  dbError(error)
  const fila = (data as VideoFila | null) ?? (await leerVideo(videoId))
  return { video: conUrls(fila), copiado: avance.copiado }
}
