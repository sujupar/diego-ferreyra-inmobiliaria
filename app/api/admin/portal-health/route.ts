import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface PortalSummary {
  published: number
  failed: number
  pending: number
  publishing: number
  paused: number
  total: number
}

export async function GET() {
  try {
    await requireRole('admin', 'dueno', 'coordinador')
    const supabase = getAdmin()

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [recent, allPending] = await Promise.all([
      supabase
        .from('property_listings')
        .select('portal, status')
        .gte('updated_at', since),
      supabase
        .from('property_listings')
        .select('portal, status')
        .eq('status', 'pending'),
    ])

    const summary: Record<string, PortalSummary> = {}
    const ensure = (p: string) => {
      summary[p] = summary[p] ?? {
        published: 0, failed: 0, pending: 0, publishing: 0, paused: 0, total: 0,
      }
      return summary[p]
    }

    for (const l of recent.data ?? []) {
      const s = ensure(l.portal)
      s.total++
      if (l.status === 'published') s.published++
      else if (l.status === 'failed') s.failed++
      else if (l.status === 'publishing') s.publishing++
      else if (l.status === 'paused') s.paused++
    }
    for (const l of allPending.data ?? []) {
      const s = ensure(l.portal)
      s.pending++
    }

    return NextResponse.json({
      summary,
      lastChecked: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
