'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { AppraisalSummary } from '@/lib/supabase/appraisals'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FilterBar } from '@/components/filters/FilterBar'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { BusquedaTexto } from '@/components/filters/BusquedaTexto'
import { RangoPrecio } from '@/components/filters/RangoPrecio'
import { normalizarBusqueda } from '@/lib/filters/busqueda-texto'
import { normalizarPrecioTexto } from '@/lib/filters/rango-precio'
import { useFiltrosUrl, mismosFiltros } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { DataTable, Column } from '@/components/ui/DataTable'
import { BulkActionsBar } from '@/components/ui/BulkActionsBar'
import {
    Trash2, ChevronLeft, ChevronRight, Plus, Loader2, FileText,
    MapPin, Calendar, Edit2, LayoutList, Table2
} from 'lucide-react'

function formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency', currency: currency === 'ARS' ? 'ARS' : 'USD',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value)
}

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Filtros de esta pantalla en la URL (lib/filters/use-filtros-url). Constante
// de MÓDULO, no literal dentro del componente — si va adentro cambia de
// identidad en cada render y el listado se re-pide sin parar (ver el hook).
// Único filtro real hoy: el rango de fechas (antes vivía en un `useState`
// suelto, `dateRange`; ahora en la URL, igual que en
// Propiedades/Contactos/CRM/Visitas), más el buscador (`q`) y el rango de
// precio (`min`/`max`). No hay claves de lista cerrada, así que no hace falta
// `permitidos`: los tres nuevos son texto libre y se validan en `normalizar`.
const FILTROS_DEFECTO = { from: '', to: '', q: '', min: '', max: '' }

// Claves propias, constante de módulo — la usa el reset de página de abajo
// para comparar `filtros` por VALOR (no por identidad: ver el comentario
// junto a `filtrosVistosRef`).
const CLAVES_FILTRO = Object.keys(FILTROS_DEFECTO) as (keyof typeof FILTROS_DEFECTO & string)[]

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizarFiltros(f: typeof FILTROS_DEFECTO): typeof FILTROS_DEFECTO {
    return {
        from: FECHA_RE.test(f.from) ? f.from : '',
        to: FECHA_RE.test(f.to) ? f.to : '',
        // Las tres son puras e idempotentes, como exige el contrato del hook.
        q: normalizarBusqueda(f.q),
        min: normalizarPrecioTexto(f.min),
        max: normalizarPrecioTexto(f.max),
    }
}

const ETIQUETAS_FILTRO: Record<string, string> = {
    from: 'Desde', to: 'Hasta', q: 'Búsqueda', min: 'Precio desde', max: 'Precio hasta',
}

function mensajeRechazo(claves: string[]): string {
    const nombres = claves.map(c => ETIQUETAS_FILTRO[c] ?? c)
    const lista = nombres.length > 1
        ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
        : nombres[0]
    if (claves.every(c => c === 'from' || c === 'to')) {
        return `No se aplicó ${lista}: revisá la fecha (el año va con 4 dígitos, por ejemplo 2026-08-01).`
    }
    if (claves.every(c => c === 'min' || c === 'max')) {
        return `No se aplicó ${lista}: escribí solo el número, por ejemplo 150000.`
    }
    return `No se aplicó ${lista}: ese valor no es válido.`
}

export default function AppraisalsHistoryPage() {
    // useSearchParams obliga a un límite de Suspense en App Router.
    return (
        <Suspense fallback={<AppraisalsSkeleton />}>
            <AppraisalsClient />
        </Suspense>
    )
}

function AppraisalsSkeleton() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Historial de Tasaciones</h1>
                <p className="text-sm text-muted-foreground">Cargando…</p>
            </div>
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        </div>
    )
}

