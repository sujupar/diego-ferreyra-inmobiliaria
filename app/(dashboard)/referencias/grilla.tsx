'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Heart, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { VideoRef } from '@/lib/video-refs/repo'
import Detalle from './detalle'

type Rango = 'hoy' | 'semana' | 'todas'
const RANGOS: { id: Rango; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'todas', label: 'Todas' },
]

const PLACEHOLDERS = [
  'bg-slate-300', 'bg-stone-300', 'bg-zinc-300', 'bg-amber-200', 'bg-sky-200', 'bg-emerald-200', 'bg-rose-200',
]
function colorPlaceholder(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PLACEHOLDERS[h % PLACEHOLDERS.length]
}

export function compacto(n: number): string {
  return new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export function MultBadge({ m, className }: { m: number | null; className?: string }) {
  return m !== null && m !== undefined ? (
    <Badge className={cn('font-semibold', className)}>×{Number.isInteger(m) ? m : m.toFixed(1)}</Badge>
  ) : (
    <Badge variant="outline" className={cn('bg-background/90 text-muted-foreground', className)}>sin medición</Badge>
  )
}

function Tarjeta({ r, onOpen }: { r: VideoRef; onOpen: () => void }) {
  const meta = [r.cuenta, r.plataforma, fechaCorta(r.fecha_video ?? r.created_at)].filter(Boolean).join(' · ')
  return (
    <li>
      <button
        type="button" onClick={onOpen}
        className="w-full text-left rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow focus-visible:ring-2 focus-visible:ring-ring outline-none"
      >
        <div className={cn('relative aspect-[9/12] w-full', !r.thumbnail_url && colorPlaceholder(r.id))}>
          {r.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.thumbnail_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          )}
          <MultBadge m={r.multiplicador} className="absolute top-2 left-2" />
          {r.estado_uso !== 'sin_usar' && (
            <Badge variant="outline" className="absolute top-2 right-2 bg-background/90">
              {r.estado_uso === 'guionizando' ? 'escribiendo…' : r.estado_uso === 'usada' ? 'guion listo' : 'error'}
            </Badge>
          )}
        </div>
        <div className="p-3 space-y-1">
          <p className="text-sm font-medium leading-snug line-clamp-2">{r.tema}</p>
          <p className="text-xs text-muted-foreground truncate">{meta}</p>
          {(r.vistas !== null || r.likes !== null) && (
            <p className="flex items-center gap-3 text-xs text-muted-foreground">
              {r.vistas !== null && <span className="inline-flex items-center gap-1"><Eye className="size-3.5" />{compacto(r.vistas)}</span>}
              {r.likes !== null && <span className="inline-flex items-center gap-1"><Heart className="size-3.5" />{compacto(r.likes)}</span>}
            </p>
          )}
        </div>
      </button>
    </li>
  )
}

export default function Grilla() {
  const [refs, setRefs] = useState<VideoRef[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [rango, setRango] = useState<Rango>('todas')
  const [selId, setSelId] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/video-refs')
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || 'No se pudieron cargar las referencias')
      setRefs(d.refs ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las referencias')
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Mientras alguna ref se esté guionizando, refrescamos solas cada 8s.
  const hayPendientes = !!refs?.some((r) => r.estado_uso === 'guionizando')
  useEffect(() => {
    if (!hayPendientes) return
    const t = setInterval(cargar, 8000)
    return () => clearInterval(t)
  }, [hayPendientes, cargar])

  const filtradas = useMemo(() => {
    if (!refs) return []
    const needle = q.trim().toLowerCase()
    const desde = rango === 'hoy' ? new Date().setHours(0, 0, 0, 0)
      : rango === 'semana' ? Date.now() - 7 * 86_400_000 : 0
    return refs.filter((r) => {
      if (desde && new Date(r.created_at).getTime() < desde) return false
      if (!needle) return true
      return `${r.cuenta ?? ''} ${r.tema}`.toLowerCase().includes(needle)
    })
  }, [refs, q, rango])

  const seleccionada = refs?.find((r) => r.id === selId) ?? null

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cuenta o tema" aria-label="Buscar referencias" className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Período">
          {RANGOS.map((o) => (
            <button
              key={o.id} type="button" onClick={() => setRango(o.id)} aria-pressed={rango === o.id}
              className={cn(
                'flex-1 sm:flex-none px-4 py-1.5 text-sm rounded-md transition-colors',
                rango === o.id ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!refs && !error && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="aspect-[3/4] rounded-xl" />)}
        </div>
      )}
      {refs && filtradas.length === 0 && (
        <div className="text-center py-12 border rounded-xl border-dashed">
          <p className="text-muted-foreground text-sm">
            {refs.length === 0 ? 'Todavía no hay referencias de video.' : 'No hay referencias que coincidan con la búsqueda.'}
          </p>
        </div>
      )}
      {filtradas.length > 0 && (
        <ul className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {filtradas.map((r) => <Tarjeta key={r.id} r={r} onOpen={() => setSelId(r.id)} />)}
        </ul>
      )}

      <Detalle
        ref_={seleccionada}
        onClose={() => setSelId(null)}
        onChanged={cargar}
      />
    </section>
  )
}
