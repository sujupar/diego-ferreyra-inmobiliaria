/**
 * ¿Le mandamos la encuesta (o el regalo) por WhatsApp a esta persona? (adenda §11.4 y §11.8)
 * Puro, con todos los frenos juntos y en orden: primero lo que apaga todo, después lo que falta.
 * Fail-closed: ajustes ilegibles = no. Devuelve SIEMPRE el motivo (se muestra en la ficha).
 *
 * El normalizador entra por parámetro (como en lib/leads/consulta-envio.ts): libphonenumber carga
 * distinto dentro y fuera de Next y no tiene que entrar a los tests de reglas.
 */
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { PLANTILLAS_ENCUESTA, PLANTILLAS_REGALO, definicionDe } from './plantillas'
import type { AjustesEncuesta, MotivoOmision } from './tipos'

export type Normalizador = (v: string | null | undefined) => string | null

/** La lista de prueba compara por últimos 10 dígitos: la gente la carga con y sin 9, con y sin +54. */
export function esTelefonoDePrueba(tel: string, lista: readonly string[]): boolean {
  const n = ultimos10Digitos(tel)
  return n !== null && lista.some(p => ultimos10Digitos(p) === n)
}

export interface EntradaEnvioEncuesta {
  ajustes: AjustesEncuesta | null
  tieneRegalo: boolean
  telefono: string | null
  plantilla: string | null
  yaEnviada: boolean
  reenvio: boolean
  completada: boolean
  vencida: boolean
}

export type DecisionEnvio =
  | { enviar: true; telefono: string; esPrueba: boolean }
  | { enviar: false; motivo: MotivoOmision }

const no = (motivo: MotivoOmision): DecisionEnvio => ({ enviar: false, motivo })

export function decidirEnvioEncuesta(e: EntradaEnvioEncuesta, normalizar: Normalizador): DecisionEnvio {
  if (!e.ajustes) return no('ajustes_ilegibles')
  if (e.completada) return no('ya_respondio')
  if (e.vencida) return no('vencida')
  const telefono = normalizar(e.telefono)
  if (!telefono) return no('telefono_invalido')
  const esPrueba = esTelefonoDePrueba(telefono, e.ajustes.telefonos_prueba)
  if (!esPrueba) {
    if (!e.ajustes.envio_automatico) return no('envio_apagado')
    if (e.ajustes.solo_con_regalo && !e.tieneRegalo) return no('sin_regalo')
  }
  if (!e.plantilla) return no('plantilla_sin_configurar')
  if (!definicionDe(PLANTILLAS_ENCUESTA, e.plantilla)) return no('plantilla_desconocida')
  if (e.yaEnviada && !e.reenvio) return no('ya_enviada')
  return { enviar: true, telefono, esPrueba }
}

export type MotivoSinRegalo =
  | 'ajustes_ilegibles' | 'sin_regalo' | 'telefono_invalido' | 'apagado'
  | 'plantilla_sin_configurar' | 'plantilla_desconocida' | 'ya_enviado'

export type DecisionRegalo =
  | { enviar: true; telefono: string; esPrueba: boolean }
  | { enviar: false; motivo: MotivoSinRegalo }

export function decidirRegaloPorWhatsapp(
  e: { ajustes: AjustesEncuesta | null; tieneRegalo: boolean; telefono: string | null; plantilla: string | null; yaEnviado: boolean },
  normalizar: Normalizador,
): DecisionRegalo {
  const noR = (motivo: MotivoSinRegalo): DecisionRegalo => ({ enviar: false, motivo })
  if (!e.ajustes) return noR('ajustes_ilegibles')
  if (!e.tieneRegalo) return noR('sin_regalo')
  const telefono = normalizar(e.telefono)
  if (!telefono) return noR('telefono_invalido')
  const esPrueba = esTelefonoDePrueba(telefono, e.ajustes.telefonos_prueba)
  if (!esPrueba && !e.ajustes.regalo_por_whatsapp) return noR('apagado')
  if (!e.plantilla) return noR('plantilla_sin_configurar')
  if (!definicionDe(PLANTILLAS_REGALO, e.plantilla)) return noR('plantilla_desconocida')
  if (e.yaEnviado) return noR('ya_enviado')
  return { enviar: true, telefono, esPrueba }
}
