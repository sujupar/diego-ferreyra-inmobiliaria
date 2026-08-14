import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
import { updateProperty, getProperty } from '@/lib/supabase/properties'
import { sanearEdicion } from '@/lib/properties/editable-fields'
import { evaluarCambioDePrecio } from '@/lib/properties/price-guard'

/**
 * PATCH /api/properties/[id]/details — edición de datos de la propiedad desde
 * su ficha (precio, moneda y características).
 *
 * Ruta propia y NO el `PUT /api/properties/[id]` genérico: aquel acepta
 * cualquier columna que venga en el body. Acá solo pasa lo que aprueba
 * `sanearEdicion` (lista blanca testeada).
 *
 * FRENO DEL PRECIO (409 `requiereConfirmacion`): un cambio brusco de precio o
 * de moneda exige `confirmar: true` en el body. La tarjeta de la ficha ya pide
 * confirmación con los dos precios a la vista, pero eso corre en el navegador
 * y un bug, una pestaña con código viejo o un llamado directo a la API lo
 * saltean. Como este número se publica solo en la landing (que lo lee en vivo,
 * sin caché) y hay pauta apuntándole, el freno se repite acá.
 *
 * La landing NO necesita nada más: lee `properties` en vivo, así que el cambio
 * aparece en el siguiente refresh. Los avisos ya publicados en los portales SÍ
 * quedan con el precio viejo — decisión tomada: se dejan como están.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    // El abogado no ve ni toca datos comerciales (mismo criterio que la ficha).
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const confirmado = body?.confirmar === true

    // Se lee la propiedad ANTES de sanear: la moneda que tiene hoy define el
    // techo del precio (en pesos los montos son mil veces más grandes) y el
    // precio actual es contra qué se mide un cambio brusco.
    const actual = await getProperty(id).catch(() => null)

    // `confirmar` es una instrucción, no un dato de la propiedad: la lista
    // blanca lo descarta sola, pero queda dicho.
    const saneado = sanearEdicion(body, actual?.currency ? String(actual.currency) : undefined)
    if (!saneado.ok) {
      return NextResponse.json({ error: saneado.error }, { status: 400 })
    }

    const tocaElPrecio = 'asking_price' in saneado.patch || 'currency' in saneado.patch
    if (tocaElPrecio && !confirmado) {
      const veredicto = evaluarCambioDePrecio({
        // Sin propiedad leída no se adivina: `anterior` inválido hace que el
        // evaluador pida confirmación, que es exactamente lo que queremos.
        anterior: Number(actual?.asking_price ?? Number.NaN),
        nuevo: 'asking_price' in saneado.patch
          ? Number(saneado.patch.asking_price)
          : Number(actual?.asking_price ?? Number.NaN),
        monedaAnterior: String(actual?.currency ?? ''),
        monedaNueva: 'currency' in saneado.patch
          ? String(saneado.patch.currency)
          : String(actual?.currency ?? ''),
      })
      if (veredicto.tipo === 'confirmar') {
        return NextResponse.json(
          { error: veredicto.motivo, requiereConfirmacion: true },
          { status: 409 },
        )
      }
    }

    await updateProperty(id, saneado.patch)
    const property = await getProperty(id)
    return NextResponse.json({ success: true, property })
  } catch (error) {
    console.error('PATCH /api/properties/[id]/details error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo guardar el cambio.' },
      { status: 500 },
    )
  }
}
