'use client'

import { useRef, useState } from 'react'
import { Loader2, Check, Pencil, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sanearEdicion } from '@/lib/properties/editable-fields'
import { evaluarCambioDePrecio } from '@/lib/properties/price-guard'
import { formatearMiles, parsearMonto } from '@/lib/properties/money-input'
import { formatMoney } from '@/lib/properties/detail-view'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '@/lib/properties/property-type'

export interface FichaEditable {
  property_type?: string | null
  operation_type?: string | null
  asking_price?: number | null
  currency?: string | null
  commission_percentage?: number | null
  contract_start_date?: string | null
  contract_end_date?: string | null
  rooms?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  garages?: number | null
  covered_area?: number | null
  total_area?: number | null
  age?: number | null
  floor?: number | null
  expensas?: number | null
  description?: string | null
}

/** Compatibilidad con el nombre anterior del tipo. */
export type CaracteristicasEditables = FichaEditable

interface Props {
  propertyId: string
  valores: FichaEditable
  onChanged: () => void
}

const NUMERICOS: { id: keyof FichaEditable; label: string; sufijo?: string }[] = [
  { id: 'rooms', label: 'Ambientes' },
  { id: 'bedrooms', label: 'Dormitorios' },
  { id: 'bathrooms', label: 'Baños' },
  { id: 'garages', label: 'Cocheras' },
  { id: 'covered_area', label: 'Superficie cubierta', sufijo: 'm²' },
  { id: 'total_area', label: 'Superficie total', sufijo: 'm²' },
  { id: 'age', label: 'Antigüedad', sufijo: 'años' },
  { id: 'floor', label: 'Piso' },
  { id: 'expensas', label: 'Expensas', sufijo: 'ARS' },
]

const OPERACIONES = [
  { id: 'venta', label: 'Venta' },
  { id: 'alquiler', label: 'Alquiler' },
  { id: 'temporario', label: 'Alquiler temporario' },
]

const FECHAS: { id: keyof FichaEditable; label: string }[] = [
  { id: 'contract_start_date', label: 'Inicio de contrato' },
  { id: 'contract_end_date', label: 'Fin de contrato' },
]

/**
 * "Modificar ficha": el ÚNICO lugar para corregir los datos de una propiedad ya
 * cargada — tipo, operación, precio, características, datos comerciales y
 * descripción.
 *
 * POR QUÉ ESTÁ TODO JUNTO: antes esto vivía repartido en editores sueltos por
 * la ficha y era fácil perder alguno de vista (de hecho se perdió: un cambio
 * dejó de renderizar el de características y el de precio, y quedaron los datos
 * como solo-lectura). Una sola puerta es más difícil de romper sin notarlo.
 *
 * REGLA DE GUARDADO: cada campo se guarda al SALIR de él, nunca por
 * temporizador. Para corregir 6 → 5 hay que vaciar el campo, y un guardado por
 * tiempo puede dispararse justo ahí y dejar el dato en blanco. Con la landing
 * pública leyendo estos valores en vivo, ese instante se ve.
 *
 * EL PRECIO tiene protección extra (`price-guard`): se escribe agrupado en
 * miles, y un cambio brusco o de moneda pide confirmación con los dos importes
 * a la vista. Mientras esa confirmación está abierta el campo queda bloqueado,
 * para que lo que se confirma sea exactamente lo que se ve.
 */
