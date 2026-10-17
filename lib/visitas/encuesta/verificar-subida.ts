import 'server-only'
/**
 * Verifica contra Storage lo que el navegador DICE que subió (PDF del regalo y portada opcional),
 * antes de guardarlo en la base. Lo comparten el regalo de una propiedad y el regalo general: las
 * dos rutas tienen que validar EXACTAMENTE igual.
 *
 * La verdad la tiene Storage, nunca el navegador (ronda 1 de revisión, 2026-10-15): tamaño y tipo
 * reales; y como el tipo que guarda Storage es el Content-Type que mandó el navegador, además se
 * mira la firma de los primeros bytes (ronda 2, 2026-10-16). Lo que no pasa se BORRA de Storage.
 * Sin bytes = Storage no respondió, no "archivo inválido": NO se borra un PDF que puede estar bien.
 */
import * as datos from './datos'
import { esImagenValida, esPdf, validarArchivoRegaloSubido, validarPortadaSubida } from './regalo'

export type VerificacionSubida =
  | { ok: true; bytesReales: number }
  | { ok: false; status: 400 | 503; error: string }

const NO_SE_PUDO_LEER = 'No se pudo revisar el archivo. Probá de nuevo en un momento.'

export async function verificarArchivosSubidos(archivoPath: string, portadaPath: string | null): Promise<VerificacionSubida> {
  const infoReal = await datos.infoArchivo(archivoPath)
  const errReal = validarArchivoRegaloSubido(infoReal)
  if (errReal || !infoReal) {
    await datos.borrarArchivos([archivoPath])
    return { ok: false, status: 400, error: errReal ?? 'El archivo no terminó de subir. Probá de nuevo.' }
  }
  const bytesArchivo = await datos.primerosBytes(archivoPath, 16)
  if (!bytesArchivo) return { ok: false, status: 503, error: NO_SE_PUDO_LEER }
  if (!esPdf(bytesArchivo)) {
    await datos.borrarArchivos([archivoPath])
    return { ok: false, status: 400, error: 'El archivo no es un PDF válido.' }
  }
  if (portadaPath !== null) {
    const errPortadaReal = validarPortadaSubida(await datos.infoArchivo(portadaPath))
    if (errPortadaReal) {
      await datos.borrarArchivos([portadaPath])
      return { ok: false, status: 400, error: errPortadaReal }
    }
    const bytesPortada = await datos.primerosBytes(portadaPath, 16)
    if (!bytesPortada) return { ok: false, status: 503, error: NO_SE_PUDO_LEER }
    if (!esImagenValida(bytesPortada)) {
      await datos.borrarArchivos([portadaPath])
      return { ok: false, status: 400, error: 'La portada no es una imagen válida.' }
    }
  }
  return { ok: true, bytesReales: infoReal.bytes }
}
