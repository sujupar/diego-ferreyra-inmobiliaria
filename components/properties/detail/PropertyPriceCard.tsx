'use client'

import { useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { formatMoney } from '@/lib/properties/detail-view'
import { sanearEdicion } from '@/lib/properties/editable-fields'

interface Props {
  propertyId: string
  askingPrice: number
  currency: string
  onChanged: () => void
}

type Estado = 'quieto' | 'guardando' | 'guardado'

/**
 * Precio de publicación, editable desde la ficha.
 *
 * DECISIÓN IMPORTANTE — este campo NO tiene autosave por tecla. La landing
 * pública lee el precio en vivo desde `properties` y se sirve sin caché
 * (`cache-control: no-store`), así que un guardado a mitad de tipeo se ve: al
 * escribir "1290000" pasaríamos por 1, 12, 129… y un visitante —con tráfico
 * pago encima— podría ver "US$ 12". Se guarda al SALIR del campo o con Enter.
 * La moneda sí guarda al instante: es un select, no tiene estados intermedios.
 */
export function PropertyPriceCard({ propertyId, askingPrice, currency, onChanged }: Props) {
  const [valor, setValor] = useState(String(askingPrice))
  const [moneda, setMoneda] = useState(currency)
  const [estado, setEstado] = useState<Estado>('quieto')
  const [error, setError] = useState<string | null>(null)

  async function guardar(patch: Record<string, unknown>) {
    // Se valida con el MISMO módulo que usa el servidor: el aviso llega antes
    // de gastar un viaje de red y los dos lados no pueden discrepar.
    const saneado = sanearEdicion(patch)
    if (!saneado.ok) {
      setError(saneado.error)
      setEstado('quieto')
      return
    }
    setError(null)
    setEstado('guardando')
    try {
      const res = await fetch(`/api/properties/${propertyId}/details`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(saneado.patch),
      })
      const cuerpo = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(cuerpo.error ?? 'No se pudo guardar el cambio.')
        setEstado('quieto')
        return
      }
      setEstado('guardado')
      onChanged()
      setTimeout(() => setEstado('quieto'), 2000)
    } catch {
      setError('No se pudo guardar el cambio. Revisá la conexión y probá de nuevo.')
      setEstado('quieto')
    }
  }

  function confirmarPrecio() {
    const n = Number(valor)
    if (n === askingPrice) return // sin cambio: no se molesta al servidor
    guardar({ asking_price: n })
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Precio de publicación</p>
        {estado === 'guardando' && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />Guardando…
          </span>
        )}
        {estado === 'guardado' && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3 w-3" />Guardado
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label htmlFor="precio-publicacion" className="sr-only">Precio</label>
        <input
          id="precio-publicacion"
          type="number"
          inputMode="numeric"
          min={1}
          value={valor}
          onChange={e => { setValor(e.target.value); setError(null) }}
          onBlur={confirmarPrecio}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
          className="w-44 rounded-md border px-3 py-2 text-sm tabular-n font-medium"
        />
        <label htmlFor="moneda-publicacion" className="sr-only">Moneda</label>
        <select
          id="moneda-publicacion"
          value={moneda}
          onChange={e => { setMoneda(e.target.value); guardar({ currency: e.target.value }) }}
          className="rounded-md border px-2 py-2 text-sm"
        >
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
      </div>

      <p className="mt-2 text-sm text-muted-foreground tabular-n">
        {formatMoney(askingPrice, currency)}
      </p>

      {error && <p className="mt-2 text-sm text-[color:var(--destructive)]">{error}</p>}

      <p className="mt-3 text-xs text-muted-foreground">
        La landing pública toma el precio nuevo enseguida. Los avisos ya publicados en los
        portales no se actualizan solos.
      </p>
    </div>
  )
}
