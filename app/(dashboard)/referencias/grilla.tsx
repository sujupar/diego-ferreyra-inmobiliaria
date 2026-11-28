'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, Heart, MessageCircle, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { VideoRefConUrls as VideoRef } from '@/lib/video-refs/repo'
import { textoAlerta, textoUltima, type EstadoRadar } from '@/lib/video-refs/estado-radar'
import Detalle from './detalle'

type Rango = 'hoy' | 'semana' | 'todas'
const RANGOS: { id: Rango; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'semana', label: 'Semana' },
  { id: 'todas', label: 'Todas' },
]

type Rubro = 'todos' | 'inmobiliario' | 'otros'
const RUBROS: { id: Rubro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'inmobiliario', label: 'Inmobiliario' },
  { id: 'otros', label: 'Otros formatos' },
]
const TEMAS: Record<string, string> = {
  noticias: 'Noticias', impuestos: 'Impuestos', datos_mercado: 'Datos de mercado', creditos: 'Créditos',
  gobierno_normativa: 'Gobierno y normas', inmobiliarias: 'Inmobiliarias', otro: 'Otros',
}

function Cartel({ radar }: { radar: EstadoRadar }) {
  const ahora = new Date()
  const alerta = textoAlerta(radar, ahora)
  const ultima = textoUltima(radar, ahora)
  if (alerta) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <AlertTriangle className="size-4 mt-0.5 shrink-0" /> <span>{alerta}{ultima && <span className="block text-xs opacity-80">{ultima}</span>}</span>
      </div>
    )
  }
  if (!ultima) return null
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <CheckCircle2 className="size-4 shrink-0" /> {ultima}
    </div>
  )
}

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
  const meta = [r.cuenta, fechaCorta(r.fecha_video ?? r.created_at)].filter(Boolean).join(' · ')
  return (
    <li>
      <button
        type="button" onClick={onOpen}
        className="w-full text-left rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow focus-visible:ring-2 focus-visible:ring-ring outline-none"
      >
        <div className={cn('relative aspect-[9/12] w-full', !r.portada_url && colorPlaceholder(r.id))}>
          {r.portada_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.portada_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
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
          {r.formato && <p className="text-xs text-muted-foreground truncate">{r.formato}</p>}
          {(r.vistas !== null || r.likes !== null || r.comentarios !== null) && (
            <p className="flex items-center gap-3 text-xs text-muted-foreground">
              {r.vistas !== null && <span className="inline-flex items-center gap-1"><Eye className="size-3.5" />{compacto(r.vistas)}</span>}
              {r.likes !== null && <span className="inline-flex items-center gap-1"><Heart className="size-3.5" />{compacto(r.likes)}</span>}
              {r.comentarios !== null && <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" />{compacto(r.comentarios)}</span>}
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
  const [rubro, setRubro] = useState<Rubro>('todos')
  const [tema, setTema] = useState('')
  const [archivo, setArchivo] = useState(false)
  const [radar, setRadar] = useState<EstadoRadar | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(archivo ? '/api/video-refs?archivo=1' : '/api/video-refs')
      const d = await r.json()
      if (!r.ok || d.error) throw new Error(d.error || 'No se pudieron cargar las referencias')
      setRefs(d.refs ?? [])
      setRadar(d.radar ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las referencias')
    }
  }, [archivo])

  useEffect(() => { setRefs(null); cargar() }, [cargar])

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
      if (rubro === 'inmobiliario' && r.categoria !== 'inmobiliario_ar' && r.categoria !== 'inmobiliario_otro_pais') return false
      if (rubro === 'otros' && r.categoria !== 'formato_otro_rubro') return false
      if (tema && r.tema_categoria !== tema) return false
      if (!needle) return true
      return `${r.cuenta ?? ''} ${r.tema}`.toLowerCase().includes(needle)
    })
  }, [refs, q, rango, rubro, tema])

  const seleccionada = refs?.find((r) => r.id === selId) ?? null

  return (
    <section className="space-y-4">
      {!archivo && radar && <Cartel radar={radar} />}
      {archivo && (
        <p className="text-sm text-muted-foreground">
          Estás viendo el archivo anterior (lo que se cargó antes del radar).{' '}
          <button type="button" onClick={() => setArchivo(false)} className="text-primary hover:underline">Volver a las de hoy</button>
        </p>
      )}
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

      {!archivo && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Rubro">
            {RUBROS.map((o) => (
              <button
                key={o.id} type="button" onClick={() => setRubro(o.id)} aria-pressed={rubro === o.id}
                className={cn('px-3 py-1 text-sm rounded-md transition-colors',
                  rubro === o.id ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground')}
              >
                {o.label}
              </button>
            ))}
          </div>
          <select
            value={tema} onChange={(e) => setTema(e.target.value)} aria-label="Tema"
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todos los temas</option>
            {Object.entries(TEMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="button" onClick={() => setArchivo(true)} className="ml-auto text-sm text-muted-foreground hover:text-foreground hover:underline">
            Archivo anterior
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!refs && !error && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="aspect-[3/4] rounded-xl" />)}
        </div>
      )}
      {refs && filtradas.length === 0 && (
        <div className="text-center py-12 border rounded-xl border-dashed">
          <p className="text-muted-foreground text-sm">
            {refs.length === 0 ? (archivo ? 'No hay referencias en el archivo anterior.' : 'Todavía no hay referencias de video.') : 'No hay referencias que coincidan con la búsqueda.'}
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
        permitirDescartar={!archivo}
      />
    </section>
  )
}
