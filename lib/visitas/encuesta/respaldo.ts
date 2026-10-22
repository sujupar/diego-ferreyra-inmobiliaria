/**
 * ¿Hay que mandar la invitación de respaldo? (2026-10-22). La invitación a la encuesta va como
 * MARKETING (decisión del dueño), y Meta descarta mensajes de marketing a quien ya recibió muchos
 * (131049) o a quien bloqueó el marketing (131050). Lo avisa minutos DESPUÉS, por el webhook de
 * estados: en el envío Meta respondió "aceptado". Ahí se manda la versión de utilidad.
 *
 * Puro: lo usa el servicio con lo que leyó de la base. Fail-closed: ante cualquier duda, no manda.
 */
import { RESPALDO_DE_ENCUESTA } from './plantillas'

/** Los dos frenos de Meta que la plantilla de utilidad sí atraviesa. Otro error (número inválido,
 *  plantilla pausada) haría fallar el respaldo igual: no se insiste. */
export const CODIGOS_FRENO_MARKETING: readonly string[] = ['131049', '131050']

export interface EntradaRespaldo {
  estado: string
  codigoError: string | null
  plantillaDelMensaje: string | null
  waMessageIdFallido: string
  /** La encuesta cuyo envío fue ese mensaje, o null si el mensaje no es de una encuesta. */
  encuesta: { waMessageIdActual: string | null; completada: boolean; vencida: boolean } | null
}

export type MotivoSinRespaldo =
  | 'no_fallo' | 'error_sin_respaldo' | 'plantilla_sin_respaldo' | 'sin_encuesta' | 'ya_reemplazado' | 'ya_respondio' | 'vencida'

export type DecisionRespaldo = { mandar: true; plantilla: string } | { mandar: false; motivo: MotivoSinRespaldo }

export function decidirRespaldo(e: EntradaRespaldo): DecisionRespaldo {
  const no = (motivo: MotivoSinRespaldo): DecisionRespaldo => ({ mandar: false, motivo })
  if (e.estado !== 'failed') return no('no_fallo')
  if (!e.codigoError || !CODIGOS_FRENO_MARKETING.includes(e.codigoError)) return no('error_sin_respaldo')
  const respaldo = e.plantillaDelMensaje && Object.hasOwn(RESPALDO_DE_ENCUESTA, e.plantillaDelMensaje)
    ? RESPALDO_DE_ENCUESTA[e.plantillaDelMensaje]
    : null
  if (!respaldo) return no('plantilla_sin_respaldo')
  if (!e.encuesta) return no('sin_encuesta')
  // Una sola vez: después del respaldo la encuesta apunta al mensaje NUEVO, así que un reintento
  // del aviso de Meta sobre el mensaje viejo ya no la encuentra igual.
  if (e.encuesta.waMessageIdActual !== e.waMessageIdFallido) return no('ya_reemplazado')
  if (e.encuesta.completada) return no('ya_respondio')
  if (e.encuesta.vencida) return no('vencida')
  return { mandar: true, plantilla: respaldo }
}
