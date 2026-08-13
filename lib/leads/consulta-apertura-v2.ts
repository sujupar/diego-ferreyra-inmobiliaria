/**
 * Apertura v2 — el primer mensaje de una consulta de portal.
 *
 * QUÉ CAMBIA CONTRA LA v1 (pedido del dueño, 2026-08-12):
 *
 * 1. Es corto. Dos frases, no seis líneas.
 * 2. NO adjunta nada. Ni plano ni video: el video se OFRECE y se manda en el
 *    mensaje siguiente si la persona dice que sí. Mandarlo de entrada es pesado
 *    y no lo pidió nadie. (El plano además nunca se usó: cero propiedades lo
 *    tienen cargado.)
 * 3. Lleva el ENLACE DEL AVISO, el que viene en el mail del portal.
 * 4. Pregunta por el video en el mismo mensaje, con botones de respuesta rápida.
 *
 * POR QUÉ DOS PLANTILLAS Y NO UNA CON EL ENLACE OPCIONAL:
 * Meta rechaza el envío ENTERO si un parámetro va vacío. Y el enlace no siempre
 * está: medido sobre las 233 consultas reales, Argenprop lo manda en 38 de 40
 * (95%) y **ZonaProp en 0 de 193**. Como ZonaProp es el 83% del volumen, la
 * variante sin enlace no es un caso de borde: es el caso normal.
 *
 * POR QUÉ BOTONES Y NO "respondé este mensaje":
 * al tocar un botón ENTRA un mensaje del cliente. Eso hace tres cosas de una:
 * abre la ventana de 24hs, deja la intención registrada en el chat, y le da al
 * agente el pie exacto para seguir. Un texto que pide responder no genera nada
 * si la persona no escribe. Mismo patrón ya aprobado en `recorrido_acceso_v3/v4`.
 *
 * Los cuerpos de abajo son un ESPEJO de lo aprobado en Meta. El texto que lee la
 * persona es el de la plantilla registrada; acá solo viajan los parámetros. Esto
 * existe para guardar el mensaje en el chat tal como se lee y para que el agente
 * sepa qué dijo. Si divergen, el chat miente y el agente se repite.
 */

/** Las cuatro plantillas v2 registradas en Meta (creadas 2026-08-12). */
export const PLANTILLAS_V2 = {
  conEnlace: 'consulta_v2',
  conEnlaceUtil: 'consulta_v2_util',
  sinEnlace: 'consulta_sin_enlace_v2',
  sinEnlaceUtil: 'consulta_sin_enlace_v2_util',
} as const

/** {{1}} nombre de pila · {{2}} propiedad · {{3}} enlace del aviso */
export const CUERPO_V2_CON_ENLACE = `Hola {{1}}, soy del equipo de Diego Ferreyra Inmobiliaria. Te paso el aviso de {{2}}: {{3}}

¿Te mando el video de la propiedad?`

/** {{1}} nombre de pila · {{2}} propiedad */
export const CUERPO_V2_SIN_ENLACE = `Hola {{1}}, soy del equipo de Diego Ferreyra Inmobiliaria, por tu consulta sobre {{2}}.

¿Te mando el video de la propiedad?`

export const CUERPO_V2_CON_ENLACE_UTIL = `Hola {{1}}. Recibimos tu consulta por {{2}}. Acá está el aviso: {{3}}

¿Querés que te mandemos el video de la propiedad?`

export const CUERPO_V2_SIN_ENLACE_UTIL = `Hola {{1}}. Recibimos tu consulta por {{2}}.

¿Querés que te mandemos el video de la propiedad?`

export interface AperturaV2 {
  /** Marketing primero; la de trámite es la red si Meta no entrega la cálida. */
  plantilla: string
  plantillaUtil: string
  cuerpo: string
  cuerpoUtil: string
  /** En orden, para `bodyParams`. */
  params: string[]
  /** Qué queda para ofrecer después. El agente lo usa para saber qué tiene. */
  pendiente: Array<'video' | 'fotos'>
}

/**
 * Un enlace sirve solo si es http(s) y no está vacío. Un `null`, un espacio o un
 * `javascript:` no son enlaces — y un parámetro vacío hace que Meta rechace el
 * envío ENTERO, no que mande el mensaje sin esa parte.
 */
export function enlaceUtilizable(v: string | null | undefined): string | null {
  const s = (v ?? '').trim()
  if (!s) return null
  return /^https?:\/\/\S+$/i.test(s) ? s : null
}

