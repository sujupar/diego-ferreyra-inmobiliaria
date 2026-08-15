'use client'

/**
 * Central de Contenido — tablero estilo monday + vista mensual tipo calendario.
 * Vistas: Calendario (lista semanal o mes), Banco de ideas, Formatos, Correcciones.
 * Todo se edita acá y persiste en Supabase.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CATEGORIAS, ESTADOS, ORDEN_ESTADOS, PLATAFORMAS } from '@/lib/contenido/constants'
import { addMonths, fmtDate, labelDia, labelMes, labelSemana, mondayOf, monthGrid } from '@/lib/contenido/fechas'

// ---------- tipos ----------
interface Piece {
  id: string
  publish_date: string
  slot: string
  categoria: string
  subcategoria: string | null
  titular: string
  enfoque: string | null
  formato: string | null
  formato_id: string | null
  recurso: string | null
  guion: string | null
  copy: string | null
  plataformas: string[]
  estado: string
  refrescar: boolean
  notas: string | null
  resultados: Record<string, number> | null
}
interface Idea {
  id: string
  categoria: string
  subcategoria: string | null
  titular: string
  enfoque: string | null
  formato: string | null
  recurso: string | null
  prioridad: 'alta' | 'media'
  origen: string
  fuente: string | null
  refrescar: boolean
  estado: 'disponible' | 'usada' | 'descartada'
}
interface Fmt {
  id: string
  nombre: string
  descripcion: string | null
  cuando_usar: string | null
  diego_ya_lo_hizo: boolean
  referencias: { url: string; nota: string }[]
}
interface Corr {
  id: string
  corrected_at: string
  que_corrigio: string
  regla: string
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({ error: 'El servidor no respondió JSON' }))
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`)
  return json
}

/** Siguiente slot libre de un día: a, b, c… (orden alfabético = orden del día). */
export function siguienteSlot(ocupados: string[]): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz'
  for (const ch of abc) if (!ocupados.includes(ch)) return ch
  return 'z'
}

