/**
 * Qué le falta a una propiedad para que valga la pena generar su descripción.
 *
 * El método de Diego escribe a partir de lo que VE en las fotos y de los datos
 * cargados. Con dos fotos o sin superficie, el resultado vuelve a ser el texto
 * genérico que se quiso dejar atrás (ver el spec 2026-09-19). Por eso el botón
 * se deshabilita y dice exactamente qué falta, en vez de generar igual.
 */
export const MIN_FOTOS = 5

export interface DatosRequisitos {
  photos?: string[] | null
  property_type?: string | null
  address?: string | null
  neighborhood?: string | null
  rooms?: number | null
  covered_area?: number | null
  asking_price?: number | null
}

const tieneTexto = (v: string | null | undefined) => typeof v === 'string' && v.trim() !== ''
const esPositivo = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v) && v > 0

export function faltanParaGenerar(p: DatosRequisitos): string[] {
  const faltan: string[] = []
  const cantidad = Array.isArray(p.photos) ? p.photos.length : 0
  if (cantidad < MIN_FOTOS) faltan.push(`fotos (tiene ${cantidad}, mínimo ${MIN_FOTOS})`)
  if (!tieneTexto(p.property_type)) faltan.push('tipo de propiedad')
  if (!tieneTexto(p.address)) faltan.push('dirección')
  if (!tieneTexto(p.neighborhood)) faltan.push('barrio')
  if (!esPositivo(p.rooms)) faltan.push('ambientes')
  if (!esPositivo(p.covered_area)) faltan.push('superficie cubierta')
  if (!esPositivo(p.asking_price)) faltan.push('precio')
  return faltan
}
