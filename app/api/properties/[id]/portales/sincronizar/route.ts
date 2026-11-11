import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sincronizarMl, sincronizarAp, type ResultadoSincronizar } from '@/lib/portals/sincronizar-portal'
import { mensajeYDetalle } from '@/lib/portals/types'
import {
  autorizar, listingsVivos, adapterMl, adapterAp, fichaDe, depsComunes, depsMlPara, depsApPara,
} from '../contexto'

const esquema = z.object({
  portal: z.enum(['mercadolibre', 'argenprop']),
  planB: z.boolean().optional(),
})

/**
 * POST { portal, planB? } → aplica al aviso de UN portal los cambios de la ficha
 * (tipo, operación, precio). Una llamada por portal para que cada request quede
 * corto (límite de tiempo de Netlify). Recalcula las diferencias contra el aviso
 * vivo en este momento; la orquestación reserva el listing antes de tocar el portal.
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

    const r: ResultadoSincronizar = portal === 'mercadolibre'
      ? await sincronizarMl(depsMlPara(comunes, await adapterMl(), property), entrada)
      : await sincronizarAp(depsApPara(comunes, await adapterAp(), property), entrada)

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
