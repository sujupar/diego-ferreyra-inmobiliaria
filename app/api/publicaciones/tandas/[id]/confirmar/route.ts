import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { confirmarTanda } from '@/lib/publicaciones/servidor/tandas'

type Ctx = { params: Promise<{ id: string }> }

// POST: "Programar N videos". Idempotente: dos clics crean los envíos una sola vez.
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    return NextResponse.json(await confirmarTanda(id))
  } catch (e) {
    return respuestaDeError(e, 'confirmar tanda')
  }
}
