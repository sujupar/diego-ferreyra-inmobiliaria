import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { leerBody, respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { actualizarTanda, borrarTanda, detalleTanda } from '@/lib/publicaciones/servidor/tandas'
import { patchTandaSchema } from '@/lib/publicaciones/validacion'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    return NextResponse.json(await detalleTanda(id))
  } catch (e) {
    return respuestaDeError(e, 'detalle tanda')
  }
}

// PATCH: ritmo, fecha de inicio y "solo días hábiles".
export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    const cambios = await leerBody(req, patchTandaSchema)
    return NextResponse.json({ tanda: await actualizarTanda(id, cambios) })
  } catch (e) {
    return respuestaDeError(e, 'actualizar tanda')
  }
}

// DELETE: descarta un borrador con sus archivos.
export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const { id } = await params
    await borrarTanda(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return respuestaDeError(e, 'borrar tanda')
  }
}