function AppraisalsClient() {
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

    const [appraisals, setAppraisals] = useState<AppraisalSummary[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(true)
    // Sin esto, un pedido fallido dejaba en pantalla el listado ANTERIOR con el
    // término nuevo en la caja de búsqueda: la pantalla afirmaba que ESO era lo
    // que había encontrado. El buscador lo vuelve alcanzable (una consulta que
    // la base rechaza sale 500), así que dejar de mentir es parte del trabajo.
    // Mismo patrón que Propiedades, que ya lo tenía.
    const [loadError, setLoadError] = useState(false)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('table')
    const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkActioning, setBulkActioning] = useState(false)
    const pageSize = 12

    // Gana el último PEDIDO, no la última respuesta — ver
    // `lib/filters/use-pedidos-versionados`. Sin esto, con la API lenta,
    // cambiar el rango de fechas y enseguida cambiarlo de nuevo podía terminar
    // mostrando el resultado del rango viejo bajo el rótulo del nuevo, para
    // siempre.
    const pedidos = usePedidosVersionados()

    // Identidad para el filtrado por rol. A4 (revisión final Fase 2): mismo
    // blindaje que Propiedades. `/api/auth/me` devuelve JSON TAMBIÉN en
    // 401/404/500 (`{error:'...'}`), así que sin chequear `r.ok` quedaba un
    // `userInfo` TRUTHY con `role` undefined: el gate `if (!userInfo) return`
    // pasaba y el pedido salía SIN `assigned_to` → un asesor veía las tasaciones
    // de todos. Sin identidad no se pide nada (fail-closed).
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
            .catch(err => { console.error(err) })
    }, [])

    // `filtros` (de/a) vistos en la última corrida del efecto de datos — para
    // el reset de página de abajo. Un cambio de filtro con la página en >1
    // tiene que volver a la 1 (la página 3 de un rango de fechas nuevo capaz
    // no existe), pero sin pagar DOS fetches: uno con la página vieja +
    // filtro nuevo (que se tiraría), y otro ya en la página 1. Por eso el
    // reset corta ACÁ, ANTES de armar ningún pedido — el re-render que
    // dispara `setPage(1)` vuelve a correr este mismo efecto, ya sin cambio
    // detectado.
    //
    // Ronda de arreglos 1: la primera versión comparaba `filtrosVistosRef.current
    // !== filtros` (identidad). `aplicados` sale de un `useMemo` que depende
    // del QUERYSTRING COMPLETO (`use-filtros-url.ts`), no solo de `from`/`to`
    // — cambia de identidad ante CUALQUIER parámetro de la URL, propio o
    // ajeno (`?utm_source=`, `?id=`, `?tab=`, el patrón que ya usan
    // CRM/Contactos/Visitas). Con `!==`, un usuario en la página 3 con el
    // MISMO rango de fechas de siempre volvía a la página 1 apenas apareciera
    // un parámetro ajeno en la URL — ningún filtro cambió, pero el reset se
    // disparaba igual. Se compara por VALOR y solo las claves propias con
    // `mismosFiltros` (la misma pieza que ya usa el hook internamente).
    const filtrosVistosRef = useRef(filtros)

    useEffect(() => {
        // PRIMERA LÍNEA, antes de cualquier `return` temprano — tanto el de
        // abajo (reset de página) como el de identidad sin resolver.
        const { gen, signal } = pedidos.abrir()

        const cambioFiltro = !mismosFiltros(filtros, filtrosVistosRef.current, CLAVES_FILTRO)
        filtrosVistosRef.current = filtros
        if (cambioFiltro && page !== 1) {
            setPage(1)
            return
        }

        // No pedir nada hasta saber quién es el usuario: el asesor solo ve
        // las suyas (assigned_to) — pedir antes mostraría, por un instante,
        // tasaciones ajenas (mismo criterio que Contactos).
        if (!userInfo) return

        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('limit', String(pageSize))
        if (filtros.from) params.set('from', filtros.from)
        if (filtros.to) params.set('to', filtros.to)
        if (filtros.q) params.set('q', filtros.q)
        if (filtros.min) params.set('min', filtros.min)
        if (filtros.max) params.set('max', filtros.max)
        if (userInfo.role === 'asesor') params.set('assigned_to', userInfo.id)

        setLoading(true)
        setLoadError(false)
        fetch(`/api/appraisals?${params}`, { signal })
            .then(r => {
                if (!r.ok) throw new Error(`GET /api/appraisals respondió ${r.status}`)
                return r.json()
            })
            .then(({ data, count }) => {
                if (!pedidos.vigente(gen)) return
                setAppraisals(data || [])
                setTotalCount(count || 0)
            })
            .catch(err => {
                // Una respuesta (o un AbortError) de un pedido que ya no es el
                // vigente no puede pintar NADA: ni datos ni error.
                if (!pedidos.vigente(gen)) return
                console.error('Error loading appraisals:', err)
                setLoadError(true)
                setAppraisals([])
                setTotalCount(0)
            })
            // El spinner del listado va versionado: si lo apagara una
            // respuesta vieja, la pantalla mostraría el listado anterior como
            // si fuera el resultado del filtro nuevo.
            .finally(() => pedidos.siVigente(gen, () => setLoading(false)))
        // La selección se limpia con CADA listado nuevo (filtro o página), igual
        // que en Propiedades/Contactos/CRM. Acá no es cosmético: la única acción
        // masiva de esta pantalla es "Eliminar DEFINITIVAMENTE". Sin esta línea,
        // una fila tildada sobrevive al cambio de filtro (y al paso de página) y
        // el `DELETE` viaja sobre ids que ya no están en pantalla — se borra lo
        // que no se ve. Va DESPUÉS del pedido, no antes de los `return`
        // tempranos: el reset de página vuelve a correr este mismo efecto ya en
        // la página 1, y sin identidad todavía no hay nada seleccionable.
        setSelectedIds(new Set())
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtros, userInfo, page])

    async function handleDelete(e: React.MouseEvent, id: string) {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm('Eliminar esta tasacion?')) return
        setDeleting(id)
        try {
            await fetch(`/api/appraisals/${id}`, { method: 'DELETE' })
            setAppraisals(prev => prev.filter(a => a.id !== id))
            setTotalCount(prev => prev - 1)
        } catch (err) {
            console.error('Delete error:', err)
        } finally {
            setDeleting(null)
        }
    }

    async function handleBulkDelete() {
        const ids = Array.from(selectedIds)
        if (ids.length === 0) return
        const confirmation = prompt(
            `Vas a ELIMINAR DEFINITIVAMENTE ${ids.length} tasacion${ids.length !== 1 ? 'es' : ''}.\n\n` +
            `Para confirmar, escribí ELIMINAR:`
        )
        if (confirmation !== 'ELIMINAR') return
        setBulkActioning(true)
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/appraisals/${id}`, { method: 'DELETE' }))
        )
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
        const deletedIds = new Set(
            ids.filter((_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<Response>).value.ok)
        )
        setAppraisals(prev => prev.filter(a => !deletedIds.has(a.id)))
        setTotalCount(prev => prev - deletedIds.size)
        setSelectedIds(new Set())
        setBulkActioning(false)
        if (failed > 0) alert(`${failed} no se pudieron eliminar.`)
    }

    const hayFiltros =
        !!filtros.from || !!filtros.to || !!filtros.q || !!filtros.min || !!filtros.max
    const cargando = loading || escribiendo
    const totalPages = Math.ceil(totalCount / pageSize)

    const columns: Column<AppraisalSummary>[] = [
        { key: 'property_title', label: 'Propiedad', sortable: true, render: r => <span className="font-medium">{r.property_title || 'Sin titulo'}</span> },
        { key: 'property_location', label: 'Ubicacion', sortable: true, render: r => <span className="text-muted-foreground truncate max-w-[200px] block">{r.property_location}</span> },
        { key: 'publication_price', label: 'Precio', sortable: true, className: 'text-right', render: r => <span className="font-medium">{formatCurrency(r.publication_price, r.currency || 'USD')}</span> },
        { key: 'comparable_count', label: 'Comp.', sortable: true, className: 'text-center', render: r => <Badge variant="secondary">{r.comparable_count}</Badge> },
        { key: 'created_at', label: 'Fecha', sortable: true, render: r => <span className="text-sm text-muted-foreground">{formatDate(r.created_at)}</span> },
        { key: 'actions', label: '', render: r => (
            <div className="flex gap-1">
                <Link href={`/appraisal/new?editId=${r.id}`} onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm"><Edit2 className="h-3.5 w-3.5" /></Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={e => handleDelete(e, r.id)} disabled={deleting === r.id}>
                    {deleting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                </Button>
            </div>
        )},
    ]

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Historial de Tasaciones</h1>
                    <p className="text-sm text-muted-foreground">
                        {cargando
                            ? 'Cargando…'
                            : loadError
                                ? 'No se pudo consultar'
                                : `${totalCount} tasacion${totalCount !== 1 ? 'es' : ''}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-md border">
                        <button onClick={() => setViewMode('cards')} className={`p-2 ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><LayoutList className="h-4 w-4" /></button>
                        <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><Table2 className="h-4 w-4" /></button>
                    </div>
                    <Link href="/appraisal/new">
                        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva</Button>
                    </Link>
                </div>
            </div>

            <FilterBar
                selects={[]}
                values={mostrado}
                onChange={setFiltro}
                onClear={limpiarTodo}
                extraActivo={
                    !!mostrado.from || !!mostrado.to ||
                    !!mostrado.q || !!mostrado.min || !!mostrado.max
                }
            >
                <BusquedaTexto
                    value={mostrado.q}
                    onChange={q => aplicarFiltros({ q })}
                    placeholder="Buscar por dirección, barrio…"
                />
                <RangoPrecio
                    value={{ min: mostrado.min, max: mostrado.max }}
                    onChange={r => aplicarFiltros({ min: r.min, max: r.max })}
                />
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

            <BulkActionsBar
                count={selectedIds.size}
                onClear={() => setSelectedIds(new Set())}
                noun="tasaciones"
                actions={[
                    { label: 'Eliminar', icon: <Trash2 className="h-4 w-4 mr-1" />, variant: 'destructive', onClick: handleBulkDelete, disabled: bulkActioning },
                ]}
            />

            {cargando ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : loadError ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <FileText className="h-12 w-12 text-destructive mb-4" />
                        <h3 className="text-lg font-medium mb-1">No se pudo cargar el historial</h3>
                        <p className="text-sm text-muted-foreground mb-4 max-w-md">
                            {hayFiltros
                                ? 'Puede ser un filtro inválido en el link o un problema de conexión. Probá de nuevo o limpiá los filtros.'
                                : 'Puede ser un problema de conexión. Probá de nuevo.'}
                        </p>
                        {hayFiltros && (
                            <Button size="sm" variant="outline" onClick={limpiarTodo}>Limpiar filtros</Button>
                        )}
                    </CardContent>
                </Card>
            ) : appraisals.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16">
                        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                        {/* Con filtros puestos, "creá tu primera tasación" es
                            mentira: hay tasaciones, no coinciden con la búsqueda.
                            Y la salida útil no es "Nueva", es limpiar los filtros. */}
                        <h3 className="text-lg font-medium mb-1">
                            {hayFiltros ? 'Sin resultados' : 'Sin tasaciones'}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4 max-w-md text-center">
                            {hayFiltros
                                ? (filtros.q
                                    ? `Ninguna tasación coincide con «${filtros.q}» y los filtros puestos.`
                                    : 'Ninguna tasación coincide con los filtros puestos.')
                                : 'Crea tu primera tasacion.'}
                        </p>
                        {hayFiltros
                            ? <Button size="sm" variant="outline" onClick={limpiarTodo}>Limpiar filtros</Button>
                            : <Link href="/appraisal/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva Tasacion</Button></Link>}
                    </CardContent>
                </Card>
            ) : viewMode === 'table' ? (
                <DataTable
                    data={appraisals}
                    columns={columns}
                    getRowKey={r => r.id}
                    onRowClick={r => router.push(`/appraisals/${r.id}`)}
                    selectable
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {appraisals.map(a => (
                        <Link key={a.id} href={`/appraisals/${a.id}`}>
                            <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer h-full">
                                <CardContent className="p-4">
                                    <h3 className="font-medium mb-1 truncate">{a.property_title || 'Sin titulo'}</h3>
                                    <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2"><MapPin className="h-3.5 w-3.5" />{a.property_location}</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-lg font-bold">{formatCurrency(a.publication_price, a.currency || 'USD')}</span>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary">{a.comparable_count} comp.</Badge>
                                            <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(a.created_at)}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">Pagina {page} de {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    )
}
