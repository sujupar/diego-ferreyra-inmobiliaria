/**
 * Qué hacer cuando entra un comentario: el corazón de la automatización.
 *
 * Módulo PURO a propósito. Acá viven TODOS los frenos que impiden que el sistema
 * le escriba a una persona que no corresponde, y ser puro es lo que permite
 * probarlos uno por uno sin tocar Instagram ni mandar un solo mensaje.
 *
 * La regla de oro, igual que en el agente de WhatsApp: **el modelo (o en este
 * caso, la coincidencia de la palabra) decide qué DECIR; el código decide qué
 * PASA.** Nada de lo de acá abajo se puede esquivar desde afuera.
 *
 * ## El orden de los frenos NO es arbitrario
 *
 * Se evalúa primero todo lo que hace que el comentario se ignore POR COMPLETO, y
 * recién después lo que solo impide el privado. Si se invirtiera, un comentario
 * que no contiene la palabra podría terminar recibiendo una respuesta pública.
 *
 * Dos casos donde el orden es la defensa:
 *  - `es_de_la_cuenta` va ANTES de mirar la palabra. Nuestras propias respuestas
 *    entran por el mismo webhook, y si el asesor escribió la palabra en el texto
 *    del reel, el sistema se contestaría a sí mismo en un bucle.
 *  - El simulacro va DESPUÉS de todos los descartes. Si tapara los descartes, el
 *    asesor vería "le habría escrito" a gente a la que en realidad nunca le
 *    escribiría, y decidiría prender el sistema con información falsa.
 */
import { comentarioCoincide } from './palabra-clave'

export interface AjustesGlobales {
  automatizacion_habilitada: boolean
  dm_habilitado: boolean
}

export interface ReelParaDecidir {
  palabra_clave: string | null
  automatizacion_activa: boolean
  /** Desde cuándo se automatiza. Sin esto no se hace nada. */
  automatizacion_desde: string | null
  simulacro: boolean
  estado: string
}

export interface ComentarioEntrante {
  texto: string | null
  creado_en: string
  autor_ig_id: string
  /** El comentario lo escribió la propia cuenta (una respuesta nuestra). */
  es_de_la_cuenta: boolean
  /** Esta persona ya recibió su privado por ESTE reel. */
  ya_recibio_dm: boolean
}

export type Decision =
  /** No se hace nada. El motivo se guarda: un descarte mudo es indistinguible de un error. */
  | { accion: 'ignorar'; motivo: string }
  /** Se registra lo que habría pasado, sin llamar a Instagram. */
  | { accion: 'simular' }
  /** Privado primero (define qué frase se usa), después la respuesta pública. */
  | { accion: 'responder_y_dm' }
  /** Responde en público sin prometer un mensaje que no va a salir. */
  | { accion: 'solo_responder'; motivo: string }

/** Instagram no acepta un privado pasados 7 días del comentario. */
const DIAS_DE_VENTANA = 7
const MILISEGUNDOS_DE_VENTANA = DIAS_DE_VENTANA * 24 * 60 * 60 * 1000

/** `null` si la fecha no se entiende. Nunca una fecha inventada. */
function fechaValida(texto: string | null): Date | null {
  if (!texto) return null
  const fecha = new Date(texto)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

export function decidirQueHacer(
  reel: ReelParaDecidir,
  comentario: ComentarioEntrante,
  ajustes: AjustesGlobales,
  ahora: Date,
): Decision {
  // --- Frenos que apagan todo -------------------------------------------
  if (!ajustes.automatizacion_habilitada) {
    return { accion: 'ignorar', motivo: 'automatizacion_global_apagada' }
  }
  if (reel.estado !== 'publicado') {
    return { accion: 'ignorar', motivo: 'reel_no_publicado' }
  }
  if (!reel.automatizacion_activa) {
    return { accion: 'ignorar', motivo: 'reel_sin_automatizacion' }
  }

  const desde = fechaValida(reel.automatizacion_desde)
  if (!desde) {
    // Sin esta fecha no se distingue un comentario nuevo de uno de hace una
    // semana. Ante la duda, no se le escribe a nadie.
    return { accion: 'ignorar', motivo: 'sin_fecha_de_activacion' }
  }

  // --- Qué comentarios no se tocan --------------------------------------
  if (comentario.es_de_la_cuenta) {
    return { accion: 'ignorar', motivo: 'comentario_propio' }
  }

  const creado = fechaValida(comentario.creado_en)
  // Una fecha ilegible se trata como vieja: es la lectura conservadora, la que
  // NO manda mensajes.
  if (!creado || creado.getTime() < desde.getTime()) {
    return { accion: 'ignorar', motivo: 'comentario_anterior_a_la_activacion' }
  }

  if (!comentarioCoincide(comentario.texto, reel.palabra_clave)) {
    return { accion: 'ignorar', motivo: 'no_coincide' }
  }

  // --- Simulacro: después de los descartes, antes de cualquier envío -----
  if (reel.simulacro) {
    return { accion: 'simular' }
  }

  // --- Frenos que solo impiden el privado --------------------------------
  if (comentario.ya_recibio_dm) {
    return { accion: 'solo_responder', motivo: 'ya_recibio_dm' }
  }
  if (!ajustes.dm_habilitado) {
    return { accion: 'solo_responder', motivo: 'dm_deshabilitado' }
  }
  if (ahora.getTime() - creado.getTime() > MILISEGUNDOS_DE_VENTANA) {
    return { accion: 'solo_responder', motivo: 'ventana_de_7_dias_vencida' }
  }

  return { accion: 'responder_y_dm' }
}
