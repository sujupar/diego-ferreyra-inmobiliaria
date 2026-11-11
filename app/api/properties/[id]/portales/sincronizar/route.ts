import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sincronizarMl, sincronizarAp, type DepsComunes, type EventoAuditoria, type ResultadoSincronizar } from '@/lib/portals/sincronizar-portal'
import { getRawAttributes, fetchCategoryAttributes } from '@/lib/portals/mercadolibre/category-attributes'
import { apPublicUrl } from '@/lib/portals/argenprop/field-schema'
import { syncPortalPropertyMap } from '@/lib/portals/mapa-avisos'
import { writeAudit } from '@/lib/portals/audit'
import { mensajeYDetalle } from '@/lib/portals/types'
import type { Database } from '@/types/database.types'
import {
  autorizar, listingsVivos, adapterMl, adapterAp, fichaDe, esJson,
  type ListingVivo, type PropertyRow, type UsuarioAutenticado,
} from '../contexto'

const esquema = z.object({
  portal: z.enum(['mercadolibre', 'argenprop']),
  planB: z.boolean().optional(),
})

function depsComunes(
  supabase: SupabaseClient<Database>, property: PropertyRow, listing: ListingVivo, user: UsuarioAutenticado,
): DepsComunes {
  return {
    async guardarListing(cambios) {
      const { metadata, ...resto } = cambios
      if (metadata !== undefined && !esJson(metadata)) throw new Error('metadata del listing no es JSON válido')
      const { error } = await supabase.from('property_listings')
        .update({ ...resto, ...(metadata !== undefined ? { metadata } : {}) })
        .eq('id', listing.id)
      if (error) throw new Error(`No se pudo guardar el aviso en la plataforma: ${error.message}`)
    },
    sincronizarMapa: (code, url) => syncPortalPropertyMap(supabase, listing.portal, property, code, url),
    auditar: (evento: EventoAuditoria) => writeAudit(supabase, {
      listingId: listing.id, propertyId: property.id, portal: listing.portal,
      eventType: evento.eventType, payload: evento.payload, errorMessage: evento.errorMessage,
      actor: user.profile.full_name ?? user.id,
    }),
    ahora: () => new Date().toISOString(),
  }
}

/**
 * POST { portal, planB? } → aplica al aviso de UN portal los cambios de la ficha
 * (tipo, operación, precio). Una llamada por portal para que cada request quede
 * corto (límite de tiempo de Netlify). Recalcula las diferencias contra el aviso
 * vivo en este momento.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await autorizar(id)
  if ('error' in ctx) return ctx.error
  const parsed = esquema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
  const { portal, planB } = parsed.data
  try {
    const listing = (await listingsVivos(ctx.supabase, id)).find(l => l.portal === portal)
    if (!listing) {
      return NextResponse.json({ error: 'Esta propiedad no tiene un aviso publicado en ese portal.' }, { status: 409 })
    }
    const { property, supabase, user } = ctx
    const comunes = depsComunes(supabase, property, listing, user)
    const entrada = { ficha: fichaDe(property), listing, planB }

    let r: ResultadoSincronizar
    if (portal === 'mercadolibre') {
      const ml = await adapterMl()
      r = await sincronizarMl({
        ...comunes,
        leerAviso: async ext => (await ml.leerAviso(ext)).item,
        atributosDeCategoria: getRawAttributes,
        idsAceptados: async cat => {
          const { required, recommended } = await fetchCategoryAttributes(cat)
          return new Set([...required, ...recommended].map(a => a.id))
        },
        cambiarEnElLugar: (ext, body) => ml.cambiarEnElLugar(ext, body),
        publicarReemplazo: opts => ml.publicarReemplazo(property, opts),
        cerrar: ext => ml.cerrar(ext),
      }, entrada)
    } else {
      const ap = await adapterAp()
      r = await sincronizarAp({
        ...comunes,
        leerAviso: codigo => ap.leerAviso(codigo),
        idAnunciante: () => ap.idAnunciante(),
        caracteristicasDeCategoria: tipo => ap.caracteristicasDeCategoria(tipo),
        republicar: (codigo, dto) => ap.republicar(codigo, dto),
        enviarAviso: dto => ap.enviarAviso(dto),
        urlPublica: avisoId => apPublicUrl(property, avisoId),
      }, entrada)
    }

    if (r.ok) {
      return NextResponse.json({ ok: true, portal: r.portal, accion: r.accion, externalUrl: r.externalUrl, mensaje: r.mensaje })
    }
    return NextResponse.json(
      { error: r.error, ...(r.planBDisponible ? { planBDisponible: true } : {}) },
      { status: r.status },
    )
  } catch (err) {
    // Adapter no conectado, listings ilegibles: nada se tocó en ningún portal.
    return NextResponse.json({ error: mensajeYDetalle(err).mensaje }, { status: 502 })
  }
}
