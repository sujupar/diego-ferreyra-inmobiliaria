import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { cierresDePeriodo, listarParaElListado, propiedadesDelAsesor } from '@/lib/informes/datos'
import { alcanceDelListado, ordenarFilas, type FilaListado } from '@/lib/informes/listado'
import { faltantes } from '@/lib/informes/resumen'
import { respuestaDeError } from '@/lib/informes/rutas'

export const dynamic = 'force-dynamic'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/informes — el listado de informes (pantalla `/informes`, la de Paula). `?estado=borrador|listo` y
 * `?hasta=AAAA-MM-DD` filtran. Quién ve qué: `alcanceDelListado` (el abogado, nada).
 */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const alcance = alcanceDelListado(String(user.profile.role))
  if (alcance === 'ninguno') return NextResponse.json({ error: 'Los informes no están disponibles para tu rol' }, { status: 403 })
  const sp = new URL(req.url).searchParams
  const estado = sp.get('estado')
  const hasta = sp.get('hasta')
  if (estado && estado !== 'borrador' && estado !== 'listo') return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  if (hasta && !FECHA.test(hasta)) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  try {
    const propertyIds = alcance === 'propias' ? await propiedadesDelAsesor(user.id) : null
    const [filas, periodos] = await Promise.all([
      listarParaElListado({ propertyIds, estado: estado === 'borrador' || estado === 'listo' ? estado : null, hasta }),
      cierresDePeriodo(),
    ])
    const data: FilaListado[] = filas.map(({ informe: i, direccion }) => ({
      id: i.id, propertyId: i.propertyId, direccion, desde: i.desde, hasta: i.hasta, origen: i.origen, estado: i.estado,
      faltantes: i.estado === 'listo' ? 0 : faltantes(i).length, listoAt: i.listoAt,
    }))
    return NextResponse.json({ data: { informes: ordenarFilas(data), periodos } })
  } catch (e) {
    return respuestaDeError(e, 'listar los informes')
  }
}
