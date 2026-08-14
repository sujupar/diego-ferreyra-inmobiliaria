'use client'

import { useState } from 'react'
import { Loader2, Check, AlertTriangle } from 'lucide-react'
import { formatMoney } from '@/lib/properties/detail-view'
import { sanearEdicion } from '@/lib/properties/editable-fields'
import { evaluarCambioDePrecio } from '@/lib/properties/price-guard'

interface Props {
  propertyId: string
  askingPrice: number
  currency: string
  onChanged: () => void
}

type Estado = 'quieto' | 'guardando' | 'guardado'

interface Pendiente {
  patch: Record<string, unknown>
  motivo: string
}

/**
 * Precio de publicación, editable desde la ficha.
 *
 * DOS FRENOS, porque este número se publica solo en una landing con pauta:
 *
 * 1. No se guarda tecleando, sino al SALIR del campo o con Enter. Con autosave
 *    por tecla, escribir 1290000 pasaría por 1, 12, 129… y cada estado
 *    intermedio se vería en la landing (que lee el precio en vivo y se sirve
 *    sin caché).
 * 2. Salir del campo TAMPOCO alcanza: si alguien tipea "12" y hace clic en
 *    otro lado, el blur llegaría con 12. Por eso un cambio brusco —o cualquier
 *    cambio de moneda— exige un clic de confirmación con los dos precios a la
 *    vista. Un cambio normal (bajar el precio un 5%) se guarda sin molestar:
 *    un freno que salta siempre se vuelve ruido y se ignora.
 *
 * La regla de qué es "brusco" vive en `lib/properties/price-guard.ts` (puro y
 * testeado), no acá.
 */
export function PropertyPriceCard({ propertyId, askingPrice, currency, onChanged }: Props) {
  const [valor, setValor] = useState(String(askingPrice))
  const [moneda, setMoneda] = useState(currency)
  const [estado, setEstado] = useState<Estado>('quieto')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)

  /**
   * `confirmado` viaja al servidor: la ruta repite el mismo freno y rechaza con
   * 409 un cambio brusco que no venga marcado. Sin este flag, confirmar en
   * pantalla no alcanzaría para guardar.
   */
  async function guardar(patch: Record<string, unknown>, confirmado = false) {
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
        body: JSON.stringify(confirmado ? { ...saneado.patch, confirmar: true } : saneado.patch),
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

  /**
   * Decide entre guardar directo o pedir confirmación. Nunca escribe sin pasar
   * por acá: es el único punto por el que un precio llega a la base.
   */
  function proponer(patch: Record<string, unknown>, nuevoPrecio: number, nuevaMoneda: string) {
    // La validación dura primero: un cero o un campo vacío es un error, no algo
    // para confirmar.
    const saneado = sanearEdicion(patch)
    if (!saneado.ok) { setError(saneado.error); return }

    const veredicto = evaluarCambioDePrecio({
      anterior: askingPrice,
      nuevo: nuevoPrecio,
      monedaAnterior: currency,
      monedaNueva: nuevaMoneda,
    })
    if (veredicto.tipo === 'sin-cambio') return
    if (veredicto.tipo === 'confirmar') {
      setError(null)
      setPendiente({ patch, motivo: veredicto.motivo })
      return
    }
    guardar(patch)
  }

  function confirmarPrecio() {
    if (pendiente) return // ya hay algo esperando decisión
    const crudo = valor.trim()
    if (crudo === '') { setValor(String(askingPrice)); return } // vaciar no borra el precio
    const n = Number(crudo)
    proponer({ asking_price: n }, n, moneda)
  }

  function elegirMoneda(nueva: string) {
    setMoneda(nueva)
    proponer({ currency: nueva }, Number(valor), nueva)
  }

  function cancelar() {
    setPendiente(null)
    setValor(String(askingPrice))
    setMoneda(currency)
    setError(null)
  }

  async function aceptar() {
    const p = pendiente
    setPendiente(null)
    if (p) await guardar(p.patch, true)
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
          onChange={e => elegirMoneda(e.target.value)}
          className="rounded-md border px-2 py-2 text-sm"
        >
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
      </div>

      <p className="mt-2 text-sm text-muted-foreground tabular-n">
        {formatMoney(askingPrice, currency)}
      </p>

      {pendiente && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2"
        >
          <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            {pendiente.motivo}
          </p>
          <p className="text-xs text-amber-800">
            Este precio se publica en la landing apenas lo guardes. Confirmá que es el correcto.
          </p>
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              onClick={aceptar}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
            >
              Confirmar el cambio
            </button>
            <button
              type="button"
              onClick={cancelar}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-[color:var(--destructive)]">{error}</p>}

      <p className="mt-3 text-xs text-muted-foreground">
        La landing pública toma el precio nuevo enseguida. Los avisos ya publicados en los
        portales no se actualizan solos.
      </p>
    </div>
  )
}
