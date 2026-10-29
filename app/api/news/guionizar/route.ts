import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { createPendingScripts } from '@/lib/news/scripts-repo'
import type { NewsCandidate } from '@/lib/news/perplexity'

export const dynamic = 'force-dynamic'

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

function isCandidate(v: unknown): v is NewsCandidate {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return isStr(o.titulo) && isStr(o.url) && typeof o.medio === 'string' &&
    typeof o.fecha === 'string' && typeof o.resumen === 'string'
}

// POST: crea piezas en estado 'guionizando'. No guioniza acá (Task 4).
export async function POST(req: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const items = (body as { items?: unknown })?.items
  if (!Array.isArray(items) || items.length === 0 || !items.every(isCandidate)) {
    return NextResponse.json({ error: 'items inválidos' }, { status: 400 })
  }

  try {
    const { ids } = await createPendingScripts(items, user.id)
    return NextResponse.json({ ids })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
