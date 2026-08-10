/**
 * De dónde sale "el agente de IA está apagado en esta conversación".
 *
 * Es una función y no una expresión suelta adentro del JSX porque ESA
 * expresión fue el bug: leía `conversacion?.ai?.agentOff`, un campo que el
 * endpoint nunca emitió, así que el botón del hilo decía "Agente activo" pase
 * lo que pase y no había forma de volver a prender el agente desde la pantalla.
 *
 * El flag vive SUELTO en la fila (`agent_off`) y no adentro de `ai` a
 * propósito: apagar el agente en una conversación que la IA todavía no analizó
 * es el caso más común (hoy `analysis_enabled` arranca apagado), y ahí `ai` es
 * `null`. Ver el docstring de `app/api/whatsapp/conversations/route.ts`.
 *
 * Puro y testeado — misma convención que `awaiting.ts` y `filters.ts`.
 */
import type { ConversationListItem } from './types'

/**
 * `true` SOLO si sabemos que está apagado. Ausencia de dato (endpoint viejo,
 * conversación que no está en la lista) = activo: es el estado normal, y
 * mostrar "apagado" sin saberlo sería la misma mentira al revés.
 */
export function agenteApagadoEn(
  conversations: ConversationListItem[] | null | undefined,
  phoneE164: string | null | undefined,
): boolean {
  if (!phoneE164) return false
  return (conversations ?? []).find(c => c.phone_e164 === phoneE164)?.agent_off === true
}

/**
 * Eco optimista del botón: refleja el cambio en la lista sin esperar al
 * refresco de 15s. NO puede condicionarse a que la fila tenga `ai` — con la
 * guarda vieja (`c.ai ? … : c`) el botón no hacía absolutamente nada visible en
 * el caso normal, que es justamente el de una conversación sin analizar.
 *
 * `activo` es lo que devuelve el endpoint (se prendió/apagó), así que el flag
 * de "apagado" es su negación.
 */
export function conAgenteMarcado(
  conversations: ConversationListItem[] | null | undefined,
  phoneE164: string,
  activo: boolean,
): ConversationListItem[] {
  return (conversations ?? []).map(c => (c.phone_e164 === phoneE164 ? { ...c, agent_off: !activo } : c))
}
