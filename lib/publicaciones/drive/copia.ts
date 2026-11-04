/**
 * Copia de un video de Drive a nuestro almacenamiento, de a partes, sin pasarse
 * del tiempo de una función de Netlify.
 *
 * Cada llamada copia las partes que entran en su presupuesto y devuelve; la
 * siguiente sigue desde donde quedó. "Donde quedó" se le PREGUNTA al
 * almacenamiento (la subida reanudable de Supabase lo sabe), no se lee de
 * nuestra base: si la función murió después de subir una parte y antes de
 * anotarlo, nuestra cuenta estaría atrasada y se subiría dos veces lo mismo.
 */

/** Supabase exige partes de exactamente 6 MB (salvo la última) en la subida reanudable. */
export const PARTE = 6 * 1024 * 1024
/** Con menos que esto por delante, no se empieza otra parte: bajarla y subirla tarda ~1-3 s. */
const MIN_RESTANTE_MS = 3_000
const TECHO_DESCARGA_MS = 8_000

export interface DepsCopia {
  ahora(): number
  crearSubida(total: number): Promise<string>
  /** Cuántos bytes tiene ya la subida; `null` si venció o no existe. */
  offsetDeSubida(url: string): Promise<number | null>
  descargar(desde: number, hasta: number, techoMs: number): Promise<Uint8Array<ArrayBuffer>>
  /** Devuelve el nuevo offset que confirma el almacenamiento. */
  subirParte(url: string, offset: number, bytes: Uint8Array<ArrayBuffer>): Promise<number>
}

export interface EstadoCopia {
  total: number
  subidaUrl: string | null
}

export interface AvanceCopia {
  subidaUrl: string
  copiado: number
  terminado: boolean
}

export async function avanzarCopia(estado: EstadoCopia, deps: DepsCopia, presupuestoMs: number): Promise<AvanceCopia> {
  const inicio = deps.ahora()
  let url = estado.subidaUrl
  let offset: number | null = url ? await deps.offsetDeSubida(url) : null
  if (url === null || offset === null) {
    url = await deps.crearSubida(estado.total)
    offset = 0
  }
  if (offset > estado.total) throw new Error('El almacenamiento tiene más bytes que el video de Drive')

  let partes = 0
  while (offset < estado.total) {
    const restante = presupuestoMs - (deps.ahora() - inicio)
    // Al menos una parte por llamada: si no, un presupuesto chico no avanzaría nunca.
    if (partes > 0 && restante < MIN_RESTANTE_MS) break
    const hasta: number = Math.min(offset + PARTE, estado.total) - 1
    const bytes = await deps.descargar(offset, hasta, Math.min(TECHO_DESCARGA_MS, Math.max(MIN_RESTANTE_MS, restante)))
    if (bytes.length !== hasta - offset + 1) throw new Error('Drive devolvió una parte incompleta del video')
    const nuevo = await deps.subirParte(url, offset, bytes)
    if (nuevo !== offset + bytes.length) throw new Error('El almacenamiento no confirmó la parte subida')
    offset = nuevo
    partes++
  }
  return { subidaUrl: url, copiado: offset, terminado: offset >= estado.total }
}
