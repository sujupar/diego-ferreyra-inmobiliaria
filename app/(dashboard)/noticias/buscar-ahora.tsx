'use client'

import { useState } from 'react'
import { CheckCircle2, ExternalLink, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import Piezas from './piezas'

interface Candidate {
  titulo: string
  medio: string
  fecha: string
  url: string
  resumen: string
}

function fechaCorta(iso: string): string {
  const [y, m, d] = (iso || '').split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function BuscarAhora() {
  const [loading, setLoading] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [mock, setMock] = useState(false)
  const [failed, setFailed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  async function buscar() {
    setLoading(true); setError(null); setSent(false); setSelected(new Set())
    try {
      const r = await fetch('/api/news/scan', { method: 'POST' })
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || 'No se pudo buscar')
      setCandidates(d.candidates ?? [])
      setMock(!!d.mock)
      setFailed(d.failedQueries ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo buscar')
    } finally {
      setLoading(false)
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(i)) n.delete(i); else n.add(i)
      return n
    })
  }

  async function guionizar() {
    if (!candidates || selected.size === 0) return
    setSending(true); setError(null)
    try {
      const items = [...selected].sort((a, b) => a - b).map((i) => candidates[i])
      const r = await fetch('/api/news/guionizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || d.error) throw new Error(d.error || 'No se pudo enviar a guionizar')
      setSent(true)
      setCandidates(null)
      setSelected(new Set())
      setRefreshKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar a guionizar')
    } finally {
      setSending(false)
    }
  }

  const n = selected.size

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="rounded-xl border bg-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
          <div>
            <h2 className="font-semibold">Noticias de esta semana</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Buscamos en la web lo más relevante del mercado inmobiliario.
            </p>
          </div>
          <Button onClick={buscar} disabled={loading} size="lg" className="w-full sm:w-auto">
            {loading
              ? <><Loader2 className="animate-spin" /> Buscando…</>
              : <><Search /> Buscar noticias de esta semana</>}
          </Button>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 rounded-lg border border-red-200 bg-red-50 px-3 py-2">{error}</p>
        )}

        {sent && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <CheckCircle2 className="size-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">
              ✅ Listo, estamos escribiendo tus guiones. Te avisamos por Telegram cuando estén.
            </p>
          </div>
        )}

        {loading && (
          <div className="space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        )}

        {!loading && candidates && (
          <>
            {(mock || failed > 0) && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                {mock && <p>Modo prueba (sin key Perplexity).</p>}
                {failed > 0 && <p>Algunas búsquedas no respondieron.</p>}
              </div>
            )}

            {candidates.length === 0 ? (
              <div className="text-center py-12 border rounded-xl border-dashed">
                <p className="text-muted-foreground text-sm">No encontramos noticias nuevas. Probá de nuevo en un rato.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {candidates.length} noticias encontradas. Marcá las que quieras convertir en guion.
                </p>
                <ul className="space-y-3 pb-24">
                  {candidates.map((c, i) => {
                    const on = selected.has(i)
                    return (
                      <li key={c.url + i}>
                        <div
                          role="checkbox"
                          aria-checked={on}
                          tabIndex={0}
                          onClick={() => toggle(i)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(i) }
                          }}
                          className={cn(
                            'flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-all hover:shadow-sm',
                            on && 'border-primary bg-primary/5 ring-1 ring-primary/30',
                          )}
                        >
                          <Checkbox
                            checked={on}
                            onCheckedChange={() => toggle(i)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 shrink-0"
                            aria-label={`Seleccionar ${c.titulo}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium leading-snug">{c.titulo}</p>
                            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5">
                              <span>{c.medio}</span><span aria-hidden>·</span><span>{fechaCorta(c.fecha)}</span>
                              <a
                                href={c.url} target="_blank" rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-0.5 hover:text-primary hover:underline"
                              >
                                <ExternalLink className="size-3" /> ver nota
                              </a>
                            </p>
                            {c.resumen && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{c.resumen}</p>}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <div className="sticky bottom-4 z-10 flex justify-center">
                  <Button
                    onClick={guionizar} disabled={n === 0 || sending} size="lg"
                    className="shadow-lg w-full sm:w-auto"
                  >
                    {sending
                      ? <><Loader2 className="animate-spin" /> Enviando…</>
                      : `Guionizar ${n} seleccionada${n === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </section>

      <Piezas refreshKey={refreshKey} />
    </div>
  )
}
