/**
 * Las plantillas del primer WhatsApp con video (D1 y D3). Puro.
 *
 * Cuál sale lo decide `WHATSAPP_TEMPLATE_TASACION` en Netlify. La regla es usar la del caso
 * si Meta la aprobó como UTILITY, si no la sobria, y si ninguna quedó como UTILITY seguir con
 * `tasacion_llamada_v1`. Las dos están también en `PLANTILLAS_QUE_SOLO_AVISAN`
 * (lib/ai/tasacion-agent.ts): no preguntan nada, así que el agente de tasación no contesta.
 */

export const PLANTILLAS_CON_VIDEO = ['tasacion_video_caso_v1', 'tasacion_video_sobria_v1'] as const

/** La plantilla de siempre: la vuelta atrás cuando el video no se puede mandar. */
export const PLANTILLA_SIN_VIDEO = 'tasacion_llamada_v1'

export function esPlantillaConVideo(nombre: string | null | undefined): boolean {
  return !!nombre && (PLANTILLAS_CON_VIDEO as readonly string[]).includes(nombre)
}

export interface ParametrosDelEnvio {
  bodyParams: string[]
  urlButtonParam: string
}

/** `{{1}}` nombre y `{{2}}` URL completa en el cuerpo; el botón lleva solo el código. */
export function parametrosDelEnvio(plantilla: string, nombre: string, url: string, codigo: string): ParametrosDelEnvio | null {
  if (!esPlantillaConVideo(plantilla)) return null
  return { bodyParams: [nombre, url], urlButtonParam: codigo }
}

function numero(codigo: string | number | null | undefined): number | null {
  if (codigo === null || codigo === undefined) return null
  const n = typeof codigo === 'number' ? codigo : Number.parseInt(codigo, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Errores que Meta devuelve EN EL ENVÍO cuando la plantilla misma no sirve (132xxx: pausada
 * 132015, deshabilitada 132016, no existe 132001, parámetros 132000/132012). Ante estos se
 * manda la plantilla sin video en el mismo intento.
 *
 * NO incluye los límites de volumen (131048, 131056, 130429, 80007), que siguen reintentando,
 * ni los frenos de marketing (131049, 131050): esos Meta los avisa minutos después por el
 * webhook de estados, nunca en el envío (ver respaldo.ts).
 */
export function esRechazoDePlantilla(codigo: string | number | null | undefined): boolean {
  const n = numero(codigo)
  return n !== null && n >= 132000 && n <= 132999
}

/** 132000 y 132012 son errores NUESTROS (cantidad o formato de parámetros): la vuelta atrás los
 *  esconde, así que se registran como error y no como aviso. */
export function esErrorDeParametros(codigo: string | number | null | undefined): boolean {
  const n = numero(codigo)
  return n === 132000 || n === 132012
}
