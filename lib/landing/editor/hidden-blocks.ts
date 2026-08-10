/**
 * E1.6 Editor — memoria de las secciones OCULTAS.
 *
 * POR QUÉ EXISTE: apagar el interruptor de una sección opcional (Galería,
 * Planos, Ubicación) la SACA del documento. El contenido que tenía —el texto de
 * zona que escribió la IA, la curación de fotos, la foto de fondo— vivía sólo en
 * un `useRef` del editor, o sea en memoria del navegador mientras el componente
 * estuviera montado. El asesor ocultaba "Ubicación", salía del editor y al
 * volver y prenderla de nuevo recibía un bloque casi vacío: el texto no estaba
 * en ningún lado y no había forma de recuperarlo salvo reescribirlo a mano.
 *
 * Acá lo guardamos en `localStorage`, la misma red de seguridad que ya usa el
 * borrador de tasaciones (`appraisal/new/page.tsx`): sobrevive a recargar, a
 * salir del editor y a cerrar la pestaña.
 *
 * LÍMITE CONOCIDO, a propósito: es por navegador. Si el asesor oculta una
 * sección en la computadora y la vuelve a mostrar desde el celular, sigue
 * cayendo al bloque por defecto — igual que antes, sin empeorar nada. El
 * arreglo de fondo (que el bloque oculto viaje DENTRO del documento, con un
 * `hidden: true`) exige tocar `lib/landing/schema.ts`.
 *
 * Nada de esto toca la landing pública: todo vive en el borrador.
 */
import { LandingBlock } from '@/lib/landing/schema'

const PREFIJO = 'landingEditorSeccionesOcultas'

function clave(propertyId: string): string {
  return `${PREFIJO}:${propertyId}`
}

/**
 * `localStorage` puede no existir (render en servidor) o tirar (Safari en modo
 * privado, cuota llena). En todos esos casos el editor tiene que seguir
 * andando: se pierde la memoria, no la pantalla.
 */
function almacen(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

function leerTodo(propertyId: string): Record<string, unknown> {
  const store = almacen()
  if (!store) return {}
  try {
    const crudo = store.getItem(clave(propertyId))
    if (!crudo) return {}
    const parsed: unknown = JSON.parse(crudo)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function escribirTodo(propertyId: string, mapa: Record<string, unknown>): void {
  const store = almacen()
  if (!store) return
  try {
    if (Object.keys(mapa).length === 0) store.removeItem(clave(propertyId))
    else store.setItem(clave(propertyId), JSON.stringify(mapa))
  } catch {
    /* cuota llena o storage bloqueado: se pierde la memoria, no el editor */
  }
}

/**
 * Devuelve el bloque que se ocultó, o null si no hay nada recordado.
 * Se valida contra el schema: una entrada vieja o corrupta se descarta en vez
 * de meter basura en el documento (que después no pasaría el Zod del autosave).
 */
export function leerBloqueOculto(propertyId: string, id: string): LandingBlock | null {
  const guardado = leerTodo(propertyId)[id]
  if (guardado === undefined) return null
  const parsed = LandingBlock.safeParse(guardado)
  if (!parsed.success) return null
  // El id tiene que seguir siendo el de la sección: si no, insertarlo rompería
  // el orden curado y podría duplicar ids.
  if (parsed.data.id !== id) return null
  return parsed.data
}

/** Recuerda el bloque tal como estaba al momento de ocultarlo. */
export function recordarBloqueOculto(propertyId: string, block: LandingBlock): void {
  const mapa = leerTodo(propertyId)
  mapa[block.id] = block
  escribirTodo(propertyId, mapa)
}

/** Se llama al volver a mostrar la sección: ya recuperó su contenido. */
export function olvidarBloqueOculto(propertyId: string, id: string): void {
  const mapa = leerTodo(propertyId)
  if (!(id in mapa)) return
  delete mapa[id]
  escribirTodo(propertyId, mapa)
}
