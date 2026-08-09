/**
 * Qué material PIDIÓ el cliente, leído de su propio mensaje.
 *
 * POR QUÉ EXISTE: el 6 de agosto de 2026 un cliente escribió "Tienes los
 * planos?" y el agente contestó "Plano no tengo a mano" — teniendo el plano
 * cargado. Se arregló el prompt (era una frase de ejemplo que el modelo copió
 * literal), pero un prompt es una tendencia. Esto es la garantía: si la persona
 * pidió algo con todas las letras y ese algo existe, SALE, aunque el modelo lo
 * niegue, lo omita o devuelva `send` vacío. Un archivo llegando contradice
 * cualquier negación mejor que cualquier corrección de texto.
 *
 * ## Por qué se lee la ENTRADA y no la salida del modelo
 *
 * La alternativa evaluada era detectar la negación en la respuesta del modelo y
 * reescribirla. Se descartó con evidencia: la frase real fue "Plano no tengo a
 * mano" —sustantivo primero, negación después— y ninguna expresión razonable la
 * atrapa sin atrapar también respuestas correctas ("No tengo ese dato, pero te
 * paso el video"). Perseguir paráfrasis del castellano con expresiones regulares
 * siempre pierde. El mensaje del cliente, en cambio, es corto y directo: "¿tenés
 * el plano?" tiene pocas formas.
 *
 * Y el error se acota solo: esto únicamente AGREGA material que la persona pidió
 * y que existe. Un falso positivo manda una foto de más; un falso negativo nos
 * devuelve al comportamiento de hoy. Nunca quita nada.
 */
import type { MaterialTipo } from '@/lib/ai/agent-brain'

/** Qué se está nombrando. */
const OBJETO: Array<{ tipo: MaterialTipo; re: RegExp }> = [
  {
    tipo: 'plano',
    re: /(planos?|plantas?|croquis|distribuci|c[oó]mo est[aá]\s+(?:distribuid|dividid)|medidas)/i,
  },
  { tipo: 'fotos', re: /(fotos?|fotograf[ií]as?|im[aá]gen|c[oó]mo es por dentro)/i },
  { tipo: 'video', re: /(v[ií]deos?|recorrido|tour|filmaci)/i },
]

/**
 * Formas de PEDIR. Sin una de éstas es una mención, no un pedido: "ya vi las
 * fotos, ¿tenés el plano?" pide el plano y nada más.
 */
const PEDIDO =
  /(\?|¿|\btene[sé]s\b|\bten[eé]s\b|\btiene[sn]?\b|\bhay\b|\bme (?:lo |la |los |las )?(?:pas[aá]s|mand[aá]s|env[ií]as)\b|\bpas(?:a|á)me\b|\bmand(?:a|á)me\b|\benvi(?:a|á)me\b|\bquiero ver\b|\bquisiera ver\b|\bme gustar[ií]a ver\b|\bpodr[ií]as?\s+(?:pasar|mandar|enviar)\b)/i

/**
 * Negación DEL PEDIDO ("no me mandes más fotos"), no cualquier "no" del turno.
 * Se evalúa por oración justamente para que "no puedo el martes, ¿me pasás el
 * plano?" no anule el pedido más claro posible.
 */
const NO_QUIERO = /\bno\s+(?:me\s+)?(?:mand|pas|env[ií]|quiero|hace falta|necesito|hace falta)/i

/**
 * Devuelve los tipos de material que la persona pidió explícitamente en este
 * turno. Puro y sin dependencias: se testea solo.
 */
export function materialPedidoExplicito(textoEntrante: string | null | undefined): MaterialTipo[] {
  const texto = (textoEntrante ?? '').trim()
  if (!texto) return []
  // Por oración: un turno puede pedir una cosa y rechazar otra.
  const oraciones = texto.split(/[.!?¿]+|\n+|,\s+/)
  const out: MaterialTipo[] = []
  for (const o of oraciones) {
    if (!o.trim()) continue
    if (NO_QUIERO.test(o)) continue
    if (!PEDIDO.test(o)) continue
    for (const { tipo, re } of OBJETO) {
      if (re.test(o) && !out.includes(tipo)) out.push(tipo)
    }
  }
  return out
}
