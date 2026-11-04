import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'
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
    // Conectar un video a una propiedad es difundirla: mismo permiso que enganchar un reel en la ficha.
    if (cambios.property_id && !(await puedeDifundir(cambios.property_id, auth.user.id, auth.user.profile.role, 'difundir'))) {
      return NextResponse.json({ error: 'No tenés permiso para difundir esa propiedad' }, { status: 403 })
    }
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
