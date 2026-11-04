import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { claimForGuionizado } from '@/lib/video-refs/repo'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST {id}: reclama una ref existente (sin_usar -> guionizando). No guioniza acá.
export async function POST(req: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const id = (body as { id?: unknown })?.id
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  try {
    const ok = await claimForGuionizado(id, user.id)
    if (!ok) return NextResponse.json({ error: 'ya fue usada' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[video-refs/guionizar]', e)
    return NextResponse.json({ error: 'No se pudo crear la pieza' }, { status: 500 })
  }
}
