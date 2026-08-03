/**
 * Crea (idempotente) los merge fields que usan las plantillas.
 * Correr: node --env-file=.env.local --import tsx scripts/mailchimp-setup.ts
 */
import { getMailchimpConfig, ensureMergeField, ping } from '@/lib/integrations/mailchimp/client'

async function main() {
  const cfg = getMailchimpConfig()
  if (!cfg) throw new Error('Config incompleta: revisá MAILCHIMP_API_KEY / MAILCHIMP_AUDIENCE_ID en .env.local')
  if (!(await ping(cfg))) throw new Error('Ping a Mailchimp falló (revisá la API key)')
  // FNAME ya existe por default en toda audiencia. Creamos los demás:
  await ensureMergeField(cfg, 'WHATSAPP', 'WhatsApp link')
  await ensureMergeField(cfg, 'LINK_LANDING', 'Link landing tasación')
  await ensureMergeField(cfg, 'CRM_STAGE', 'Etapa CRM')
  console.log('✅ merge fields asegurados: WHATSAPP, LINK_LANDING, CRM_STAGE (+ FNAME por default)')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
