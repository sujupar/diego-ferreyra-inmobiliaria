import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { puedeGestionarVisitas, puedeVerVisita } from '@/lib/visitas/acceso'
import { asegurarLinkDeEncuesta, encuestaParaFicha, prepararYEnviarEncuesta, ReenvioNoPermitido } from '@/lib/visitas/encuesta/servicio'
import type { Role, UserWithProfile } from '@/types/auth.types'

/**
 * La encuesta desde la ficha de la visita (adenda §11.4): estado, "Crear link" (visitas realizadas
 * antes de esta entrega) y "Reenviar por WhatsApp". Mismo permiso que ver la visita; el abogado no.
 */
const cuerpo = z.object({ accion: z.enum(['link', 'reenviar']) }).strict()

async function permitir(id: string): Promise<{ ok: true; user: UserWithProfile; status: string } | { ok: false; res: NextResponse }> {
  const user = await getUser()
  if (!user || !user.profile.is_active) return { ok: false, res: NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 }) }
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return { ok: false, res: NextResponse.json({ error: 'No tenés permiso sobre esta visita' }, { status: 403 }) }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, res: NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 }) }
  const visita = await datos.leerVisita(id)
  if (!visita || !puedeVerVisita(role, user.id, visita)) return { ok: false, res: NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 }) }
  return { ok: true, user, status: visita.status }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const p = await permitir(id)
    if (!p.ok) return p.res
    return NextResponse.json({ data: await encuestaParaFicha(id, new Date()) })
  } catch (e) {
    console.error('[GET /api/visits/[id]/encuesta]', e)
    return NextResponse.json({ error: 'No pudimos cargar la encuesta' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const p = await permitir(id)
    if (!p.ok) return p.res
    const parsed = cuerpo.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    if (p.status !== 'completed') {
      return NextResponse.json({ error: 'La encuesta se crea cuando la visita se marca como realizada' }, { status: 409 })
    }
    const ahora = new Date()
    if (parsed.data.accion === 'link') {
      await asegurarLinkDeEncuesta(id, p.user.id, ahora)
      return NextResponse.json({ data: await encuestaParaFicha(id, ahora) })
    }
    try {
      return NextResponse.json({ data: await prepararYEnviarEncuesta(id, { reenvio: true, actorId: p.user.id, ahora }) })
    } catch (e) {
      if (e instanceof ReenvioNoPermitido) return NextResponse.json({ error: e.message }, { status: 409 })
      throw e
    }
  } catch (e) {
    console.error('[POST /api/visits/[id]/encuesta]', e)
    return NextResponse.json({ error: 'No pudimos hacer el cambio. Probá de nuevo.' }, { status: 500 })
  }
}
