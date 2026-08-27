/**
 * Vigía del estado de `consulta_portal_v2` en Meta.
 *
 * Pensado para correr como Monitor: cada línea que escribe es un aviso. Solo
 * habla cuando pasa algo — se calla mientras siga PENDING.
 *
 * Avisa en TODOS los desenlaces, no solo en el bueno: una plantilla puede quedar
 * REJECTED, PAUSED o DISABLED, y si solo mirara APPROVED el silencio se
 * confundiría con "todavía esperando".
 *
 * Uso: node --env-file=.env.local --import tsx scripts/watch-plantilla-consulta-v2.ts
 */
import { writeSync } from 'node:fs'

const API = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const NOMBRE = 'consulta_portal_v2'
const CADA_MS = 5 * 60 * 1000
// Cada 4 horas. Con el latido cada hora, una espera larga llena la pantalla de
// mensajes idénticos que no dicen nada nuevo; el chequeo REAL sigue siendo cada
// 5 minutos, esto es solo la señal de vida.
const LATIDO_CADA = 48 // 48 vueltas × 5 min = 4 horas

/** Desde cuándo se espera de verdad, para que reiniciar el vigía no reinicie el conteo. */
const DESDE = process.argv[2] ? new Date(process.argv[2]) : new Date()

/** stdout sin buffer: en un pipe, console.log puede quedarse esperando. */
const decir = (s: string) => writeSync(1, `${s}\n`)
const reloj = () => new Date().toLocaleTimeString('es-AR', { hour12: false })

async function estado(): Promise<{ status: string; category: string; motivo: string } | null> {
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!waba || !token) throw new Error('faltan WHATSAPP_BUSINESS_ACCOUNT_ID / WHATSAPP_ACCESS_TOKEN')
  const res = await fetch(
    `https://graph.facebook.com/${API}/${waba}/message_templates?limit=100&fields=name,status,category,rejected_reason&access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(20_000) },
  )
  const j = (await res.json()) as { data?: Array<Record<string, string>> }
  const t = (j.data ?? []).find(x => x.name === NOMBRE)
  if (!t) return null
  return { status: t.status, category: t.category, motivo: t.rejected_reason ?? 'NONE' }
}

async function main() {
  let fallos = 0
  let vueltas = 0
  for (;;) {
    try {
      const e = await estado()
      fallos = 0
      if (!e) {
        decir(`⚠️ [${reloj()}] la plantilla ${NOMBRE} desapareció de la cuenta de Meta`)
        process.exit(1)
      }
      if (e.status !== 'PENDING') {
        const bien = e.status === 'APPROVED'
        decir(`${bien ? '✅' : '❌'} [${reloj()}] ${NOMBRE}: ${e.status} · categoría ${e.category}` +
          (e.motivo && e.motivo !== 'NONE' ? ` · motivo: ${e.motivo}` : ''))
        if (bien && e.category !== 'UTILITY') {
          decir(`⚠️ quedó como ${e.category}, no UTILITY: Meta retiene las de marketing por el tope diario`)
        }
        process.exit(0)
      }
      vueltas++
      if (vueltas % LATIDO_CADA === 0) {
        const horas = Math.round((Date.now() - DESDE.getTime()) / 3_600_000)
        decir(`⏳ [${reloj()}] sigue PENDING (${horas}h esperando)`)
      }
    } catch (err) {
      fallos++
      // Un tropiezo de red no dice nada; cinco seguidos sí (media hora ciego).
      if (fallos === 5) decir(`⚠️ [${reloj()}] 5 consultas seguidas fallaron: ${err instanceof Error ? err.message : err}`)
    }
    await new Promise(r => setTimeout(r, CADA_MS))
  }
}
main().catch(e => { writeSync(1, `❌ el vigía se cayó: ${e instanceof Error ? e.message : e}\n`); process.exit(1) })
