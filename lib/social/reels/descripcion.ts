/**
 * La descripción que acompaña al reel en Instagram.
 *
 * Módulo PURO, sin IA. Decisión del dueño (2026-09-22): se arma con los datos
 * que ya están cargados de la propiedad, no analizando el video. Era la opción
 * más simple, más barata y la que deja el texto disponible al instante — el
 * asesor lo edita antes de publicar, así que la máquina solo tiene que dar un
 * punto de partida decente, no la versión final.
 *
 * ## La regla dura: acá NUNCA va el precio
 *
 * Es el pedido explícito del dueño. No está implementado como un filtro sobre un
 * texto ya armado —eso sería frágil— sino en la FORMA DE LOS DATOS: el tipo
 * `DatosDescripcion` no tiene campo de precio. No existe ningún camino por el
 * que un precio llegue hasta acá. Si alguna vez alguien agrega ese campo, la
 * prueba de `descripcion.test.ts` lo obliga a decidirlo a conciencia.
 */
import { normalizePropertyTypeLabel, operationLabelFor } from '@/lib/properties/etiquetas'
import { separarPalabras } from './palabra-clave'

export interface DatosDescripcion {
  property_type?: string | null
  operation_type?: string | null
  neighborhood?: string | null
  rooms?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  garages?: number | null
  covered_area?: number | null
  amenities?: string[] | null
}

/** "3 ambientes", "1 dormitorio": el singular importa, se lee en el aviso. */
function cantidad(n: number | null | undefined, singular: string, plural: string): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null
  return `${n} ${n === 1 ? singular : plural}`
}

/**
 * `palabras` es la lista del reel ("parque rivadavia, doblas, info"). En el
 * texto va SOLO la primera: las demás son las variantes que la gente escribe de
 * verdad y se aceptan igual, pero pedirle cuatro palabras al público confunde.
 */
export function armarDescripcionReel(datos: DatosDescripcion, palabras: string): string {
  const palabra = separarPalabras(palabras)[0] ?? ''
  const tipo = normalizePropertyTypeLabel(datos.property_type)
  const operacion = operationLabelFor(datos.operation_type)
  const barrio = datos.neighborhood?.trim()

  // Sin barrio no se escribe "en" colgado: queda "Departamento · En venta".
  const encabezado = barrio ? `${tipo} en ${barrio}` : tipo

  const ficha = [
    cantidad(datos.rooms, 'ambiente', 'ambientes'),
    cantidad(datos.bedrooms, 'dormitorio', 'dormitorios'),
    cantidad(datos.bathrooms, 'baño', 'baños'),
    cantidad(datos.garages, 'cochera', 'cocheras'),
    typeof datos.covered_area === 'number' && datos.covered_area > 0
      ? `${datos.covered_area} m² cubiertos`
      : null,
  ].filter((x): x is string => x !== null)

  const comodidades = (datos.amenities ?? [])
    .map((a) => a?.trim())
    .filter((a): a is string => !!a)

  const llamado = palabra.trim()
    ? `📩 Comentá la palabra ${palabra.trim().toLocaleUpperCase('es-AR')} y te mando la ficha completa con todos los detalles.`
    : null

  // Cada bloque es una línea; los vacíos desaparecen en vez de dejar el hueco.
  return [
    `${encabezado} · ${operacion}`,
    ficha.length > 0 ? ficha.join(' · ') : null,
    comodidades.length > 0 ? comodidades.join(' · ') : null,
    llamado,
  ]
    .filter((x): x is string => x !== null)
    .join('\n\n')
    .trim()
}
