/**
 * Task 6 — remediación única de los 2 leads "John Doe" ya existentes en la
 * base (evidencia A4 de la auditoría: bot que ejecuta JS de verdad, corre
 * 2-4 min DESPUÉS de crear una campaña Meta, mismo nombre/email/teléfono/CTA,
 * utm={}). Confirmado por lectura directa (2026-07-30): SOLO existen 2 leads
 * con name='John Doe' en toda la base — `lead_number` #1001 y #1008, mismo
 * email `john.doe@gmail.com`, mismo teléfono `+54 11 1234 5678`, mismo
 * `message` ("Coordinar una visita · closing").
 *
 * Acción (borrado LÓGICO, nunca DELETE — regla dura del proyecto):
 *   - `suspected_bot = true`
 *   - `bot_reason`  = el mismo motivo que calcularía `detectFillerLeadData`
 *                     hoy, para que quede auditable con la MISMA lógica que
 *                     ahora protege al formulario en vivo.
 *   - `deleted_at`  = now() (papelera del Inbox) — el `lead_number` NO se toca.
 *
 * Idempotente: solo actualiza filas que hoy tengan `suspected_bot=false` (no
 * pisa una fila que ya haya sido tocada por otra corrida).
 *
 * Uso: node --env-file=.env.local --import tsx scripts/mark-johndoe-leads-suspected.ts
 */
import { createClient } from '@supabase/supabase-js'
import { detectFillerLeadData } from '../lib/leads/anti-bot'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const LEAD_NUMBERS = [1001, 1008]

async function main() {
  const { data: rows, error } = await supabase
    .from('property_leads')
    .select('id, lead_number, name, email, phone, deleted_at, suspected_bot')
    .in('lead_number', LEAD_NUMBERS)
    .order('lead_number', { ascending: true })
  if (error) {
    console.error('No se pudo leer:', error.message)
    process.exit(1)
  }
  if (!rows || rows.length !== LEAD_NUMBERS.length) {
    console.error(
      `Se esperaban ${LEAD_NUMBERS.length} leads (lead_number ${LEAD_NUMBERS.join(', ')}) y se encontraron ${rows?.length ?? 0}. Abortando sin tocar nada.`,
    )
    process.exit(1)
  }

  // Guardrail: confirmar que de verdad son los "John Doe" esperados antes de tocar nada.
  const inesperados = rows.filter(r => r.name !== 'John Doe')
  if (inesperados.length > 0) {
    console.error('Alguna fila NO se llama "John Doe" — abortando por seguridad:', inesperados)
    process.exit(1)
  }

  for (const row of rows) {
    if (row.suspected_bot) {
      console.log(`lead_number #${row.lead_number}: ya estaba marcado — no se toca (idempotente).`)
      continue
    }
    const reason = detectFillerLeadData({ name: row.name, email: row.email, phone: row.phone })
    const { error: updErr } = await supabase
      .from('property_leads')
      .update({
        suspected_bot: true,
        bot_reason: reason ?? 'confirmado manualmente como bot (evidencia A4 de la auditoría 2026-07-30)',
        deleted_at: row.deleted_at ?? new Date().toISOString(),
      })
      .eq('id', row.id)
    if (updErr) {
      console.error(`lead_number #${row.lead_number}: FALLÓ el update:`, updErr.message)
      process.exit(1)
    }
    console.log(`lead_number #${row.lead_number}: marcado suspected_bot=true, bot_reason="${reason}", enviado a la papelera.`)
  }

  // Verificación final.
  const { data: after } = await supabase
    .from('property_leads')
    .select('id, lead_number, suspected_bot, bot_reason, deleted_at')
    .in('lead_number', LEAD_NUMBERS)
    .order('lead_number', { ascending: true })
  console.log('\nEstado final:')
  console.log(JSON.stringify(after, null, 2))
  const ok = (after ?? []).every(r => r.suspected_bot === true && r.deleted_at != null)
  console.log(ok ? '\n✅ Los 2 leads quedaron marcados y en la papelera.' : '\n❌ Algo no quedó como se esperaba.')
  process.exit(ok ? 0 : 1)
}

main()
