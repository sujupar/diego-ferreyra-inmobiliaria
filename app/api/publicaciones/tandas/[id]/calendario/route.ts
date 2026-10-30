import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { aplicarCalendario } from '@/lib/publicaciones/servidor/tandas'

type Ctx = { params: Promise<{ id: string }> }

// POST: aplica el ritmo de la tanda a sus videos (respeta las horas puestas a mano).
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    return NextResponse.json({ videos: await aplicarCalendario(id) })
  } catch (e) {
    return respuestaDeError(e, 'calendario')
  }
}
