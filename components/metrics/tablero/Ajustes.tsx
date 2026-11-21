'use client'

/** Ajustes de campaña: el vigente arriba (qué se hizo, qué se busca, meta, cuándo se decide) y la lista con su antes y después. */

import { useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { AjusteCalculado, Tramo } from '@/lib/metrics/tablero/anuncios'
import { hoyArgentina } from '@/lib/metrics/panel/rango'
import { fechaCorta, num } from '@/components/metrics/panel/formato'
import { ars } from './ui'

export function AjusteVigente({ ajuste }: { ajuste: AjusteCalculado | null }) {
  if (!ajuste) return <p className="text-sm text-muted-foreground">Sin ajustes de campaña cargados.</p>
  const datos: [string, string][] = [
    ['Qué se hizo', `${fechaCorta(ajuste.fecha)} · ${ajuste.titulo}${ajuste.detalle ? `. ${ajuste.detalle}` : ''}`],
    ['Resultado que buscamos', ajuste.resultadoBuscado ?? '—'],
    ['Meta de costo por registro', ajuste.metaCostoRegistroArs ? `${ars(ajuste.metaCostoRegistroArs)} o menos` : '—'],
    ['Cuándo se decide', ajuste.fechaDecision ? fechaCorta(ajuste.fechaDecision) : '—'],
  ]
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
      {datos.map(([k, v]) => (
        <div key={k} className="rounded-xl border bg-card p-3 space-y-1 min-w-0">
          <p className="text-xs text-muted-foreground">{k}</p>
          <p className="text-sm font-medium break-words">{v}</p>
        </div>
      ))}
    </div>
  )
}

function TramoTexto({ etiqueta, t }: { etiqueta: string; t: Tramo | null }) {
  if (!t) return <span className="text-muted-foreground">{etiqueta}: todavía no hay días</span>
  return (
    <span className="tabular-n">
      {etiqueta} ({fechaCorta(t.desde)} – {fechaCorta(t.hasta)}): {ars(t.gasto)} · {num(t.registros)} {t.registros === 1 ? 'registro' : 'registros'} · {t.registros === 0 ? 'sin costo por registro' : <><strong>{ars(t.costoPorRegistro)}</strong> por registro</>}
    </span>
  )
}

export function HistorialAjustes({ ajustes, onCambio }: { ajustes: AjusteCalculado[]; onCambio: () => void }) {
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <button type="button" className="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          Todos los ajustes, con su antes y después <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3">
        {ajustes.length === 0 ? <p className="text-sm text-muted-foreground">Sin ajustes cargados.</p> : (
          <ul className="divide-y border rounded-lg bg-card">
            {ajustes.map(j => (
              <li key={j.id} className="p-3 text-sm space-y-1">
                <p><span className="tabular-n text-muted-foreground">{fechaCorta(j.fecha)}</span> · {j.embudo === 'clase' ? 'Clase' : 'Tasación'} · <strong>{j.titulo}</strong></p>
                {j.detalle && <p className="text-xs text-muted-foreground">{j.detalle}</p>}
                <div className="flex flex-col text-xs gap-0.5">
                  <TramoTexto etiqueta="Antes" t={j.antes} />
                  <TramoTexto etiqueta="Después" t={j.despues} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <FormAjuste onCambio={onCambio} />
      </CollapsibleContent>
    </Collapsible>
  )
}

const inp = 'rounded-md border px-2 py-1.5 text-sm bg-background'

function FormAjuste({ onCambio }: { onCambio: () => void }) {
  const vacio = { fecha: hoyArgentina(), embudo: 'tasacion', titulo: '', detalle: '', resultado_buscado: '', meta_costo_registro_ars: '', fecha_decision: '' }
  const [f, setF] = useState(vacio)
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  if (!abierto) return <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>Cargar un ajuste</Button>

  async function guardar() {
    setEnviando(true)
    try {
      const r = await fetch('/api/metrics/hitos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, embudo: f.embudo || null }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d?.error ?? `Error ${r.status}`); return }
      if (d?.aviso) toast.warning(d.aviso); else toast.success('Ajuste cargado')
      setF(vacio); setAbierto(false); onCambio()
    } finally { setEnviando(false) }
  }

  return (
    <div className="rounded-lg border bg-card p-3 grid gap-2 sm:grid-cols-2">
      <label className="text-xs space-y-1"><span className="block text-muted-foreground">Fecha</span><input className={`${inp} w-full`} type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></label>
      <label className="text-xs space-y-1"><span className="block text-muted-foreground">Campaña</span>
        <select className={`${inp} w-full`} value={f.embudo} onChange={e => setF({ ...f, embudo: e.target.value })}><option value="tasacion">Tasación</option><option value="clase">Clase</option><option value="">Las dos</option></select>
      </label>
      <label className="text-xs space-y-1 sm:col-span-2"><span className="block text-muted-foreground">Qué se hizo</span><input className={`${inp} w-full`} placeholder="Ej: dos conjuntos, Validados 70 % y Pruebas 30 %" value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} /></label>
      <label className="text-xs space-y-1 sm:col-span-2"><span className="block text-muted-foreground">Detalle (opcional)</span><input className={`${inp} w-full`} value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })} /></label>
      <label className="text-xs space-y-1 sm:col-span-2"><span className="block text-muted-foreground">Qué se busca (opcional)</span><input className={`${inp} w-full`} value={f.resultado_buscado} onChange={e => setF({ ...f, resultado_buscado: e.target.value })} /></label>
      <label className="text-xs space-y-1"><span className="block text-muted-foreground">Meta de costo por registro, $ (opcional)</span><input className={`${inp} w-full`} type="number" min="1" value={f.meta_costo_registro_ars} onChange={e => setF({ ...f, meta_costo_registro_ars: e.target.value })} /></label>
      <label className="text-xs space-y-1"><span className="block text-muted-foreground">Fecha de decisión (opcional)</span><input className={`${inp} w-full`} type="date" min={f.fecha} value={f.fecha_decision} onChange={e => setF({ ...f, fecha_decision: e.target.value })} /></label>
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" onClick={guardar} disabled={enviando || !f.titulo.trim() || !f.fecha}>{enviando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Guardar</Button>
        <Button size="sm" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
      </div>
    </div>
  )
}
