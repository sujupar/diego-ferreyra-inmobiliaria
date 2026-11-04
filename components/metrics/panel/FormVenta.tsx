'use client'

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { calcularVenta, partesSugeridas, type OrigenDueno, type VentaRow } from '@/lib/metrics/panel/reparto'
import { usd } from './formato'

export const ORIGENES: { key: OrigenDueno; label: string }[] = [
  { key: 'referido', label: 'Referido' },
  { key: 'embudo', label: 'Embudo de tasación' },
  { key: 'clase', label: 'Clase gratuita' },
  { key: 'portal', label: 'Portal' },
  { key: 'redes', label: 'Redes (orgánico)' },
  { key: 'otro', label: 'Otro' },
]

export const VENTA_VACIA: VentaRow = {
  direccion: '', estado: 'reservada', captada_en: null, reservada_en: null, escriturada_en: null, precio: null,
  moneda: 'USD', pct_vendedor: null, pct_comprador: null, otra_inmobiliaria_usd: 0, honorario_cobrado_usd: null,
  capto: 'Diego', vendio: null, asesor_pct: 0, julian_pct: 0, referidor_nombre: null, referidor_pct: 0,
  gastos_propiedad_usd: 0, origen_dueno: null, a_confirmar: false, notas: null,
}

const inp = 'w-full rounded-md border px-3 py-2 text-sm bg-background'

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="text-sm block">
      <span className="eyebrow block mb-1">{label}</span>
      {children}
      {ayuda && <span className="text-xs text-muted-foreground mt-1 block">{ayuda}</span>}
    </label>
  )
}

/**
 * Datos de una operación. El reparto se sugiere según quién captó, quién vendió
 * y cómo llegó el dueño (regla del dueño); se puede corregir. Lo limpio de Diego
 * se calcula en vivo y no se tipea.
 */
