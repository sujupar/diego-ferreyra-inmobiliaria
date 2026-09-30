/**
 * Qué se manda solo a los portales cuando cambia la ficha. Puro.
 * Solo precio, fotos y expensas (decisión del dueño 2026-09-26): título y
 * descripción los escriben también los asistentes de publicación, y
 * reenviarlos hacía que publicar en Argenprop le cambiara el título a ML.
 */
import { fotosPublicables } from './fotos-publicables'
import type { CambiosMl } from './mercadolibre/edicion'
import type { CambiosAp } from './argenprop/edicion'

export type CampoFicha = 'precio' | 'fotos' | 'expensas'
const CONOCIDOS: readonly CampoFicha[] = ['precio', 'fotos', 'expensas']
type Ficha = { asking_price: number; photos: unknown[] | null; expensas: number | null }

export function leerCambiosFicha(metadata: unknown): CampoFicha[] {
  const raw = (metadata as { cambios_ficha?: unknown } | null)?.cambios_ficha
  if (!Array.isArray(raw)) return []
  return CONOCIDOS.filter(c => raw.includes(c))
}

export function cambiosMlDesdeFicha(campos: CampoFicha[], p: Ficha): CambiosMl {
  const out: CambiosMl = { valores: {} }
  if (campos.includes('precio')) out.precio = p.asking_price
  if (campos.includes('fotos')) out.fotos = fotosPublicables(p.photos).validas
  if (campos.includes('expensas')) out.valores.MAINTENANCE_FEE = p.expensas ? { value_name: `${p.expensas} ARS` } : null
  return out
}

export function cambiosApDesdeFicha(campos: CampoFicha[], p: Ficha): CambiosAp {
  const out: CambiosAp = { valores: {} }
  if (campos.includes('precio')) out.precio = p.asking_price
  if (campos.includes('fotos')) out.fotos = fotosPublicables(p.photos).validas
  if (campos.includes('expensas')) out.valores.EXPENSAS = p.expensas ? { value_name: String(p.expensas) } : null
  return out
}
