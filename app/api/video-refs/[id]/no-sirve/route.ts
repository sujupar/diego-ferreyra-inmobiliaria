import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'

export const dynamic = 'force-dynamic'

const MAX_MOTIVO = 300
const DESCARTES_PARA_DESACTIVAR = 3

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// POST: "No sirve". Oculta la referencia, guarda el motivo y suma un descarte a la cuenta;
// con 3 descartes a mano la cuenta pasa a inactiva.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const motivoRaw = (body as { motivo?: unknown }).motivo
  if (motivoRaw !== undefined && typeof motivoRaw !== 'string') {
    return NextResponse.json({ error: 'Motivo inválido' }, { status: 400 })
  }
  const motivo = (motivoRaw ?? '').trim()
  if (motivo.length > MAX_MOTIVO) {
    return NextResponse.json({ error: `El motivo puede tener hasta ${MAX_MOTIVO} caracteres` }, { status: 400 })
  }

  const db = admin()
  const { data: ref, error: e1 } = await db.from('video_refs').select('id, cuenta').eq('id', id).maybeSingle()
  if (e1) return NextResponse.json({ error: 'No se pudo completar' }, { status: 500 })
  if (!ref) return NextResponse.json({ error: 'No existe esa referencia' }, { status: 404 })

  const { error: e2 } = await db.from('video_refs')
    .update({ oculta: true, no_sirve_at: new Date().toISOString(), no_sirve_motivo: motivo || null })
    .eq('id', id)
  if (e2) return NextResponse.json({ error: 'No se pudo completar' }, { status: 500 })

  // Descarte a la cuenta (video_refs.cuenta es "@usuario"; radar_cuentas.usuario va sin "@").
  const usuario = (ref.cuenta ?? '').replace(/^@/, '').trim()
  if (usuario) {
    try {
      const { data: c } = await db.from('radar_cuentas').select('descartes_manuales').eq('usuario', usuario).maybeSingle()
      if (c) {
        const n = (c.descartes_manuales ?? 0) + 1
        const patch: Record<string, unknown> = { descartes_manuales: n }
        if (n >= DESCARTES_PARA_DESACTIVAR) patch.activa = false
        await db.from('radar_cuentas').update(patch).eq('usuario', usuario)
      }
    } catch (e) {
      console.warn('[no-sirve] no se pudo sumar el descarte a la cuenta', e)
    }
  }
  return NextResponse.json({ ok: true })
}
