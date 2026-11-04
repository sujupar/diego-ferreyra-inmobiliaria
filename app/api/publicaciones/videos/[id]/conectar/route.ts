import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { reconectarVideo } from '@/lib/publicaciones/servidor/conexion'
import { respuestaDeError } from '@/lib/publicaciones/servidor/http'

type Ctx = { params: Promise<{ id: string }> }

// POST: "Conectar de nuevo" — vuelve a conectar los comentarios de un video ya publicado.
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    const r = await reconectarVideo(id)
    return NextResponse.json(r, { status: r.ok ? 200 : 409 })
  } catch (e) {
    return respuestaDeError(e, 'conectar comentarios')
  }
}
