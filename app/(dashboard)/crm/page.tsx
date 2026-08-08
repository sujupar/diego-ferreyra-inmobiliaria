'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/StatTile'
import { FilterBar } from '@/components/filters/FilterBar'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { DataTable, Column } from '@/components/ui/DataTable'
import { BulkActionsBar } from '@/components/ui/BulkActionsBar'
import {
  Loader2, RefreshCw, User,
  LayoutList, Table2, Clock,
  CheckSquare, Square, Trash2, Users
} from 'lucide-react'
import { CRM_STAGES, deriveCRMStage, getCRMStageInfo, mapStageToCRM } from './_components/crm-stages'
import { ORIGIN_LABELS } from './_components/constants'
import { timeAgo } from './_components/format'
import { StagePipeline } from './_components/StagePipeline'
import { DealsList } from './_components/DealsList'
import type { Deal } from './_components/types'

const PAGE_SIZE = 50

// Filtros de esta pantalla en la URL (lib/filters/use-filtros-url). Constantes
// de MÓDULO — si van adentro del componente cambian de identidad en cada
// render y el listado se re-pide sin parar.
const OPCIONES_ETAPA = [
  { value: '', label: 'Todas' },
  ...CRM_STAGES.map(s => ({ value: s.key, label: s.label })),
]
const OPCIONES_ORIGEN = [
  { value: '', label: 'Todos' },
  ...Object.entries(ORIGIN_LABELS).map(([key, label]) => ({ value: key, label })),
]

const FILTROS_DEFECTO = { etapa: '', origin: '', asesor: '', from: '', to: '' }

// `asesor` NO entra acá: los ids de asesores son UUIDs dinámicos (vienen de
// `/api/users/advisors`, cargados DESPUÉS del montaje) — no hay forma de
// tener esa lista lista al definir esta constante de módulo, y construirla
// desde `advisors` (estado) violaría la regla de identidad estable. En su
// lugar, `normalizarFiltros` valida el FORMATO (UUID) — no la pertenencia —
// y cae a '' si no matchea. La seguridad real no depende de esto: es el
// if/else de `buildParams` (ver más abajo) el que impide que un asesor vea
// deals ajenos, no la validación de la URL.
const PERMITIDOS = { etapa: OPCIONES_ETAPA.map(o => o.value), origin: OPCIONES_ORIGEN.map(o => o.value) }

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizarFiltros(f: typeof FILTROS_DEFECTO): typeof FILTROS_DEFECTO {
  return {
    ...f,
    from: FECHA_RE.test(f.from) ? f.from : '',
    to: FECHA_RE.test(f.to) ? f.to : '',
    asesor: UUID_RE.test(f.asesor) ? f.asesor : '',
  }
}

const ETIQUETAS_FILTRO: Record<string, string> = {
  etapa: 'Etapa',
  origin: 'Origen',
  asesor: 'Asesor',
  from: 'Desde',
  to: 'Hasta',
}

function mensajeRechazo(claves: string[]): string {
  const nombres = claves.map(c => ETIQUETAS_FILTRO[c] ?? c)
  const lista = nombres.length > 1
    ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
    : nombres[0]
  const soloFechas = claves.every(c => c === 'from' || c === 'to')
  return soloFechas
    ? `No se aplicó ${lista}: revisá la fecha (el año va con 4 dígitos, por ejemplo 2026-08-01).`
    : `No se aplicó ${lista}: ese valor no es válido.`
}

// ── Component ────────────────────────────────────────────────────
export default function CRMPage() {
  // useSearchParams obliga a un límite de Suspense en App Router.
  return (
    <Suspense fallback={<CRMSkeleton />}>
      <CRMClient />
    </Suspense>
  )
}

function CRMSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="eyebrow">Dashboard · Procesos</p>
        <h1 className="display text-4xl">CRM</h1>
        <p className="text-muted-foreground text-sm">Cargando…</p>
      </div>
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  )
}

