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
import {
  enviarAperturaDeConsulta,
  COLUMNAS_APERTURA,
  type PropiedadParaConsulta,
} from '@/lib/leads/responder-consulta'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** La frase canónica, la que se documenta y se muestra. */
export const PALABRA_DE_REINICIO = 'reiniciar prueba'

/**
 * También se acepta "reiniciar" a secas: es lo que sale escribir, y el dueño lo
 * probó así. No es riesgoso porque el freno real NO es la longitud de la frase
 * sino la lista blanca de teléfonos: para cualquier otra persona, "reiniciar"
 * es un mensaje común y el agente le contesta normal.
 */
const PALABRAS_ACEPTADAS = new Set([PALABRA_DE_REINICIO, 'reiniciar'])

/** Estado de la nota interna que queda en el chat. */
export const NOTE_STATUS_RESET = 'agent_reset'

/**
 * Pura. ¿Este mensaje es la palabra de reinicio?
 *
 * Compara sin acentos, sin mayúsculas y sin espacios de más, porque se escribe
 * desde un teléfono: "Reiniciar", "REINICIAR  PRUEBA" y "reiniciar prueba." son
 * todos la misma intención. Se admite puntuación final y nada más: una frase que
 * CONTIENE la palabra ("che, habría que reiniciar prueba mañana") NO cuenta — un
 * reinicio accidental le arruina la prueba a quien la esté corriendo.
 */
export function esPalabraDeReinicio(texto: string | null | undefined): boolean {
  const limpio = (texto ?? '')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[.!¡?¿,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return PALABRAS_ACEPTADAS.has(limpio)
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
/**
 * Qué se le escribe al estado de la conversación cuando se reinicia. Pura, para
 * poder fijarla con un test: acá vivía un error que costó tres rondas.
 *
 * La sutileza está en `lastAnalyzedAt`. Reiniciar NO es "nunca leí nada" —eso
 * es lo que significa dejar las anclas en null, y hace que
 * `mensajesNuevosDesde` devuelva la conversación ENTERA—. Reiniciar es "ya leí
 * todo lo anterior y no me importa": la marca se ADELANTA hasta ahora, y el
 * modelo solo ve lo que llegue después.
 *
 * `lastAnalyzedMessageId` sí va en null, y es correcto: no hay un mensaje
 * concreto hasta el cual se leyó, hay un instante. La marca de tiempo alcanza.
 */
export function parcheDeReinicio(ahoraISO: string) {
  return {
    summary: '',
    last_analyzed_message_id: null,
    last_analyzed_at: ahoraISO,
    intent: 'desconocido',
    priority_score: 0,
    priority_reason: null,
    suggested_next_step: null,
    agent_messages_sent: 0,
    agent_handed_off: false,
    updated_at: ahoraISO,
  }
}

export async function reiniciarPrueba(
  phoneE164: string,
  propertyId: string | null,
  leadId: string | null = null,
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
    //
    //    ## Por qué la marca de lectura se ADELANTA en vez de borrarse
    //
    //    Antes se ponían `last_analyzed_message_id` y `last_analyzed_at` en
    //    `null`, que parece lo correcto para "empezar de cero" y es justo lo
    //    contrario. `mensajesNuevosDesde` (lib/ai/conversation-memory.ts) usa
    //    esas dos como ancla, y **sin ninguna de las dos devuelve TODA la
    //    conversación** — su comentario lo dice: sin estado previo asume que es
    //    el primer análisis.
    //
    //    En una conversación de prueba con 166 mensajes acumulados, eso le
    //    entregaba al modelo el historial entero de las pruebas anteriores. El
    //    2026-08-13 el dueño escribió "Sí, mandame el video" y recibió fotos +
    //    video y un cierre de visita: el modelo había leído "Me gustaría ver
    //    los planos" y "Si, mañana está bien" de la prueba de media hora antes
    //    y actuó en consecuencia, con toda lógica. Se perdieron tres rondas
    //    corrigiendo el prompt de alguien que leía el libreto equivocado.
    //
    //    Reiniciar NO es "nunca leí nada": es "ya leí todo lo anterior y no me
    //    importa". Por eso la marca se adelanta hasta AHORA. Los mensajes que
    //    lleguen después son los únicos que el modelo va a ver.
    const { error: errEstado } = await sb
      .from('conversation_ai_state')
      .update(parcheDeReinicio(new Date().toISOString()) as never)
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

/**
 * Vuelve a mandar el PRIMER mensaje, el mismo que recibe alguien que deja una
 * consulta en un portal: la plantilla aprobada con el plano (o el video) en el
 * encabezado.
 *
 * Va SEPARADO de `reiniciarPrueba` por el ORDEN en que se lee el chat: primero
 * la confirmación de que se reinició, después la apertura. Al revés quedaba la
 * apertura y encima un "listo, reinicié", que se lee al revés de como pasó.
 *
 * Usa `enviarAperturaDeConsulta`, la MISMA función que dispara una consulta
 * real. Si fueran dos caminos, la prueba dejaría de probar lo que pasa de
 * verdad en cuanto uno de los dos cambiara.
 */
export async function reenviarApertura(
  phoneE164: string,
  propertyId: string,
  leadId: string | null,
): Promise<{ ok: boolean; detalle: string }> {
  try {
    const sb = admin()
    const { data: propRow } = await sb
      .from('properties').select(COLUMNAS_APERTURA).eq('id', propertyId).maybeSingle()
    if (!propRow) return { ok: false, detalle: 'la propiedad no existe' }

    // El nombre sale del lead de ESTA persona, que el webhook ya resolvió.
    // Buscarlo por propiedad traería el lead de otro cliente y la apertura
    // arrancaría saludando a un desconocido.
    let nombre = ''
    if (leadId) {
      const { data: leadRow } = await sb.from('property_leads').select('name').eq('id', leadId).maybeSingle()
      nombre = (leadRow as { name?: string | null } | null)?.name?.trim() ?? ''
    }

    const envio = await enviarAperturaDeConsulta({
      telefono: phoneE164,
      prop: propRow as PropiedadParaConsulta,
      nombre,
      leadId,
    })
    if (envio.skipped) return { ok: false, detalle: 'modo prueba de WhatsApp: no se mandó nada' }
    if (!envio.ok) return { ok: false, detalle: envio.error ?? 'error de Meta' }
    return { ok: true, detalle: `plantilla ${envio.plantillaUsada}` }
  } catch (err) {
    return { ok: false, detalle: err instanceof Error ? err.message : String(err) }
  }
}

/** El texto que se le manda a quien pidió el reinicio. Corto y concreto. */
export function mensajeDeConfirmacion(limpiado: string[]): string {
  const detalle = limpiado.length > 0 ? ` Se reinició ${limpiado.join(' y ')}.` : ''
  return `Listo, la prueba arranca de cero.${detalle} Los mensajes anteriores quedan en el historial: no se borró nada. Te reenvío el primer mensaje.`
}