// ---------- pills ----------
function CatPill({ cat, sub }: { cat: string; sub?: string | null }) {
  const c = CATEGORIAS[cat] ?? { label: cat, bg: 'bg-gray-500', text: 'text-white' }
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${c.bg} ${c.text} whitespace-nowrap`}>
      {c.label}
      {sub ? <span className="ml-1 opacity-80 normal-case">· {sub === 'ia' ? 'IA' : 'Mkt'}</span> : null}
    </span>
  )
}

function EstadoSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const e = ESTADOS[value] ?? { label: value, bg: 'bg-gray-400' }
  return (
    <div className="relative inline-block">
      <select
        aria-label="Estado"
        className={`appearance-none cursor-pointer rounded px-2.5 py-1 pr-6 text-[11px] font-semibold uppercase tracking-wide text-white ${e.bg} disabled:opacity-60`}
        value={value}
        disabled={disabled}
        onChange={(ev) => onChange(ev.target.value)}
      >
        {ORDEN_ESTADOS.map((k) => (
          <option key={k} value={k} className="bg-white text-gray-900">
            {ESTADOS[k].label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-white text-[9px]">▾</span>
    </div>
  )
}

// ---------- componente principal ----------
export function ContenidoClient() {
  const [pieces, setPieces] = useState<Piece[] | null>(null)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [formats, setFormats] = useState<Fmt[]>([])
  const [corrections, setCorrections] = useState<Corr[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [vistaCal, setVistaCal] = useState<'lista' | 'mes'>('lista')
  const [mesAncla, setMesAncla] = useState('2026-08')
  const [selPiece, setSelPiece] = useState<Piece | null>(null)
  const [nueva, setNueva] = useState<null | { fecha?: string }>(null)
  const [catFiltro, setCatFiltro] = useState<string>('*')
  const [busqueda, setBusqueda] = useState('')
  const [programar, setProgramar] = useState<Idea | null>(null)

  useEffect(() => {
    api('GET', '/api/contenido')
      .then((d) => {
        setPieces(d.pieces)
        setIdeas(d.ideas)
        setFormats(d.formats)
        setCorrections(d.corrections)
        const hoy = fmtDate(new Date())
        setMesAncla(hoy.slice(0, 7))
      })
      .catch((e) => setError(e.message))
  }, [])

  const flash = useCallback((msg: string) => {
    setAviso(msg)
    setTimeout(() => setAviso(null), 2500)
  }, [])

  const patchPiece = useCallback(
    async (id: string, patch: Partial<Piece>) => {
      const prev = pieces
      setPieces((ps) => (ps ? ps.map((p) => (p.id === id ? { ...p, ...patch } : p)) : ps))
      try {
        const { row } = await api('PATCH', `/api/contenido/pieces/${id}`, patch)
        setPieces((ps) => (ps ? ps.map((p) => (p.id === id ? row : p)) : ps))
        setSelPiece((s) => (s && s.id === id ? row : s))
      } catch (e) {
        setPieces(prev)
        flash(`No se guardó: ${(e as Error).message}`)
      }
    },
    [pieces, flash],
  )

  const slotLibre = useCallback(
    (fecha: string) => siguienteSlot((pieces ?? []).filter((p) => p.publish_date === fecha).map((p) => p.slot)),
    [pieces],
  )

  const semanas = useMemo(() => {
    if (!pieces) return []
    const map = new Map<string, Piece[]>()
    for (const p of pieces) {
      const k = mondayOf(p.publish_date)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(p)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monday, ps]) => ({
        monday,
        piezas: ps.sort((a, b) => a.publish_date.localeCompare(b.publish_date) || a.slot.localeCompare(b.slot)),
      }))
  }, [pieces])

  const porDia = useMemo(() => {
    const map = new Map<string, Piece[]>()
    for (const p of pieces ?? []) {
      if (!map.has(p.publish_date)) map.set(p.publish_date, [])
      map.get(p.publish_date)!.push(p)
    }
    for (const v of map.values()) v.sort((a, b) => a.slot.localeCompare(b.slot))
    return map
  }, [pieces])

  const ideasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return ideas.filter(
      (i) =>
        i.estado !== 'descartada' &&
        (catFiltro === '*' || i.categoria === catFiltro) &&
        (!q || i.titular.toLowerCase().includes(q) || (i.enfoque ?? '').toLowerCase().includes(q)),
    )
  }, [ideas, catFiltro, busqueda])

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-lg font-medium">Sin acceso a la Central de Contenido</p>
        <p className="text-sm text-muted-foreground mt-2">{error}</p>
      </div>
    )
  }
  if (!pieces) return <div className="max-w-6xl mx-auto px-4 py-16 text-sm text-muted-foreground">Cargando la central…</div>

  const disponibles = ideas.filter((i) => i.estado === 'disponible').length
  const hoy = fmtDate(new Date())

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* header */}
      <div className="mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Central de Contenido</h1>
          <p className="text-xs text-muted-foreground font-mono">enlace directo · /contenido · no aparece en el menú</p>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {pieces.filter((p) => p.estado !== 'descartado').length} piezas programadas · {disponibles} ideas disponibles en el banco ·{' '}
          {corrections.length} correcciones registradas
        </p>
      </div>

      {aviso && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md bg-gray-900 text-white text-sm px-4 py-2 shadow-lg">{aviso}</div>
      )}

      <Tabs defaultValue="calendario">
        <TabsList>
          <TabsTrigger value="calendario">Calendario</TabsTrigger>
          <TabsTrigger value="banco">Banco de ideas</TabsTrigger>
          <TabsTrigger value="formatos">Formatos</TabsTrigger>
          <TabsTrigger value="correcciones">Correcciones</TabsTrigger>
        </TabsList>

        {/* ============ CALENDARIO ============ */}
        <TabsContent value="calendario" className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-md border overflow-hidden">
              <button
                className={`px-3 py-1.5 text-xs font-semibold ${vistaCal === 'lista' ? 'bg-gray-900 text-white' : 'hover:bg-muted'}`}
                onClick={() => setVistaCal('lista')}
              >
                Lista semanal
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-semibold border-l ${vistaCal === 'mes' ? 'bg-gray-900 text-white' : 'hover:bg-muted'}`}
                onClick={() => setVistaCal('mes')}
              >
                Mes
              </button>
            </div>
            <Button size="sm" onClick={() => setNueva({})}>
              + Nueva pieza
            </Button>
          </div>

          {vistaCal === 'lista' && (
            <>
              {semanas.length === 0 && <p className="text-sm text-muted-foreground">No hay piezas programadas todavía.</p>}
              {semanas.map(({ monday, piezas }) => {
                const publicadas = piezas.filter((p) => p.estado === 'publicado').length
                return (
                  <div key={monday} className="rounded-lg border overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-700 text-white px-4 py-2.5">
                      <span className="font-semibold text-sm">{labelSemana(monday)}</span>
                      <span className="text-xs opacity-90 font-mono">
                        {piezas.length} piezas · {publicadas} publicadas
                      </span>
                    </div>
                    <div className="flex h-1.5 w-full">
                      {piezas.map((p) => (
                        <span key={p.id} className={`flex-1 ${(ESTADOS[p.estado] ?? ESTADOS.propuesto).bg}`} />
                      ))}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[860px]">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-muted/40">
                            <th className="px-4 py-2 font-medium w-24">Día</th>
                            <th className="px-2 py-2 font-medium w-32">Categoría</th>
                            <th className="px-2 py-2 font-medium">Titular</th>
                            <th className="px-2 py-2 font-medium w-36">Formato</th>
                            <th className="px-2 py-2 font-medium w-32">Estado</th>
                            <th className="px-2 py-2 font-medium w-24">Vistas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {piezas.map((p) => {
                            const views =
                              p.resultados && typeof p.resultados.views === 'number' ? p.resultados.views.toLocaleString('es-AR') : '—'
                            const fmtNombre = formats.find((f) => f.id === p.formato_id)?.nombre ?? p.formato ?? '—'
                            return (
                              <tr
                                key={p.id}
                                className={`border-b last:border-b-0 hover:bg-muted/50 cursor-pointer ${p.estado === 'descartado' ? 'opacity-45' : ''}`}
                                onClick={() => setSelPiece(p)}
                              >
                                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                                  {labelDia(p.publish_date)} <span className="opacity-60">· {p.slot}</span>
                                </td>
                                <td className="px-2 py-2.5">
                                  <CatPill cat={p.categoria} sub={p.subcategoria} />
                                </td>
                                <td className="px-2 py-2.5">
                                  <span className={p.estado === 'descartado' ? 'line-through' : ''}>{p.titular}</span>
                                  {p.refrescar && (
                                    <span className="ml-2 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5 whitespace-nowrap">
                                      refrescar dato
                                    </span>
                                  )}
                                </td>
                                <td className="px-2 py-2.5 text-xs text-muted-foreground">{fmtNombre}</td>
                                <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                                  <EstadoSelect value={p.estado} onChange={(v) => patchPiece(p.id, { estado: v })} />
                                </td>
                                <td className="px-2 py-2.5 font-mono text-xs">{views}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {vistaCal === 'mes' && (
            <div className="rounded-lg border overflow-hidden">
              <div className="flex items-center justify-between bg-emerald-700 text-white px-4 py-2.5">
                <button className="text-sm font-bold px-2 hover:opacity-75" onClick={() => setMesAncla(addMonths(mesAncla, -1))} aria-label="Mes anterior">
                  ←
                </button>
                <span className="font-semibold text-sm capitalize">{labelMes(mesAncla)}</span>
                <button className="text-sm font-bold px-2 hover:opacity-75" onClick={() => setMesAncla(addMonths(mesAncla, 1))} aria-label="Mes siguiente">
                  →
                </button>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="grid grid-cols-7 border-b bg-muted/40">
                    {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => (
                      <div key={d} className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {d}
                      </div>
                    ))}
                  </div>
                  {monthGrid(mesAncla).map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
                      {week.map((day) => {
                        const delMes = day.slice(0, 7) === mesAncla
                        const items = porDia.get(day) ?? []
                        return (
                          <div
                            key={day}
                            className={`min-h-24 border-r last:border-r-0 p-1.5 align-top ${delMes ? '' : 'bg-muted/30'} ${day === hoy ? 'ring-2 ring-inset ring-emerald-500' : ''}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[11px] font-mono ${delMes ? '' : 'text-muted-foreground'}`}>{Number(day.slice(8))}</span>
                              <button
                                className="text-[11px] text-muted-foreground hover:text-foreground px-1"
                                title="Agregar pieza este día"
                                onClick={() => setNueva({ fecha: day })}
                              >
                                +
                              </button>
                            </div>
                            <div className="space-y-1">
                              {items.map((p) => {
                                const c = CATEGORIAS[p.categoria] ?? { bg: 'bg-gray-500', text: 'text-white' }
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => setSelPiece(p)}
                                    className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10.5px] font-medium ${c.bg} ${c.text} ${p.estado === 'descartado' ? 'opacity-40 line-through' : ''}`}
                                    title={`${p.titular} — ${(ESTADOS[p.estado] ?? ESTADOS.propuesto).label}`}
                                  >
                                    {p.estado === 'publicado' ? '✓ ' : ''}
                                    {p.titular.replace(/^«|»$/g, '')}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Las piezas también se programan desde el <strong>Banco de ideas</strong> («Programar») — el slot del día se asigna solo, sin
            límite de videos por día.
          </p>
        </TabsContent>

        {/* ============ BANCO ============ */}
        <TabsContent value="banco" className="mt-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <button
              onClick={() => setCatFiltro('*')}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${catFiltro === '*' ? 'bg-gray-900 text-white border-gray-900' : 'hover:border-gray-400'}`}
            >
              Todas
            </button>
            {Object.entries(CATEGORIAS).map(([k, c]) => (
              <button
                key={k}
                onClick={() => setCatFiltro(k)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${catFiltro === k ? `${c.bg} ${c.text} border-transparent` : 'hover:border-gray-400'}`}
              >
                {c.label}
              </button>
            ))}
            <Input
              placeholder="Buscar en el banco…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="ml-auto w-56 h-8 text-sm"
            />
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            {ideasFiltradas.length} ideas {catFiltro !== '*' ? `en ${CATEGORIAS[catFiltro]?.label}` : 'en total'} · las usadas quedan
            marcadas y enlazadas a su pieza
          </p>
          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-muted/40">
                    <th className="px-4 py-2 font-medium w-32">Categoría</th>
                    <th className="px-2 py-2 font-medium">Titular</th>
                    <th className="px-2 py-2 font-medium w-32">Formato</th>
                    <th className="px-2 py-2 font-medium w-24">Prioridad</th>
                    <th className="px-2 py-2 font-medium w-24">Origen</th>
                    <th className="px-2 py-2 font-medium w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {ideasFiltradas.map((i) => (
                    <tr key={i.id} className={`border-b last:border-b-0 hover:bg-muted/50 ${i.estado === 'usada' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-2.5">
                        <CatPill cat={i.categoria} sub={i.subcategoria} />
                      </td>
                      <td className="px-2 py-2.5">
                        <div>{i.titular}</div>
                        {i.enfoque && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{i.enfoque}</div>}
                        <div className="flex gap-1.5 mt-1">
                          {i.refrescar && (
                            <span className="rounded bg-amber-100 text-amber-800 text-[10px] font-semibold px-1.5 py-0.5">refrescar dato</span>
                          )}
                          {i.estado === 'usada' && (
                            <span className="rounded bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-1.5 py-0.5">ya programada</span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">{i.formato ?? '—'}</td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${i.prioridad === 'alta' ? 'bg-gray-900 text-white' : 'bg-muted text-muted-foreground'}`}
                        >
                          {i.prioridad}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">{i.origen === 'banco' ? 'Diego' : 'propuesto'}</td>
                      <td className="px-2 py-2.5 text-right">
                        {i.estado === 'disponible' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setProgramar(i)}>
                            Programar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <NuevaIdea
            onCreada={(row) => {
              setIdeas((xs) => [row, ...xs])
              flash('Idea agregada al banco')
            }}
            onError={flash}
          />
        </TabsContent>

        {/* ============ FORMATOS ============ */}
        <TabsContent value="formatos" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3 max-w-3xl">
            El <strong>formato de grabación</strong> es CÓMO se filma (pizarra, selfie caminando, pantalla verde…) — independiente del tema.
            Cada formato junta sus <strong>referencias</strong>: videos reales grabados así, para mirar antes de grabar. Se agregan pegando
            el enlace (Instagram, TikTok, YouTube).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {formats.map((f) => (
              <FormatoCard
                key={f.id}
                f={f}
                onPatch={(row) => setFormats((xs) => xs.map((x) => (x.id === row.id ? row : x)))}
                onError={flash}
              />
            ))}
          </div>
          <NuevoFormato
            onCreado={(row) => {
              setFormats((xs) => [...xs, row])
              flash('Formato agregado')
            }}
            onError={flash}
          />
        </TabsContent>

        {/* ============ CORRECCIONES ============ */}
        <TabsContent value="correcciones" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3 max-w-2xl">
            Cada vez que Diego corrige un guion, la corrección entra acá con la regla que deja. El objetivo: que el porcentaje de líneas
            corregidas baje sesión a sesión.
          </p>
          <div className="rounded-lg border overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-muted/40">
                    <th className="px-4 py-2 font-medium w-28">Fecha</th>
                    <th className="px-2 py-2 font-medium">Qué corrigió</th>
                    <th className="px-2 py-2 font-medium">Regla que deja</th>
                  </tr>
                </thead>
                <tbody>
                  {corrections.map((c) => (
                    <tr key={c.id} className="border-b last:border-b-0">
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{c.corrected_at}</td>
                      <td className="px-2 py-2.5 text-muted-foreground">{c.que_corrigio}</td>
                      <td className="px-2 py-2.5 font-medium">{c.regla}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <NuevaCorreccion
            onCreada={(row) => {
              setCorrections((xs) => [row, ...xs])
              flash('Corrección registrada')
            }}
            onError={flash}
          />
        </TabsContent>
      </Tabs>

      {/* ============ panel de edición de pieza ============ */}
      <Sheet open={!!selPiece} onOpenChange={(o) => !o && setSelPiece(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selPiece && (
            <PiecePanel
              piece={selPiece}
              formats={formats}
              onSave={(patch) => patchPiece(selPiece.id, patch).then(() => flash('Guardado'))}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ============ nueva pieza ============ */}
      <Sheet open={!!nueva} onOpenChange={(o) => !o && setNueva(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {nueva && (
            <NuevaPiezaPanel
              fechaInicial={nueva.fecha}
              formats={formats}
              slotLibre={slotLibre}
              onDone={(piece) => {
                setPieces((ps) => (ps ? [...ps, piece] : [piece]))
                setNueva(null)
                flash(`Creada para el ${labelDia(piece.publish_date)}`)
              }}
              onError={flash}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ============ programar idea ============ */}
      <Sheet open={!!programar} onOpenChange={(o) => !o && setProgramar(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {programar && (
            <ProgramarPanel
              idea={programar}
              slotLibre={slotLibre}
              onDone={(piece, idea) => {
                setPieces((ps) => (ps ? [...ps, piece] : [piece]))
                setIdeas((xs) => xs.map((i) => (i.id === idea.id ? idea : i)))
                setProgramar(null)
                flash(`Programada para el ${labelDia(piece.publish_date)}`)
              }}
              onError={flash}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ---------- panel de pieza ----------
function PiecePanel({ piece, formats, onSave }: { piece: Piece; formats: Fmt[]; onSave: (patch: Partial<Piece>) => void }) {
  const [f, setF] = useState(() => aForm(piece))
  useEffect(() => setF(aForm(piece)), [piece])

  function aForm(p: Piece) {
    return {
      titular: p.titular,
      enfoque: p.enfoque ?? '',
      guion: p.guion ?? '',
      copy: p.copy ?? '',
      notas: p.notas ?? '',
      recurso: p.recurso ?? '',
      publish_date: p.publish_date,
      formato_id: p.formato_id ?? '',
      plataformas: p.plataformas ?? [],
      views: p.resultados?.views ?? '',
      likes: p.resultados?.likes ?? '',
      comments: p.resultados?.comments ?? '',
      saves: p.resultados?.saves ?? '',
    }
  }
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }))
  const num = (v: unknown) => (v === '' || v === null || isNaN(Number(v)) ? undefined : Number(v))
  const fmtSel = formats.find((x) => x.id === f.formato_id)

  return (
    <div className="space-y-4 px-5 pb-8 pt-2">
      <SheetHeader className="px-0 pb-2 border-b">
        <SheetTitle className="flex items-center gap-2 text-base">
          <CatPill cat={piece.categoria} sub={piece.subcategoria} />
          <span className="font-mono text-xs text-muted-foreground">
            {labelDia(piece.publish_date)} · slot {piece.slot}
          </span>
        </SheetTitle>
      </SheetHeader>

      <Campo label="Titular">
        <Textarea rows={2} value={f.titular} onChange={(e) => set('titular', e.target.value)} />
      </Campo>
      <Campo label="Enfoque">
        <Textarea rows={3} value={f.enfoque} onChange={(e) => set('enfoque', e.target.value)} />
      </Campo>

      <Campo label="Formato de grabación (cómo se filma)">
        <select
          aria-label="Formato de grabación"
          className="w-full h-9 rounded-md border px-2 text-sm bg-transparent"
          value={f.formato_id}
          onChange={(e) => set('formato_id', e.target.value)}
        >
          <option value="">— elegir formato —</option>
          {formats.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
        {fmtSel && (
          <div className="mt-2 rounded-md border bg-muted/40 p-3">
            {fmtSel.descripcion && <p className="text-xs text-muted-foreground">{fmtSel.descripcion}</p>}
            {Array.isArray(fmtSel.referencias) && fmtSel.referencias.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {fmtSel.referencias.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border bg-background px-2 py-1 text-[11px] font-medium hover:border-gray-400"
                    title={r.nota}
                  >
                    ▶ {r.nota ? r.nota.slice(0, 34) : `referencia ${i + 1}`}
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1.5 italic">
                Este formato todavía no tiene referencias — se agregan en la pestaña Formatos.
              </p>
            )}
          </div>
        )}
      </Campo>

      <Campo label="Guion (se escribe después de la aprobación del titular)">
        <Textarea rows={8} value={f.guion} onChange={(e) => set('guion', e.target.value)} placeholder="Pendiente…" />
      </Campo>
      <Campo label="Copy / descripción del posteo">
        <Textarea rows={3} value={f.copy} onChange={(e) => set('copy', e.target.value)} placeholder="Pendiente…" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Fecha de publicación">
          <Input type="date" value={f.publish_date} onChange={(e) => set('publish_date', e.target.value)} />
        </Campo>
        <Campo label="Recurso para grabar">
          <Input value={f.recurso} onChange={(e) => set('recurso', e.target.value)} />
        </Campo>
      </div>
      <Campo label="Plataformas">
        <div className="flex gap-3">
          {PLATAFORMAS.map((pl) => (
            <label key={pl} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={f.plataformas.includes(pl)}
                onChange={(e) =>
                  set('plataformas', e.target.checked ? [...f.plataformas, pl] : f.plataformas.filter((x) => x !== pl))
                }
              />
              {pl}
            </label>
          ))}
        </div>
      </Campo>
      <Campo label="Resultados (a los 7 días de publicado)">
        <div className="grid grid-cols-4 gap-2">
          {(['views', 'likes', 'comments', 'saves'] as const).map((k) => (
            <div key={k}>
              <p className="text-[10px] uppercase text-muted-foreground mb-1">{k}</p>
              <Input type="number" value={f[k] as number | ''} onChange={(e) => set(k, e.target.value)} />
            </div>
          ))}
        </div>
      </Campo>
      <Campo label="Notas / observaciones">
        <Textarea rows={2} value={f.notas} onChange={(e) => set('notas', e.target.value)} />
      </Campo>

      <div className="flex justify-end gap-2">
        <Button
          onClick={() =>
            onSave({
              titular: f.titular,
              enfoque: f.enfoque || null,
              guion: f.guion || null,
              copy: f.copy || null,
              notas: f.notas || null,
              recurso: f.recurso || null,
              publish_date: f.publish_date,
              formato_id: f.formato_id || null,
              plataformas: f.plataformas,
              resultados: {
                ...(num(f.views) !== undefined ? { views: num(f.views)! } : {}),
                ...(num(f.likes) !== undefined ? { likes: num(f.likes)! } : {}),
                ...(num(f.comments) !== undefined ? { comments: num(f.comments)! } : {}),
                ...(num(f.saves) !== undefined ? { saves: num(f.saves)! } : {}),
              },
            })
          }
        >
          Guardar
        </Button>
      </div>
    </div>
  )
}

// ---------- nueva pieza ----------
function NuevaPiezaPanel({
  fechaInicial,
  formats,
  slotLibre,
  onDone,
  onError,
}: {
  fechaInicial?: string
  formats: Fmt[]
  slotLibre: (fecha: string) => string
  onDone: (piece: Piece) => void
  onError: (msg: string) => void
}) {
  const [fecha, setFecha] = useState(fechaInicial ?? '')
  const [cat, setCat] = useState('secretos')
  const [titular, setTitular] = useState('')
  const [formatoId, setFormatoId] = useState('')
  const [enviando, setEnviando] = useState(false)

  return (
    <div className="space-y-4 px-5 pb-8 pt-2">
      <SheetHeader className="px-0 pb-2 border-b">
        <SheetTitle className="text-base">Nueva pieza</SheetTitle>
      </SheetHeader>
      <Campo label="Fecha de publicación">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        {fecha && <p className="text-[11px] text-muted-foreground mt-1">Slot asignado: «{slotLibre(fecha)}» (orden del día, automático)</p>}
      </Campo>
      <Campo label="Categoría">
        <select
          aria-label="Categoría"
          className="w-full h-9 rounded-md border px-2 text-sm bg-transparent"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          {Object.entries(CATEGORIAS).map(([k, c]) => (
            <option key={k} value={k}>
              {c.label}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Titular">
        <Textarea rows={2} value={titular} onChange={(e) => setTitular(e.target.value)} />
      </Campo>
      <Campo label="Formato de grabación (opcional)">
        <select
          aria-label="Formato de grabación"
          className="w-full h-9 rounded-md border px-2 text-sm bg-transparent"
          value={formatoId}
          onChange={(e) => setFormatoId(e.target.value)}
        >
          <option value="">— elegir después —</option>
          {formats.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Button
        disabled={!fecha || !titular.trim() || enviando}
        onClick={async () => {
          setEnviando(true)
          try {
            const { row } = await api('POST', '/api/contenido/pieces', {
              publish_date: fecha,
              slot: slotLibre(fecha),
              categoria: cat,
              titular: titular.trim(),
              formato_id: formatoId || null,
            })
            onDone(row)
          } catch (e) {
            onError(`No se pudo crear: ${(e as Error).message}`)
          } finally {
            setEnviando(false)
          }
        }}
      >
        {enviando ? 'Creando…' : 'Crear pieza'}
      </Button>
    </div>
  )
}

// ---------- programar una idea ----------
function ProgramarPanel({
  idea,
  slotLibre,
  onDone,
  onError,
}: {
  idea: Idea
  slotLibre: (fecha: string) => string
  onDone: (piece: Piece, idea: Idea) => void
  onError: (msg: string) => void
}) {
  const [fecha, setFecha] = useState('')
  const [enviando, setEnviando] = useState(false)

  return (
    <div className="space-y-4 px-5 pb-8 pt-2">
      <SheetHeader className="px-0 pb-2 border-b">
        <SheetTitle className="text-base">Programar en el calendario</SheetTitle>
      </SheetHeader>
      <div className="rounded-md border p-3">
        <CatPill cat={idea.categoria} sub={idea.subcategoria} />
        <p className="text-sm mt-2">{idea.titular}</p>
      </div>
      <Campo label="Fecha de publicación">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        {fecha && <p className="text-[11px] text-muted-foreground mt-1">Slot asignado: «{slotLibre(fecha)}» (orden del día, automático)</p>}
      </Campo>
      <Button
        disabled={!fecha || enviando}
        onClick={async () => {
          setEnviando(true)
          try {
            const { row: piece } = await api('POST', '/api/contenido/pieces', {
              publish_date: fecha,
              slot: slotLibre(fecha),
              categoria: idea.categoria,
              subcategoria: idea.subcategoria,
              titular: idea.titular,
              enfoque: idea.enfoque,
              formato: idea.formato,
              recurso: idea.recurso,
              refrescar: idea.refrescar,
              origen: idea.origen,
            })
            const { row: ideaUpd } = await api('PATCH', `/api/contenido/ideas/${idea.id}`, {
              estado: 'usada',
              piece_id: piece.id,
            })
            onDone(piece, ideaUpd)
          } catch (e) {
            onError(`No se pudo programar: ${(e as Error).message}`)
          } finally {
            setEnviando(false)
          }
        }}
      >
        {enviando ? 'Programando…' : 'Programar'}
      </Button>
    </div>
  )
}

// ---------- formatos ----------
function FormatoCard({ f, onPatch, onError }: { f: Fmt; onPatch: (row: Fmt) => void; onError: (m: string) => void }) {
  const [url, setUrl] = useState('')
  const [nota, setNota] = useState('')
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="rounded-lg border p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm">{f.nombre}</h3>
        {f.diego_ya_lo_hizo && (
          <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 whitespace-nowrap">
            Diego ya lo hizo
          </span>
        )}
      </div>
      {f.descripcion && <p className="text-xs text-muted-foreground mt-1.5">{f.descripcion}</p>}
      {f.cuando_usar && (
        <p className="text-xs mt-1.5">
          <span className="font-medium">Cuándo:</span> <span className="text-muted-foreground">{f.cuando_usar}</span>
        </p>
      )}
      {Array.isArray(f.referencias) && f.referencias.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {f.referencias.map((r, i) => (
            <a
              key={i}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border px-2 py-0.5 text-[10px] font-medium hover:border-gray-400"
              title={r.nota}
            >
              ▶ {r.nota ? r.nota.slice(0, 28) : `referencia ${i + 1}`}
            </a>
          ))}
        </div>
      )}
      <div className="mt-auto pt-3">
        {!abierto ? (
          <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setAbierto(true)}>
            + agregar referencia
          </button>
        ) : (
          <div className="space-y-1.5">
            <Input placeholder="Enlace (Instagram / TikTok / YouTube)" value={url} onChange={(e) => setUrl(e.target.value)} className="h-8 text-xs" />
            <Input placeholder="Nota corta: qué mirar de este video" value={nota} onChange={(e) => setNota(e.target.value)} className="h-8 text-xs" />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={!url.trim().startsWith('http')}
                onClick={async () => {
                  try {
                    const refs = [...(f.referencias ?? []), { url: url.trim(), nota: nota.trim() }]
                    const { row } = await api('PATCH', `/api/contenido/formats/${f.id}`, { referencias: refs })
                    setUrl('')
                    setNota('')
                    setAbierto(false)
                    onPatch(row)
                  } catch (e) {
                    onError((e as Error).message)
                  }
                }}
              >
                Guardar
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAbierto(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NuevoFormato({ onCreado, onError }: { onCreado: (row: Fmt) => void; onError: (m: string) => void }) {
  const [nombre, setNombre] = useState('')
  const [desc, setDesc] = useState('')
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Input placeholder="Formato nuevo (ej: pantalla verde sobre nota)" value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-72" />
      <Input placeholder="Descripción corta" value={desc} onChange={(e) => setDesc(e.target.value)} className="flex-1 min-w-64" />
      <Button
        variant="outline"
        disabled={!nombre.trim()}
        onClick={async () => {
          try {
            const { row } = await api('POST', '/api/contenido/formats', { nombre: nombre.trim(), descripcion: desc.trim() || null })
            setNombre('')
            setDesc('')
            onCreado(row)
          } catch (e) {
            onError((e as Error).message)
          }
        }}
      >
        Agregar formato
      </Button>
    </div>
  )
}

// ---------- altas rápidas ----------
function NuevaIdea({ onCreada, onError }: { onCreada: (row: Idea) => void; onError: (m: string) => void }) {
  const [titular, setTitular] = useState('')
  const [cat, setCat] = useState('secretos')
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <select
        aria-label="Categoría de la idea nueva"
        className="h-9 rounded-md border px-2 text-sm bg-transparent"
        value={cat}
        onChange={(e) => setCat(e.target.value)}
      >
        {Object.entries(CATEGORIAS).map(([k, c]) => (
          <option key={k} value={k}>
            {c.label}
          </option>
        ))}
      </select>
      <Input
        placeholder="Idea nueva de Diego o tuya — se anota acá y nada se pierde"
        value={titular}
        onChange={(e) => setTitular(e.target.value)}
        className="flex-1 min-w-64"
      />
      <Button
        variant="outline"
        disabled={!titular.trim()}
        onClick={async () => {
          try {
            const { row } = await api('POST', '/api/contenido/ideas', { categoria: cat, titular: titular.trim(), origen: 'nuevo' })
            setTitular('')
            onCreada(row)
          } catch (e) {
            onError((e as Error).message)
          }
        }}
      >
        Agregar al banco
      </Button>
    </div>
  )
}

function NuevaCorreccion({ onCreada, onError }: { onCreada: (row: Corr) => void; onError: (m: string) => void }) {
  const [que, setQue] = useState('')
  const [regla, setRegla] = useState('')
  return (
    <div className="rounded-lg border p-4 max-w-2xl">
      <p className="text-sm font-medium mb-2">Registrar corrección de Diego</p>
      <div className="space-y-2">
        <Input placeholder="Qué corrigió (textual)" value={que} onChange={(e) => setQue(e.target.value)} />
        <Input placeholder="Regla que deja para los próximos guiones" value={regla} onChange={(e) => setRegla(e.target.value)} />
        <Button
          variant="outline"
          size="sm"
          disabled={!que.trim() || !regla.trim()}
          onClick={async () => {
            try {
              const { row } = await api('POST', '/api/contenido/corrections', { que_corrigio: que.trim(), regla: regla.trim() })
              setQue('')
              setRegla('')
              onCreada(row)
            } catch (e) {
              onError((e as Error).message)
            }
          }}
        >
          Guardar corrección
        </Button>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
      {children}
    </div>
  )
}
