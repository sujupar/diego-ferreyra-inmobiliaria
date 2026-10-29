'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ExternalLink, Copy, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { NewsScript } from '@/lib/news/scripts-repo'

const ESTADO: Record<NewsScript['estado'], { label: string; cls: string }> = {
  guionizando: { label: 'escribiendo…', cls: 'border-amber-200 bg-amber-100 text-amber-800' },
  listo: { label: 'listo', cls: 'border-emerald-200 bg-emerald-100 text-emerald-800' },
  error: { label: 'error', cls: 'border-red-200 bg-red-100 text-red-800' },
}

function fechaCorta(iso: string | null): string {
  const [y, m, d] = (iso || '').split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Pieza({ s }: { s: NewsScript }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const est = ESTADO[s.estado]

  async function copiar() {
    if (!s.guion) return
    try {
      await navigator.clipboard.writeText(s.guion)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* sin permiso de portapapeles */ }
  }

  return (
    <li className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{s.titulo}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {[s.medio, fechaCorta(s.fecha_articulo)].filter(Boolean).join(' · ')}
          </p>
          <Badge variant="outline" className={cn('mt-2 font-medium', est.cls, s.estado === 'guionizando' && 'animate-pulse')}>
            {est.label}
          </Badge>
        </div>
        <ChevronDown className={cn('size-5 shrink-0 text-muted-foreground mt-0.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t px-4 py-4 space-y-4 bg-muted/20">
          <a
            href={s.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" /> Ver artículo original
          </a>
          {s.resumen && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Resumen</p>
              <p className="text-sm leading-relaxed">{s.resumen}</p>
            </div>
          )}
          {s.estado === 'listo' && s.guion && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Guion</p>
                <button type="button" onClick={copiar} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  {copied ? <><Check className="size-3.5" /> Copiado</> : <><Copy className="size-3.5" /> Copiar</>}
                </button>
              </div>
              <p className="text-base leading-relaxed whitespace-pre-wrap rounded-lg border bg-background p-4">{s.guion}</p>
            </div>
          )}
          {s.estado === 'guionizando' && (
            <p className="text-sm text-muted-foreground">Estamos escribiendo el guion. Se actualiza solo.</p>
          )}
          {s.estado === 'error' && (
            <p className="text-sm text-red-700">
              No se pudo escribir este guion{s.error_msg ? `: ${s.error_msg}` : '.'}
            </p>
          )}
        </div>
      )}
    </li>
  )
}

export default function Piezas({ refreshKey = 0 }: { refreshKey?: number }) {
  const [scripts, setScripts] = useState<NewsScript[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/news/scripts')
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || 'No se pudieron cargar las piezas')
      setScripts(d.scripts ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las piezas')
    }
  }, [])

  useEffect(() => { cargar() }, [cargar, refreshKey])

  // Mientras haya piezas escribiéndose, refrescamos solas.
  const hayPendientes = !!scripts?.some((s) => s.estado === 'guionizando')
  useEffect(() => {
    if (!hayPendientes) return
    const t = setInterval(cargar, 8000)
    return () => clearInterval(t)
  }, [hayPendientes, cargar])

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold border-b pb-2">Tus piezas</h2>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!scripts && !error && (
        <div className="space-y-3" aria-hidden>
          {[0, 1].map((i) => <div key={i} className="h-20 rounded-xl border bg-muted/40 animate-pulse" />)}
        </div>
      )}
      {scripts && scripts.length === 0 && (
        <div className="text-center py-12 border rounded-xl border-dashed">
          <p className="text-muted-foreground text-sm">Todavía no guionizaste ninguna noticia. Buscá arriba y elegí las que quieras.</p>
        </div>
      )}
      {scripts && scripts.length > 0 && (
        <ul className="space-y-3">{scripts.map((s) => <Pieza key={s.id} s={s} />)}</ul>
      )}
    </section>
  )
}
