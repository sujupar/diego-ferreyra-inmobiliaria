/**
 * Búsqueda de propiedades para conectar un video. Módulo PURO.
 *
 * Lo que escribe la persona va a un `ilike`: sin escapar, un "%" o un "_"
 * serían comodines y la lista mostraría propiedades que no se buscaron.
 */
const MAX = 80

export function patronDeBusqueda(texto: string): string | null {
  const limpio = texto.normalize('NFC').trim().slice(0, MAX)
  if (limpio.length < 2) return null
  return `%${limpio.replace(/[%_\\]/g, '\\$&')}%`
}

export interface PropiedadParaConectar {
  id: string
  direccion: string
  barrio: string | null
  /** Sin landing publicada el privado no tiene adónde llevar: la automatización queda apagada. */
  landingPublicada: boolean
  /** El enlace público de la landing (para mostrar el privado tal como va a salir). */
  landingSlug: string | null
}
