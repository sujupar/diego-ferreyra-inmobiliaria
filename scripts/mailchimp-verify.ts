/**
 * Smoke test: upsert de un contacto de prueba + tag, y lo lee de vuelta.
 * NO manda emails (ningún Journey activo). Requiere MAILCHIMP_SYNC_ENABLED=true
 * SOLO para esta prueba (el script no lo chequea; llama al client directo).
 * Correr: node --env-file=.env.local --import tsx scripts/mailchimp-verify.ts
 */
import { getMailchimpConfig, upsertMember, setMemberTags } from '@/lib/integrations/mailchimp/client'
import { mergeFieldsFor } from '@/lib/integrations/mailchimp/subscriber'

async function main() {
  const cfg = getMailchimpConfig()
  if (!cfg) throw new Error('Config incompleta')
  const email = 'prueba+mailchimp@inmodf.com.ar'
  const up = await upsertMember(cfg, email, mergeFieldsFor('Prueba Mailchimp', 'request'))
  console.log('upsert:', up)
  if (!up.ok) throw new Error('upsert falló: ' + up.error)
  const tg = await setMemberTags(cfg, email, 'seq-solicita', ['seq-agendada', 'seq-no-realizada', 'seq-realizada', 'seq-seguimiento'])
  console.log('tags:', tg)
  if (!tg.ok) throw new Error('tags falló: ' + tg.error)
  console.log('\n✅ contacto de prueba creado con tag seq-solicita — verificalo en el Audience de Mailchimp')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
