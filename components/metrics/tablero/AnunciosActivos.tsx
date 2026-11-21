'use client'

/**
 * Anuncios de la campaña de tasación en el período: solo los ACTIVOS hoy, cada
 * uno con su miniatura; al tocarlo se abre una ventana para verlo (vista previa
 * de Meta e Instagram). Los apagados que gastaron se resumen en una línea y se
 * pueden desplegar. Lee Meta en vivo por una ruta aparte: si falla, dice "no
 * disponible" y el resto del Tablero sigue.
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ExternalLink, Loader2 } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AnunciosEnVivo } from '@/lib/metrics/tablero/meta-vivo'
import type { AnuncioPeriodo, TotalesAnuncios } from '@/lib/metrics/tablero/anuncios-periodo'
import type { Rango } from '@/lib/metrics/panel/rango'
import { num, pct, usd } from '@/components/metrics/panel/formato'
import { Caja, Plata, tabla, td, tdR, th } from './ui'

/** "🟢 Validados · Tasación · 70%" → "Validados (70 %)". El nombre interno de Meta no le dice nada al que lee. */
export function nombreConjunto(c: string): string {
  const pctTxt = /(\d{1,3})\s*%/.exec(c)?.[1]
  const base = c.replace(/^[^\p{L}\p{N}]+/u, '').split('·')[0].trim()
  return pctTxt ? `${base} (${pctTxt} %)` : base
}

function Cabecera() {
  return (
    <thead><tr className="border-b">
      <th className={`${th} text-left`}>Anuncio</th><th className={`${th} text-right`}>Gasto</th><th className={`${th} text-right`}>Impresiones</th>
      <th className={`${th} text-right`}>CTR</th><th className={`${th} text-right`}>Clics</th><th className={`${th} text-right`}>Visitas</th>
      <th className={`${th} text-right`}>Registros</th><th className={`${th} text-right`}>Visita → registro</th><th className={`${th} text-right`}>Costo por registro</th>
    </tr></thead>
  )
}

function Fila({ a, onVer }: { a: AnuncioPeriodo; onVer: (a: AnuncioPeriodo) => void }) {
  return (
    <tr className="border-b last:border-0 align-top">
      <td className={td}>
        <button type="button" onClick={() => onVer(a)} className="flex items-start gap-2 text-left group min-w-[220px]" aria-label={`Ver el anuncio ${a.nombre}`}>
          {a.miniatura
            // eslint-disable-next-line @next/next/no-img-element -- miniatura de Meta (URL firmada que vence): no pasa por el optimizador de imágenes
            ? <img src={a.miniatura} alt="" className="h-12 w-12 rounded-md object-cover border shrink-0" loading="lazy" referrerPolicy="no-referrer" />
            : <span className="h-12 w-12 rounded-md border bg-muted shrink-0" />}
          <span className="min-w-0">
            <span className="font-medium group-hover:underline underline-offset-2 break-words">{a.nombre}</span>
            {a.versiones > 1 && <span className="text-xs text-muted-foreground"> · {a.versiones} versiones</span>}
            {a.conjuntosActivos.length > 0 && <span className="block text-xs text-muted-foreground">{a.conjuntosActivos.map(nombreConjunto).join(' · ')}</span>}
            <span className="block text-xs text-primary">Ver anuncio</span>
          </span>
        </button>
      </td>
      <td className={tdR}><Plata u={a.gastoUsd} a={a.gasto} /></td>
      <td className={tdR}>{num(a.impresiones)}</td>
      <td className={tdR}>{pct(a.impresiones ? a.clics / a.impresiones : null, 2)}</td>
      <td className={tdR}>{num(a.clics)}</td>
      <td className={tdR}>{num(a.visitas)}</td>
      <td className={`${tdR} font-semibold`}>{num(a.registros)}</td>
      <td className={tdR}>{pct(a.visitas ? a.registros / a.visitas : null)}</td>
      <td className={tdR}>{a.registros === 0 ? <span className="text-muted-foreground">sin registros</span> : <Plata u={a.costoPorRegistroUsd} a={a.costoPorRegistro} />}</td>
    </tr>
  )
}

function FilaTotal({ etiqueta, t }: { etiqueta: string; t: TotalesAnuncios }) {
  return (
    <tr className="border-t font-semibold">
      <td className={td}>{etiqueta}</td>
      <td className={tdR}><Plata u={t.gastoUsd} a={t.gasto} /></td>
      <td className={tdR}>{num(t.impresiones)}</td>
      <td className={tdR}>{pct(t.impresiones ? t.clics / t.impresiones : null, 2)}</td>
      <td className={tdR}>{num(t.clics)}</td>
      <td className={tdR}>{num(t.visitas)}</td>
      <td className={tdR}>{num(t.registros)}</td>
      <td className={tdR}>{pct(t.visitas ? t.registros / t.visitas : null)}</td>
      <td className={tdR}>{t.registros ? <Plata u={t.costoPorRegistroUsd} a={t.costoPorRegistro} /> : '—'}</td>
    </tr>
  )
}

