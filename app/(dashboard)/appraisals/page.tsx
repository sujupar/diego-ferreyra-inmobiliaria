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
import { puedeBorrarTasacion } from '@/lib/auth/appraisal-access'
import {
    Trash2, ChevronLeft, ChevronRight, Plus, Loader2, FileText,
    MapPin, Calendar, Edit2, LayoutList, Table2, AlertTriangle
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

/**
 * Los cuatro motivos por los que esta pantalla puede no tener nada que mostrar
 * SIN estar vacía. Antes eran cero: un 500 del listado, un 401 de sesión
 * vencida y un 403 de permiso terminaban todos en el mismo cartel «Sin
 * tasaciones — Crea tu primera tasacion» (D8), y un fallo de identidad dejaba
 * el spinner girando para siempre (D6). Cada uno necesita un texto y una
 * salida distinta: reintentar no arregla un permiso, y volver a loguearse no
 * arregla un 500.
 */
type MotivoError = 'sesion' | 'permiso' | 'identidad' | 'listado'

/** Un Error que además se acuerda del status HTTP que lo produjo. */
function errorConEstado(status: number, mensaje: string): Error {
    const e = new Error(mensaje) as Error & { status?: number }
    e.status = status
    return e
}

function estadoDe(err: unknown): number | undefined {
    return (err as { status?: number } | null | undefined)?.status
}

/** 401 y 403 tienen salida propia; el resto es "no se pudo". */
function motivoDe(err: unknown, porDefecto: MotivoError): MotivoError {
    const status = estadoDe(err)
    if (status === 401) return 'sesion'
    if (status === 403) return 'permiso'
    return porDefecto
}

/**
 * Qué decirle al usuario cuando un borrado NO se hizo. El 500 tiene mención
 * propia porque es el caso más común y el menos evidente: `deals.appraisal_id`,
 * `properties.appraisal_id` y `scheduled_appraisals.appraisal_id` son claves
 * foráneas SIN cascada, así que cualquier tasación que entró al pipeline
 * levanta violación de FK al borrarse.
 */
function motivoDeBorrado(status: number | undefined): string {
    if (status === 401) return 'Tu sesión venció. Entrá de nuevo y volvé a intentar.'
    if (status === 403) return 'No tenés permiso para eliminar esta tasación.'
    if (status === 500) return 'Puede estar vinculada a un proceso o a una propiedad: primero hay que desvincularla.'
    return 'Probá de nuevo en un momento.'
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
    const [deleting, setDeleting] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('table')
    const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
    // D6: «todavía no sé quién sos» ≠ «sé que no hay identidad». Sin esta
    // bandera, el `.catch` del efecto de identidad dejaba `userInfo` en null
    // PARA SIEMPRE, el gate de más abajo cortaba antes del único
    // `setLoading(false)` de la pantalla, y el spinner giraba indefinidamente
    // sin error ni forma de salir. Es la mitad del patrón de Propiedades que
    // no se había copiado.
    const [userInfoResuelto, setUserInfoResuelto] = useState(false)
    // D6 + D8: el estado que faltaba. Distingue «cargando» de «falló» de
    // «vacío de verdad».
    const [loadError, setLoadError] = useState<MotivoError | null>(null)
    // El «Reintentar» de verdad: con la URL sin cambiar, ningún efecto vuelve a
    // correr solo. Este contador entra en las dependencias de los dos efectos.
    const [reintentos, setReintentos] = useState(0)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkActioning, setBulkActioning] = useState(false)
    // D29: el orden de la tabla se resuelve en el SERVIDOR. En memoria ordenaba
    // solo las 12 filas de la página y la flecha del encabezado mentía que el
    // orden era de todas.
    const [tableSort, setTableSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
    const pageSize = 12

    // D1: quién ve la papelera. El servidor ya rechaza el borrado de los roles
    // sin alcance, pero mostrarles el botón igual es ofrecer una acción
    // irreversible al rol equivocado — así fue como el abogado terminó
    // borrando tasaciones. Mismo criterio que `canHardDelete` en Propiedades,
    // con la lista de roles compartida con la API para que las dos capas no se
    // desincronicen.
    const puedeBorrar = puedeBorrarTasacion(userInfo?.role)

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
                if (!r.ok) throw errorConEstado(r.status, `GET /api/auth/me respondió ${r.status}`)
                return r.json()
            })
            .then((perfil: { id?: unknown; role?: unknown } | null) => {
                // Un 200 sin `id` tampoco es una identidad.
                if (!perfil || typeof perfil.id !== 'string' || !perfil.id) {
                    throw new Error('GET /api/auth/me no devolvió un id')
                }
                setUserInfo({ id: perfil.id, role: typeof perfil.role === 'string' ? perfil.role : '' })
            })
            .catch(err => {
                console.error(err)
                // D6: el fallo se CUENTA. Un 401 manda a re-loguearse; el resto
                // (404 de perfil que no resuelve, 500, hipo de red) ofrece
                // reintentar. Antes acá solo había un console.error.
                setLoadError(motivoDe(err, 'identidad'))
            })
            // Resuelto pase lo que pase: es lo que destraba el efecto de datos.
            .finally(() => setUserInfoResuelto(true))
    }, [reintentos])

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
        if (!userInfoResuelto) return

        // D6: identidad RESUELTA pero sin usuario. Antes esto era el mismo
        // `return` mudo de arriba y la pantalla quedaba en «Cargando…» para
        // siempre. El motivo ya lo dejó puesto el efecto de identidad; acá se
        // apaga el spinner y se limpia lo que hubiera en pantalla.
        if (!userInfo) {
            setAppraisals([])
            setTotalCount(0)
            setSelectedIds(new Set())
            setLoading(false)
            return
        }

        const params = new URLSearchParams()
        params.set('page', String(page))
        params.set('limit', String(pageSize))
        if (filtros.from) params.set('from', filtros.from)
        if (filtros.to) params.set('to', filtros.to)
        if (filtros.q) params.set('q', filtros.q)
        if (filtros.min) params.set('min', filtros.min)
        if (filtros.max) params.set('max', filtros.max)
        if (userInfo.role === 'asesor') params.set('assigned_to', userInfo.id)
        // D29: el orden viaja al servidor. Sin esto, la tabla ordenaba las 12
        // filas de la página en memoria.
        if (tableSort) {
            params.set('sort', tableSort.key)
            params.set('dir', tableSort.dir)
        }

        setLoading(true)
        setLoadError(null)
        fetch(`/api/appraisals?${params}`, { signal })
            .then(r => {
                if (!r.ok) throw errorConEstado(r.status, `GET /api/appraisals respondió ${r.status}`)
                return r.json()
            })
            .then(({ data, count }) => {
                if (!pedidos.vigente(gen)) return
                setAppraisals(data || [])
                setTotalCount(count || 0)
            })
            .catch(err => {
                if (!pedidos.vigente(gen)) return
                console.error('Error loading appraisals:', err)
                // D8: sin esto, `appraisals` quedaba en [] y `totalCount` en 0,
                // y el render caía en «Sin tasaciones — Crea tu primera
                // tasacion»: un asesor con 30 tasaciones veía que no tenía
                // ninguna. Un 401 manda a re-loguearse, un 403 avisa que el rol
                // no alcanza, el resto ofrece reintentar.
                setLoadError(motivoDe(err, 'listado'))
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
    }, [filtros, userInfo, userInfoResuelto, page, tableSort, reintentos])

    // D6/D8: vuelve a preguntar quién sos (por si lo que se cayó fue
    // `/api/auth/me`) y fuerza el pedido del listado aunque la URL no haya
    // cambiado ni un carácter.
    function reintentar() {
        setLoading(true)
        setLoadError(null)
        setUserInfoResuelto(false)
        setReintentos(n => n + 1)
    }

    async function handleDelete(e: React.MouseEvent, id: string) {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm('Eliminar esta tasacion?')) return
        setDeleting(id)
        try {
            const res = await fetch(`/api/appraisals/${id}`, { method: 'DELETE' })
            // D7: `fetch` solo rechaza por fallo de red — un 401, un 403 o un
            // 500 caían por la rama de éxito y la fila desaparecía de la
            // pantalla (y el contador bajaba) sobre una tasación que seguía
            // viva. La acción masiva de acá abajo ya lo chequeaba: eran dos
            // borrados de lo mismo comportándose distinto.
            if (!res.ok) throw errorConEstado(res.status, `DELETE /api/appraisals/${id} respondió ${res.status}`)
            setAppraisals(prev => prev.filter(a => a.id !== id))
            setTotalCount(prev => prev - 1)
        } catch (err) {
            console.error('Delete error:', err)
            alert(`No se pudo eliminar la tasación. ${motivoDeBorrado(estadoDe(err))}`)
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
        if (failed > 0) {
            // El aviso ya existía, pero no decía POR QUÉ. El motivo del primer
            // rechazo alcanza: los fallos de un lote suelen ser todos el mismo
            // (sesión vencida, permiso, o el FK del pipeline).
            const primero = results.find(r => r.status === 'rejected' || !r.value.ok)
            const status = primero && primero.status === 'fulfilled' ? primero.value.status : undefined
            alert(`${failed} no se pudieron eliminar. ${motivoDeBorrado(status)}`)
        }
    }

    const hayFiltros =
        !!filtros.from || !!filtros.to || !!filtros.q || !!filtros.min || !!filtros.max
    const cargando = loading || escribiendo
    const totalPages = Math.ceil(totalCount / pageSize)
    // Para el cartel de error: con filtros puestos, «limpiar filtros» suele ser
    // la salida más rápida (un rango inválido en el link da 500).
    const hayFiltros = !!filtros.from || !!filtros.to

    // `card` = qué se ve cuando la tabla se apila como ficha en el teléfono.
    // Una tasación se reconoce por la PROPIEDAD; el precio y la fecha son lo
    // que se compara de un vistazo. Se esconden:
    //  · «Comp.» (cantidad de comparables) — es un dato del método, no del
    //    negocio: nadie elige una tasación por eso;
    //  · los dos botones de acción — son dos blancos de 33px pegados uno al
    //    otro, imposibles de acertar con el pulgar, y los dos destinos siguen
    //    disponibles: tocar la ficha abre el detalle (que tiene «Editar
    //    Tasación») y borrar sigue estando en la selección múltiple.
    const columns: Column<AppraisalSummary>[] = [
        { key: 'property_title', label: 'Propiedad', sortable: true, wrap: true, card: 'title', render: r => <span className="font-medium">{r.property_title || 'Sin titulo'}</span> },
        { key: 'property_location', label: 'Ubicacion', sortable: true, wrap: true, card: 'meta', render: r => <span className="text-muted-foreground truncate max-w-[200px] block">{r.property_location}</span> },
        { key: 'publication_price', label: 'Precio', sortable: true, className: 'text-right', card: 'meta', render: r => <span className="font-medium">{formatCurrency(r.publication_price, r.currency || 'USD')}</span> },
        { key: 'comparable_count', label: 'Comp.', sortable: true, className: 'text-center', card: 'none', render: r => <Badge variant="secondary">{r.comparable_count}</Badge> },
        { key: 'created_at', label: 'Fecha', sortable: true, card: 'meta', render: r => <span className="text-sm text-muted-foreground">{formatDate(r.created_at)}</span> },
        { key: 'actions', label: '', card: 'none', render: r => (
            <div className="flex gap-1">
                {/* El `aria-label` no es opcional: el control es SOLO un ícono,
                    así que sin él un lector de pantalla lo anuncia como "enlace"
                    y nada más — y está pegado al de borrar, que sí lo tiene.
                    Lleva el nombre de la propiedad porque en un listado hay uno
                    por fila y veinte "Editar" idénticos no distinguen ninguna.
                    `asChild` y no un <Button> ADENTRO del <Link>: anidados son
                    dos paradas de tabulador para una sola acción, y el enlace
                    de afuera se quedaba igual sin nombre (su contenido es el
                    ícono). Así queda un solo <a>, con el estilo del botón. */}
                <Button asChild variant="ghost" size="sm">
                    <Link
                        href={`/appraisal/new?editId=${r.id}`}
                        onClick={e => e.stopPropagation()}
                        aria-label={`Editar la tasación de ${r.property_title || 'la propiedad sin título'}`}
                    >
                        <Edit2 className="h-3.5 w-3.5" />
                    </Link>
                </Button>
                {puedeBorrar && (
                    <Button variant="ghost" size="sm" onClick={e => handleDelete(e, r.id)} disabled={deleting === r.id} aria-label="Eliminar tasación">
                        {deleting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                    </Button>
                )}
            </div>
        )},
    ]

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Historial de Tasaciones</h1>
                    <p className="text-sm text-muted-foreground">
                        {/* D8: con el listado fallado, «0 tasaciones» es una
                            afirmación falsa sobre la base — el subtítulo no
                            puede contar lo que no pudo leer. */}
                        {cargando
                            ? 'Cargando…'
                            : loadError
                                ? 'No se pudo consultar'
                                : `${totalCount} tasacion${totalCount !== 1 ? 'es' : ''}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Mismo arreglo que en Contactos: el control que saca al
                        usuario de la vista que no le sirve no puede ser el
                        blanco más chico y menos etiquetado de la pantalla. */}
                    <div className="flex rounded-md border">
                        <button
                            onClick={() => setViewMode('cards')}
                            aria-label="Ver como fichas"
                            aria-pressed={viewMode === 'cards'}
                            className={`tap flex items-center justify-center rounded-l-md ${viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                        >
                            <LayoutList className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            aria-label="Ver como tabla"
                            aria-pressed={viewMode === 'table'}
                            className={`tap flex items-center justify-center rounded-r-md ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                        >
                            <Table2 className="h-4 w-4" />
                        </button>
                    </div>
                    {/* D1: si el servidor ya contestó que este rol no alcanza
                        las tasaciones, «Nueva» lo lleva a un asistente que va a
                        fallar al guardar (el POST también rechaza). No se le
                        ofrece. */}
                    {loadError !== 'permiso' && (
                        <Link href="/appraisal/new">
                            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva</Button>
                        </Link>
                    )}
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
                actions={puedeBorrar
                    ? [{ label: 'Eliminar', icon: <Trash2 className="h-4 w-4 mr-1" />, variant: 'destructive' as const, onClick: handleBulkDelete, disabled: bulkActioning }]
                    : []}
            />

            {cargando ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : loadError ? (
                /* D6/D8: la rama que faltaba. Va ANTES de la de vacío — si no,
                   un fallo se lee como «todavía no cargaste nada». Cada motivo
                   con su salida: reintentar no arregla un permiso. */
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
                        <h3 className="text-lg font-medium mb-1">
                            {loadError === 'sesion'
                                ? 'Tu sesión venció'
                                : loadError === 'permiso'
                                    ? 'No tenés acceso a las tasaciones'
                                    : loadError === 'identidad'
                                        ? 'No pudimos confirmar quién sos'
                                        : 'No se pudo cargar el historial'}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4 max-w-md">
                            {loadError === 'sesion'
                                ? 'Entrá de nuevo para ver el historial de tasaciones.'
                                : loadError === 'permiso'
                                    ? 'Tu rol no tiene permisos sobre las tasaciones. Si necesitás verlas, pedíselo a un administrador.'
                                    : loadError === 'identidad'
                                        ? 'El historial de un asesor muestra solo sus tasaciones y no pudimos averiguar quién sos, así que no mostramos nada para no enseñarte tasaciones ajenas.'
                                        : hayFiltros
                                            ? 'Puede ser un filtro inválido en el link o un problema de conexión. Probá de nuevo o limpiá los filtros.'
                                            : 'Puede ser un problema de conexión. Probá de nuevo.'}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            {loadError === 'sesion' ? (
                                <Link href="/login"><Button size="sm">Iniciar sesión</Button></Link>
                            ) : loadError === 'permiso' ? null : (
                                <>
                                    <Button size="sm" onClick={reintentar}>Reintentar</Button>
                                    {hayFiltros && loadError === 'listado' && (
                                        <Button size="sm" variant="outline" onClick={limpiarTodo}>Limpiar filtros</Button>
                                    )}
                                </>
                            )}
                        </div>
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
                    // La única acción masiva de esta pantalla es eliminar: sin
                    // permiso de borrado, los tildes no llevan a ningún lado.
                    selectable={puedeBorrar}
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    // D29: modo CONTROLADO. Pasar `onSortChange` apaga el orden
                    // en memoria del DataTable (que solo alcanzaba a la página
                    // cargada) y hace que el orden lo resuelva la query.
                    sort={tableSort}
                    onSortChange={(key, dir) => {
                        setTableSort({ key, dir })
                        // Un orden nuevo cambia QUÉ 12 filas son la primera
                        // página: quedarse en la 4 mostraría un tramo del medio
                        // sin ninguna señal.
                        setPage(1)
                    }}
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
                /* Dos flechas sin nombre, de 33px, separadas por el texto de la
                   página: el pulgar caía justo en el medio. `icon-sm` las lleva
                   a 40px en celular (`components/ui/button.tsx`) y el
                   `aria-label` las hace anunciables. */
                <div className="flex items-center justify-center gap-2">
                    <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Página anterior">
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">Pagina {page} de {totalPages}</span>
                    <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} aria-label="Página siguiente">
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    )
}
