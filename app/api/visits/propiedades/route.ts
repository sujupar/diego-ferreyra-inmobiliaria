import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

/** Paso 1 de la ventana: propiedades captadas disponibles/reservadas. Asesor: solo las suyas. */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return NextResponse.json({ error: 'No tenés permiso' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const id = sp.get('id')
  if (id && !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Propiedad inválida' }, { status: 400 })
  try {
    const data = await datos.buscarPropiedadesParaVisita({
      q: (sp.get('q') ?? '').slice(0, 80),
      id: id ?? undefined,
      asesorId: puedeVerTodasLasVisitas(role) ? undefined : user.id,
    })
    return NextResponse.json({ data })
  } catch (e) {
    console.error('[GET visits/propiedades]', e)
    return NextResponse.json({ error: 'No pudimos buscar propiedades' }, { status: 500 })
  }
}
