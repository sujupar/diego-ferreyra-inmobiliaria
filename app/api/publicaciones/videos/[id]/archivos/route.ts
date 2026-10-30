import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { leerBody, respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { urlParaArchivo } from '@/lib/publicaciones/servidor/tandas'
import { archivoSchema } from '@/lib/publicaciones/validacion'

type Ctx = { params: Promise<{ id: string }> }

// POST: URL firmada para subir la miniatura, el audio o volver a subir el video.
export async function POST(req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    const { kind } = await leerBody(req, archivoSchema)
    return NextResponse.json(await urlParaArchivo(id, kind))
  } catch (e) {
    return respuestaDeError(e, 'url de archivo')
  }
}
