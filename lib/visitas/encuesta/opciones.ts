/**
 * Opciones de "¿qué te gustó más / menos?" armadas con lo que tiene ESA propiedad (spec §4.8).
 * Sin IA: reglas fijas sobre amenities, cochera, piso, tipo y expensas. Puro y seguro para el
 * navegador. Las claves son globales (el email y la ficha las traducen con ETIQUETA_DE_OPCION).
 */
export interface OpcionEncuesta { clave: string; etiqueta: string }
export interface OpcionesDeLaEncuesta { masGusto: OpcionEncuesta[]; menosGusto: OpcionEncuesta[] }
export interface PropiedadParaOpciones {
  property_type: string | null
  amenities: unknown
  garages: number | null
  floor: number | null
  expensas: number | null
}

export const OTRA = 'otra'
export const NADA = 'nada'
export const MAX_OPCIONES = 8
/** Desde este piso la vista es un argumento de venta. */
const PISO_CON_VISTA = 6

export const ETIQUETA_DE_OPCION: Readonly<Record<string, string>> = {
  ubicacion: 'La ubicación', luz: 'La luz', distribucion: 'La distribución', estado: 'El estado',
  tamano: 'El tamaño', patio_jardin: 'El patio o jardín', balcon_terraza: 'El balcón o terraza',
  cochera: 'La cochera', vista: 'La vista', amenities: 'Los amenities', precio: 'El precio',
  ruido: 'El ruido', expensas: 'Las expensas', nada: 'Nada en especial', otra: 'Otra cosa',
}

export function etiquetaDeOpcion(clave: string): string {
  return ETIQUETA_DE_OPCION[clave] ?? clave
}

/** Sin tildes y en minúsculas: "Balcón" (NFD, como lo pega macOS) tiene que dar "balcon". */
function plano(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function amenitiesPlanos(a: unknown): string[] {
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string').map(plano) : []
}

const ESPACIOS_PROPIOS = /patio|jardin|parque|balcon|terraza|cochera|garage/

export function opcionesDeLaEncuesta(p: PropiedadParaOpciones): OpcionesDeLaEncuesta {
  const ams = amenitiesPlanos(p.amenities)
  const tiene = (re: RegExp) => ams.some(a => re.test(a))
  const tipo = plano(p.property_type ?? '')
  // Orden de prioridad de los extras: si no entran todos (tope de 8), quedan los primeros.
  const extras: string[] = []
  if (tiene(/patio|jardin|parque/) || tipo === 'casa') extras.push('patio_jardin')
  if (tiene(/balcon|terraza/)) extras.push('balcon_terraza')
  if ((p.garages ?? 0) > 0 || tiene(/cochera|garage/)) extras.push('cochera')
  if ((p.floor ?? 0) >= PISO_CON_VISTA) extras.push('vista')
  if (ams.some(a => !ESPACIOS_PROPIOS.test(a))) extras.push('amenities')
  const mas = ['ubicacion', 'luz', 'distribucion', 'estado', 'tamano', ...extras].slice(0, MAX_OPCIONES - 1)
  const menos = ['precio', 'tamano', 'estado', 'ruido', ...((p.expensas ?? 0) > 0 ? ['expensas'] : []), NADA]
  const aOpcion = (clave: string): OpcionEncuesta => ({ clave, etiqueta: etiquetaDeOpcion(clave) })
  return { masGusto: [...mas, OTRA].map(aOpcion), menosGusto: [...menos, OTRA].map(aOpcion) }
}
