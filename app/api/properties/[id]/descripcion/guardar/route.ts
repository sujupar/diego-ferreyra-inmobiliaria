/**
 * POST /api/properties/[id]/descripcion/guardar → guarda el titular y la
 * descripción que el asesor aceptó en la vista previa (con sus retoques). La
 * descripción anterior queda respaldada en `descripcion_ia.anteriores`.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { guardarDescripcion } from '@/lib/descripcion/servicio'
import { autorizarDescripcion, respuestaDeError } from '../autorizar'

const TextoSchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(1000),
  body: z.string().trim().min(1).max(8000),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  const { id } = await params
  try {
    if (!(await autorizarDescripcion(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const parsed = TextoSchema.safeParse(await req.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Faltan el titular o el cuerpo.', detail: parsed.error.flatten() }, { status: 400 })
    }
    await guardarDescripcion(id, parsed.data)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return respuestaDeError(err, 'guardar')
  }
}
