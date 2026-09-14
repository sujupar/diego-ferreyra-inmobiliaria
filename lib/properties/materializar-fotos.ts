import { randomUUID } from 'node:crypto'
import { parsearDataUrl, esFotoIncrustada } from './fotos-incrustadas'

/**
 * Convierte las fotos incrustadas (base64) de una propiedad en archivos de
 * Storage, devolviendo el array de fotos con URLs públicas en el MISMO orden.
 *
 * Se llama al captar (POST /api/properties) porque es el único lugar donde
 * entran fotos así (heredadas de la tasación). Una foto que no se puede subir
 * se DESCARTA con log: la regla es que en `properties.photos` nunca quede un
 * `data:` — es lo que rompía MercadoLibre (413) y Argenprop (Multimedia.Url).
 *
 * El subidor se inyecta para poder probar el módulo sin Storage.
 */
export interface SubidorDeFotos {
  /** Sube los bytes y devuelve la URL pública. */
  subir(path: string, bytes: Buffer, mime: string): Promise<string>
}

export interface ResultadoMaterializacion {
  photos: string[]
  subidas: number
  descartadas: number
}

export async function materializarFotosIncrustadas(
  propertyId: string,
  photos: readonly unknown[],
  subidor: SubidorDeFotos,
): Promise<ResultadoMaterializacion> {
  const salida: string[] = []
  let subidas = 0
  let descartadas = 0

  for (let i = 0; i < photos.length; i++) {
    const foto = photos[i]
    if (typeof foto !== 'string' || foto.trim() === '') { descartadas++; continue }
    if (!esFotoIncrustada(foto)) { salida.push(foto); continue }

    const parseada = parsearDataUrl(foto)
    if (!parseada) {
      console.error('[materializar-fotos] foto incrustada no soportada, se descarta', { propertyId, indice: i, inicio: foto.slice(0, 40) })
      descartadas++
      continue
    }
    const path = `properties/${propertyId}/photos/${randomUUID()}.${parseada.extension}`
    try {
      const url = await subidor.subir(path, parseada.bytes, parseada.mime)
      salida.push(url)
      subidas++
    } catch (e) {
      console.error('[materializar-fotos] falló la subida, se descarta la foto', {
        propertyId, indice: i, bytes: parseada.bytes.length, error: e instanceof Error ? e.message : String(e),
      })
      descartadas++
    }
  }
  return { photos: salida, subidas, descartadas }
}

/** Subidor real contra el bucket `property-files` (mismo path que el resto de la multimedia). */
export function subidorStorage(storage: {
  from(bucket: string): {
    upload(path: string, body: Buffer, opts: { contentType: string }): Promise<{ error: { message: string } | null }>
    getPublicUrl(path: string): { data: { publicUrl: string } }
  }
}): SubidorDeFotos {
  return {
    async subir(path, bytes, mime) {
      const bucket = storage.from('property-files')
      const { error } = await bucket.upload(path, bytes, { contentType: mime })
      if (error) throw new Error(error.message)
      return bucket.getPublicUrl(path).data.publicUrl
    },
  }
}
