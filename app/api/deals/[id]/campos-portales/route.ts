import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessDeal } from '@/lib/auth/entity-access'
import { resolveCategory } from '@/lib/portals/mercadolibre/mapping'
import { fetchCategoryAttributes } from '@/lib/portals/mercadolibre/category-attributes'
import { getApSchema } from '@/lib/portals/argenprop/field-schema'
import { camposPendientesDeVisita } from '@/lib/portals/datos-visita'

const TIPOS = new Set(['departamento', 'casa', 'ph', 'otro'])

/**
 * GET /api/deals/[id]/campos-portales?tipo=departamento
 *
 * Qué falta preguntar en la VISITA para que los wizards de MercadoLibre y
 * Argenprop salgan prellenados (Sección 08 del formulario de visita). Devuelve
 * solo los campos que no se derivan del resto de la visita. Si ML no responde,
 * el bloque de ML viene vacío con su motivo: la visita nunca se bloquea por eso.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const { id } = await params
    if (!(await canAccessDeal(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const tipoParam = (req.nextUrl.searchParams.get('tipo') ?? 'departamento').toLowerCase()
    const tipo = TIPOS.has(tipoParam) ? tipoParam : 'departamento'

    // La visita de tasación es SIEMPRE de venta: es lo que se tasa para vender.
    const categoriaMl = tipo === 'otro' ? null : resolveCategory({ property_type: tipo, operation_type: 'venta' })
    let ml: { categoryId: string; required: Awaited<ReturnType<typeof fetchCategoryAttributes>>['required']; recommended: Awaited<ReturnType<typeof fetchCategoryAttributes>>['recommended'] } | null = null
    let mlError: string | null = null
    if (categoriaMl) {
      try {
        const attrs = await fetchCategoryAttributes(categoriaMl)
        ml = { categoryId: categoriaMl, ...attrs }
      } catch (e) {
        mlError = e instanceof Error ? e.message : 'No se pudieron traer los campos de MercadoLibre.'
      }
    } else {
      mlError = 'MercadoLibre no tiene una categoría para este tipo de propiedad.'
    }
    const ap = getApSchema({ property_type: tipo === 'otro' ? 'departamento' : tipo })
    const pendientes = camposPendientesDeVisita({ ml, ap })

    return NextResponse.json({
      ml: { categoryId: ml?.categoryId ?? null, checklist: pendientes.ml.checklist, otros: pendientes.ml.otros },
      mlError,
      ap: pendientes.ap,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
