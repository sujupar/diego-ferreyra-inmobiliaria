/**
 * Saca de `portal_inquiries` los correos que NUNCA fueron consultas: la
 * publicidad de Argenprop que se coló entre el 5 y el 25 de septiembre de 2026
 * (ver CLAUDE.md § "La publicidad de los portales NO es una consulta").
 *
 * Desde el PR #32 el cron ya no las deja entrar; esto limpia las que quedaron,
 * que ensucian el conteo de consultas de septiembre.
 *
 * ## Cómo decide qué borrar
 *
 * NO tiene una lista escrita a mano: usa `esConsultaDeVerdad`, la MISMA función
 * que usa el cron en producción. Si mañana la regla cambia, este script cambia
 * con ella y no hay dos criterios que se contradigan.
 *
 * ## Qué NO se pierde
 *
 * Antes de borrar, cada correo se anota en `portal_emails_descartados` con su
 * motivo — el mismo lugar donde el cron anota los que descarta ahora. La fila se
 * va de la lista de consultas, pero el rastro de que ese correo existió queda.
 * Además se guarda un respaldo completo en JSON (consultas + sus avisos) por si
 * hubiera que revertir.
 *
 * Borrar una consulta arrastra en CASCADA sus filas de
 * `portal_inquiry_notifications` (los avisos de WhatsApp que se mandaron por
 * ella). Es correcto: son avisos de algo que no era una consulta.
 *
 * Sin `--commit` no toca nada: muestra qué haría.
 *
 *   node --env-file=.env.local --import tsx scripts/limpiar-consultas-publicidad.ts
 *   node --env-file=.env.local --import tsx scripts/limpiar-consultas-publicidad.ts --commit
 */
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { esConsultaDeVerdad } from '../lib/integrations/portal-inquiries/es-consulta'
import type { Portal } from '../lib/integrations/portal-inquiries/types'

/** Tope de seguridad: si la regla quisiera borrar más que esto, algo está mal. */
const TOPE = 15

interface Fila {
  id: string
  seq: number
  portal: Portal
  gmail_message_id: string | null
  raw_subject: string | null
  lead_name: string | null
  lead_email: string | null
  lead_phone: string | null
  received_at: string
}

async function main() {
  const commit = process.argv.includes('--commit')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const casilla = process.env.GMAIL_IMPERSONATE_EMAIL ?? null
  if (!casilla) throw new Error('Falta GMAIL_IMPERSONATE_EMAIL: sin saber cuál es nuestra casilla, la regla no puede decidir')

  const { data, error } = await sb
    .from('portal_inquiries')
    .select('id, seq, portal, gmail_message_id, raw_subject, lead_name, lead_email, lead_phone, received_at')
    .order('seq')
  if (error || !data) throw new Error(`No pude leer las consultas: ${error?.message}`)
  const filas = data as unknown as Fila[]

  const aBorrar = filas.filter(f => !esConsultaDeVerdad(
    { portal: f.portal, subject: f.raw_subject ?? '', leadName: f.lead_name, leadEmail: f.lead_email, leadPhone: f.lead_phone },
    casilla,
  ).esConsulta)

  console.log(`consultas en la base: ${filas.length}`)
  console.log(`no son consultas:     ${aBorrar.length}\n`)
  for (const f of aBorrar) {
    console.log(`  #${f.seq} · ${f.received_at.slice(0, 10)} · ${f.portal} · ${String(f.raw_subject).replace(/\s+/g, ' ').slice(0, 56)}`)
  }

  // Dos frenos antes de tocar nada.
  const conPersona = aBorrar.filter(f => f.lead_phone || f.lead_name || (f.lead_email && f.lead_email.toLowerCase() !== casilla.toLowerCase()))
  if (conPersona.length > 0) {
    throw new Error(`ABORTO: ${conPersona.length} de las candidatas tienen datos de una persona (#${conPersona.map(f => f.seq).join(', #')})`)
  }
  if (aBorrar.length > TOPE) {
    throw new Error(`ABORTO: la regla quiere borrar ${aBorrar.length} filas y el tope es ${TOPE}. Revisar antes de seguir.`)
  }
  if (aBorrar.length === 0) { console.log('\nNo hay nada para limpiar.'); return }

  const ids = aBorrar.map(f => f.id)
  const { data: avisos } = await sb
    .from('portal_inquiry_notifications')
    .select('id, inquiry_id, recipient_phone, status, error_message, created_at')
    .in('inquiry_id', ids)
  console.log(`\navisos de WhatsApp que se van con ellas (en cascada): ${(avisos ?? []).length}`)

  if (!commit) { console.log('\n(SIMULACIÓN) No borré nada. Agregá --commit.'); return }

  // 1) Respaldo completo antes de tocar la base.
  const respaldo = `/tmp/respaldo-consultas-publicidad-${Date.now()}.json`
  writeFileSync(respaldo, JSON.stringify({ consultas: aBorrar, avisos: avisos ?? [] }, null, 2))
  console.log(`\nrespaldo: ${respaldo}`)

  // 2) Dejar el rastro donde corresponde, antes de borrar.
  const anotar = aBorrar
    .filter(f => f.gmail_message_id)
    .map(f => ({
      gmail_message_id: f.gmail_message_id!,
      portal: f.portal,
      remitente: null,
      asunto: f.raw_subject,
      motivo: 'publicidad del portal registrada como consulta antes del filtro (limpieza 2026-09-25)',
    }))
  if (anotar.length > 0) {
    const { error: errAnotar } = await sb
      .from('portal_emails_descartados')
      .upsert(anotar, { onConflict: 'gmail_message_id', ignoreDuplicates: true })
    if (errAnotar) throw new Error(`No pude anotar los descartados (no borro nada): ${errAnotar.message}`)
    console.log(`anotados en portal_emails_descartados: ${anotar.length}`)
  }

  // 3) Recién ahora, borrar.
  const { error: errBorrar } = await sb.from('portal_inquiries').delete().in('id', ids)
  if (errBorrar) throw new Error(`No pude borrar: ${errBorrar.message}`)

  const { count: quedan } = await sb.from('portal_inquiries').select('id', { count: 'exact', head: true })
  console.log(`\n✅ borradas ${ids.length} · consultas que quedan: ${quedan}`)
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
