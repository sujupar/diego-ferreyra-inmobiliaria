/**
 * Orden por prioridad del Inbox (task 4, `.superpowers/sdd/2026-08-03-agente-ia/`).
 *
 * Combina DOS señales:
 *   1. Cuánto falta para que cierre la ventana de 24hs — CALCULADO, sin IA
 *      (`serviceWindow` de `./window.ts`, ya existente, reusado tal cual).
 *   2. `conversation_ai_state.priority_score` — la LECTURA de la IA (tabla que
 *      escriben `lib/ai/conversation-memory.ts` + `lib/ai/analyze-conversation.ts`,
 *      construidos en paralelo por otra tarea).
 *
 * Pura y testeada — no toca la red ni Supabase. Vive PEGADA a `window.ts`
 * (mismo dominio: WhatsApp) en vez de en `lib/ai/` porque esto no analiza
 * nada: solo COMBINA un número que ya calculó `serviceWindow` con un número
 * que la IA ya dejó escrito en otra tabla.
 *
 * Reglas de negocio (brief task 4 + ambigüedades ya resueltas):
 *   - Sin análisis de IA todavía (`ai === null`): el orden cae 100% al cálculo
 *     de ventana. Nunca aparenta "prioridad cero" — `analyzed: false` es lo
 *     que la UI usa para mostrar "todavía no la miró la IA" en vez de nada.
 *   - Con análisis: 50/50 entre la urgencia de ventana (calculada, siempre
 *     fresca) y `priority_score` (puede tener minutos de antigüedad — sigue
 *     siendo la mejor lectura de intención que hay).
 *   - SIEMPRE hay una frase en `reason`, en castellano — sin motivo, nadie
 *     confía en un orden automático. Se arma combinando la razón de la IA (o,
 *     si no hay, una frase corta derivada del `intent`) con el estado ACTUAL
 *     de la ventana (nunca se confía en que la IA sepa cuánto queda de
 *     ventana AHORA — eso se calcula en cada request, no se guarda).
 */
import { serviceWindow, WINDOW_MS, type ServiceWindowResult } from './window'

export type ConversationIntent = 'agendar' | 'consulta' | 'frio' | 'desconocido'

/** Lo que necesita esta pieza de `conversation_ai_state` — subconjunto camelCase de `ConversationAiStateRow`. */
export interface AiPriorityInput {
  intent: ConversationIntent
  /** 0-100 (`conversation_ai_state.priority_score`). Se clampea igual por las dudas. */
  priorityScore: number
  priorityReason: string | null
}

export interface PriorityResult {
  /** 0-100. Combinado si hay lectura de IA; si no, es la urgencia de ventana sola. */
  score: number
  /** Una frase en castellano — SIEMPRE presente, para justificar el orden en pantalla. */
  reason: string
  /** Componente puramente calculado (0-100), sin IA — lo que alimenta el filtro "Ventana por cerrar". */
  windowUrgency: number
  /** true si esta conversación tiene una lectura de IA (aunque sea vieja). false = "todavía no la miró la IA". */
  analyzed: boolean
}

const INTENT_PHRASES: Record<ConversationIntent, string> = {
  agendar: 'pidió agendar una visita',
  consulta: 'tiene una consulta sin resolver',
  frio: 'está frío, sin urgencia',
  desconocido: 'la IA no pudo determinar la intención',
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s
}

/**
 * 0 (ventana recién abierta, o ya cerrada) a 100 (a punto de cerrarse).
 * Una ventana CERRADA da 0 a propósito: no hay nada "por cerrar" — ya cerró.
 * Es justo lo que necesita el filtro "Ventana por cerrar": solo las abiertas
 * compiten, y entre ellas gana la que menos tiempo le queda.
 */
export function windowUrgency(window: ServiceWindowResult): number {
  if (!window.open) return 0
  const ratio = 1 - window.msRemaining / WINDOW_MS
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100)
}

/** "le quedan 3h de ventana" / "le queda 1 min de ventana" / "la ventana de 24hs ya se cerró". */
function windowPhrase(window: ServiceWindowResult): string {
  if (!window.open) return 'la ventana de 24hs ya se cerró'
  const totalMin = Math.max(1, Math.round(window.msRemaining / 60000))
  if (totalMin < 60) return `le queda${totalMin === 1 ? '' : 'n'} ${totalMin} min de ventana`
  const hours = Math.round(totalMin / 60)
  return `le queda${hours === 1 ? '' : 'n'} ${hours}h de ventana`
}

/**
 * Combina `windowUrgency` (calculado) con `ai.priorityScore` (IA) 50/50.
 * Sin `ai`, degrada con elegancia al cálculo puro — es el corazón del
 * requisito "el filtro de ventana funciona aunque la IA esté apagada o caída".
 */
export function computePriority(window: ServiceWindowResult, ai: AiPriorityInput | null): PriorityResult {
  const wUrgency = windowUrgency(window)

  if (!ai) {
    return {
      score: wUrgency,
      reason: capitalize(windowPhrase(window)),
      windowUrgency: wUrgency,
      analyzed: false,
    }
  }

  const aiScore = Math.min(100, Math.max(0, ai.priorityScore))
  const score = Math.round(0.5 * wUrgency + 0.5 * aiScore)

  // La razón de la IA manda si existe (es lo que Task 2 pide mostrarle al
  // asesor); si no vino, se cae a una frase corta derivada del intent. Nunca
  // se usa la razón de la IA SOLA: siempre se le suma el estado ACTUAL de la
  // ventana, calculado en este mismo request (la razón guardada puede tener
  // minutos de antigüedad y "quedan 3h" pudo haberse convertido en "cerró").
  const basePhrase = (ai.priorityReason?.trim() || INTENT_PHRASES[ai.intent] || INTENT_PHRASES.desconocido).replace(
    /[.!?]+$/,
    '',
  )
  const reason = `${capitalize(basePhrase)} y ${windowPhrase(window)}`

  return { score, reason, windowUrgency: wUrgency, analyzed: true }
}

/** Reexportado para que los callers (API route) no tengan que importar de dos módulos para lo mismo. */
export { serviceWindow }
export type { ServiceWindowResult }
