import { NextResponse } from 'next/server'
import { diferenciasMl, diferenciasAp, type DiferenciasPortal } from '@/lib/portals/diferencias-con-ficha'
import { diferenciasDePortales, reemplazoPendiente, sincronizarMl } from '@/lib/portals/sincronizar-portal'
import { mensajeYDetalle } from '@/lib/portals/types'
import {
  autorizar, listingsVivos, adapterMl, adapterAp, fichaDe, depsComunes, depsMlPara,
  type ListingVivo, type PropertyRow,
} from '../contexto'

async function leerDiferencias(property: PropertyRow, listing: ListingVivo): Promise<DiferenciasPortal> {
  const ficha = fichaDe(property)
  if (listing.portal === 'mercadolibre') {
    const ml = await adapterMl()
    const { item } = await ml.leerAviso(listing.external_id)
    return diferenciasMl(ficha, { category_id: item.category_id, price: item.price, currency_id: item.currency_id ?? null })
  }
  const ap = await adapterAp()
  const aviso = await ap.leerAviso(listing.external_id)
  return diferenciasAp(ficha, {
    tipo: aviso.Categoria.Tipo,
    subtipo: aviso.Categoria.SubTipo ?? null,
    operacion: aviso.Precio.Operacion,
    monto: aviso.Precio.Monto,
    moneda: aviso.Precio.Moneda,
  })
}

/**
 * GET → diferencias entre la ficha y cada aviso vivo (publicado o pausado).
 * Las lecturas van en paralelo y cada portal por su cuenta: si uno no responde,
 * vuelve con su error y el otro igual se muestra.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await autorizar(id)
  if ('error' in ctx) return ctx.error
  try {
    let listings = await listingsVivos(ctx.supabase, id)
    // Un plan B de ML quedó a medias (publicó el nuevo y se cortó): se termina acá,
    // así las diferencias se leen del aviso que de verdad queda. Con reserva, igual
    // que el POST; si falla, se sigue y se muestra lo que haya.
    const aMedias = listings.find(l => l.portal === 'mercadolibre' && reemplazoPendiente(l.metadata)?.desde === l.external_id)
    if (aMedias) {
      try {
        const deps = depsMlPara(depsComunes(ctx.supabase, ctx.property, aMedias, ctx.user), await adapterMl(), ctx.property)
        await sincronizarMl(deps, { ficha: fichaDe(ctx.property), listing: aMedias })
        listings = await listingsVivos(ctx.supabase, id)
      } catch (e) {
        console.warn('[portales/diferencias] no se pudo terminar el reemplazo pendiente', e)
      }
    }
    const portales = await diferenciasDePortales(listings, l => leerDiferencias(ctx.property, l))
    return NextResponse.json({ portales })
  } catch (err) {
    return NextResponse.json({ error: mensajeYDetalle(err).mensaje }, { status: 500 })
  }
}