export function PropertyDetailsEditor({ propertyId, valores, onChanged }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState<Record<string, string>>(() => aTexto(valores))
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado'>('quieto')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, setPendiente] = useState<{ precio: number; moneda: string; motivo: string } | null>(null)
  const inicial = useRef<Record<string, string>>(aTexto(valores))

  const precioVigente = valores.asking_price ?? 0
  const monedaVigente = valores.currency ?? 'USD'

  /**
   * Manda UN cambio. Solo se marca como guardado si el servidor confirmó: si se
   * marcara antes, un guardado fallido dejaría el valor viejo en la base y el
   * panel creyendo que ya está.
   */
  async function enviar(patch: Record<string, unknown>, marcas: Record<string, string>, confirmado = false) {
    const saneado = sanearEdicion(patch, monedaVigente)
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
        // El servidor repite el freno del precio y puede pedir confirmación
        // aunque el cliente no la haya pedido (compara contra la base real).
        // Sin este camino quedaba un error sin salida.
        if (cuerpo.requiereConfirmacion) {
          setPendiente({
            precio: Number(patch.asking_price ?? precioVigente),
            moneda: String(patch.currency ?? monedaVigente),
            motivo: cuerpo.error ?? 'Este cambio necesita que lo confirmes.',
          })
          setEstado('quieto')
          return
        }
        setError(cuerpo.error ?? 'No se pudo guardar el cambio.')
        setEstado('quieto')
        return
      }
      inicial.current = { ...inicial.current, ...marcas }
      setEstado('guardado')
      onChanged()
      setTimeout(() => setEstado('quieto'), 2000)
    } catch {
      setError('No se pudo guardar el cambio. Revisá la conexión y probá de nuevo.')
      setEstado('quieto')
    }
  }

  function escribir(campo: string, crudo: string) {
    setBorrador(b => ({ ...b, [campo]: campo === 'asking_price' ? formatearMiles(crudo) : crudo }))
    setError(null)
  }

  /** Al salir de un campo simple: si cambió respecto de lo guardado, se manda. */
  function confirmar(campo: string) {
    const crudo = borrador[campo] ?? ''
    if (crudo === (inicial.current[campo] ?? '')) return
    const esTexto = campo === 'description' || campo === 'property_type'
      || campo === 'operation_type' || campo === 'currency'
      || campo === 'contract_start_date' || campo === 'contract_end_date'
    const valor = crudo === '' ? null : esTexto ? crudo : Number(crudo)
    enviar({ [campo]: valor }, { [campo]: crudo })
  }

  /** El precio pasa por el freno antes de tocar la base. */
  function confirmarPrecio() {
    if (pendiente) return
    const crudo = borrador.asking_price ?? ''
    if (crudo === (inicial.current.asking_price ?? '')) return
    const monto = parsearMonto(crudo)
    if (monto === null) {
      // Vaciar el campo no borra el precio: se restaura el publicado.
      setBorrador(b => ({ ...b, asking_price: formatearMiles(String(precioVigente)) }))
      setError(null)
      return
    }
    const veredicto = evaluarCambioDePrecio({
      anterior: precioVigente, nuevo: monto,
      monedaAnterior: monedaVigente, monedaNueva: borrador.currency ?? monedaVigente,
    })
    if (veredicto.tipo === 'sin-cambio') return
    if (veredicto.tipo === 'confirmar') {
      setError(null)
      setPendiente({ precio: monto, moneda: borrador.currency ?? monedaVigente, motivo: veredicto.motivo })
      return
    }
    enviar({ asking_price: monto }, { asking_price: crudo })
  }

  /** Cambiar la moneda siempre pide confirmación: el mismo número vale otra cosa. */
  function elegirMoneda(nueva: string) {
    if (pendiente || nueva === monedaVigente) return
    setBorrador(b => ({ ...b, currency: nueva }))
    const monto = parsearMonto(borrador.asking_price ?? '') ?? precioVigente
    const veredicto = evaluarCambioDePrecio({
      anterior: precioVigente, nuevo: monto, monedaAnterior: monedaVigente, monedaNueva: nueva,
    })
    if (veredicto.tipo === 'confirmar') {
      setPendiente({ precio: monto, moneda: nueva, motivo: veredicto.motivo })
    }
  }

  function cancelarPrecio() {
    setPendiente(null)
    setBorrador(b => ({
      ...b,
      asking_price: formatearMiles(String(precioVigente)),
      currency: monedaVigente,
    }))
    setError(null)
  }

  async function aceptarPrecio() {
    const p = pendiente
    if (!p) return
    setPendiente(null)
    const patch: Record<string, unknown> = {}
    if (p.precio !== precioVigente) patch.asking_price = p.precio
    if (p.moneda !== monedaVigente) patch.currency = p.moneda
    await enviar(patch, {
      asking_price: formatearMiles(String(p.precio)),
      currency: p.moneda,
    }, true)
  }

  if (!abierto) {
    return (
      <Button variant="outline" size="sm" className="mt-4" onClick={() => setAbierto(true)}>
        <Pencil className="h-3.5 w-3.5 mr-1.5" />Modificar ficha
      </Button>
    )
  }

  const bloqueadoPorPrecio = pendiente !== null

  return (
    <div className="mt-4 rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <p className="eyebrow">Modificar ficha</p>
        <div className="flex items-center gap-3">
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
          <button type="button" onClick={() => setAbierto(false)} className="text-xs text-muted-foreground underline">
            Listo
          </button>
        </div>
      </div>

      {/* 1. Qué es y cómo se comercializa */}
      <p className="eyebrow mb-2">Datos principales</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Tipo</span>
          <select
            aria-label="Tipo"
            value={borrador.property_type ?? ''}
            onChange={e => { escribir('property_type', e.target.value); confirmarCampo('property_type', e.target.value) }}
            className="w-full rounded-md border px-2.5 py-1.5 text-sm bg-background"
          >
            {PROPERTY_TYPES.map(t => (
              <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Operación</span>
          <select
            aria-label="Operación"
            value={borrador.operation_type ?? ''}
            onChange={e => { escribir('operation_type', e.target.value); confirmarCampo('operation_type', e.target.value) }}
            className="w-full rounded-md border px-2.5 py-1.5 text-sm bg-background"
          >
            {OPERACIONES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      </div>

      {/* 2. Precio: el dato que se publica solo en la landing */}
      <p className="eyebrow mt-4 mb-2">Precio y comisión</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Precio</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Precio"
            disabled={bloqueadoPorPrecio}
            value={borrador.asking_price ?? ''}
            onChange={e => escribir('asking_price', e.target.value)}
            onBlur={confirmarPrecio}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className="w-full rounded-md border px-2.5 py-1.5 text-sm tabular-n font-medium disabled:bg-muted disabled:text-muted-foreground"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Moneda</span>
          <select
            aria-label="Moneda"
            disabled={bloqueadoPorPrecio}
            value={borrador.currency ?? 'USD'}
            onChange={e => elegirMoneda(e.target.value)}
            className="w-full rounded-md border px-2.5 py-1.5 text-sm bg-background disabled:bg-muted disabled:text-muted-foreground"
          >
            <option value="USD">USD</option>
            <option value="ARS">ARS</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Comisión (%)</span>
          <input
            type="number" inputMode="decimal" aria-label="Comisión"
            value={borrador.commission_percentage ?? ''}
            onChange={e => escribir('commission_percentage', e.target.value)}
            onBlur={() => confirmar('commission_percentage')}
            className="w-full rounded-md border px-2.5 py-1.5 text-sm tabular-n"
          />
        </label>
      </div>

      {pendiente && (
        <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
          <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />{pendiente.motivo}
          </p>
          <p className="text-xs text-amber-800">
            Este precio se publica en la landing apenas lo guardes. Confirmá que es el correcto.
          </p>
          <div className="flex gap-2 pt-0.5">
            <button type="button" onClick={aceptarPrecio}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800">
              Confirmar {formatMoney(pendiente.precio, pendiente.moneda)}
            </button>
            <button type="button" onClick={cancelarPrecio}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* 3. Características */}
      <p className="eyebrow mt-4 mb-2">Características</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {NUMERICOS.map(c => (
          <label key={c.id} className="space-y-1">
            <span className="text-xs text-muted-foreground">
              {c.label}{c.sufijo ? ` (${c.sufijo})` : ''}
            </span>
            <input
              type="number" inputMode="numeric" aria-label={c.label}
              value={borrador[c.id] ?? ''}
              onChange={e => escribir(c.id, e.target.value)}
              onBlur={() => confirmar(c.id)}
              className="w-full rounded-md border px-2.5 py-1.5 text-sm tabular-n"
            />
          </label>
        ))}
      </div>

      {/* 4. Contrato */}
      <p className="eyebrow mt-4 mb-2">Contrato</p>
      <div className="grid grid-cols-2 gap-3">
        {FECHAS.map(f => (
          <label key={f.id} className="space-y-1">
            <span className="text-xs text-muted-foreground">{f.label}</span>
            <input
              type="date" aria-label={f.label}
              value={borrador[f.id] ?? ''}
              onChange={e => escribir(f.id, e.target.value)}
              onBlur={() => confirmar(f.id)}
              className="w-full rounded-md border px-2.5 py-1.5 text-sm"
            />
          </label>
        ))}
      </div>

      {/* 5. Descripción */}
      <label className="block mt-4 space-y-1">
        <span className="eyebrow">Descripción</span>
        <textarea
          aria-label="Descripción" rows={6}
          value={borrador.description ?? ''}
          onChange={e => escribir('description', e.target.value)}
          onBlur={() => confirmar('description')}
          className="w-full rounded-md border px-3 py-2 text-sm leading-relaxed mt-1"
        />
      </label>

      {error && <p className="mt-2 text-sm text-[color:var(--destructive)]">{error}</p>}

      <p className="mt-3 text-xs text-muted-foreground">
        Si la propiedad tiene landing publicada, estos datos se actualizan solos ahí; los
        textos que ya escribió la IA no se reescriben. Los avisos ya publicados en los
        portales no se actualizan solos.
      </p>
    </div>
  )

  /** Los desplegables guardan al elegir: no hay estado intermedio que proteger. */
  function confirmarCampo(campo: string, valor: string) {
    if (valor === (inicial.current[campo] ?? '')) return
    enviar({ [campo]: valor }, { [campo]: valor })
  }
}

function aTexto(v: FichaEditable): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of NUMERICOS) {
    const val = v[c.id]
    out[c.id] = val == null ? '' : String(val)
  }
  out.property_type = v.property_type ?? ''
  out.operation_type = v.operation_type ?? ''
  out.currency = v.currency ?? 'USD'
  out.asking_price = v.asking_price == null ? '' : formatearMiles(String(v.asking_price))
  out.commission_percentage = v.commission_percentage == null ? '' : String(v.commission_percentage)
  out.contract_start_date = v.contract_start_date ?? ''
  out.contract_end_date = v.contract_end_date ?? ''
  out.description = v.description ?? ''
  return out
}
