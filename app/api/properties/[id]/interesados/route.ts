import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { esOrigenVisita } from '@/lib/visitas/origen'
import { interesadosParaOrigen } from '@/lib/visitas/interesados'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

/** Personas para el paso "Persona" de la ventana de agendar (spec §3.2 paso 3). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return NextResponse.json({ error: 'No tenés permiso' }, { status: 403 })
  const origen = req.nextUrl.searchParams.get('origen')
  if (!esOrigenVisita(origen)) return NextResponse.json({ error: 'Origen inválido' }, { status: 400 })
  const { id } = await params
  try {
    const prop = await datos.leerPropiedadParaVisita(id)
    if (!prop) return NextResponse.json({ error: 'No encontramos la propiedad' }, { status: 404 })
    if (!puedeVerTodasLasVisitas(role) && prop.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Esa propiedad no es tuya' }, { status: 403 })
    }
    const [consultas, registros, visitasActivas] = await Promise.all([
      origen === 'portal' ? datos.listarConsultasDeLaPropiedad(id) : Promise.resolve([]),
      origen === 'publicidad_meta' || origen === 'publicidad_paga' ? datos.listarRegistrosDeLaPropiedad(id) : Promise.resolve([]),
      datos.visitasActivasDeLaPropiedad(id),
    ])
    return NextResponse.json({ data: interesadosParaOrigen(origen, { consultas, registros, visitasActivas }) })
  } catch (e) {
    console.error('[GET interesados]', e)
    return NextResponse.json({ error: 'No pudimos cargar las personas' }, { status: 500 })
  }
}
