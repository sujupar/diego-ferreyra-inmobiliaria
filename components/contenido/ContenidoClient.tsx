'use client'

/**
 * Central de Contenido — tablero estilo monday.
 * Cuatro vistas: Calendario (piezas agrupadas por semana), Banco de ideas,
 * Formatos y Correcciones. Todo se edita acá y persiste en Supabase.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CATEGORIAS, ESTADOS, ORDEN_ESTADOS, PLATAFORMAS } from '@/lib/contenido/constants'
import { labelDia, labelSemana, mondayOf } from '@/lib/contenido/fechas'

// ---------- tipos ----------
interface Piece {
  id: string
  publish_date: string
  slot: 'a' | 'b'
  categoria: string
  subcategoria: string | null
  titular: string
  enfoque: string | null
  formato: string | null
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

// ---------- helpers ----------
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

  const [selPiece, setSelPiece] = useState<Piece | null>(null)
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

  // ---------- agrupar por semana ----------
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
        <TabsContent value="calendario" className="mt-4 space-y-6">
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
                {/* barrita resumen de estados, estilo monday */}
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
                            <td className="px-2 py-2.5 text-xs text-muted-foreground">{p.formato ?? '—'}</td>
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
          <p className="text-xs text-muted-foreground">
            Las piezas nuevas se programan desde el <strong>Banco de ideas</strong> (botón «Programar») para que el calendario nunca se
            llene a mano.
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {formats.map((f) => (
              <div key={f.id} className="rounded-lg border p-4">
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
                        className="rounded border px-2 py-0.5 text-[10px] font-mono uppercase hover:border-gray-400"
                        title={r.nota}
                      >
                        ref {i + 1} ↗
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
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
              onSave={(patch) => patchPiece(selPiece.id, patch).then(() => flash('Guardado'))}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ============ dialog programar idea ============ */}
      <Sheet open={!!programar} onOpenChange={(o) => !o && setProgramar(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {programar && (
            <ProgramarPanel
              idea={programar}
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
function PiecePanel({ piece, onSave }: { piece: Piece; onSave: (patch: Partial<Piece>) => void }) {
  const [f, setF] = useState({
    titular: piece.titular,
    enfoque: piece.enfoque ?? '',
    guion: piece.guion ?? '',
    copy: piece.copy ?? '',
    notas: piece.notas ?? '',
    recurso: piece.recurso ?? '',
    publish_date: piece.publish_date,
    plataformas: piece.plataformas ?? [],
    views: piece.resultados?.views ?? '',
    likes: piece.resultados?.likes ?? '',
    comments: piece.resultados?.comments ?? '',
    saves: piece.resultados?.saves ?? '',
  })
  useEffect(() => {
    setF({
      titular: piece.titular,
      enfoque: piece.enfoque ?? '',
      guion: piece.guion ?? '',
      copy: piece.copy ?? '',
      notas: piece.notas ?? '',
      recurso: piece.recurso ?? '',
      publish_date: piece.publish_date,
      plataformas: piece.plataformas ?? [],
      views: piece.resultados?.views ?? '',
      likes: piece.resultados?.likes ?? '',
      comments: piece.resultados?.comments ?? '',
      saves: piece.resultados?.saves ?? '',
    })
  }, [piece])

  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }))
  const num = (v: unknown) => (v === '' || v === null || isNaN(Number(v)) ? undefined : Number(v))

  return (
    <div className="space-y-4">
      <SheetHeader className="px-0">
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

      <div className="flex justify-end gap-2 pb-6">
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

// ---------- programar una idea ----------
function ProgramarPanel({
  idea,
  onDone,
  onError,
}: {
  idea: Idea
  onDone: (piece: Piece, idea: Idea) => void
  onError: (msg: string) => void
}) {
  const [fecha, setFecha] = useState('')
  const [slot, setSlot] = useState<'a' | 'b'>('a')
  const [enviando, setEnviando] = useState(false)

  return (
    <div className="space-y-4">
      <SheetHeader className="px-0">
        <SheetTitle className="text-base">Programar en el calendario</SheetTitle>
      </SheetHeader>
      <div className="rounded-md border p-3">
        <CatPill cat={idea.categoria} sub={idea.subcategoria} />
        <p className="text-sm mt-2">{idea.titular}</p>
      </div>
      <Campo label="Fecha de publicación">
        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <Campo label="Slot del día">
        <div className="flex gap-3">
          {(['a', 'b'] as const).map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name="slot" checked={slot === s} onChange={() => setSlot(s)} />
              {s === 'a' ? 'Primero del día' : 'Segundo del día'}
            </label>
          ))}
        </div>
      </Campo>
      <Button
        disabled={!fecha || enviando}
        onClick={async () => {
          setEnviando(true)
          try {
            const { row: piece } = await api('POST', '/api/contenido/pieces', {
              publish_date: fecha,
              slot,
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
