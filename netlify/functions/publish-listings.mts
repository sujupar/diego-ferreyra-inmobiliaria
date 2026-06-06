// DESACTIVADO como scheduled function: el scheduler de Netlify no dispara en
// este sitio (Next 16 + @netlify/plugin-nextjs v5, ver CLAUDE.md). El worker
// corre vía pg_cron → POST /api/cron/publish-listings. Se deja como handler
// on-demand SIN `export const config.schedule` para evitar doble envío si
// Netlify reviviera el cron.
import { runPublishWorker } from '@/lib/portals/worker'

export default async () => {
  await runPublishWorker()
  return new Response('ok', { status: 200 })
}
// NOTA: sin `export const config = { schedule }` a propósito.
