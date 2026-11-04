import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { avanzarPreparacion, EstiloNoAprendido, VideoNoEncontrado } from '@/lib/publicaciones/servidor/preparar'
import { conUrls } from '@/lib/publicaciones/servidor/tandas'

type Ctx = { params: Promise<{ id: string }> }

// POST: avanza UNA etapa (transcribir o describir). El cliente loopea.
export async function POST(_req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  try {
    const video = await avanzarPreparacion(id)
    // Con las URLs armadas: sin ellas la pantalla perdía la miniatura y el video hasta recargar.
    return NextResponse.json({ video: conUrls(video) })
  } catch (e) {
    if (e instanceof EstiloNoAprendido) return NextResponse.json({ error: e.message }, { status: 409 })
    if (e instanceof VideoNoEncontrado) return NextResponse.json({ error: e.message }, { status: 404 })
    console.error('[publicaciones] preparar route', id, e)
    return NextResponse.json({ error: 'No se pudo avanzar la preparación' }, { status: 500 })
  }
}
