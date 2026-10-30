import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { leerBody, respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { actualizarVideo, borrarVideo } from '@/lib/publicaciones/servidor/tandas'
import { patchVideoSchema } from '@/lib/publicaciones/validacion'

type Ctx = { params: Promise<{ id: string }> }

// PATCH: lo que se edita de un video (autoguardado) y los pasos del navegador.
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    const cambios = await leerBody(req, patchVideoSchema)
    return NextResponse.json({ video: await actualizarVideo(id, cambios) })
  } catch (e) {
    return respuestaDeError(e, 'actualizar video')
  }
}

// DELETE: "Quitar" o "Sacar del calendario".
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    await borrarVideo(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return respuestaDeError(e, 'borrar video')
  }
}
