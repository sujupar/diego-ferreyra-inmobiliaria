'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'

interface NewsItem {
  rank: number | null
  titulo: string | null
  medio: string | null
  fecha: string | null
  impacto: number | null
  por_que: string | null
  angulo: string | null
  formato: string | null
  url: string | null
}

interface Scan {
  id: string
  scan_date: string
  items: NewsItem[]
  created_at: string
}

// Color del badge de impacto según la rúbrica del Reportero (umbral 60 para
// "molestar a Diego"): ≥80 = fuerte, 60-79 = pasa, <60 = flojo.
function impactoVariant(n: number | null): 'default' | 'secondary' | 'outline' {
  if (n == null) return 'outline'
  if (n >= 80) return 'default'
  if (n >= 60) return 'secondary'
  return 'outline'
}

// Fecha YYYY-MM-DD -> texto largo en es-AR, sin corrimiento de zona horaria
// (si se parsea como ISO, Date la toma a medianoche UTC y en GMT-5 cae un día antes).
function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export default function NoticiasPage() {
  const [scans, setScans] = useState<Scan[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/news')
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setScans(d.scans) })
      .catch((e) => setError(String(e.message)))
  }, [])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Noticias</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Barridos diarios del Reportero: noticias inmobiliarias frescas, verificadas y rankeadas por impacto para el propietario.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!scans && !error && <p className="text-muted-foreground text-sm">Cargando…</p>}
      {scans && scans.length === 0 && (
        <div className="text-center py-16 border rounded-xl border-dashed">
          <p className="text-muted-foreground">Todavía no hay barridos cargados.</p>
        </div>
      )}

      <div className="space-y-8">
        {(scans || []).map((scan) => {
          const items = [...(scan.items || [])].sort(
            (a, b) => (a.rank ?? 999) - (b.rank ?? 999),
          )
          return (
            <section key={scan.id}>
              <h2 className="text-lg font-semibold capitalize border-b pb-2 mb-4">
                {fechaLarga(scan.scan_date)}
              </h2>

              {items.length === 0 && (
                <p className="text-sm text-muted-foreground">Ese día no se rankeó ninguna noticia.</p>
              )}

              <div className="space-y-3">
                {items.map((it, i) => (
                  <article key={i} className="rounded-xl border p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start gap-3">
                      <Badge variant={impactoVariant(it.impacto)} className="shrink-0 mt-0.5">
                        {it.impacto != null ? `Impacto ${it.impacto}` : 'Sin puntaje'}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug">
                          {it.url
                            ? <a href={it.url} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">{it.titulo || 'Sin título'}</a>
                            : (it.titulo || 'Sin título')}
                        </p>
                        {(it.medio || it.fecha) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {[it.medio, it.fecha].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {it.por_que && (
                          <p className="text-sm mt-2"><span className="text-muted-foreground">Por qué sirve: </span>{it.por_que}</p>
                        )}
                        {it.angulo && (
                          <p className="text-sm mt-1"><span className="text-muted-foreground">Ángulo: </span>{it.angulo}</p>
                        )}
                        {it.formato && (
                          <p className="text-xs mt-2">
                            <Badge variant="outline">{it.formato}</Badge>
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
