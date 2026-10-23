/**
 * Direcciones de búsqueda de los portales por tipo, barrio y ambientes. Formato VERIFICADO contra los portales
 * el 2026-10-22 (Argenprop y MercadoLibre devuelven el listado con ScraperAPI a 1 crédito). Zonaprop NO: bloquea
 * sus páginas de resultados aun con el proxy premium.
 */

export function slugDeBarrio(barrio: string): string {
  return barrio.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const TIPO_ARGENPROP: Record<string, string> = {
  departamento: 'departamentos', casa: 'casas', ph: 'ph', terreno: 'terrenos', local: 'locales', oficina: 'oficinas',
}
const TIPO_MERCADOLIBRE: Record<string, string> = {
  departamento: 'departamentos', casa: 'casas', ph: 'ph', terreno: 'terrenos-lotes', local: 'locales', oficina: 'oficinas',
}

function tipoNormalizado(tipo: string | null): string {
  return (tipo ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function urlBusquedaArgenprop(f: { tipo: string | null; barrio: string | null; ambientes: number | null }): string | null {
  const tipo = TIPO_ARGENPROP[tipoNormalizado(f.tipo)]
  if (!tipo || !f.barrio?.trim()) return null
  const amb = f.ambientes && f.ambientes > 0 ? `/${f.ambientes}-ambientes` : ''
  return `https://www.argenprop.com/${tipo}/venta/${slugDeBarrio(f.barrio)}${amb}`
}

/**
 * Solo Capital: fuera de Capital la ruta de ML lleva la zona del Gran Buenos Aires y el partido, que no se pueden
 * armar de forma confiable desde el barrio de la ficha. Mejor no buscar que buscar en otro lado.
 */
export function urlBusquedaMercadoLibre(f: { tipo: string | null; barrio: string | null; ambientes: number | null; esCapital: boolean }): string | null {
  const tipo = TIPO_MERCADOLIBRE[tipoNormalizado(f.tipo)]
  if (!tipo || !f.barrio?.trim() || !f.esCapital) return null
  const amb = f.ambientes && f.ambientes > 0 ? `${f.ambientes}-ambientes/` : ''
  return `https://inmuebles.mercadolibre.com.ar/${tipo}/venta/${amb}capital-federal/${slugDeBarrio(f.barrio)}/`
}