export function FormVenta({ inicial, conDireccion = true, onGuardar, onCancelar }: {
  inicial: VentaRow
  conDireccion?: boolean
  onGuardar: (v: VentaRow) => Promise<string | null>
  onCancelar?: () => void
}) {
  const [v, setV] = useState<VentaRow>(inicial)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const calc = useMemo(() => calcularVenta(v), [v])

  const set = <K extends keyof VentaRow>(k: K, val: VentaRow[K]) => setV(prev => ({ ...prev, [k]: val }))
  const num = (s: string) => (s.trim() === '' ? null : Number(s))

  /** Al cambiar quién captó/vendió, el origen o el referidor, se re-sugieren los %. */
  function resugerir(next: Partial<VentaRow>) {
    setV(prev => {
      const m = { ...prev, ...next }
      return { ...m, ...partesSugeridas({ capto: m.capto, vendio: m.vendio, origen: m.origen_dueno, hayReferidor: !!m.referidor_nombre?.trim() }) }
    })
  }

  async function guardar() {
    setGuardando(true); setError(null)
    try { setError(await onGuardar(v)) } finally { setGuardando(false) }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {conDireccion && (
          <Campo label="Propiedad">
            <input className={inp} value={v.direccion} onChange={e => set('direccion', e.target.value)} placeholder="Dirección" />
          </Campo>
        )}
        <Campo label="Estado">
          <select className={inp} value={v.estado} onChange={e => set('estado', e.target.value as VentaRow['estado'])}>
            <option value="reservada">Reservada</option>
            <option value="vendida">Vendida (escriturada)</option>
            <option value="caida">Se cayó</option>
          </select>
        </Campo>
        <Campo label="Cómo llegó el dueño">
          <select className={inp} value={v.origen_dueno ?? ''} onChange={e => resugerir({ origen_dueno: (e.target.value || null) as OrigenDueno | null })}>
            <option value="">Elegir…</option>
            {ORIGENES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </Campo>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Campo label="Se captó"><input type="date" className={inp} value={v.captada_en ?? ''} onChange={e => set('captada_en', e.target.value || null)} /></Campo>
        <Campo label="Se reservó" ayuda="La venta cuenta en este mes."><input type="date" className={inp} value={v.reservada_en ?? ''} onChange={e => set('reservada_en', e.target.value || null)} /></Campo>
        <Campo label="Se escrituró"><input type="date" className={inp} value={v.escriturada_en ?? ''} onChange={e => set('escriturada_en', e.target.value || null)} /></Campo>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Campo label="Precio de venta"><input type="number" min="0" className={inp} value={v.precio ?? ''} onChange={e => set('precio', num(e.target.value))} /></Campo>
        <Campo label="Moneda">
          <select className={inp} value={v.moneda} onChange={e => set('moneda', e.target.value as 'USD' | 'ARS')}>
            <option value="USD">USD</option><option value="ARS">ARS</option>
          </select>
        </Campo>
        <Campo label="% al vendedor"><input type="number" min="0" max="20" step="0.5" className={inp} value={v.pct_vendedor ?? ''} onChange={e => set('pct_vendedor', num(e.target.value))} /></Campo>
        <Campo label="% al comprador"><input type="number" min="0" max="20" step="0.5" className={inp} value={v.pct_comprador ?? ''} onChange={e => set('pct_comprador', num(e.target.value))} /></Campo>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Se llevó otra inmobiliaria (USD)" ayuda="Si se compartió la operación.">
          <input type="number" min="0" className={inp} value={v.otra_inmobiliaria_usd || ''} onChange={e => set('otra_inmobiliaria_usd', num(e.target.value) ?? 0)} />
        </Campo>
        <Campo label="Honorario cobrado real (USD)" ayuda={calc.honorarioBrutoUsd != null ? `Si se deja vacío: ${usd(Math.max(0, calc.honorarioBrutoUsd - v.otra_inmobiliaria_usd))} (precio × %).` : 'Lo que efectivamente entró.'}>
          <input type="number" min="0" className={inp} value={v.honorario_cobrado_usd ?? ''} onChange={e => set('honorario_cobrado_usd', num(e.target.value))} />
        </Campo>
      </div>

      <div className="rounded-xl border p-3 space-y-3">
        <p className="eyebrow">Reparto (sale del honorario cobrado)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo label="Captó"><input className={inp} value={v.capto ?? ''} onChange={e => resugerir({ capto: e.target.value || null })} /></Campo>
          <Campo label="Mostró / vendió"><input className={inp} value={v.vendio ?? ''} onChange={e => resugerir({ vendio: e.target.value || null })} /></Campo>
          <Campo label="Referidor (si hubo)"><input className={inp} value={v.referidor_nombre ?? ''} onChange={e => resugerir({ referidor_nombre: e.target.value || null })} placeholder="Ej: la abogada" /></Campo>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Campo label="% asesor" ayuda="20% si mostró, 50% si captó."><input type="number" min="0" max="100" className={inp} value={v.asesor_pct} onChange={e => set('asesor_pct', num(e.target.value) ?? 0)} /></Campo>
          <Campo label="% Julián" ayuda="20% si llegó por embudo."><input type="number" min="0" max="100" className={inp} value={v.julian_pct} onChange={e => set('julian_pct', num(e.target.value) ?? 0)} /></Campo>
          <Campo label="% referidor"><input type="number" min="0" max="100" className={inp} value={v.referidor_pct} onChange={e => set('referidor_pct', num(e.target.value) ?? 0)} /></Campo>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
          <Cifra t="Cobrado" v={calc.cobradoUsd} />
          <Cifra t="Asesor" v={calc.asesorUsd} />
          <Cifra t="Julián" v={calc.julianUsd} />
          <Cifra t="Referidor" v={calc.referidorUsd} />
          <Cifra t="Limpio Diego" v={calc.limpioDiegoUsd} fuerte />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Gastos de esta propiedad (USD)" ayuda="Fotos, video, recorrido, destaques, cartel. Se restan como costo de vender.">
          <input type="number" min="0" className={inp} value={v.gastos_propiedad_usd || ''} onChange={e => set('gastos_propiedad_usd', num(e.target.value) ?? 0)} />
        </Campo>
        <Campo label="Notas">
          <input className={inp} value={v.notas ?? ''} onChange={e => set('notas', e.target.value || null)} />
        </Campo>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.a_confirmar} onChange={e => set('a_confirmar', e.target.checked)} />
        Algún dato está a confirmar
      </label>

      {calc.faltan.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">Faltan: {calc.faltan.join(', ')}. Se puede guardar igual; el panel la marca como incompleta.</p>
      )}
      {error && <p className="text-sm text-[color:var(--destructive)]">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={guardar} disabled={guardando}>
          {guardando && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Guardar
        </Button>
        {onCancelar && <Button variant="ghost" onClick={onCancelar} disabled={guardando}>Cancelar</Button>}
      </div>
    </div>
  )
}

function Cifra({ t, v, fuerte }: { t: string; v: number | null; fuerte?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 ${fuerte ? 'bg-[color:var(--brand)]/10' : 'bg-muted/40'}`}>
      <p className="text-xs text-muted-foreground">{t}</p>
      <p className={`tabular-n ${fuerte ? 'font-semibold' : ''}`}>{v == null ? '—' : usd(v)}</p>
    </div>
  )
}
