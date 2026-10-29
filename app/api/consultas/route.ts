import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/consultas/datos'
import { leerFiltrosConsultas } from '@/lib/consultas/filtros'
import { armarBandeja, consultasEnBandeja, contarPorPortal, contarPorPropiedad, POR_PAGINA } from '@/lib/consultas/bandeja'
import type { RespuestaBandeja } from '@/lib/consultas/tipos'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas, alcanceDeVisitas } from '@/lib/visitas/acceso'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import { inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'
import type { Role } from '@/types/auth.types'

/**
 * La bandeja de Consultas (portales + landings) de un período, ya armada para
 * la pantalla: una página de 25, las tarjetas y los números de los selectores.
 *
 * Quién ve qué: los mismos permisos que Visitas (de la consulta sale la
 * visita). El abogado y un rol desconocido no pasan. El asesor ve SOLO las
 * consultas de sus propiedades o asignadas a él: el alcance se aplica en la
 * base, así que pedir `?propiedad=<ajena>` le devuelve vacío, y su `?asesor=`
 * se ignora (Review Focus 3).
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

  const lectura: datos.FiltroConsultas = {
    alcance: alcanceDeVisitas(role, user.id),
    desde: inicioDelDiaArgentina(f.desde),
    hasta: finDelDiaArgentina(f.hasta),
    portal: f.portal,
    propiedad: f.propiedad,
    asesor: puedeVerTodasLasVisitas(role) ? f.asesor : null,
    q: f.q,
  }

  try {
    // Los números de un selector se cuentan SIN su propio filtro: si no, al
    // elegir ZonaProp el selector diría "Argenprop (0)" y no habría cómo saber
    // cuántas hay para cambiar. Solo hace falta otra lectura si el filtro está.
    const [principal, sinPortal, sinPropiedad] = await Promise.all([
      datos.consultasDelPeriodo(lectura),
      f.portal ? datos.consultasDelPeriodo({ ...lectura, portal: null }) : null,
      f.propiedad ? datos.consultasDelPeriodo({ ...lectura, propiedad: null }) : null,
    ])
    const filas = principal.filas
    const paraPropiedades = sinPropiedad?.filas ?? filas

    const propertyIds = [...new Set(filas.map((c) => c.property_id).filter((id): id is string => id !== null))]
    const inquiryIds = filas.filter((c) => c.tipo === 'portal').map((c) => c.id)
    const asesorIds = [...new Set(filas.map((c) => c.asesor_propiedad ?? c.assigned_to).filter((id): id is string => id !== null))]
    const idsParaEtiquetas = [...new Set([
      ...propertyIds,
      ...paraPropiedades.map((c) => c.property_id).filter((id): id is string => id !== null),
    ])]

    const [visitas, nombres] = await Promise.all([
      datos.visitasParaConsultas(propertyIds, inquiryIds),
      datos.propiedadesYAsesores(idsParaEtiquetas, asesorIds),
    ])

    const enBandeja = consultasEnBandeja(filas, visitas, nombres.propiedades, nombres.asesores)
    const bandeja = armarBandeja(enBandeja, f)
    const truncado = principal.truncado || sinPortal?.truncado === true || sinPropiedad?.truncado === true

    const respuesta: RespuestaBandeja = {
      ...bandeja,
      pagina: f.pagina,
      porPagina: POR_PAGINA,
      porPortal: contarPorPortal(sinPortal?.filas ?? filas, f.portal),
      porPropiedad: contarPorPropiedad(paraPropiedades, nombres.propiedades, f.propiedad),
      periodo: { desde: f.desde, hasta: f.hasta, etiqueta: f.etiqueta },
      ...(truncado ? { truncado: true as const } : {}),
    }
    return NextResponse.json(respuesta)
  } catch (e) {
    console.error('[GET /api/consultas]', e)
    return error(500, 'No pudimos cargar las consultas')
  }
}
