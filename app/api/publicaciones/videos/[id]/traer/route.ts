import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { traerDeDrive } from '@/lib/publicaciones/servidor/drive'
import { respuestaDeError } from '@/lib/publicaciones/servidor/http'

type Ctx = { params: Promise<{ id: string }> }

// POST: copia de Drive a Storage lo que entra en un pedido. El navegador repite hasta que el video sale de `subiendo`.
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    return NextResponse.json(await traerDeDrive(id))
  } catch (e) {
    return respuestaDeError(e, 'traer de drive')
  }
}
