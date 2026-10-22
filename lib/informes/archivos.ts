/**
 * Paths del bucket privado `property-reports` (capturas y PDF del informe). Puro y seguro para el
 * navegador. Regex EXACTA atada al id del informe: un `startsWith` sobre lo que manda el navegador
 * deja pasar recorridos de carpeta. El CHECK de `pdf_path` en la base repite la regla del PDF.
 */
import type { NombreCaptura } from './tipos'

export const BUCKET_INFORMES = 'property-reports'
export const MAX_CAPTURA_BYTES = 5 * 1024 * 1024
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const SEGUNDOS_URL_LECTURA = 3600

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const EXT = ['png', 'jpg', 'jpeg', 'webp'] as const

function extension(nombre: string): string {
  return (nombre.split('.').pop() ?? '').toLowerCase()
}

export function validarCaptura(m: { nombre: string; bytes: number }): string | null {
  if (!(EXT as readonly string[]).includes(extension(m.nombre))) return 'La captura tiene que ser PNG, JPG o WEBP'
  if (!Number.isFinite(m.bytes) || m.bytes <= 0) return 'La captura está vacía'
  if (m.bytes > MAX_CAPTURA_BYTES) return 'La captura supera los 5 MB'
  return null
}

export function pathDeCaptura(informeId: string, cual: NombreCaptura, uuid: string, nombre: string): string {
  const ext = extension(nombre) === 'jpeg' ? 'jpg' : extension(nombre)
  return `informes/${informeId}/captura-${cual}-${uuid}.${ext}`
}

export function esPathDeCaptura(path: string, informeId: string, cual: NombreCaptura): boolean {
  if (!new RegExp(`^${UUID}$`).test(informeId)) return false
  return new RegExp(`^informes/${informeId}/captura-${cual}-${UUID}\\.(png|jpg|webp)$`).test(path)
}

export function pathDelPdf(informeId: string, uuid: string): string {
  return `informes/${informeId}/informe-${uuid}.pdf`
}

export function esPathDelPdf(path: string, informeId: string): boolean {
  if (!new RegExp(`^${UUID}$`).test(informeId)) return false
  return new RegExp(`^informes/${informeId}/informe-${UUID}\\.pdf$`).test(path)
}

export function esPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && [0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => bytes[i] === b)
}

export function esImagen(bytes: Uint8Array): boolean {
  const empieza = (f: number[], desde = 0) => bytes.length >= desde + f.length && f.every((b, i) => bytes[desde + i] === b)
  return empieza([0xff, 0xd8, 0xff]) || empieza([0x89, 0x50, 0x4e, 0x47]) || (empieza([0x52, 0x49, 0x46, 0x46]) && empieza([0x57, 0x45, 0x42, 0x50], 8))
}

/** "Informe quincenal - Roque Pérez 3059 - 01-10 al 15-10.pdf" sin caracteres raros. */
export function nombreDelPdf(direccion: string, desde: string, hasta: string): string {
  const dir = direccion.normalize('NFC').replace(/[^\p{L}\p{N} .,-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Propiedad'
  const corta = (f: string) => `${f.slice(8, 10)}-${f.slice(5, 7)}`
  return `Informe quincenal - ${dir} - ${corta(desde)} al ${corta(hasta)}.pdf`
}
