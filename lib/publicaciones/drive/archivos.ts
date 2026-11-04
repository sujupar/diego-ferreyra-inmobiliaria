/**
 * Un archivo de Drive tal como lo muestra la lista para elegir: con el motivo
 * en castellano si no se puede traer. Mismas reglas que la subida desde la
 * computadora (MP4/MOV hasta 200 MB) porque después recorren el mismo camino.
 */
import { TAMANO_MAXIMO } from '../validacion'

export interface ArchivoCrudoDrive {
  id: string
  name?: string
  mimeType?: string
  size?: string
  resourceKey?: string
}

export interface ArchivoDrive {
  id: string
  /** Solo en archivos de enlaces viejos: sin ella, Drive no deja verlo ni bajarlo. Cada archivo tiene la suya. */
  resourceKey?: string
  nombre: string
  tamano: number
  tipo: 'video/mp4' | 'video/quicktime' | null
  apto: boolean
  motivo: string | null
}

const TIPOS: Record<string, 'video/mp4' | 'video/quicktime'> = {
  'video/mp4': 'video/mp4',
  'video/quicktime': 'video/quicktime',
}

export function clasificarArchivo(a: ArchivoCrudoDrive): ArchivoDrive {
  const nombre = (a.name ?? '').normalize('NFC').trim().slice(0, 255) || 'video-de-drive.mp4'
  const tipo = TIPOS[a.mimeType ?? ''] ?? null
  const tamano = a.size === undefined ? NaN : Number(a.size)
  let motivo: string | null = null
  if (!tipo) motivo = 'Formato no compatible (solo MP4 o MOV)'
  else if (!Number.isFinite(tamano)) motivo = 'Drive no informa su tamaño'
  else if (tamano <= 0) motivo = 'El archivo está vacío'
  else if (tamano > TAMANO_MAXIMO) motivo = 'Pesa más de 200 MB'
  const base = { id: a.id, nombre, tamano: Number.isFinite(tamano) ? tamano : 0, tipo, apto: motivo === null, motivo }
  return a.resourceKey && /^[A-Za-z0-9_-]{1,100}$/.test(a.resourceKey) ? { ...base, resourceKey: a.resourceKey } : base
}
