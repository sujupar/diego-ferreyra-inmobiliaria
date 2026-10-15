/**
 * Reglas del regalo de la encuesta (adenda §11.2): un PDF por propiedad, con título y portada
 * opcional, en el bucket PRIVADO `visit-survey-gifts`. Puro y seguro para el navegador (lo usa la
 * pantalla para validar antes de subir y la ruta para revalidar).
 *
 * Los paths se validan con regex EXACTA atada al property_id: un `startsWith` sobre texto que manda
 * el navegador deja pasar "properties/<id>/regalo-x.pdf/../../otra-cosa". La base tiene el mismo
 * CHECK (property_survey_gifts_file_path_check): se tocan juntos.
 */
export const BUCKET_REGALOS = 'visit-survey-gifts'
export const MAX_REGALO_BYTES = 20 * 1024 * 1024
export const MAX_PORTADA_BYTES = 5 * 1024 * 1024
export const EXTENSIONES_PORTADA = ['jpg', 'jpeg', 'png', 'webp'] as const
/** La descarga de la persona: corta, se pide de nuevo cada vez que toca el botón. */
export const SEGUNDOS_URL_DESCARGA = 600
/** Meta descarga el PDF del encabezado cuando procesa el mensaje: le damos una hora. */
export const SEGUNDOS_URL_WHATSAPP = 3600
export const SEGUNDOS_URL_PORTADA = 3600

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID_RE = new RegExp(`^${UUID}$`)

export interface MetaArchivo { nombre: string; bytes: number }

function extension(nombre: string): string {
  return (nombre.split('.').pop() ?? '').toLowerCase()
}

export function validarArchivoRegalo(m: MetaArchivo): string | null {
  if (extension(m.nombre) !== 'pdf') return 'El regalo tiene que ser un PDF'
  if (!Number.isFinite(m.bytes) || m.bytes <= 0) return 'El archivo está vacío'
  if (m.bytes > MAX_REGALO_BYTES) return 'El PDF supera los 20 MB'
  return null
}

export function validarPortada(m: MetaArchivo): string | null {
  if (!(EXTENSIONES_PORTADA as readonly string[]).includes(extension(m.nombre))) return 'La portada tiene que ser JPG, PNG o WEBP'
  if (!Number.isFinite(m.bytes) || m.bytes <= 0) return 'La portada está vacía'
  if (m.bytes > MAX_PORTADA_BYTES) return 'La portada supera los 5 MB'
  return null
}

export function pathDelRegalo(propertyId: string, uuid: string): string {
  return `properties/${propertyId}/regalo-${uuid}.pdf`
}

export function pathDePortada(propertyId: string, uuid: string, nombreArchivo: string): string {
  const ext = extension(nombreArchivo) === 'jpeg' ? 'jpg' : extension(nombreArchivo)
  return `properties/${propertyId}/portada-${uuid}.${ext}`
}

export function esPathDelRegalo(path: string, propertyId: string): boolean {
  if (!UUID_RE.test(propertyId)) return false
  return new RegExp(`^properties/${propertyId}/regalo-${UUID}\\.pdf$`).test(path)
}

export function esPathDePortada(path: string, propertyId: string): boolean {
  if (!UUID_RE.test(propertyId)) return false
  return new RegExp(`^properties/${propertyId}/portada-${UUID}\\.(jpg|png|webp)$`).test(path)
}

/** El nombre con que se baja el archivo: sin rutas, comillas ni caracteres raros; siempre .pdf. */
export function nombreDeDescarga(nombre: string): string {
  const base = nombre.normalize('NFC').replace(/\.pdf$/i, '').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\.{2,}/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)
  return `${base || 'regalo'}.pdf`
}

export function validarTitulo(t: unknown): { ok: true; titulo: string } | { ok: false; error: string } {
  const error = 'El título tiene que tener entre 3 y 120 caracteres'
  if (typeof t !== 'string') return { ok: false, error }
  let limpio = ''
  for (const ch of t.normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 0
    limpio += c < 32 || c === 127 ? ' ' : ch
  }
  const titulo = limpio.replace(/\s+/g, ' ').trim()
  if (titulo.length < 3 || titulo.length > 120) return { ok: false, error }
  return { ok: true, titulo }
}

/** Lo que la ruta de la ficha devuelve del regalo (con URLs firmadas de vida corta). */
export interface RegaloVista {
  titulo: string
  archivoNombre: string
  archivoBytes: number
  archivoPath: string
  portadaPath: string | null
  portadaUrl: string | null
  descargaUrl: string | null
}
