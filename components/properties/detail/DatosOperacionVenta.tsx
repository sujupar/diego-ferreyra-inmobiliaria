'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FormVenta } from '@/components/metrics/panel/FormVenta'
import { usd } from '@/components/metrics/panel/formato'
import type { VentaCalculada, VentaRow } from '@/lib/metrics/panel/reparto'

/**
 * Datos de la operación de una propiedad reservada o vendida.
 *
 * La venta ya existe: se crea sola al cambiar el estado (lib/metrics/panel/
 * venta-propiedad.ts). Acá se completa. Solo la ve quien tiene permiso de
 * métricas (la API contesta 403 al resto y la sección no aparece).
 */
export function DatosOperacionVenta({ propertyId, abrir }: { propertyId: string; abrir: number }) {
  const [item, setItem] = useState<{ venta: VentaRow & { id: string }; calc: VentaCalculada } | null>(null)
  const [editando, setEditando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/metrics/ventas?property_id=${propertyId}`)
      if (!r.ok) { setItem(null); return }
      const lista = await r.json()
      setItem(Array.isArray(lista) && lista[0] ? lista[0] : null)
    } catch { setItem(null) }
  }, [propertyId])

  useEffect(() => { cargar() }, [cargar, abrir])
  // Recién reservada/vendida: abrir el formulario para completar.
  useEffect(() => { if (abrir > 0) setEditando(true) }, [abrir])

  if (!item) return null
  const { venta, calc } = item

  async function guardar(v: VentaRow) {
    const r = await fetch(`/api/metrics/ventas/${venta.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return data?.error ?? 'No se pudo guardar.'
    toast.success('Datos de la operación guardados')
    setEditando(false)
    await cargar()
    return null
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="eyebrow">Datos de la operación</p>
          {calc.faltan.length > 0
            ? <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">Faltan datos: {calc.faltan.join(', ')}.</p>
            : <p className="text-sm text-muted-foreground mt-1">Completa: el panel de métricas la suma sola.</p>}
        </div>
        {!editando && <Button size="sm" variant="outline" onClick={() => setEditando(true)}>{calc.faltan.length ? 'Completar' : 'Editar'}</Button>}
      </div>
      {!editando && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div><p className="text-xs text-muted-foreground">Cobrado</p><p className="tabular-n">{usd(calc.cobradoUsd)}</p></div>
          <div><p className="text-xs text-muted-foreground">Reparto</p><p className="tabular-n">{usd(calc.asesorUsd + calc.julianUsd + calc.referidorUsd)}</p></div>
          <div><p className="text-xs text-muted-foreground">Limpio Diego</p><p className="tabular-n font-semibold">{usd(calc.limpioDiegoUsd)}</p></div>
          <div><p className="text-xs text-muted-foreground">Reservada</p><p className="tabular-n">{venta.reservada_en ?? '—'}</p></div>
        </div>
      )}
      {editando && <FormVenta inicial={venta} conDireccion={false} onGuardar={guardar} onCancelar={() => setEditando(false)} />}
    </div>
  )
}
