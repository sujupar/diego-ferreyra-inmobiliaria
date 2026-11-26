// "Último contacto" de la cabecera de la ficha (design.md D2). Puro.
// Cuenta como contacto (decisión del dueño 2026-11-26): una llamada con cualquier
// resultado, un WhatsApp marcado y una visita de tasación realizada (`deals.visited_at`).
// Una nota no. Es de la PERSONA (cualquier proceso, abierto o cerrado): la ruta `ficha`
// lee las tres fuentes, `masReciente` elige y `ultimoContacto` arma el texto y la alerta.
import { diasDeCalendarioEntre } from './horario-laboral'

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
