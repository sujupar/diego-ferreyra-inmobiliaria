// De qué sección es la pantalla para el menú y la barra superior (crm-cartera-por-rol,
// design.md D11). Puro. Hoy `lib/nav` decide solo por el camino, así una ficha de contacto
// (`/contacts/<id>`) siempre es "Contactos". Abierta desde una fila del CRM, la ficha es
// parte del CRM: la barra dice "CRM" y el menú lo marca, igual que el "‹ Volver al CRM".
import { enlaceVolver } from '@/lib/crm/cartera-url'

// Una ficha: un solo segmento después de /contacts que no es el alta de contacto.
const RE_FICHA = /^\/contacts\/(?!new$)[^/]+$/

/**
 * El camino con el que el menú y la barra superior resuelven la sección. En una ficha con
 * un `volver` válido (la misma validación del enlace, `enlaceVolver`: si no, cualquiera
 * podría marcar otra sección desde la dirección) es el de la lista de origen; en cualquier
 * otro caso, el camino tal cual (nada cambia).
 */
export function seccionDeOrigen(pathname: string, volver: string | null): string {
  if (!RE_FICHA.test(pathname)) return pathname
  const v = enlaceVolver(volver)
  if (!v) return pathname
  return v.seccion === 'crm' ? '/crm' : '/contacts'
}
