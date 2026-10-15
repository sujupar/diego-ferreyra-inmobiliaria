import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { leerFiltrosResumen } from '@/lib/visitas/filtros'
import { armarResumen, DIAS_DE_AGENDA } from '@/lib/visitas/resumen'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas, alcanceDeVisitas } from '@/lib/visitas/acceso'
import { ESTADOS_ACTIVOS } from '@/lib/visitas/transiciones'
import { fechaEnArgentina, sumarDias } from '@/lib/visitas/horario'
import { inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'
import type { Role } from '@/types/auth.types'

export const dynamic = 'force-dynamic'

/**
 * Resumen de la sección Visitas (spec §3.4 y §4.4): tarjetas, agenda, "requieren tu
 * acción" y estadísticas del período. Las cuentas están en lib/visitas/metricas.ts y
 * lib/visitas/resumen.ts; acá solo permisos, parámetros y las tres lecturas.
 */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return NextResponse.json({ error: 'No tenés permiso para ver visitas' }, { status: 403 })
  const filtros = leerFiltrosResumen(req.nextUrl.searchParams)
  if (!filtros.ok) return NextResponse.json({ error: filtros.error }, { status: 400 })

  const f = filtros.valor
  const verTodo = puedeVerTodasLasVisitas(role)
  const ahora = new Date()
  const hoy = fechaEnArgentina(ahora)
  const base: datos.FiltroConsultaVisitas = {
    alcance: alcanceDeVisitas(role, user.id),
    asesorId: verTodo ? f.asesorId : null,
    propiedadId: f.propiedadId,
    origen: f.origen,
  }
  try {
    const [delPeriodo, abiertas, proximas] = await Promise.all([
      datos.todasLasVisitas({ ...base, desde: inicioDelDiaArgentina(f.desde), hasta: finDelDiaArgentina(f.hasta) }),
      datos.todasLasVisitas({ ...base, estados: ESTADOS_ACTIVOS }),
      datos.todasLasVisitas({ ...base, desde: inicioDelDiaArgentina(hoy), hasta: finDelDiaArgentina(sumarDias(hoy, DIAS_DE_AGENDA - 1)) }),
    ])
    const resumen = armarResumen({
      periodo: { desde: f.desde, hasta: f.hasta },
      delPeriodo: delPeriodo.filas,
      abiertas: abiertas.filas,
      proximas: proximas.filas,
      ahora,
      truncado: delPeriodo.truncado || abiertas.truncado || proximas.truncado,
      verTodo,
    })
    return NextResponse.json({ data: resumen })
  } catch (e) {
    console.error('[GET /api/visits/resumen]', e)
    return NextResponse.json({ error: 'No pudimos cargar el resumen de visitas' }, { status: 500 })
  }
}
