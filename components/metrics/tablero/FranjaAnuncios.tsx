'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Tablero } from '@/lib/metrics/tablero/servidor'
import type { AnunciosEnVivo } from '@/lib/metrics/tablero/meta-vivo'
import type { AjusteCalculado, Tramo } from '@/lib/metrics/tablero/anuncios'
import { hoyArgentina } from '@/lib/metrics/panel/rango'
import { fechaCorta, num } from '@/components/metrics/panel/formato'
import { Franja, Numero, Seccion, ars, tabla, th } from './Franja'

const TIPO: Record<string, string> = { tasacion: 'Tasación', clase: 'Clase gratuita', propiedad: 'Propiedad' }
const REGLA = 'Estado: costo por registro de tasación contra el período comparado. Menos de 10 % de diferencia = Igual.'

export function FranjaAnuncios({ t, onCambio }: { t: Tablero; onCambio: () => void }) {
  const a = t.anuncios, x = a.actual, y = a.anterior
  const u = a.ultimoAjuste
  return (
    <Franja titulo="Anuncios" estado={a.estado} regla={REGLA} numeros={<>
      <Numero titulo="Inversión tasación" valor={ars(x?.gasto)} actual={x?.gasto} antes={y?.gasto} antesTexto={ars(y?.gasto)} bueno="baja"
        fuente={`Gasto de la campaña de tasación en Meta (meta_ads_daily, pesos). Meta se sincroniza una vez por día${a.ultimoDiaConGasto ? `: último día con gasto, ${fechaCorta(a.ultimoDiaConGasto)}` : ''}.`} />
      <Numero titulo="Registros tasación" valor={num(x?.registros)} actual={x?.registros} antes={y?.registros} antesTexto={num(y?.registros)}
        fuente="Evento CompleteRegistration del píxel (el que optimizan los conjuntos), de meta_ads_daily." />
      <Numero titulo="Costo por registro" valor={ars(x?.costoPorRegistro)} actual={x?.costoPorRegistro} antes={y?.costoPorRegistro} antesTexto={ars(y?.costoPorRegistro)} bueno="baja"
        fuente="Inversión ÷ registros de la campaña de tasación." />
      <Numero titulo={u ? `Desde el ajuste del ${fechaCorta(u.fecha)}` : 'Desde el último ajuste'} valor={u ? ars(u.despues?.costoPorRegistro) : 'sin ajuste cargado'}
        actual={u?.despues?.costoPorRegistro} antes={u?.antes?.costoPorRegistro} antesTexto={u ? ars(u.antes?.costoPorRegistro) : undefined} bueno="baja"
        sub={u?.metaCostoRegistroArs ? `meta ${ars(u.metaCostoRegistroArs)}` : undefined}
        fuente="Costo por registro de tasación desde el día siguiente al último ajuste cargado hasta hoy. 'Antes' = del 1 del mes al día previo al ajuste. El día del ajuste no cuenta en ninguno." />
    </>}>
      <Seccion titulo="Por campaña" fuente="Gasto y visitas de Meta (meta_ads_daily). Registros: píxel para tasación y clase; para cada propiedad, los registros de su ficha que vinieron de Meta (property_leads).">
        {a.campanias.length === 0 ? <p className="text-sm text-muted-foreground">Sin gasto en el período.</p> : (
          <div className="overflow-x-auto">
            <table className={tabla}>
              <thead><tr className="border-b"><th className={`${th} text-left`}>Campaña</th><th className={`${th} text-right`}>Gasto</th><th className={`${th} text-right`}>Visitas</th><th className={`${th} text-right`}>Registros</th><th className={`${th} text-right`}>Costo por registro</th></tr></thead>
              <tbody>
                {a.campanias.map(c => (
                  <tr key={c.campaniaId} className="border-b last:border-0">
                    <td className="py-1.5 pr-2">
                      <span className="text-xs text-muted-foreground">{TIPO[c.tipo]} · </span>
                      {c.propiedadId ? <Link className="underline-offset-2 hover:underline" href={`/properties/${c.propiedadId}`}>{c.nombre}</Link> : c.nombre}
                    </td>
                    <td className="text-right">{ars(c.gasto)}</td>
                    <td className="text-right">{num(c.visitas)}</td>
                    <td className="text-right">{num(c.registros)}</td>
                    <td className="text-right">{c.registros === 0 ? 'sin registros' : ars(c.costoPorRegistro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Ajustes de campaña" fuente="Cada cambio cargado, con el costo por registro antes (del 1 del mes al día previo) y después (del día siguiente a hoy). El día del ajuste no entra en ninguno: Meta da el gasto por día.">
        <ListaAjustes ajustes={a.ajustes} />
        <FormAjuste onCambio={onCambio} />
      </Seccion>

      <Seccion titulo="Anuncios de la estructura actual" fuente="Meta en vivo (se vuelve a leer cada 30 minutos): conjuntos activos de la campaña de tasación y sus anuncios, con lo acumulado desde que existen.">
        <AnunciosVivo />
      </Seccion>
    </Franja>
  )
}

function TramoTexto({ etiqueta, t }: { etiqueta: string; t: Tramo | null }) {
  if (!t) return <span className="text-muted-foreground">{etiqueta}: todavía no hay días</span>
  return (
    <span className="tabular-n">
      {etiqueta} ({fechaCorta(t.desde)} – {fechaCorta(t.hasta)}): {ars(t.gasto)} · {num(t.registros)} registros · <strong>{t.registros === 0 ? 'sin registros' : ars(t.costoPorRegistro)}</strong> por registro
    </span>
  )
}

function ListaAjustes({ ajustes }: { ajustes: AjusteCalculado[] }) {
  if (ajustes.length === 0) return <p className="text-sm text-muted-foreground">Sin ajustes cargados.</p>
  return (
    <ul className="divide-y border rounded-lg">
      {ajustes.map(j => (
        <li key={j.id} className="p-3 text-sm space-y-1">
          <p><span className="tabular-n text-muted-foreground">{fechaCorta(j.fecha)}</span> · {j.embudo === 'clase' ? 'Clase' : 'Tasación'} · <strong>{j.titulo}</strong></p>
          {j.detalle && <p className="text-xs text-muted-foreground">{j.detalle}</p>}
          {(j.resultadoBuscado || j.metaCostoRegistroArs || j.fechaDecision) && (
            <p className="text-xs">
              {j.resultadoBuscado && <>Busca: {j.resultadoBuscado}. </>}
              {j.metaCostoRegistroArs && <>Meta: {ars(j.metaCostoRegistroArs)} por registro. </>}
              {j.fechaDecision && <>Se decide el {fechaCorta(j.fechaDecision)}.</>}
            </p>
          )}
          <div className="flex flex-col text-xs gap-0.5">
            <TramoTexto etiqueta="Antes" t={j.antes} />
            <TramoTexto etiqueta="Después" t={j.despues} />
          </div>
        </li>
      ))}
    </ul>
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
    <div className="rounded-lg border p-3 grid gap-2 sm:grid-cols-2">
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

const ESTADO_AD: Record<string, string> = { ACTIVE: 'Activo', PAUSED: 'Pausado', ADSET_PAUSED: 'Conjunto pausado', CAMPAIGN_PAUSED: 'Campaña pausada', DISAPPROVED: 'Rechazado', PENDING_REVIEW: 'En revisión', WITH_ISSUES: 'Con problemas', ARCHIVED: 'Archivado' }

function AnunciosVivo() {
  const [r, setR] = useState<AnunciosEnVivo | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/metrics/tablero/anuncios-vivo').then(x => (x.ok ? x.json() : null)).catch(() => null)
      .then(d => { if (vivo) setR(d ?? { disponible: false, motivo: 'no disponible' }) })
    return () => { vivo = false }
  }, [])
  if (!r) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Consultando a Meta…</p>
  if (!r.disponible) return <p className="text-sm text-muted-foreground">No disponible ({r.motivo})</p>
  const conjuntos = [...new Set(r.anuncios.map(a => a.conjunto))]
  return (
    <div className="space-y-3">
      {conjuntos.map(c => (
        <div key={c} className="overflow-x-auto">
          <p className="text-xs font-medium mb-1">{c}</p>
          <table className={tabla}>
            <thead><tr className="border-b"><th className={`${th} text-left`}>Anuncio</th><th className={`${th} text-left`}>Estado</th><th className={`${th} text-right`}>Gasto</th><th className={`${th} text-right`}>Visitas</th><th className={`${th} text-right`}>Registros</th><th className={`${th} text-right`}>Costo por registro</th></tr></thead>
            <tbody>
              {r.anuncios.filter(a => a.conjunto === c).map(a => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">{a.nombre}</td>
                  <td className={a.estado === 'ACTIVE' ? '' : 'text-muted-foreground'}>{ESTADO_AD[a.estado] ?? a.estado}</td>
                  <td className="text-right">{ars(a.gasto)}</td>
                  <td className="text-right">{num(a.visitas)}</td>
                  <td className="text-right">{num(a.registros)}</td>
                  <td className="text-right">{a.registros === 0 ? 'sin registros' : ars(a.costoPorRegistro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {r.anuncios.length === 0 && <p className="text-sm text-muted-foreground">No hay conjuntos activos.</p>}
    </div>
  )
}
