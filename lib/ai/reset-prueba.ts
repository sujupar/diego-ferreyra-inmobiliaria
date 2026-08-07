/**
 * La PALABRA DE REINICIO: volver a empezar una prueba del agente sin depender
 * de nadie.
 *
 * POR QUÉ EXISTE: probar el agente contra el WhatsApp real es la única forma de
 * verlo de verdad, y hasta ahora cada intento dejaba la conversación sucia — el
 * resumen acumulado, el contador de mensajes, una visita anotada a mitad de
 * camino. Repetir la prueba requería que un programador corriera un script. El
 * dueño lo pidió explícito: manda una palabra y vuelve a foja cero.
 *
 * ## La distinción que ordena todo este archivo
 *
 * Hay dos clases de cosas en una conversación:
 *
 *   - ESTADO DERIVADO: el resumen, los contadores, las marcas. Lo calculó el
 *     sistema a partir de los mensajes y se puede volver a calcular. Reiniciarlo
 *     no pierde nada.
 *   - DATOS REALES: los mensajes, el lead, la consulta del portal, las visitas.
 *     Son el registro de lo que pasó. NO SE BORRAN NUNCA, ni en una prueba.
 *
 * Esta función solo toca lo primero. La única excepción es una visita que haya
 * anotado el AGENTE durante la prueba, y ni siquiera se borra: se CANCELA con
 * una nota que dice por qué. La fila queda, el historial queda, y se puede
 * revertir a mano. Una visita que cargó una persona no se toca jamás.
 *
 * ## Por qué la lista blanca
 *
 * El reinicio solo funciona desde un teléfono que esté en
 * `ai_agent_settings.consulta_test_phones` — la misma lista que ya gobierna el
 * modo prueba de las consultas. Si un cliente real escribiera la palabra por
 * casualidad, para el sistema es un mensaje más y el agente le contesta normal.
 * Y si esa lista no se puede leer, no se reinicia nada: ante la duda, no se toca
 * el estado de una conversación real.
 */
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * La palabra. Dos palabras, en realidad: una sola ("reset") aparece en
 * conversaciones normales y en nombres de propiedades; ésta no la escribe nadie
 * sin querer.
 */
export const PALABRA_DE_REINICIO = 'reiniciar prueba'

/** Estado de la nota interna que queda en el chat. */
export const NOTE_STATUS_RESET = 'agent_reset'

/**
 * Pura. ¿Este mensaje es la palabra de reinicio?
 *
 * Compara sin acentos, sin mayúsculas y sin espacios de más, porque se escribe
 * desde un teléfono: "Reiniciar Prueba", "REINICIAR  PRUEBA" y "reiniciar
 * prueba." son todos la misma intención. Se admite puntuación final y nada más:
 * una frase que CONTIENE la palabra ("che, habría que reiniciar prueba mañana")
 * NO cuenta — un reinicio accidental le arruina la prueba a quien la esté
 * corriendo.
 */
