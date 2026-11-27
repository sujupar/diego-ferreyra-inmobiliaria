// "Último contacto" de la cabecera de la ficha (design.md D2). Puro.
// Cuenta como contacto (decisión del dueño 2026-11-26): una llamada con cualquier
// resultado, un WhatsApp marcado y una visita de tasación realizada (`deals.visited_at`).
// Una nota no. Es de la PERSONA (cualquier proceso, abierto o cerrado): la ruta `ficha`
// lee las tres fuentes, `masReciente` elige y `ultimoContacto` arma el texto y la alerta.
import { RESULTADO_CORTO } from './actividades'
import { diasDeCalendarioEntre, enArgentina } from './horario-laboral'
import { RESULTADOS_LLAMADA, type ResultadoLlamada } from './tipos'

export interface UltimoContacto {
  texto: string
  dias: number | null
  alerta: boolean
}

const DIAS_PARA_ALERTA = 2

/**
 * El instante más nuevo de la lista, tal como vino. Compara por instante y no por texto:
 * la base devuelve "+00:00" con microsegundos y otras fuentes "Z", y el texto mayor no es
 * siempre el instante mayor. Una fecha ilegible se descarta (no puede ganar).
 */
export function masReciente(instantes: (string | null | undefined)[]): string | null {
  let mejor: string | null = null
  let mejorMs = -Infinity
  for (const i of instantes) {
    if (!i) continue
    const ms = Date.parse(i)
    if (Number.isNaN(ms)) continue
    if (ms > mejorMs) {
      mejor = i
      mejorMs = ms
    }
  }
  return mejor
}

/**
 * Cuenta días de calendario de Argentina (un contacto de las 23:30 visto a las 00:30 es
 * "ayer"). La alerta va solo en Solicitud: sin contacto, o con el último hace 2 días o más.
 * `etapaCRM` es la etapa del CRM del proceso activo (`solicitud`, `coordinada`…).
 */
export function ultimoContacto(ultimoEn: string | null, ahora: Date, etapaCRM: string | null): UltimoContacto {
  const enSolicitud = etapaCRM === 'solicitud'
  if (!ultimoEn) return { texto: 'Sin contacto todavía', dias: null, alerta: enSolicitud }
  // Un desfase de relojes puede dejarlo unos segundos en el futuro: cuenta como hoy.
  const dias = Math.max(0, diasDeCalendarioEntre(new Date(ultimoEn), ahora))
  const texto =
    dias === 0 ? 'Último contacto: hoy' : dias === 1 ? 'Último contacto: ayer' : `Último contacto: hace ${dias} días`
  return { texto, dias, alerta: enSolicitud && dias >= DIAS_PARA_ALERTA }
}

// ── Lo que suma la cartera (crm-cartera-por-rol, design.md D3 y D5) ───────────────────────
// La cabecera de la ficha (arriba) no cambia: la fila de la lista necesita además QUÉ fue
// el contacto y la fecha desde la que se anotan las llamadas.

/**
 * Día de Argentina en que salió a producción la ficha de contacto (PR #92, 2026-11-26 21:04
 * AR; respuesta 1 del dueño: "contar desde la salida de la ficha"). Antes de ese día las
 * llamadas no se anotaban: sin esta fecha, las 185 solicitudes viejas aparecerían "sin
 * primer contacto" y los 100 seguimientos "sin movimiento". Se toma el día entero (lo que
 * entró ese día antes del deploy cuenta como posterior): mejor avisar de más que esconder
 * una solicitud real, que es lo que pasaría si se corriera hacia adelante.
 */
export const INICIO_REGISTRO_CONTACTOS = '2026-11-26'

export type QueFue = 'llamada' | 'whatsapp' | 'visita'

export interface ContactoRegistrado {
  at: string
  que: QueFue
  resultado: ResultadoLlamada | null
}

/** Una fila de `crm_ultimos_contactos` (migración 20261127000001), sin el id. */
export interface FilaUltimosContactos {
  actividad_at: string | null
  actividad_tipo: string | null
  actividad_resultado: string | null
  visita_at: string | null
}

function comoResultado(v: string | null): ResultadoLlamada | null {
  return RESULTADOS_LLAMADA.find((r) => r === v) ?? null
}

/**
 * El contacto registrado más nuevo de la persona. Elige con `masReciente`, la MISMA regla
 * que la cabecera de la ficha: si cada lado comparara a su manera, la ficha y la lista
 * dirían fechas distintas de la misma persona. Ante un empate gana la actividad (va
 * primera): dice qué se habló, la visita no. Un tipo de actividad que no es llamada ni
 * WhatsApp se ignora (la función de la base ya filtra; esto es la segunda barrera).
 */
export function contactoRegistrado(r: FilaUltimosContactos | null): ContactoRegistrado | null {
  if (!r) return null
  const tipo: QueFue | null =
    r.actividad_tipo === 'call' ? 'llamada' : r.actividad_tipo === 'whatsapp_sent' ? 'whatsapp' : null
  const actividadAt = tipo ? r.actividad_at : null
  const at = masReciente([actividadAt, r.visita_at])
  if (!at) return null
  if (tipo && at === actividadAt) {
    return { at, que: tipo, resultado: tipo === 'llamada' ? comoResultado(r.actividad_resultado) : null }
  }
  return { at, que: 'visita', resultado: null }
}

/** "Llamada · no atendió" | "WhatsApp enviado" | "Visita de tasación" (spec "Qué fue"). */
export function textoQueFue(c: ContactoRegistrado): string {
  if (c.que === 'whatsapp') return 'WhatsApp enviado'
  if (c.que === 'visita') return 'Visita de tasación'
  if (!c.resultado) return 'Llamada'
  // El mismo texto que la ficha, con minúscula: en la fila va después de "Llamada ·".
  const corto = RESULTADO_CORTO[c.resultado]
  return `Llamada · ${corto.charAt(0).toLowerCase()}${corto.slice(1)}`
}

/**
 * ¿El proceso empezó antes del registro de llamadas? Se compara el DÍA de Argentina: una
 * solicitud de las 23:30 del 25 (ya 26 en UTC) es anterior. Una fecha ilegible cuenta como
 * posterior, del lado de avisar de más.
 */
export function anteriorAlRegistro(creadoEn: string): boolean {
  const d = new Date(creadoEn)
  if (Number.isNaN(d.getTime())) return false
  return enArgentina(d).fecha < INICIO_REGISTRO_CONTACTOS
}
