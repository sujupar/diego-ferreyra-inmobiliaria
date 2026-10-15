/**
 * Reglas de los avisos que salen al completar la encuesta (adenda §11.7): email al equipo, regalo
 * por WhatsApp y regalo por email. Puro: los límites de tiempo y cómo se cierra cada canal.
 *
 * POR QUÉ HAY LÍMITES DE INICIO: Netlify corta la función a ~26 s y `maxDuration` no sirve acá
 * (CLAUDE.md § regla dura). Cada canal arranca solo si queda tiempo para su peor caso; lo que no
 * entra queda "pendiente" para el barrido del cron. Los números se pueden recalcular con los tests.
 */
import { PREFIJO_ERROR_TIEMPO } from '@/lib/email/resend-client'
import { TECHO_POR_DESTINATARIO_MS } from '@/lib/email/notifications/visit-survey-answered'
import { CANALES_AVISO, COLUMNAS_DE_CANAL, type CanalAviso, type EncuestaFila } from './tipos'

export const TECHO_NETLIFY_MS = 26_000
/** Peor caso de un canal de regalo: una llamada a Meta o un email, techo de 8 s. */
export const TIMEOUT_CANAL_MS = 8_000
export const LIMITE_INICIO_MS: Readonly<Record<CanalAviso, number>> = {
  equipo: 5_000,
  regalo_whatsapp: 12_000,
  regalo_email: 16_000,
}
export const MAX_INTENTOS_AVISO = 3
/** La pantalla de gracias pide los avisos enseguida: el barrido no se le cruza. */
export const ESPERA_ANTES_DEL_BARRIDO_MS = 2 * 60_000
export const DIAS_DEL_BARRIDO = 7

export function puedeEmpezar(canal: CanalAviso, transcurridoMs: number): boolean {
  return transcurridoMs < LIMITE_INICIO_MS[canal]
}

/** Peor caso del email al equipo: varios destinatarios EN SERIE (sendEmail manda de a uno). */
export function peorCasoEquipoMs(destinatarios: number): number {
  return LIMITE_INICIO_MS.equipo + destinatarios * TECHO_POR_DESTINATARIO_MS
}

export function canalesPendientes(
  e: Pick<EncuestaFila, 'completed_at' | 'notice_attempts' | 'team_notice_status' | 'gift_whatsapp_status' | 'gift_email_status'>,
): CanalAviso[] {
  if (!e.completed_at || e.notice_attempts >= MAX_INTENTOS_AVISO) return []
  return CANALES_AVISO.filter(c => e[COLUMNAS_DE_CANAL[c].estado] === 'pendiente')
}

export interface ResultadoEmailLike { ok: boolean; sent: number; failed: number; errors: string[] }

/**
 * `sendEmail` NUNCA lanza. Vencido = Resend pudo haberlo mandado: no se reintenta (se prefiere
 * perder un aviso a duplicarlo, mismo criterio que el recordatorio). `ok:false` con `failed:0` es
 * "falta RESEND_API_KEY": también es un fallo, y ese sí se reintenta.
 */
export function cierreDeEmail(r: ResultadoEmailLike | null): 'enviado' | 'fallido' | 'pendiente' {
  if (r && r.ok && r.failed === 0 && r.sent > 0) return 'enviado'
  if (r && r.errors.some(e => e.startsWith(PREFIJO_ERROR_TIEMPO))) return 'fallido'
  return 'pendiente'
}

export function cierreTrasFallo(intentosPrevios: number): { estado: 'pendiente' | 'fallido'; intentos: number } {
  const intentos = intentosPrevios + 1
  return { estado: intentos >= MAX_INTENTOS_AVISO ? 'fallido' : 'pendiente', intentos }
}

export function rangoDelBarrido(ahora: Date): { desde: string; hasta: string } {
  return {
    desde: new Date(ahora.getTime() - DIAS_DEL_BARRIDO * 86_400_000).toISOString(),
    hasta: new Date(ahora.getTime() - ESPERA_ANTES_DEL_BARRIDO_MS).toISOString(),
  }
}
