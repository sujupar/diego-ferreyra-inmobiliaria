import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { cargarPeriodo } from '@/lib/consultas/servicio'
import { leerFiltrosConsultas } from '@/lib/consultas/filtros'
import { puedeGestionarVisitas } from '@/lib/visitas/acceso'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import type { Role } from '@/types/auth.types'

/**
 * El período ENTERO de Consultas (portales + landings), con cada consulta ya
 * decidida. La pantalla filtra, pagina y calcula las estadísticas sin volver a
 * pedir: esta ruta solo se usa al CAMBIAR el período (la primera carga viene
 * dentro de la página). Del querystring se lee solo el período.
 *
 * Quién ve qué: los mismos permisos que Visitas. El abogado y un rol
 * desconocido no pasan. El asesor recibe SOLO las consultas de sus propiedades
 * o asignadas a él: el alcance se aplica en la base con el usuario de la sesión.
 */
export const dynamic = 'force-dynamic'

function error(status: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status })
}

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo')
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return error(403, 'No tenés permiso para ver las consultas')

  const filtros = leerFiltrosConsultas(req.nextUrl.searchParams, fechaEnArgentina(new Date()))
  if (!filtros.ok) return error(400, filtros.error)
  const f = filtros.valor

  try {
    const periodo = await cargarPeriodo({ rol: role, usuarioId: user.id, desde: f.desde, hasta: f.hasta, etiqueta: f.etiqueta })
    return NextResponse.json(periodo)
  } catch (e) {
    console.error('[GET /api/consultas]', e)
    return error(500, 'No pudimos cargar las consultas')
  }
}
