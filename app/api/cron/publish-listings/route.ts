import { NextResponse } from 'next/server'
import { runPublishWorker } from '@/lib/portals/worker'

export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('x-cron-secret') === secret
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 403 })
  try {
    const r = await runPublishWorker()
    return NextResponse.json(r)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return POST(req)
}
