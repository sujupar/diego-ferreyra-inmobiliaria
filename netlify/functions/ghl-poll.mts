import type { Config } from '@netlify/functions'

/**
 * Scheduled function que dispara el polling de GHL.
 *
 * Cada 10 minutos pega a `/api/cron/ghl-poll` con el secret. La lógica real
 * (fetch GHL + import a Supabase) vive en el endpoint Next.js para poder
 * compartir tipos y libs con el resto de la app.
 */
export default async () => {
  const url = `${process.env.URL ?? 'https://app.inmodf.com.ar'}/api/cron/ghl-poll`
  const res = await fetch(url, {
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
  })
  const body = await res.json().catch(() => ({}))
  return new Response(JSON.stringify({ status: res.status, body }), {
    headers: { 'content-type': 'application/json' },
  })
}

export const config: Config = {
  schedule: '*/10 * * * *',
}