export function elegirAperturaV2(input: {
  nombre: string
  propiedad: string
  enlace?: string | null
  video?: string | null
  fotos?: string[] | null
}): AperturaV2 {
  const enlace = enlaceUtilizable(input.enlace)
  // Solo el nombre de pila: "Hola María Fernanda Gómez" no lo dice nadie.
  const nombre = input.nombre.trim().split(/\s+/)[0] || 'Hola'

  const pendiente: Array<'video' | 'fotos'> = []
  if ((input.video ?? '').trim()) pendiente.push('video')
  if ((input.fotos ?? []).length > 0) pendiente.push('fotos')

  if (enlace) {
    return {
      plantilla: PLANTILLAS_V2.conEnlace,
      plantillaUtil: PLANTILLAS_V2.conEnlaceUtil,
      cuerpo: CUERPO_V2_CON_ENLACE,
      cuerpoUtil: CUERPO_V2_CON_ENLACE_UTIL,
      params: [nombre, input.propiedad, enlace],
      pendiente,
    }
  }
  return {
    plantilla: PLANTILLAS_V2.sinEnlace,
    plantillaUtil: PLANTILLAS_V2.sinEnlaceUtil,
    cuerpo: CUERPO_V2_SIN_ENLACE,
    cuerpoUtil: CUERPO_V2_SIN_ENLACE_UTIL,
    params: [nombre, input.propiedad],
    pendiente,
  }
}

/* ────────────────────────── la escalera de intentos ────────────────────────── */

/** Un peldaño: todo lo que hace falta para UN envío concreto. */
export interface IntentoDeApertura {
  plantilla: string
  /** En orden, para `bodyParams`. */
  params: string[]
  /** El cuerpo con `{{n}}` sin reemplazar; el llamador lo renderiza. */
  cuerpo: string
  /** Solo los peldaños v1 adjuntan algo. La v2 nunca. */
  header?: { tipo: 'document' | 'video'; link: string; filename?: string }
  /** Para el log: por qué se probó este peldaño. */
  motivo: 'v2' | 'v2-tramite' | 'v1' | 'v1-tramite'
}

/**
 * La escalera de plantillas, de la mejor a la que seguro funciona.
 *
 * POR QUÉ EXISTE: las cuatro v2 se mandaron a aprobar el 2026-08-12 y Meta puede
 * tardar hasta 24hs (al día siguiente había tres aprobadas y una todavía en
 * revisión). Sin escalera habría que elegir entre deployar y romper las
 * respuestas hasta que aprueben, o esperar y deployar a mano después. Con
 * escalera se deploya cuando se quiera y **el cambio a las cortas ocurre solo**
 * en el primer envío posterior a cada aprobación. Nadie tiene que acordarse.
 *
 * El orden y el porqué de cada peldaño:
 *   1. v2 cálida    — lo que el dueño pidió.
 *   2. v2 trámite   — si Meta frena la de marketing (tope de marketing de esa
 *                     persona, o promociones desactivadas), que son errores
 *                     distintos de "no existe".
 *   3. v1 cálida    — mientras la v2 que toque no esté aprobada. Adjunta como antes.
 *   4. v1 trámite   — la red de siempre.
 *
 * Cuando las cuatro v2 estén aprobadas y estables, los peldaños 3 y 4 se pueden
 * borrar junto con `elegirPlantilla`. No antes: son lo único que sostiene el
 * servicio durante la ventana de aprobación.
 */
export function escaleraDeApertura(
  v2: AperturaV2,
  v1: {
    plantilla: string
    plantillaUtil: string
    params: string[]
    cuerpo: string
    cuerpoUtil: string
    header?: { tipo: 'document' | 'video'; link: string; filename?: string }
  },
): IntentoDeApertura[] {
  return [
    { plantilla: v2.plantilla, params: v2.params, cuerpo: v2.cuerpo, motivo: 'v2' },
    { plantilla: v2.plantillaUtil, params: v2.params, cuerpo: v2.cuerpoUtil, motivo: 'v2-tramite' },
    { plantilla: v1.plantilla, params: v1.params, cuerpo: v1.cuerpo, header: v1.header, motivo: 'v1' },
    { plantilla: v1.plantillaUtil, params: v1.params, cuerpo: v1.cuerpoUtil, header: v1.header, motivo: 'v1-tramite' },
  ]
}
