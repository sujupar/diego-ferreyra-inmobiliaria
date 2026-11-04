/**
 * La venta de una propiedad se registra SOLA al cambiar su estado comercial.
 *
 * Al pasar a reservada o vendida se crea (o actualiza) la venta abierta de esa
 * propiedad con lo que ya se sabe: dirección, precio, fecha, quién captó, cómo
 * llegó el dueño y los % sugeridos del reparto. Lo que falta lo completa el
 * formulario "Datos de la operación" de la ficha; mientras tanto el panel la
 * muestra como "faltan datos". Al volver a disponible, la venta pasa a "caída".
 *
 * Es best-effort: si falla, el cambio de estado ya se guardó y la ruta lo avisa
 * con un warning. Nunca bloquea el cambio de estado.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { partesSugeridas, type OrigenDueno } from './reparto'

export function origenDesdePropiedad(origin: string | null | undefined): OrigenDueno | null {
  if (origin === 'embudo') return 'embudo'
  if (origin === 'referido') return 'referido'
  return null
}

export async function sincronizarVenta(db: SupabaseClient, i: {
  propertyId: string
  to: string
  soldPrice: number | null
  soldCurrency: string | null
  soldAt: string | null
  hoy: string
  userId: string
}): Promise<void> {
  const { data: abierta } = await db.from('ventas').select('id, estado, reservada_en, precio').eq('property_id', i.propertyId).neq('estado', 'caida').maybeSingle()

  if (i.to !== 'reservada' && i.to !== 'vendida') {
    if (abierta) await db.from('ventas').update({ estado: 'caida', updated_by: i.userId }).eq('id', abierta.id)
    return
  }

  const { data: p } = await db.from('properties')
    .select('address, asking_price, currency, origin, captured_at, created_at, assigned_to, profiles:assigned_to(full_name)')
    .eq('id', i.propertyId).maybeSingle()
  if (!p) return
  const asesor = (p as { profiles?: { full_name?: string | null } | null }).profiles?.full_name ?? null
  const moneda = (i.soldCurrency ?? p.currency) === 'ARS' ? 'ARS' : 'USD'
  const precio = i.soldPrice ?? abierta?.precio ?? p.asking_price ?? null

  if (abierta) {
    const cambios: Record<string, unknown> = { estado: i.to, updated_by: i.userId }
    if (i.to === 'vendida') {
      if (i.soldPrice) { cambios.precio = i.soldPrice; cambios.moneda = moneda }
      if (i.soldAt) cambios.escriturada_en = i.soldAt
      if (!abierta.reservada_en) cambios.reservada_en = i.soldAt ?? i.hoy
    }
    await db.from('ventas').update(cambios).eq('id', abierta.id)
    return
  }

  const origen = origenDesdePropiedad(p.origin)
  await db.from('ventas').insert({
    property_id: i.propertyId,
    direccion: p.address,
    estado: i.to,
    captada_en: (p.captured_at ?? p.created_at)?.slice(0, 10) ?? null,
    reservada_en: i.to === 'reservada' ? i.hoy : (i.soldAt ?? i.hoy),
    escriturada_en: i.to === 'vendida' ? i.soldAt : null,
    precio,
    moneda,
    capto: asesor,
    origen_dueno: origen,
    ...partesSugeridas({ capto: asesor, vendio: null, origen, hayReferidor: false }),
    created_by: i.userId,
    updated_by: i.userId,
  })
}
