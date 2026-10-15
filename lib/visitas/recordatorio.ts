/**
 * Recordatorio "¿se realizó?" al asesor (spec §4.7). Puro: decide; la ruta del cron
 * reserva, manda y registra. La regla y el porqué de cada número están en el plan de la
 * Entrega 2 (Tarea 14); lo esencial:
 *  - 1 h de gracia después del horario (el asesor suele marcarla él);
 *  - 48 h de ventana: la PRIMERA corrida no le manda a nadie una ráfaga de avisos de
 *    visitas viejas (esas ya están en "Requieren tu acción");
 *  - solo visitas confirmadas (`scheduled`): una propuesta sin confirmar no es una cita.
 */
import type { VisitaParaRecordar } from './tipos'

export const RECORDATORIO_GRACIA_MS = 60 * 60 * 1000
export const RECORDATORIO_VENTANA_MS = 48 * 60 * 60 * 1000

export function ventanaDeRecordatorio(ahora: Date): { desde: string; hasta: string } {
  return {
    desde: new Date(ahora.getTime() - RECORDATORIO_VENTANA_MS).toISOString(),
    hasta: new Date(ahora.getTime() - RECORDATORIO_GRACIA_MS).toISOString(),
  }
}

export type MotivoSinRecordatorio = 'ya_enviado' | 'no_esta_confirmada' | 'fuera_de_ventana' | 'sin_asesor' | 'asesor_sin_email'

export type DecisionRecordatorio =
  | { enviar: true; destino: { nombre: string; email: string } }
  | { enviar: false; motivo: MotivoSinRecordatorio }

export function decidirRecordatorio(v: VisitaParaRecordar, ahora: Date): DecisionRecordatorio {
  if (v.reminder_sent_at) return { enviar: false, motivo: 'ya_enviado' }
  if (v.status !== 'scheduled') return { enviar: false, motivo: 'no_esta_confirmada' }
  const cuando = Date.parse(v.scheduled_at)
  const { desde, hasta } = ventanaDeRecordatorio(ahora)
  if (cuando < Date.parse(desde) || cuando > Date.parse(hasta)) return { enviar: false, motivo: 'fuera_de_ventana' }
  if (!v.asesor) return { enviar: false, motivo: 'sin_asesor' }
  const email = v.asesor.email?.trim()
  if (!email) return { enviar: false, motivo: 'asesor_sin_email' }
  return { enviar: true, destino: { nombre: v.asesor.nombre.trim() || 'equipo', email } }
}
