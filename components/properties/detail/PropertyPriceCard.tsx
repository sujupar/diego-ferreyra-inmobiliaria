'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, AlertTriangle } from 'lucide-react'
import { formatMoney } from '@/lib/properties/detail-view'
import { sanearEdicion } from '@/lib/properties/editable-fields'
import { evaluarCambioDePrecio } from '@/lib/properties/price-guard'
import { formatearMiles, parsearMonto } from '@/lib/properties/money-input'

interface Props {
  propertyId: string
  askingPrice: number
  currency: string
  onChanged: () => void
}

type Estado = 'quieto' | 'guardando' | 'guardado'

/** Lo que espera un clic de confirmación. Guarda los VALORES, no un patch armado. */
interface Pendiente {
  precio: number
  moneda: string
  motivo: string
}

/**
 * Precio de publicación, editable desde la ficha.
 *
 * Este número se publica solo en una landing pública que lo lee EN VIVO y se
 * sirve sin caché, con pauta de Meta apuntándole. Un precio equivocado acá se
 * ve afuera en segundos. De ahí las cuatro defensas, cada una tapando un
 * agujero que una revisión adversarial encontró de verdad:
 *
 * 1. El campo muestra el número AGRUPADO mientras se escribe (1.290.000, no
 *    1290000). Es la defensa más fuerte y la más barata: "12" y "1.290.000" ya
 *    no se parecen, y el error salta a la vista antes de guardar.
 * 2. No se guarda tecleando, sino al SALIR del campo o con Enter — así ningún
 *    estado intermedio llega a la base.
 * 3. Un cambio brusco (o cualquier cambio de moneda) exige un clic de
 *    confirmación con los dos precios a la vista. MIENTRAS el cartel está
 *    abierto el campo queda BLOQUEADO: si se pudiera seguir escribiendo, el
 *    cartel confirmaría un valor distinto del que se ve en pantalla — que fue
 *    exactamente el bug más grave de la primera versión.
 * 4. El estado local se resincroniza con la base cada vez que la ficha se
 *    refresca. Sin eso, el campo se quedaba con un precio viejo y un simple
 *    clic adentro/afuera revertía en silencio la baja que hizo otra persona.
 *
 * La regla de qué es "brusco" vive en `lib/properties/price-guard.ts` (puro y
 * testeado) y la repite el servidor en `/api/properties/[id]/details`.
 */
