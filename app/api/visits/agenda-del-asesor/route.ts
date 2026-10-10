import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

const schema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  propiedad: z.string().uuid(),
  asesor: z.string().uuid().nullish(),
})

/** Visitas del día del asesor y de la propiedad: alimenta los AVISOS de choque (no bloquean). */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return NextResponse.json({ error: 'No tenés permiso' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const p = schema.safeParse({ fecha: sp.get('fecha'), propiedad: sp.get('propiedad'), asesor: sp.get('asesor') })
  if (!p.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const asesorId = puedeVerTodasLasVisitas(role) ? (p.data.asesor ?? null) : user.id
  try {
    const data = await datos.visitasDelDia({ fecha: p.data.fecha, asesorId, propiedadId: p.data.propiedad })
    return NextResponse.json({ data })
  } catch (e) {
    console.error('[GET agenda-del-asesor]', e)
    return NextResponse.json({ error: 'No pudimos revisar la agenda' }, { status: 500 })
  }
}