export function esPalabraDeReinicio(texto: string | null | undefined): boolean {
  const limpio = (texto ?? '')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[.!¡?¿,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return limpio === PALABRA_DE_REINICIO
}

/**
 * Pura. ¿Este teléfono puede reiniciar?
 *
 * Fail-closed en los dos casos que importan: sin ajustes legibles (`null`) y con
 * la lista vacía, nadie puede. Que la lista esté vacía significa "no hay modo
 * prueba configurado", no "cualquiera".
 */
export function puedeReiniciar(
  phoneE164: string,
  testPhones: string[] | null | undefined,
): boolean {
  const lista = testPhones ?? []
  if (lista.length === 0) return false
  const soloDigitos = (v: string) => (v ?? '').replace(/\D/g, '')
  const mio = soloDigitos(phoneE164)
  if (!mio) return false
  return lista.some(t => soloDigitos(t) === mio)
}

export interface ResultadoReinicio {
  reiniciado: boolean
  /** Para el log y la nota interna. */
  motivo: string
  /** Qué se limpió, en palabras, para poder decírselo a quien lo pidió. */
  limpiado: string[]
}

/**
 * Reinicia el estado del agente para una conversación. NUNCA lanza: es un
 * atajo de prueba y no puede tumbar el webhook que lo llama.
 *
 * Devuelve `reiniciado: false` sin tocar nada si el teléfono no está autorizado
 * o si no se pudieron leer los ajustes.
 */
export async function reiniciarPrueba(
  phoneE164: string,
  propertyId: string | null,
): Promise<ResultadoReinicio> {
  try {
    const sb = admin()

    const { data: ajustes, error: errAjustes } = await sb
      .from('ai_agent_settings')
      .select('consulta_test_phones')
      .eq('id', true)
      .maybeSingle()
    if (errAjustes) {
      return { reiniciado: false, motivo: `no se pudieron leer los ajustes: ${errAjustes.message}`, limpiado: [] }
    }
    const testPhones = (ajustes as { consulta_test_phones: string[] | null } | null)?.consulta_test_phones ?? null
    if (!puedeReiniciar(phoneE164, testPhones)) {
      return { reiniciado: false, motivo: 'este teléfono no está en la lista de prueba', limpiado: [] }
    }

    const limpiado: string[] = []

    // 1. La memoria del agente. Se reescribe, no se borra la fila: los
    //    contadores de costo (`tokens_used_total`, `analyses_count`) siguen
    //    acumulando, porque esos tokens SE GASTARON y el panel de costo tiene
    //    que seguir diciendo la verdad.
    const { error: errEstado } = await sb
      .from('conversation_ai_state')
      .update({
        summary: '',
        last_analyzed_message_id: null,
        last_analyzed_at: null,
        intent: 'desconocido',
        priority_score: 0,
        priority_reason: null,
        suggested_next_step: null,
        agent_messages_sent: 0,
        agent_handed_off: false,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('phone_e164', phoneE164)
    if (errEstado) {
      return { reiniciado: false, motivo: `no se pudo reiniciar la memoria: ${errEstado.message}`, limpiado: [] }
    }
    limpiado.push('la memoria y el contador de mensajes')

    // 2. Las visitas que anotó EL AGENTE y siguen sin confirmar. Se CANCELAN,
    //    no se borran, y solo las suyas: una visita que cargó una persona del
    //    equipo es trabajo real y no la toca ni una prueba.
    if (propertyId) {
      const { data: visitas, error: errLeer } = await sb
        .from('property_visits')
        .select('id, client_phone')
        .eq('property_id', propertyId)
        .eq('created_by_ai', true)
        .eq('status', 'pending_confirmation')
      if (errLeer) {
        // No es motivo para abortar: la memoria ya se reinició, que es lo
        // principal. Se dice en el motivo para que quede visible.
        limpiado.push('(no se pudieron revisar las visitas de prueba)')
      } else {
        const soloDigitos = (v: string | null) => (v ?? '').replace(/\D/g, '')
        const mias = ((visitas as Array<{ id: string; client_phone: string | null }> | null) ?? [])
          .filter(v => soloDigitos(v.client_phone) === soloDigitos(phoneE164))
        for (const v of mias) {
          await sb
            .from('property_visits')
            .update({
              status: 'cancelled',
              notes: `[Cancelada por un reinicio de prueba del agente, ${new Date().toISOString().slice(0, 10)}. La fila se conserva a propósito: no se borra nada.]`,
              updated_at: new Date().toISOString(),
            } as never)
            .eq('id', v.id)
        }
        if (mias.length > 0) {
          limpiado.push(`${mias.length} visita${mias.length === 1 ? '' : 's'} de prueba (cancelada${mias.length === 1 ? '' : 's'}, no borrada${mias.length === 1 ? '' : 's'})`)
        }
      }
    }

    return { reiniciado: true, motivo: 'reiniciado', limpiado }
  } catch (err) {
    return {
      reiniciado: false,
      motivo: `excepción reiniciando: ${err instanceof Error ? err.message : String(err)}`,
      limpiado: [],
    }
  }
}

/** El texto que se le manda a quien pidió el reinicio. Corto y concreto. */
export function mensajeDeConfirmacion(limpiado: string[]): string {
  const detalle = limpiado.length > 0 ? ` Se reinició ${limpiado.join(' y ')}.` : ''
  return `Listo, la prueba arranca de cero.${detalle} Los mensajes anteriores quedan en el historial: no se borró nada.`
}