function VerAnuncio({ a, onCerrar }: { a: AnuncioPeriodo | null; onCerrar: () => void }) {
  return (
    <Dialog open={!!a} onOpenChange={o => { if (!o) onCerrar() }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {a && <>
          <DialogHeader>
            <DialogTitle className="break-words">{a.nombre}</DialogTitle>
            <DialogDescription>{a.activo ? `Activo · ${a.conjuntosActivos.map(nombreConjunto).join(' · ') || 'sin conjunto'}` : 'Apagado'}</DialogDescription>
          </DialogHeader>
          {a.miniatura && (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura de Meta (URL firmada que vence)
            <img src={a.miniatura} alt={`Imagen del anuncio ${a.nombre}`} className="w-full max-h-80 object-contain rounded-lg border bg-muted" referrerPolicy="no-referrer" />
          )}
          {a.titulo && <p className="text-sm font-semibold">{a.titulo}</p>}
          {a.texto && <p className="text-sm whitespace-pre-line text-muted-foreground">{a.texto}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {a.vistaPrevia && (
              <a href={a.vistaPrevia} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Ver el anuncio <ExternalLink className="h-4 w-4" />
              </a>
            )}
            {a.instagram && (
              <a href={a.instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                Ver en Instagram <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
          {a.vistaPrevia && <p className="text-xs text-muted-foreground">La vista previa de Meta pide estar logueado en Facebook. Instagram abre sin cuenta.</p>}
          {!a.vistaPrevia && !a.instagram && <p className="text-sm text-muted-foreground">Meta no devolvió un enlace para este anuncio.</p>}
        </>}
      </DialogContent>
    </Dialog>
  )
}

export function AnunciosActivos({ rango }: { rango: Rango }) {
  const [res, setRes] = useState<{ clave: string; valor: AnunciosEnVivo } | null>(null)
  const clave = `${rango.desde}|${rango.hasta}`
  // La respuesta guarda de qué período es: si cambió el período, se muestra "cargando" sin vaciar el estado en el efecto.
  const r = res?.clave === clave ? res.valor : null
  const [ver, setVer] = useState<AnuncioPeriodo | null>(null)
  useEffect(() => {
    let vivo = true
    fetch(`/api/metrics/tablero/anuncios-vivo?${new URLSearchParams({ desde: rango.desde, hasta: rango.hasta })}`)
      .then(x => (x.ok ? x.json() : null)).catch(() => null)
      .then(d => { if (vivo) setRes({ clave: `${rango.desde}|${rango.hasta}`, valor: d ?? { disponible: false, motivo: 'no disponible' } }) })
    return () => { vivo = false }
  }, [rango.desde, rango.hasta])

  if (!r) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Consultando a Meta…</p>
  if (!r.disponible) return <p className="text-sm text-muted-foreground">Anuncios no disponibles ({r.motivo}).</p>
  return (
    <div className="space-y-2">
      {r.activos.length === 0 ? <p className="text-sm text-muted-foreground">Ningún anuncio de la campaña de tasación está activo hoy.</p> : (
        <Caja>
          <table className={tabla}>
            <Cabecera />
            <tbody>
              {r.activos.map(a => <Fila key={a.nombre} a={a} onVer={setVer} />)}
              <FilaTotal etiqueta="Total activos" t={r.totales.activos} />
            </tbody>
          </table>
        </Caja>
      )}
      {r.apagados.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <button type="button" className="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground text-left">
              {r.apagados.length} {r.apagados.length === 1 ? 'anuncio apagado gastó' : 'anuncios apagados gastaron'} {usd(r.totales.apagados.gastoUsd, 1)} en el período ({num(r.totales.apagados.registros)} registros). Total de la campaña: {usd(r.totales.campania.gastoUsd, 1)}
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Caja>
              <table className={tabla}>
                <Cabecera />
                <tbody>
                  {r.apagados.map(a => <Fila key={a.nombre} a={a} onVer={setVer} />)}
                  <FilaTotal etiqueta="Total apagados" t={r.totales.apagados} />
                  <FilaTotal etiqueta="Total campaña" t={r.totales.campania} />
                </tbody>
              </table>
            </Caja>
          </CollapsibleContent>
        </Collapsible>
      )}
      <VerAnuncio a={ver} onCerrar={() => setVer(null)} />
    </div>
  )
}
