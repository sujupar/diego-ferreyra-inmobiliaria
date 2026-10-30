import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { leerBody, respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { altaVideos } from '@/lib/publicaciones/servidor/tandas'
import { altaVideosSchema } from '@/lib/publicaciones/validacion'

type Ctx = { params: Promise<{ id: string }> }

// POST: da de alta N videos y devuelve una URL firmada por video para subirlo
// directo a Storage (el archivo nunca pasa por el body de Next).
export async function POST(req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    const alta = await leerBody(req, altaVideosSchema)
    return NextResponse.json(await altaVideos(id, alta))
  } catch (e) {
    return respuestaDeError(e, 'alta videos')
  }
}
