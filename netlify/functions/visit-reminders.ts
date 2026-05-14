import type { Config } from '@netlify/functions'

export default async () => {
  const url = `${process.env.URL ?? 'https://app.inmodf.com.ar'}/api/cron/visit-reminders`
  const res = await fetch(url, {
    headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
  })
  return new Response(JSON.stringify({ status: res.status }), {
    headers: { 'content-type': 'application/json' },
  })
}

export const config: Config = {
  schedule: '0 * * * *',
}
