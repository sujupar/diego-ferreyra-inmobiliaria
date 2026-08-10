import { isCollapsible, type NavGroup, type NavItem } from './sections'

/**
 * Los destinos de la barra inferior del celular.
 *
 * POR QUÉ EXISTE LA BARRA (y por qué no reemplaza al menú): en el teléfono la
 * ÚNICA puerta a la navegación es el botón de arriba a la izquierda, que es el
 * punto más incómodo de alcanzar con una mano — hay que recolocar el teléfono
 * para llegar. La barra pone lo que se usa todo el día donde llega el pulgar sin
 * moverse. Pero cuatro accesos no pueden representar 39 pantallas: por eso el
 * último lugar de la barra es "Menú" y abre EL MISMO panel de siempre. La barra
 * no saca nada; agrega un camino corto para lo frecuente y un camino cómodo
 * para todo lo demás.
 *
 * ESTA LISTA NO SE ESCRIBE A MANO: sale del menú del rol. Un rol que no puede
 * entrar a una pantalla nunca la ve en la barra, y si mañana se le saca una
 * sección a un rol, desaparece de los dos lugares a la vez. Una barra con su
 * propia lista de rutas se desincroniza el día que alguien toca los permisos, y
 * el síntoma sería un botón que lleva a "no tenés permiso".
 */

/**
 * El orden en que se prefieren los destinos, por lo que hace un asesor en un
 * día: mira qué le toca, contesta, y mueve el embudo. Se toman los primeros
 * `MAXIMO_DESTINOS` que el rol efectivamente tenga.
 *
 * No es un ranking de importancia sino de FRECUENCIA con el teléfono en la
 * mano: `/appraisal/new` es importantísimo y no está, porque nadie carga una
 * tasación entera parado en la vereda.
 */
export const PREFERENCIA_DE_DESTINOS = [
  '/inicio',
  '/tasks',
  '/inbox',
  '/crm',
  '/visits',
  '/properties/review',
  '/properties',
  '/contacts',
] as const

/**
 * Cuatro y no cinco: el quinto lugar de la barra es "Menú", y con seis celdas
 * en 390px cada una queda por debajo del ancho cómodo para el pulgar.
 */
export const MAXIMO_DESTINOS = 4

/** Todos los ítems del menú de un rol, aplanados (los de los desplegables también). */
function itemsPlanos(groups: NavGroup[]): NavItem[] {
  const out: NavItem[] = []
  for (const g of groups) {
    for (const e of g.entries) {
      if (isCollapsible(e)) out.push(...e.items)
      else out.push(e)
    }
  }
  return out
}

/**
 * Los destinos de la barra para ESTE menú, en el orden de la preferencia (no en
 * el orden del menú): la barra tiene que verse igual siempre, y el orden del
 * menú cambia de un rol a otro.
 */
export function itemsBarraInferior(groups: NavGroup[]): NavItem[] {
  const disponibles = itemsPlanos(groups)
  const elegidos: NavItem[] = []
  for (const href of PREFERENCIA_DE_DESTINOS) {
    if (elegidos.length >= MAXIMO_DESTINOS) break
    const item = disponibles.find(i => i.href === href)
    if (item) elegidos.push(item)
  }
  return elegidos
}

/**
 * Cuál de los destinos de la barra está activo para `pathname`.
 *
 * Gana la coincidencia más larga, igual que en el menú lateral: en
 * `/properties/review`, tanto `/properties` como `/properties/review` matchean
 * por prefijo y sin comparar entre ellos quedarían los dos encendidos.
 */
export function destinoActivo(items: NavItem[], pathname: string): string | null {
  let mejor: { href: string; largo: number } | null = null
  for (const { href } of items) {
    const exacto = pathname === href
    const prefijo = pathname.startsWith(href + '/')
    if (!exacto && !prefijo) continue
    const largo = exacto ? Number.MAX_SAFE_INTEGER : href.length
    if (!mejor || largo > mejor.largo) mejor = { href, largo }
  }
  return mejor ? mejor.href : null
}