function CRMClient() {
  const router = useRouter()

  // Toda la máquina de filtros en la URL vive en `lib/filters/use-filtros-url`
  // (probada aparte). `mostrado` alimenta los controles (espejo optimista);
  // `filtros` es lo que hay REALMENTE en la URL y lo único que se le pide al
  // servidor.
  const {
    filtros: mostrado,
    aplicados: filtros,
    aplicar,
    limpiar,
    escribiendo,
  } = useFiltrosUrl({
    defectos: FILTROS_DEFECTO,
    permitidos: PERMITIDOS,
    normalizar: normalizarFiltros,
  })

  const [avisoFiltro, setAvisoFiltro] = useState<string | null>(null)

  function aplicarFiltros(patch: Partial<typeof FILTROS_DEFECTO>) {
    const r = aplicar(patch)
    setAvisoFiltro(r.rechazadas.length > 0 ? mensajeRechazo(r.rechazadas) : null)
  }

  function setFiltro(key: string, value: string) {
    aplicarFiltros({ [key]: value } as Partial<typeof FILTROS_DEFECTO>)
  }

  function limpiarTodo() {
    limpiar()
    setAvisoFiltro(null)
  }

  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards')
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
  // N1 (pulido pre-entrega): `userInfo === null` es AMBIGUO — puede ser "la
  // respuesta de /api/auth/me todavía no llegó" (el estado normal de cada
  // carga, unos cientos de ms) o "llegó y falló". Sin esta bandera, la
  // tarjeta le decía "sin identidad confirmada" al dueño en CADA visita
  // normal a /crm, como si la sesión se hubiera roto. Mismo patrón que
  // Inicio (`errorIdentidad`) y Propiedades (`loadError==='identidad'`).
  const [identidadError, setIdentidadError] = useState(false)
  const [advisors, setAdvisors] = useState<Array<{ id: string; full_name: string }>>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [serverStageCounts, setServerStageCounts] = useState<Record<string, number>>({})
  const [serverCrmStageCounts, setServerCrmStageCounts] = useState<Record<string, number>>({})
  // Task 16: sin esto, un /api/deals caído dejaría `total`/`stageCounts` en su
  // valor previo (o en 0 inicial) y las tarjetas nuevas mostrarían un número
  // como si fuera actual — exactamente la mentira que la regla del tablero
  // prohíbe. Solo lo toca el pedido PRINCIPAL (no "Cargar más": ese tiene su
  // propio fallback silencioso y no debe invalidar los totales ya mostrados).
  const [fetchError, setFetchError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActioning, setBulkActioning] = useState(false)
  const [showColegas, setShowColegas] = useState(false)

  // Gana el último PEDIDO, no la última respuesta — ver
  // `lib/filters/use-pedidos-versionados`. Medido en Propiedades sin esto:
  // elegir un filtro y enseguida otro terminaba mostrando el listado viejo
  // bajo el rótulo del filtro nuevo, para siempre.
  const pedidos = usePedidosVersionados()

  // Declarado temprano: lo usan efectos de más abajo (limpieza de `?asesor=`
  // huérfano) además del render. `userInfo` empieza en `null`, así que esto
  // es `false` hasta que se resuelve — ver M4/M3 más abajo.
  const esAsesor = userInfo?.role === 'asesor'

  // A4 (revisión final Fase 2) — mismo blindaje que Propiedades. `/api/auth/me`
  // devuelve JSON TAMBIÉN en 401/404/500 (`{error:'...'}`): sin chequear `r.ok`,
  // `userInfo` quedaba TRUTHY con `role` undefined, y acá eso cae justo en el
  // `else` de `buildParams` — el if/else que es lo único que impide que un
  // asesor vea deals ajenos. Sin identidad no se pide nada (fail-closed).
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => {
        if (!r.ok) throw new Error(`GET /api/auth/me respondió ${r.status}`)
        return r.json()
      })
      .then((perfil: { id?: unknown; role?: unknown } | null) => {
        // Un 200 sin `id` tampoco es una identidad.
        if (!perfil || typeof perfil.id !== 'string' || !perfil.id) {
          throw new Error('GET /api/auth/me no devolvió un id')
        }
        setUserInfo({ id: perfil.id, role: typeof perfil.role === 'string' ? perfil.role : '' })
      })
      .catch(err => { console.error(err); setIdentidadError(true) })
    fetch('/api/users/advisors').then(r => r.ok ? r.json() : { data: [] }).then(j => setAdvisors(j.data || [])).catch(() => {})
  }, [])

  // Abogados don't belong in CRM — they work from /properties/review
  useEffect(() => {
    if (userInfo?.role === 'abogado') {
      router.replace('/properties/review')
    }
  }, [userInfo, router])

  // M3: un asesor no puede fijar `?asesor=` (el if/else de `buildParams` ya
  // lo ignora), pero si un deep link o el historial lo dejan puesto en la URL
  // queda huérfano: el desplegable "Asesor" no se renderiza para este rol, así
  // que `FilterBar` nunca arma su ficha, y si no hay otro filtro tampoco
  // aparece "Limpiar todo" para sacarlo a mano. Se limpia solo apenas se
  // conoce el rol — `aplicar` es idempotente (no-op si ya está en default),
  // así que esto no reentra en loop.
  useEffect(() => {
    if (esAsesor && filtros.asesor) {
      aplicarFiltros({ asesor: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAsesor, filtros.asesor])

  function buildParams(targetPage: number) {
    const params = new URLSearchParams()
    if (filtros.etapa) params.set('crm_stage', filtros.etapa)
    if (filtros.origin) params.set('origin', filtros.origin)
    if (filtros.from) params.set('from', filtros.from)
    if (filtros.to) params.set('to', filtros.to)
    // Cuidado: este if/else NO se toca. Si el rol es asesor, se fuerza su
    // propio id e IGNORA `filtros.asesor` — es lo único que impide que un
    // asesor vea deals ajenos manipulando la URL a mano.
    if (userInfo?.role === 'asesor') {
      params.set('assigned_to', userInfo.id)
    } else if (filtros.asesor) {
      params.set('assigned_to', filtros.asesor)
    }
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(targetPage * PAGE_SIZE))
    return params
  }

  async function runFetch(pedido: { gen: number; signal: AbortSignal }, opts: { append: boolean; page: number }) {
    if (opts.append) setLoadingMore(true)
    else { setLoading(true); setFetchError(false) }
    try {
      const res = await fetch(`/api/deals?${buildParams(opts.page)}`, { signal: pedido.signal })
      if (!res.ok) throw new Error(`GET /api/deals respondió ${res.status}`)
      const { data, total: t, stageCounts: sc, crmStageCounts: csc } = await res.json()
      // Una respuesta que ya no pertenece al pedido vigente no puede pintar nada.
      if (!pedidos.vigente(pedido.gen)) return
      if (opts.append) setDeals(prev => [...prev, ...(data || [])])
      else setDeals(data || [])
      setTotal(t ?? 0)
      setServerStageCounts(sc || {})
      setServerCrmStageCounts(csc || {})
      setPage(opts.page)
    } catch (err) {
      if (!pedidos.vigente(pedido.gen)) return
      console.error('CRM fetch error:', err)
      if (!opts.append) setFetchError(true)
    } finally {
      // "Cargar más" es la bandera de un BOTÓN: no va versionada, dejarla
      // puesta bloquearía el botón para el listado nuevo.
      if (opts.append) setLoadingMore(false)
      // El spinner del listado sí va versionado: si lo apagara una respuesta
      // vieja, la pantalla mostraría el listado anterior como si fuera el
      // resultado del filtro nuevo.
      else pedidos.siVigente(pedido.gen, () => setLoading(false))
    }
  }

  useEffect(() => {
    // PRIMERA LÍNEA, antes de cualquier `return` temprano.
    const pedido = pedidos.abrir()
    if (!userInfo) return
    runFetch(pedido, { append: false, page: 0 })
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, userInfo])

  async function loadMore() {
    if (loadingMore || deals.length >= total) return
    // Se engancha al listado VIGENTE, no abre uno nuevo.
    const pedido = pedidos.actual()
    await runFetch(pedido, { append: true, page: page + 1 })
  }

  async function refrescar() {
    const pedido = pedidos.actual()
    await runFetch(pedido, { append: false, page: 0 })
  }

  const canHardDelete = userInfo?.role === 'admin' || userInfo?.role === 'dueno'

  function toggleSelectMode() {
    setSelectMode(prev => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }

  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const confirmation = prompt(
      `Vas a ELIMINAR DEFINITIVAMENTE ${ids.length} proceso${ids.length !== 1 ? 's' : ''} comercial${ids.length !== 1 ? 'es' : ''}.\n\n` +
      `Esta acción no se puede deshacer. Las tasaciones, propiedades y contactos asociados quedan intactos — solo desaparece el proceso del CRM.\n\n` +
      `Para confirmar, escribí ELIMINAR:`
    )
    if (confirmation !== 'ELIMINAR') return
    setBulkActioning(true)
    const results = await Promise.allSettled(
      ids.map(id => fetch(`/api/deals/${id}`, { method: 'DELETE' }))
    )
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
    setBulkActioning(false)
    setSelectedIds(new Set())
    setSelectMode(false)
    await refrescar()
    if (failed > 0) alert(`${failed} no se pudieron eliminar. Probablemente requieren permisos de admin/dueño.`)
  }

  const dealsWithCRM = deals.map(d => ({ ...d, crmStage: deriveCRMStage(d) }))

  // Asesor role: hide stages pre-asignación (clase_gratuita, solicitud).
  // Esos los maneja exclusivamente el coordinador antes de asignar asesor.
  const PRE_ASSIGNMENT_STAGES = ['clase_gratuita', 'solicitud']
  const roleFilteredDeals = esAsesor
    ? dealsWithCRM.filter(d => !PRE_ASSIGNMENT_STAGES.includes(d.crmStage))
    : dealsWithCRM

  // Por defecto ocultamos deals tag='colega' (vienen importados de GHL).
  // Se ven con el toggle "Mostrar colegas".
  const colegaFilteredDeals = showColegas
    ? roleFilteredDeals
    : roleFilteredDeals.filter(d => !(d.tags || []).includes('colega'))

  // El filtro de etapa server-side no distingue solicitud/coordinada (mismo
  // stage crudo 'scheduled') — este re-filtro en memoria usa `filtros`
  // (lo aplicado, lo que realmente se pidió), no el espejo.
  const filteredDeals = filtros.etapa
    ? colegaFilteredDeals.filter(d => d.crmStage === filtros.etapa)
    : colegaFilteredDeals

  const colegaCount = roleFilteredDeals.filter(d => (d.tags || []).includes('colega')).length

  // Server-provided CRM-stage counts (handles scheduled→solicitud/coordinada split).
  // Fallback al mapeo desde stageCounts crudo si el server viejo no manda crmStageCounts.
  const stageCounts: Record<string, number> = { ...serverCrmStageCounts }
  if (Object.keys(stageCounts).length === 0) {
    for (const [rawStage, n] of Object.entries(serverStageCounts)) {
      const k = mapStageToCRM(rawStage)
      stageCounts[k] = (stageCounts[k] || 0) + (n as number)
    }
  }
  // For asesor: zero out pre-asignación stages
  if (esAsesor) {
    for (const k of PRE_ASSIGNMENT_STAGES) stageCounts[k] = 0
  }

  // For asesor we approximate by using the loaded-slice filtered count (since we
  // can't distinguish solicitud vs coordinada server-side).
  const totalDealsDisplay = esAsesor ? roleFilteredDeals.length : total
  const isGlobal = userInfo && ['dueno', 'admin', 'coordinador'].includes(userInfo.role)

  // Task 16 — el contexto de la tarjeta tiene que decir la verdad sobre SU
  // PROPIA base, no una genérica. `total` respeta TODOS los filtros server-side.
  const hayFiltros = !!filtros.etapa || !!filtros.origin || !!filtros.asesor || !!filtros.from || !!filtros.to
  // Ronda 1 de la revisión — I1: para un asesor `totalDealsDisplay` NO es el
  // total del servidor, es `roleFilteredDeals.length` (línea de arriba): lo
  // que hay CARGADO en memoria, una página (50) hacia abajo. Decir "en el
  // sistema" ahí es la mentira exacta que la regla del tablero prohíbe — un
  // asesor con 70 deals y una sola página cargada vería "45 · en el sistema"
  // en vez de "45 · de los cargados en pantalla". Los demás roles usan
  // `total`, el conteo real, así que sí les corresponde "en el sistema" /
  // "con los filtros puestos".
  // Subido desde el render (antes vivía junto a `activeStageInfo`): la tarjeta
  // de arriba lo necesita para no afirmar un número que todavía no vale.
  const cargando = loading || escribiendo
  // Revisión final Fase 3 — C1. Dos agujeros que la tarjeta tapaba con un cero:
  //   · SIN IDENTIDAD (`/api/auth/me` caído): el efecto de datos hace `return`
  //     antes de pedir (fail-closed, correcto) y `loading` se queda en `true`
  //     PARA SIEMPRE — no hay respuesta que lo apague. Un "0 · en el sistema"
  //     sin vencimiento. Va primero porque no es una carga que vaya a terminar.
  //   · MIENTRAS CARGA: `total` arranca en 0 y, al cambiar de filtro, conserva
  //     el valor de la base ANTERIOR. En los dos casos el número no vale todavía.
  const dealsTileValue = !userInfo || fetchError || cargando ? null : totalDealsDisplay
  // N1: mientras `/api/auth/me` está EN VUELO (el caso normal de cada carga)
  // esto tiene que leerse como una carga más, no como una falla. Recién si
  // el catch de arriba corrió de verdad decimos que no se pudo confirmar.
  const dealsTileContext = !userInfo
    ? (identidadError ? 'sin identidad confirmada' : 'todavía cargando')
    : fetchError
      ? 'No se pudo consultar'
      : cargando
        ? 'todavía cargando'
        : esAsesor
          ? 'de los cargados en pantalla'
          : hayFiltros
            ? 'con los filtros puestos'
            : 'en el sistema'

  const OPCIONES_ASESOR = [
    { value: '', label: 'Todos' },
    ...advisors.map(a => ({ value: a.id, label: a.full_name })),
  ]

  // M4: `esAsesor` es `false` mientras `userInfo` no resolvió (arranca en
  // `null`), así que para un asesor de verdad el desplegable "Asesor"
  // aparecía y desaparecía en el primer instante (se renderizaba con el
  // `false` transitorio y se sacaba al llegar el rol real). Gateado con
  // `userInfo &&`: sin identidad resuelta, no se muestra — igual que ya pasa
  // con el resto de la pantalla mientras `userInfo` es `null`.
  const mostrarAsesor = !!userInfo && !esAsesor

  const columns: Column<(typeof dealsWithCRM)[0]>[] = [
    { key: 'contact_name', label: 'Contacto', sortable: true, render: r => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{r.contact_name.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <span className="font-medium text-sm">{r.contact_name}</span>
          {r.contact_phone && <span className="block text-xs text-muted-foreground">{r.contact_phone}</span>}
        </div>
      </div>
    )},
    { key: 'property_address', label: 'Propiedad', sortable: true, render: r => (
      <span className="text-muted-foreground text-sm truncate max-w-[220px] block">{r.property_address}</span>
    )},
    { key: 'crmStage', label: 'Etapa', sortable: true, render: r => {
      const s = getCRMStageInfo(r.crmStage)
      return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.badgeBg} ${s.badgeText}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dotColor}`} />
          {s.label}
        </span>
      )
    }},
    { key: 'origin', label: 'Origen', sortable: true, render: r => r.origin ? <Badge variant="secondary" className="text-xs font-normal">{ORIGIN_LABELS[r.origin] || r.origin}</Badge> : <span className="text-muted-foreground text-xs">—</span> },
    ...(isGlobal ? [{ key: 'assigned_to_name' as const, label: 'Asesor', sortable: true, render: (r: (typeof dealsWithCRM)[0]) => <span className="text-sm text-muted-foreground">{r.assigned_to_name || '—'}</span> }] : []),
    { key: 'stage_changed_at', label: 'Actualizado', sortable: true, render: r => (
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Clock className="h-3 w-3" />
        <span className="tabular-n">{timeAgo(r.stage_changed_at)}</span>
      </span>
    )},
  ]

  const activeStageInfo = mostrado.etapa ? getCRMStageInfo(mostrado.etapa) : null

  return (
    <div className="space-y-8">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="eyebrow">Dashboard · Procesos</p>
          <h1 className="display text-4xl">CRM</h1>
          <p className="text-muted-foreground text-sm">
            <span className="tabular-n">{totalDealsDisplay}</span> proceso{totalDealsDisplay !== 1 ? 's' : ''} comercial{totalDealsDisplay !== 1 ? 'es' : ''}
            <span className="ml-2 text-xs opacity-70">· estado actual del pipeline</span>
            {mostrado.etapa && (
              <span className={`ml-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${activeStageInfo?.badgeBg} ${activeStageInfo?.badgeText}`}>
                {activeStageInfo?.label}
                <button onClick={() => aplicarFiltros({ etapa: '' })} className="ml-0.5 hover:opacity-70">&times;</button>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            <button
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
            >
              <Table2 className="h-4 w-4" />
            </button>
          </div>
          {canHardDelete && (
            <Button
              variant={selectMode ? 'default' : 'outline'}
              size="sm"
              onClick={toggleSelectMode}
              className="gap-1.5"
            >
              {selectMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {selectMode ? 'Cancelar' : 'Seleccionar'}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={refrescar}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Task 16 — ronda 1: el desglose por etapa YA existe más abajo
          (`StagePipeline`, con el mismo `stageCounts` y encima clickeable
          para filtrar) — repetirlo acá arriba era mostrar la misma grilla
          dos veces. Solo queda el total, que es lo único que la pantalla NO
          tenía. Cero fetch/consulta nueva. En error (`fetchError`) el número
          se apaga a `null` en vez de mostrar el 0 que deja el catch. */}
      <div data-testid="tarjetas-numeros" className="max-w-xs">
        <StatTile
          label="Deals"
          value={dealsTileValue}
          context={dealsTileContext}
        />
      </div>

      {/* Bulk actions bar — visible cuando hay selección */}
      {selectMode && (
        <BulkActionsBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          noun="procesos"
          actions={[
            { label: 'Eliminar', icon: <Trash2 className="h-4 w-4 mr-1" />, variant: 'destructive', onClick: handleBulkDelete, disabled: bulkActioning },
          ]}
        />
      )}

      <StagePipeline
        hideSolicitud={!!esAsesor}
        stageCounts={stageCounts}
        activeKey={mostrado.etapa}
        onToggle={key => aplicarFiltros({ etapa: mostrado.etapa === key ? '' : key })}
      />

      {/* ── Filters Bar ─────────────────────────────────────── */}
      <div className="space-y-3">
        <FilterBar
          selects={[
            { key: 'etapa', label: 'Etapa', options: OPCIONES_ETAPA },
            { key: 'origin', label: 'Origen', options: OPCIONES_ORIGEN },
            ...(mostrarAsesor ? [{ key: 'asesor', label: 'Asesor', options: OPCIONES_ASESOR }] : []),
          ]}
          values={mostrado}
          onChange={setFiltro}
          onClear={limpiarTodo}
          extraActivo={!!mostrado.from || !!mostrado.to}
        >
          <DateRangeFilter
            value={{ from: mostrado.from, to: mostrado.to }}
            onChange={r => aplicarFiltros({ from: r.from, to: r.to })}
          />
        </FilterBar>

        {/* Región SIEMPRE montada — un contenedor que aparece junto con su
            contenido no lo anuncian muchos lectores de pantalla. */}
        <p
          role="status"
          aria-live="polite"
          className={avisoFiltro ? 'text-sm text-destructive' : 'sr-only'}
        >
          {avisoFiltro}
        </p>

        {colegaCount > 0 && (
          <div className="flex gap-1.5 items-center">
            <span className="text-xs font-medium text-muted-foreground mr-1">Colegas</span>
            <Button
              variant={showColegas ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs rounded-full gap-1.5"
              onClick={() => setShowColegas(prev => !prev)}
            >
              <Users className="h-3 w-3" />
              {showColegas ? `Ocultar (${colegaCount})` : `Mostrar (${colegaCount})`}
            </Button>
          </div>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      {cargando ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Cargando procesos...</p>
        </div>
      ) : filteredDeals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
            <User className="h-8 w-8 text-muted-foreground/40" />
          </div>
          <div className="text-center">
            <h3 className="font-semibold mb-1">Sin procesos</h3>
            <p className="text-sm text-muted-foreground max-w-xs">No hay procesos que coincidan con los filtros seleccionados.</p>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <DataTable
          data={filteredDeals}
          columns={columns}
          getRowKey={r => r.id}
          onRowClick={selectMode ? undefined : r => router.push(`/pipeline/${r.id}`)}
          selectable={selectMode}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      ) : (
        <DealsList
          deals={filteredDeals}
          selectMode={selectMode}
          selectedIds={selectedIds}
          onToggleSelection={toggleSelection}
          isGlobal={!!isGlobal}
        />
      )}

      {/* Cargar más — only when there are more records on the server */}
      {!cargando && deals.length < total && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={loadMore}
          >
            {loadingMore ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Cargando…</>
            ) : (
              <>Cargar más ({deals.length} / {total})</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