export function PropertyPriceCard({ propertyId, askingPrice, currency, onChanged }: Props) {
  const [texto, setTexto] = useState(() => formatearMiles(String(askingPrice)))
  const [moneda, setMoneda] = useState(currency)
  const [estado, setEstado] = useState<Estado>('quieto')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const hayPendiente = useRef(false)
  hayPendiente.current = pendiente !== null

  /**
   * Trae de vuelta lo que dice la base cada vez que la ficha se refresca. Sin
   * esto el campo conservaba para siempre el valor con el que se montó: si otra
   * persona bajaba el precio, un clic adentro/afuera sin escribir nada
   * reescribía el viejo y revertía su cambio sin que saltara ninguna alarma.
   * No se toca mientras hay una confirmación abierta, para no moverle el piso.
   */
  useEffect(() => {
    if (hayPendiente.current) return
    setTexto(formatearMiles(String(askingPrice)))
    setMoneda(currency)
  }, [askingPrice, currency])

  async function guardar(precio: number | null, monedaNueva: string, confirmado: boolean) {
    const patch: Record<string, unknown> = {}
    if (precio !== null && precio !== askingPrice) patch.asking_price = precio
    if (monedaNueva !== currency) patch.currency = monedaNueva
    if (Object.keys(patch).length === 0) return

    const saneado = sanearEdicion(patch, currency)
    if (!saneado.ok) { setError(saneado.error); setEstado('quieto'); return }

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
        // El servidor repite el freno y puede pedir confirmación aunque el
        // cliente no la haya pedido (compara contra la base real, que puede
        // haber cambiado). Sin este camino, la respuesta 409 quedaba como un
        // texto de error sin ningún botón: un callejón sin salida del que solo
        // se salía recargando la página.
        if (cuerpo.requiereConfirmacion) {
          setPendiente({
            precio: precio ?? askingPrice,
            moneda: monedaNueva,
            motivo: cuerpo.error ?? 'Este cambio necesita que lo confirmes.',
          })
          setEstado('quieto')
          return
        }
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

  /** Único punto por el que un precio sale hacia la base. */
  function proponer(precio: number | null, monedaNueva: string) {
    if (pendiente) return // hay algo esperando decisión: no se encima otra cosa

    const precioFinal = precio ?? askingPrice
    const patch: Record<string, unknown> = {}
    if (precio !== null && precio !== askingPrice) patch.asking_price = precio
    if (monedaNueva !== currency) patch.currency = monedaNueva
    if (Object.keys(patch).length === 0) return

    // Validación dura primero: un cero o un campo vacío es un error, no algo
    // para confirmar.
    const saneado = sanearEdicion(patch, currency)
    if (!saneado.ok) { setError(saneado.error); return }

    const veredicto = evaluarCambioDePrecio({
      anterior: askingPrice,
      nuevo: precioFinal,
      monedaAnterior: currency,
      monedaNueva,
    })
    if (veredicto.tipo === 'sin-cambio') return
    if (veredicto.tipo === 'confirmar') {
      setError(null)
      setPendiente({ precio: precioFinal, moneda: monedaNueva, motivo: veredicto.motivo })
      return
    }
    guardar(precio, monedaNueva, false)
  }

  function confirmarPrecio() {
    const monto = parsearMonto(texto)
    if (monto === null) {
      // Vaciar el campo no borra el precio: se restaura lo que hay publicado.
      setTexto(formatearMiles(String(askingPrice)))
      setError(null)
      return
    }
    proponer(monto, moneda)
  }

  function elegirMoneda(nueva: string) {
    if (pendiente) return
    setMoneda(nueva)
    proponer(parsearMonto(texto), nueva)
  }

  function cancelar() {
    setPendiente(null)
    setTexto(formatearMiles(String(askingPrice)))
    setMoneda(currency)
    setError(null)
  }

  async function aceptar() {
    const p = pendiente
    if (!p) return
    setPendiente(null)
    await guardar(p.precio, p.moneda, true)
  }

  const montoEnPantalla = parsearMonto(texto)
  const bloqueado = pendiente !== null

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
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={bloqueado}
          value={texto}
          onChange={e => { setTexto(formatearMiles(e.target.value)); setError(null) }}
          onBlur={confirmarPrecio}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
          className="w-44 rounded-md border px-3 py-2 text-sm tabular-n font-medium disabled:bg-muted disabled:text-muted-foreground"
        />
        <label htmlFor="moneda-publicacion" className="sr-only">Moneda</label>
        <select
          id="moneda-publicacion"
          value={moneda}
          disabled={bloqueado}
          onChange={e => elegirMoneda(e.target.value)}
          className="rounded-md border px-2 py-2 text-sm disabled:bg-muted disabled:text-muted-foreground"
        >
          <option value="USD">USD</option>
          <option value="ARS">ARS</option>
        </select>
      </div>

      {/* Lo que va a quedar publicado, en limpio y a la vista, ANTES de guardar. */}
      <p className="mt-2 text-sm text-muted-foreground tabular-n">
        {montoEnPantalla !== null && (montoEnPantalla !== askingPrice || moneda !== currency)
          ? `Vas a publicar ${formatMoney(montoEnPantalla, moneda)}`
          : `Publicado: ${formatMoney(askingPrice, currency)}`}
      </p>

      {pendiente && (
        <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
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
              Confirmar {formatMoney(pendiente.precio, pendiente.moneda)}
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
