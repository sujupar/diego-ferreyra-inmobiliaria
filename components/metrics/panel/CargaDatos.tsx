'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { VentaCalculada, VentaRow } from '@/lib/metrics/panel/reparto'
import { FormVenta, VENTA_VACIA } from './FormVenta'
import { fechaCorta, usd } from './formato'

async function enviar(url: string, method: string, body?: unknown): Promise<string | null> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  if (r.ok) return null
  const d = await r.json().catch(() => ({}))
  return d?.error ?? `Error ${r.status}`
}

/** Donde se cargan las ventas sin ficha, los gastos fijos y los cambios (hitos). */
export function CargaDatos({ onCambio }: { onCambio: () => void }) {
  return (
    <Collapsible className="rounded-xl border bg-card">
      <CollapsibleTrigger asChild>
        <button className="group w-full flex items-center justify-between p-4 text-left">
          <span><span className="font-semibold">Cargar datos</span><span className="block text-xs text-muted-foreground">Ventas, gastos fijos e impuestos, y los cambios que movieron la conversión.</span></span>
          <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <Tabs defaultValue="ventas">
          <TabsList>
            <TabsTrigger value="ventas">Ventas</TabsTrigger>
            <TabsTrigger value="gastos">Gastos</TabsTrigger>
            <TabsTrigger value="hitos">Cambios</TabsTrigger>
          </TabsList>
          <TabsContent value="ventas" className="pt-3"><Ventas onCambio={onCambio} /></TabsContent>
          <TabsContent value="gastos" className="pt-3"><Gastos onCambio={onCambio} /></TabsContent>
          <TabsContent value="hitos" className="pt-3"><Hitos onCambio={onCambio} /></TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Ventas({ onCambio }: { onCambio: () => void }) {
  const [lista, setLista] = useState<{ venta: VentaRow & { id: string }; calc: VentaCalculada }[]>([])
  const [editando, setEditando] = useState<string | 'nueva' | null>(null)
  const cargar = useCallback(async () => {
    const r = await fetch('/api/metrics/ventas')
    if (r.ok) setLista(await r.json())
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function guardar(v: VentaRow, id?: string) {
    const err = await enviar(id ? `/api/metrics/ventas/${id}` : '/api/metrics/ventas', id ? 'PATCH' : 'POST', v)
    if (err) return err
    toast.success('Venta guardada'); setEditando(null); await cargar(); onCambio()
    return null
  }
  async function borrar(id: string, dir: string) {
    if (!confirm(`¿Borrar la venta de ${dir}? Si la operación se cayó, mejor marcala "Se cayó".`)) return
    const err = await enviar(`/api/metrics/ventas/${id}`, 'DELETE')
    if (err) { toast.error(err); return }
    await cargar(); onCambio()
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Las ventas de propiedades que están en la plataforma se cargan solas al marcarlas reservadas o vendidas en su ficha. Acá se cargan las que no tienen ficha y se corrige cualquiera.</p>
      {editando === 'nueva' ? <FormVenta inicial={VENTA_VACIA} onGuardar={v => guardar(v)} onCancelar={() => setEditando(null)} />
        : <Button size="sm" onClick={() => setEditando('nueva')}>Cargar una venta</Button>}
      <div className="divide-y border rounded-lg">
        {lista.map(({ venta: v, calc: c }) => (
          <div key={v.id} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <strong>{v.direccion}</strong> · {v.estado === 'caida' ? 'se cayó' : v.estado} {fechaCorta(v.reservada_en)} · cobrado {usd(c.cobradoUsd)} · limpio {usd(c.limpioDiegoUsd)}
                {(c.faltan.length > 0 || v.a_confirmar) && <span className="text-xs text-amber-700 dark:text-amber-400"> · {v.a_confirmar ? 'a confirmar' : `faltan: ${c.faltan.join(', ')}`}</span>}
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => setEditando(editando === v.id ? null : v.id)}>{editando === v.id ? 'Cerrar' : 'Editar'}</Button>
                <Button size="icon" variant="ghost" aria-label={`Borrar la venta de ${v.direccion}`} onClick={() => borrar(v.id, v.direccion)}><Trash2 className="h-4 w-4" /></Button>
              </span>
            </div>
            {v.notas && editando !== v.id && <p className="text-xs text-muted-foreground mt-1">{v.notas}</p>}
            {editando === v.id && <div className="pt-3"><FormVenta inicial={v} onGuardar={x => guardar(x, v.id)} onCancelar={() => setEditando(null)} /></div>}
          </div>
        ))}
        {lista.length === 0 && <p className="p-3 text-sm text-muted-foreground">Todavía no hay ventas cargadas.</p>}
      </div>
    </div>
  )
}

interface Gasto { id: string; concepto: string; tipo: 'fijo' | 'impuesto'; monto_usd: number; desde: string; hasta: string | null; a_confirmar: boolean; notas: string | null }
const inp = 'rounded-md border px-2 py-1.5 text-sm bg-background'

function Gastos({ onCambio }: { onCambio: () => void }) {
  const [lista, setLista] = useState<Gasto[]>([])
  const [nuevo, setNuevo] = useState({ concepto: '', tipo: 'fijo', monto_usd: '', desde: new Date().toISOString().slice(0, 8) + '01' })
  const cargar = useCallback(async () => { const r = await fetch('/api/metrics/gastos'); if (r.ok) setLista(await r.json()) }, [])
  useEffect(() => { cargar() }, [cargar])

  async function cambiar(id: string, cambios: Partial<Gasto>) {
    const err = await enviar(`/api/metrics/gastos/${id}`, 'PATCH', cambios)
    if (err) toast.error(err); else { await cargar(); onCambio() }
  }
  async function agregar() {
    const err = await enviar('/api/metrics/gastos', 'POST', { ...nuevo, monto_usd: Number(nuevo.monto_usd) })
    if (err) { toast.error(err); return }
    setNuevo({ ...nuevo, concepto: '', monto_usd: '' }); await cargar(); onCambio()
  }
  async function borrar(g: Gasto) {
    if (!confirm(`¿Borrar "${g.concepto}"? Si el gasto terminó, mejor poné la fecha "hasta": así los meses anteriores no cambian.`)) return
    const err = await enviar(`/api/metrics/gastos/${g.id}`, 'DELETE')
    if (err) toast.error(err); else { await cargar(); onCambio() }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Monto mensual en dólares. Si un gasto cambia, poné la fecha "hasta" en el viejo y cargá el nuevo: así el margen de los meses anteriores no se mueve.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-xs text-muted-foreground border-b"><th className="text-left font-normal py-1">Concepto</th><th className="text-left font-normal px-2">Tipo</th><th className="text-right font-normal px-2">USD por mes</th><th className="text-left font-normal px-2">Desde</th><th className="text-left font-normal px-2">Hasta</th><th className="text-left font-normal px-2">A confirmar</th><th /></tr></thead>
          <tbody>
            {lista.map(g => (
              <tr key={g.id} className="border-b">
                <td className="py-1.5">{g.concepto}{g.notas && <span className="block text-xs text-muted-foreground">{g.notas}</span>}</td>
                <td className="px-2">{g.tipo === 'impuesto' ? 'Impuesto' : 'Fijo'}</td>
                <td className="px-2 text-right"><input type="number" min="0" defaultValue={g.monto_usd} className={`${inp} w-24 text-right`} onBlur={e => Number(e.target.value) !== g.monto_usd && cambiar(g.id, { monto_usd: Number(e.target.value) })} /></td>
                <td className="px-2">{fechaCorta(g.desde)}</td>
                <td className="px-2"><input type="date" defaultValue={g.hasta ?? ''} className={inp} onBlur={e => (e.target.value || null) !== g.hasta && cambiar(g.id, { hasta: e.target.value || null })} /></td>
                <td className="px-2"><input type="checkbox" checked={g.a_confirmar} onChange={e => cambiar(g.id, { a_confirmar: e.target.checked })} /></td>
                <td><Button size="icon" variant="ghost" aria-label={`Borrar ${g.concepto}`} onClick={() => borrar(g)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <input className={inp} placeholder="Concepto (ej: Monotributo)" value={nuevo.concepto} onChange={e => setNuevo({ ...nuevo, concepto: e.target.value })} />
        <select className={inp} value={nuevo.tipo} onChange={e => setNuevo({ ...nuevo, tipo: e.target.value })}><option value="fijo">Gasto fijo</option><option value="impuesto">Impuesto</option></select>
        <input className={`${inp} w-28`} type="number" min="0" placeholder="USD por mes" value={nuevo.monto_usd} onChange={e => setNuevo({ ...nuevo, monto_usd: e.target.value })} />
        <input className={inp} type="date" value={nuevo.desde} onChange={e => setNuevo({ ...nuevo, desde: e.target.value })} />
        <Button size="sm" onClick={agregar} disabled={!nuevo.concepto.trim() || nuevo.monto_usd === ''}>Agregar</Button>
      </div>
    </div>
  )
}

interface Hito { id: string; fecha: string; embudo: 'tasacion' | 'clase' | null; titulo: string; detalle: string | null }

function Hitos({ onCambio }: { onCambio: () => void }) {
  const [lista, setLista] = useState<Hito[]>([])
  const [nuevo, setNuevo] = useState({ fecha: new Date().toISOString().slice(0, 10), embudo: '', titulo: '', detalle: '' })
  const cargar = useCallback(async () => { const r = await fetch('/api/metrics/hitos'); if (r.ok) setLista(await r.json()) }, [])
  useEffect(() => { cargar() }, [cargar])

  async function agregar() {
    const err = await enviar('/api/metrics/hitos', 'POST', { ...nuevo, embudo: nuevo.embudo || null })
    if (err) { toast.error(err); return }
    setNuevo({ ...nuevo, titulo: '', detalle: '' }); await cargar(); onCambio()
  }
  async function borrar(h: Hito) {
    if (!confirm(`¿Borrar "${h.titulo}"?`)) return
    const err = await enviar(`/api/metrics/hitos/${h.id}`, 'DELETE')
    if (err) toast.error(err); else { await cargar(); onCambio() }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Cada cambio que se carga acá aparece como una línea en los gráficos: landing nueva, prueba A/B, anuncio nuevo, cambio de presupuesto.</p>
      <ul className="divide-y border rounded-lg">
        {lista.map(h => (
          <li key={h.id} className="p-2.5 flex items-start justify-between gap-2 text-sm">
            <span><span className="tabular-n text-muted-foreground">{fechaCorta(h.fecha)}</span> · {h.embudo === 'tasacion' ? 'Tasación' : h.embudo === 'clase' ? 'Clase' : 'Los dos'} · <strong>{h.titulo}</strong>{h.detalle && <span className="block text-xs text-muted-foreground">{h.detalle}</span>}</span>
            <Button size="icon" variant="ghost" aria-label={`Borrar ${h.titulo}`} onClick={() => borrar(h)}><Trash2 className="h-4 w-4" /></Button>
          </li>
        ))}
        {lista.length === 0 && <li className="p-2.5 text-sm text-muted-foreground">Sin cambios cargados.</li>}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <input className={inp} type="date" value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })} />
        <select className={inp} value={nuevo.embudo} onChange={e => setNuevo({ ...nuevo, embudo: e.target.value })}><option value="">Los dos embudos</option><option value="tasacion">Tasación</option><option value="clase">Clase</option></select>
        <input className={`${inp} min-w-48`} placeholder="Qué cambió (ej: anuncio nuevo VID11)" value={nuevo.titulo} onChange={e => setNuevo({ ...nuevo, titulo: e.target.value })} />
        <input className={`${inp} min-w-48`} placeholder="Detalle (opcional)" value={nuevo.detalle} onChange={e => setNuevo({ ...nuevo, detalle: e.target.value })} />
        <Button size="sm" onClick={agregar} disabled={!nuevo.titulo.trim()}>Agregar</Button>
      </div>
    </div>
  )
}
