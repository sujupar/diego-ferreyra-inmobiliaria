/**
 * Errores de portales en castellano, para la asistente.
 *
 * POR QUÉ (2026-09-14, en vivo): MercadoLibre devolvió "error 413" a secas y
 * Argenprop un JSON con un base64 de 4 MB adentro. Ninguno de los dos decía
 * qué corregir. Este módulo es puro y lo comparten los dos clientes de portal:
 * lo que ve una persona sale de acá; el detalle crudo se guarda aparte,
 * recortado, para diagnosticar.
 */

export type PortalLegible = 'MercadoLibre' | 'Argenprop'

/** Más que esto no entra en `last_error`: un base64 entero no sirve para diagnosticar nada. */
export const LARGO_MAXIMO_DETALLE = 1500

const ETIQUETA_INCRUSTADA = '(imagen incrustada)'

/** Reemplaza cada `data:...;base64,...` por una etiqueta corta. */
export function ocultarImagenesIncrustadas(texto: string): string {
  return texto.replace(/data:[a-z0-9.+/-]+;base64,[A-Za-z0-9+/=]+/gi, ETIQUETA_INCRUSTADA)
}

/** Detalle técnico apto para guardar: sin base64 y con un largo máximo. */
export function recortarDetalle(crudo: string): string {
  const limpio = ocultarImagenesIncrustadas(crudo)
  if (limpio.length <= LARGO_MAXIMO_DETALLE) return limpio
  return `${limpio.slice(0, LARGO_MAXIMO_DETALLE)}… [recortado, ${limpio.length} caracteres]`
}

/**
 * Mensaje por código HTTP, cuando el cuerpo no trae nada más útil (una página
 * HTML del gateway, por ejemplo). El 413 lleva la pista concreta porque la
 * única vez que pasó fue por una foto guardada como base64.
 */
export function explicarErrorHttp(portal: PortalLegible, status: number): string {
  if (status === 401 || status === 403) {
    return `${portal} rechazó las credenciales. Hay que volver a conectar la cuenta.`
  }
  if (status === 413) {
    return (
      `El aviso es demasiado pesado para ${portal}. Suele pasar cuando una foto quedó guardada ` +
      'como imagen incrustada en vez de archivo: volvé a subir las fotos desde Multimedia.'
    )
  }
  if (status === 429) {
    return `${portal} está limitando la cantidad de pedidos. Reintentá en unos minutos.`
  }
  if (status >= 500) {
    return `${portal} tuvo un problema de su lado. Reintentá en unos minutos.`
  }
  return `${portal} rechazó el aviso (error ${status}).`
}

/** Campo de la API de Argenprop → cómo lo nombra la asistente. */
const CAMPOS_ARGENPROP: { patron: RegExp; nombre: string }[] = [
  { patron: /^Multimedia/i, nombre: 'Una de las fotos o videos no tiene un enlace válido' },
  { patron: /^Titulo/i, nombre: 'El título del aviso' },
  { patron: /^Descripcion/i, nombre: 'La descripción del aviso' },
  { patron: /^Precio/i, nombre: 'El precio del aviso' },
  { patron: /^Localizacion|^Ubicacion/i, nombre: 'La ubicación de la propiedad' },
  { patron: /^Caracteristicas/i, nombre: 'Un campo de características' },
  { patron: /^Categoria/i, nombre: 'El tipo o subtipo de propiedad' },
  { patron: /^Codigo/i, nombre: 'El código del aviso' },
  { patron: /^IdAnunciante/i, nombre: 'La cuenta anunciante' },
]

const LARGO_MAXIMO_VALOR = 80

function limpiarValor(valor: unknown): string {
  const texto = ocultarImagenesIncrustadas(typeof valor === 'string' ? valor : JSON.stringify(valor ?? ''))
  return texto.length > LARGO_MAXIMO_VALOR ? `${texto.slice(0, LARGO_MAXIMO_VALOR)}…` : texto
}

interface CuerpoArgenprop {
  ErrorCode?: string
  Detail?: string
  Title?: string
  Errors?: Record<string, unknown> | unknown[]
}

/**
 * Traduce la respuesta de error de Argenprop (`{ErrorCode, Detail, Errors}`).
 * `Errors` puede venir como objeto por campo o como lista de frases.
 */
export function explicarErrorArgenprop(status: number, cuerpo: string): string {
  let json: CuerpoArgenprop | null = null
  try { json = cuerpo ? (JSON.parse(cuerpo) as CuerpoArgenprop) : null } catch { json = null }

  if (!json || typeof json !== 'object') return explicarErrorHttp('Argenprop', status)
  if (status === 401 || status === 403 || status === 429 || status >= 500) {
    return explicarErrorHttp('Argenprop', status)
  }

  const frases: string[] = []
  if (Array.isArray(json.Errors)) {
    for (const e of json.Errors) frases.push(limpiarValor(e))
  } else if (json.Errors && typeof json.Errors === 'object') {
    for (const [campo, valor] of Object.entries(json.Errors)) {
      const conocido = CAMPOS_ARGENPROP.find(c => c.patron.test(campo))
      const detalle = limpiarValor(valor)
      frases.push(conocido ? `${conocido.nombre} (${campo}: ${detalle})` : `${campo}: ${detalle}`)
    }
  }
  if (frases.length > 0) return `Argenprop rechazó el aviso. ${[...new Set(frases)].join('. ')}.`

  const detalle = typeof json.Detail === 'string' ? json.Detail : typeof json.Title === 'string' ? json.Title : ''
  if (detalle.trim()) return `Argenprop rechazó el aviso: ${limpiarValor(detalle)}`
  return explicarErrorHttp('Argenprop', status)
}
