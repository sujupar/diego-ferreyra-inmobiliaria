import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { reintentarEnvio } from '@/lib/publicaciones/servidor/tandas'

type Ctx = { params: Promise<{ id: string }> }

// POST: un envío fallido vuelve a la cola desde cero (sale en la próxima corrida).
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    return NextResponse.json({ envio: await reintentarEnvio(id) })
  } catch (e) {
    return respuestaDeError(e, 'reintentar envío')
  }
}
