'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatTile } from '@/components/ui/StatTile'
import { FilterBar } from '@/components/filters/FilterBar'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { DataTable, Column } from '@/components/ui/DataTable'
import { BulkActionsBar } from '@/components/ui/BulkActionsBar'
import { Building2, Plus, MapPin, Calendar, Loader2, ChevronRight, LayoutList, LayoutGrid, Table2, Archive, Trash2 } from 'lucide-react'
import { PropertyCard } from './_components/PropertyCard'
import { PropertyDetailModal, type DetailProperty } from './_components/PropertyDetailModal'
import { ScheduleVisitDialog } from './_components/ScheduleVisitDialog'

// Catálogo de valores REALES de `properties.status`: alimenta el desplegable de
// filtros (que consulta por el valor guardado). `pending_docs` y
// `pending_review` ya no los escribe nadie desde 2026-08-09 — quedan para las
// filas viejas, y por eso van marcados. El badge de cada fila NO sale de acá
// cuando la propiedad está en captación: ver `getPropertyStatusInfo`.
const STATUS_INFO: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-400' },
  pending_docs: { label: 'Pend. Fotos (previo)', color: 'bg-amber-500' },
  pending_photos: { label: 'Pend. Fotos', color: 'bg-orange-500' },
  pending_review: { label: 'En Revisión (previo)', color: 'bg-purple-500' },
  approved: { label: 'Aprobada', color: 'bg-green-500' },
  rejected: { label: 'Rechazada', color: 'bg-red-500' },
  active: { label: 'Activa', color: 'bg-emerald-600' },
  descartada: { label: 'Descartada', color: 'bg-slate-500' },
}

// Mismo arreglo que antes alimentaba los botones de estado — ahora las
// opciones del desplegable de FilterBar. "Todas" = sin filtro (value '').
const OPCIONES_ESTADO = [
  { value: '', label: 'Todas' },
  ...Object.entries(STATUS_INFO).map(([key, info]) => ({ value: key, label: info.label })),
]

// Filtros de esta pantalla en la URL (lib/filters/use-filtros-url). El objeto
// de defaults NO se tipa con `interface`: le falta el index signature que pide
// `Record<string, string>` y no compila (TS2345) — objeto literal, se infiere solo.
const FILTROS_DEFECTO = { status: '', from: '', to: '', mios: '' }

// Constantes de MÓDULO, no literales dentro del componente: el hook las lee por
// ref y su contrato pide que sean estables.
// `mios` es booleano disfrazado de string: solo '1' (tildado) o '' (sin filtro).
// `mios` es booleano disfrazado de string: solo '1' (tildado) o '' (sin filtro).
// Cerrarle la lista evita que un `?mios=banana` viaje de vuelta a la URL en la
// siguiente escritura.
const PERMITIDOS = { status: OPCIONES_ESTADO.map(o => o.value), mios: ['', '1'] }

// Ronda de arreglos 1 — I3: from/to viajan crudos desde la URL (deep link o
// edición a mano) directo a la API, que devuelve 500 ante algo tipo
// `?from=basura` (ver el fetch más abajo). `leerFiltros` no puede validar
// FORMATO — su `permitidos` es una lista cerrada de valores, no un patrón — así
// que se normaliza después de leer. Si no matchea, cae al default.
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

// `normalizar` del hook: corre igual al LEER la URL y al validar una ESCRITURA,
// así nunca hay dos criterios distintos sobre qué es una fecha válida. Es pura
// e idempotente, como exige el contrato del hook.
function normalizarFiltros(f: typeof FILTROS_DEFECTO): typeof FILTROS_DEFECTO {
  return {
    ...f,
    from: FECHA_RE.test(f.from) ? f.from : '',
    to: FECHA_RE.test(f.to) ? f.to : '',
  }
}

// Ronda 3 — N3: cuando una escritura se descarta entera, el usuario tiene que
// enterarse. Acá viven los nombres que ve la gente, no las claves de la URL.
const ETIQUETAS_FILTRO: Record<string, string> = {
  status: 'Estado',
  from: 'Desde',
  to: 'Hasta',
  mios: 'Solo mías',
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

// Shape del LISTADO — viene de vw_properties_list (GET /api/properties), sin
// el array `photos` completo (A3 de la auditoría: 21.951 KB por request, 99%
// eran fotos base64 legacy). Solo `thumbnail` (portada) + `photo_count`.
// El detalle completo (galería, descripción, video, tour) se pide aparte al
// abrir el modal — ver fetchFullProperty más abajo.
interface Property {
  id: string; address: string; neighborhood: string; city: string; property_type: string
  asking_price: number; currency: string; status: string; origin: string | null
  thumbnail: string | null; photo_count: number; thumbnail_is_legacy_base64: boolean
  created_at: string; legal_status?: string
  assigned_to?: string | null; rooms?: number | null; bathrooms?: number | null; covered_area?: number | null
  legal_docs_pending?: boolean | null; origin_pending?: boolean | null
}

const PAGE_SIZE = 24

/**
 * Badge del listado. Con la documentación fuera del camino crítico
 * (2026-08-09), "Pend. Docs" describía algo que ya no bloquea nada: lo único
 * que falta en esos estados son las fotos.
 */
function getPropertyStatusInfo(p: Property) {
  const enCaptacion = !['approved', 'active', 'rejected', 'descartada'].includes(p.status)
  if (enCaptacion) {
    if (p.legal_status === 'rejected') return { label: 'Doc. Rechazada', color: 'bg-red-500' }
    if (!p.photo_count) return { label: 'Pend. Fotos', color: 'bg-orange-500' }
    return { label: 'En captación', color: 'bg-amber-500' }
  }
  return STATUS_INFO[p.status] || { label: p.status, color: 'bg-gray-400' }
}

function formatCurrency(v: number, c: string = 'USD') {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: c === 'ARS' ? 'ARS' : 'USD', minimumFractionDigits: 0 }).format(v)
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function PropertiesPage() {
  // useSearchParams obliga a un límite de Suspense en App Router. Ronda de
  // arreglos 1 — MENOR: `fallback={null}` dejaba la pantalla ENTERA en blanco
  // (título y botones viven adentro de PropertiesClient). Esqueleto liviano
  // en vez de blanco puro — barato, no duplica el layout final.
  return (
    <Suspense fallback={<PropertiesSkeleton />}>
      <PropertiesClient />
    </Suspense>
  )
}

function PropertiesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground">Cargando…</p>
        </div>
      </div>
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  )
}

function PropertiesClient() {
  const router = useRouter()

  // Toda la máquina de filtros en la URL vive en `lib/filters/use-filtros-url`
  // (ronda 3): ref sincrónico en cada escritura, espejo optimista con el valor
  // VALIDADO, preservación de los parámetros ajenos y liberación del espejo por
  // ráfaga (sin temporizadores). Está testeada aparte —
  // `use-filtros-url.test.ts`—, que es lo que acá adentro no se podía hacer.
  //  - `mostrado`: lo que ven los CONTROLES (espejo si hay escritura pendiente).
  //  - `filtros`:  lo que hay en la URL, o sea lo único que se le puede pedir al
  //    servidor. Pedir por el espejo duplicaría cada request.
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

  // Ronda 3 — N3: si la validación descarta el parche ENTERO no pasa nada, y
  // "no pasa nada" es indistinguible de un botón roto. En Propiedades hay que
  // errarle al año para llegar acá; en Contactos y CRM, con campos de texto que
  // se recortan o normalizan, va a ser el caso común.
  const [avisoFiltro, setAvisoFiltro] = useState<string | null>(null)

  function aplicarFiltros(patch: Partial<typeof FILTROS_DEFECTO>) {
    const r = aplicar(patch)
    // También avisa el parche a medias (una clave entró, otra no): el usuario
    // vería un filtro aplicado y el otro desaparecido, sin explicación.
    setAvisoFiltro(r.rechazadas.length > 0 ? mensajeRechazo(r.rechazadas) : null)
  }

  function setFiltro(key: string, value: string) {
    aplicarFiltros({ [key]: value } as Partial<typeof FILTROS_DEFECTO>)
  }

  function limpiarTodo() {
    limpiar()
    setAvisoFiltro(null)
  }

  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  // Ronda de arreglos 1 — I3: distingue "todavía cargando" / "vino vacío de
  // verdad" de "la API falló" — sin esto un 500 (ej. from=basura antes del
  // fix de validación, o cualquier otro error real) terminaba mostrando "Sin
  // propiedades — Creá tu primera propiedad captada", que es mentira.
  // Ronda 2: pasó de booleano a motivo, porque "no cargó el listado" y "no sé
  // quién sos y por eso no te muestro nada" necesitan textos y salidas distintas.
  const [loadError, setLoadError] = useState<null | 'listado' | 'identidad'>(null)
  // H1: "Limpiar filtros" con la URL ya limpia es un botón muerto —
  // `router.replace(pathname)` no cambia el querystring, `filtros` conserva la
  // misma referencia y el efecto de datos no corre: cero requests. Y es
  // justamente el caso más probable, porque la primera carga falla con la URL
  // limpia. Este contador es el "Reintentar" de verdad: entra en las
  // dependencias del efecto de datos y del de identidad, así que fuerza el
  // refetch aunque no haya cambiado ni un filtro.
  const [reintentos, setReintentos] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  // Menor de la ronda 3: el catch de `loadMore` era mudo. Si "Cargar más"
  // fallaba no pasaba NADA visible — el asesor no sabía si ya no había más o si
  // se había roto. No usa `loadError` a propósito: el listado que ya está en
  // pantalla sigue siendo válido, lo que falló es el pedazo nuevo.
  const [errorMas, setErrorMas] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table'>('grid')
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
  // Ronda de arreglos 1 — I2: distingue "todavía no sé quién sos" de "sé que
  // no hay usuario". Sin esto, el fetch de propiedades arrancaba ANTES de que
  // conteste /api/auth/me — con `mios=1` en la URL, `assigned_to` depende de
  // `userInfo.id`, así que pedía TODAS las propiedades primero (fichas
  // ajenas en pantalla) y recién corregía con un segundo fetch al llegar
  // userInfo. Medido: t=2308ms sin assigned_to, t=2849ms con assigned_to, en
  // la MISMA carga de /properties?mios=1.
  const [userInfoLoaded, setUserInfoLoaded] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActioning, setBulkActioning] = useState(false)
  const [modalProperty, setModalProperty] = useState<DetailProperty | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [scheduleVisitOpen, setScheduleVisitOpen] = useState(false)
  const [scheduleForPropertyId, setScheduleForPropertyId] = useState<string | null>(null)
  // Orden de la vista tabla (hallazgo #7): se resuelve en el SERVIDOR, no en
  // memoria sobre la página cargada — ver `buildParams`/`getPropertiesListPage`.
  const [tableSort, setTableSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const canHardDelete = userInfo?.role === 'admin' || userInfo?.role === 'dueno'
  // Hallazgo #11 (carrera al abrir dos fichas seguidas): guarda el id
  // efectivamente pedido; si la respuesta llega y ya no coincide con el
  // último pedido, se descarta — no pisa el modal de una ficha más nueva.
  const modalRequestIdRef = useRef<string | null>(null)

  // Ronda 3 — N2: los tres fetch de listado no tenían ni cancelación ni
  // versionado, así que ganaba la ÚLTIMA RESPUESTA, no el último pedido.
  // Medido: con la API lenta, elegir "Aprobada" y después "Activa" terminaba
  // mostrando 21 propiedades bajo el rótulo "Activa" (que tiene 0), y para
  // siempre. Y un "Cargar más" en vuelo appendeaba filas del filtro viejo
  // dentro del nuevo, reescribiendo el total a un número inventado.
  //
  // Ronda 4: la máquina salió a `lib/filters/use-pedidos-versionados` (con
  // tests) porque son ~20 líneas con tres reglas sutiles que un copiar/pegar
  // rompe, y las tres pantallas que siguen tienen los mismos dos casos
  // abiertos. `abrir` = listado nuevo (solo el efecto de datos);
  // `actual` = engancharse al vigente (cargar más / refrescos).
  const pedidos = usePedidosVersionados()

  useEffect(() => {
    const saved = localStorage.getItem('propertiesViewMode') as 'grid' | 'list' | 'table' | null
    if (saved === 'grid' || saved === 'list' || saved === 'table') setViewMode(saved)
  }, [])
  useEffect(() => {
    localStorage.setItem('propertiesViewMode', viewMode)
  }, [viewMode])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => {
        // H2: `/api/auth/me` devuelve JSON TAMBIÉN en 401/404/500
        // (`{error:'...'}`, ver app/api/auth/me/route.ts). Sin chequear `r.ok`,
        // `r.json()` resuelve, `setUserInfo({error})` deja `userInfo` truthy
        // con `.id` undefined y el `.catch` ni se entera. Medido con esa ruta
        // bloqueada: `?mios=1` mostraba "24 de 31 propiedades" AJENAS, sin
        // spinner ni error, de forma permanente.
        if (!r.ok) throw new Error(`GET /api/auth/me respondió ${r.status}`)
        return r.json()
      })
      .then((perfil: { id?: unknown; role?: unknown } | null) => {
        // Un 200 sin `id` tampoco es una identidad: sin id no hay "solo mías".
        if (!perfil || typeof perfil.id !== 'string' || !perfil.id) {
          throw new Error('GET /api/auth/me no devolvió un id')
        }
        setUserInfo({ id: perfil.id, role: typeof perfil.role === 'string' ? perfil.role : '' })
      })
      .catch(err => { console.error(err) })
      // Se marca "resuelto" pase lo que pase. Antes el .catch dejaba
      // `userInfo` en null PARA SIEMPRE si esta llamada fallaba — con el gate
      // de abajo eso hubiera colgado el listado en el spinner para siempre;
      // con este .finally, en cambio, el efecto de datos decide qué hacer
      // (sin `mios` sigue de largo; con `mios` avisa, ver H2 abajo).
      .finally(() => setUserInfoLoaded(true))
  }, [reintentos])

  function buildParams(offset: number, limit: number = PAGE_SIZE) {
    const params = new URLSearchParams()
    if (filtros.status) params.set('status', filtros.status)
    if (filtros.from) params.set('from', filtros.from)
    if (filtros.to) params.set('to', filtros.to)
    if (filtros.mios === '1' && userInfo?.id) params.set('assigned_to', userInfo.id)
    if (tableSort) {
      params.set('sort', tableSort.key)
      params.set('dir', tableSort.dir)
    }
    params.set('limit', String(limit))
    params.set('offset', String(offset))
    return params
  }

  // Paginado de a PAGE_SIZE (24) — ver task-7-brief.md. Reset a la página 0
  // cada vez que cambia un filtro (u orden — mismo criterio: ambos cambian
  // QUÉ 24 filas corresponden a la página 0).
  useEffect(() => {
    // N2: CUALQUIER corrida de este efecto invalida (y cancela) el listado
    // anterior, incluso las que deciden no pedir nada — si no, una respuesta
    // vieja pintaría sobre una pantalla que ya decidió mostrar otra cosa.
    const { gen, signal } = pedidos.abrir()
    // Ronda de arreglos 1 — I2: no pedir nada hasta saber quién es el
    // usuario (resuelto con éxito o no). Esto también elimina el segundo
    // request duplicado de página 0 que antes hacía TODA carga de la
    // pantalla (uno sin userInfo al montar, otro al llegar userInfo).
    if (!userInfoLoaded) return
    // H2, segunda mitad: con "solo mías" pedido y SIN identidad resuelta, la
    // versión anterior omitía `assigned_to` y pedía el listado igual — o sea
    // que el filtro "solo mías" fallaba mostrando MÁS de lo que corresponde.
    // No se pide nada: se avisa. Fail-closed.
    if (filtros.mios === '1' && !userInfo?.id) {
      setProperties([])
      setTotal(0)
      setHasMore(false)
      setSelectedIds(new Set())
      setLoadError('identidad')
      setErrorMas(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    setErrorMas(null)
    fetch(`/api/properties?${buildParams(0)}`, { signal })
      .then(async r => {
        // Ronda de arreglos 1 — I3: un 500 devuelve un body JSON válido
        // ({error:...}); sin este chequeo el .then de abajo desestructuraba
        // {data,total,hasMore} de un error → todo undefined → "Sin
        // propiedades", mintiendo que el sistema está vacío.
        if (!r.ok) throw new Error(`GET /api/properties respondió ${r.status}`)
        return r.json()
      })
      .then(({ data, total, hasMore }) => {
        if (!pedidos.vigente(gen)) return
        setProperties(data || [])
        setTotal(total ?? (data || []).length)
        setHasMore(!!hasMore)
      })
      .catch(err => {
        // Una respuesta (o un AbortError) de un listado que ya no es el vigente
        // no puede pintar NADA: ni datos ni error.
        if (!pedidos.vigente(gen)) return
        console.error(err)
        setLoadError('listado')
        setProperties([])
        setTotal(0)
        setHasMore(false)
      })
      // Idem para el spinner: si lo apagara la respuesta vieja, la pantalla
      // mostraría el listado anterior como si fuera el resultado del filtro
      // nuevo — la misma mentira de H4, por otra puerta.
      .finally(() => pedidos.siVigente(gen, () => setLoading(false)))
    // Limpiar selección al cambiar filtros
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, userInfo, userInfoLoaded, tableSort, reintentos])

  // H1: el "Reintentar" de verdad. Vuelve a preguntar quién sos (por si lo que
  // se cayó fue `/api/auth/me`) y fuerza el refetch del listado aunque la URL
  // no haya cambiado ni un carácter.
  function reintentar() {
    setLoading(true)
    setLoadError(null)
    setUserInfoLoaded(false)
    setReintentos(n => n + 1)
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return
    // N2: se captura la generación del listado al que este "más" pertenece. Si
    // el filtro cambia mientras el pedido está en vuelo, la respuesta se
    // descarta en vez de appendear filas del filtro viejo (y de reescribir el
    // total con el del listado anterior: medido, "28 de 31" sobre un filtro que
    // tenía 21).
    const { gen, signal } = pedidos.actual()
    setLoadingMore(true)
    setErrorMas(null)
    try {
      const res = await fetch(`/api/properties?${buildParams(properties.length)}`, { signal })
      if (!res.ok) throw new Error(`GET /api/properties respondió ${res.status}`)
      const { data, total: newTotal, hasMore: newHasMore } = await res.json()
      if (!pedidos.vigente(gen)) return
      setProperties(prev => [...prev, ...(data || [])])
      setTotal(newTotal ?? 0)
      setHasMore(!!newHasMore)
    } catch (err) {
      console.error(err)
      if (pedidos.vigente(gen)) setErrorMas('No se pudieron cargar más propiedades. Probá de nuevo.')
    } finally {
      // Siempre, aunque la generación haya cambiado (regla 3 del helper): es la
      // bandera del BOTÓN, y dejarla puesta lo bloquearía para el listado nuevo.
      setLoadingMore(false)
    }
  }

  // Hallazgo #9: una acción en lote (descartar/eliminar) recargaba con
  // offset=0 y el limit de UNA página, así que un asesor que había cargado 3
  // páginas volvía a ver solo 24 filas — perdía su lugar en el scroll. Ahora
  // re-pide TANTAS filas como había cargadas (mínimo una página), para que el
  // listado visible no encoja por debajo de lo que el asesor ya había traído.
  async function refreshProperties() {
    const keep = Math.max(properties.length, PAGE_SIZE)
    // N2: mismo criterio que `loadMore`. Si el filtro cambió mientras el
    // refresco viajaba, el listado nuevo manda y este se descarta — refrescar
    // el listado VIEJO encima del nuevo sería exactamente el bug.
    const { gen, signal } = pedidos.actual()
    try {
      const res = await fetch(`/api/properties?${buildParams(0, keep)}`, { signal })
      if (!res.ok) throw new Error(`GET /api/properties respondió ${res.status}`)
      const { data, total: newTotal, hasMore: newHasMore } = await res.json()
      if (!pedidos.vigente(gen)) return
      setProperties(data || [])
      setTotal(newTotal ?? (data || []).length)
      setHasMore(!!newHasMore)
    } catch (err) {
      // H6: antes esto era un `console.error` + `return` mudo. Tras un descarte
      // o un borrado masivo, si el refresco fallaba quedaban EN PANTALLA las
      // filas recién eliminadas, sin ningún aviso — el asesor las veía y creía
      // que la acción no había funcionado. Ahora se avisa y se vacía el
      // listado, que ya no representa lo que hay en el sistema.
      console.error(err)
      if (!pedidos.vigente(gen)) return
      setProperties([])
      setTotal(0)
      setHasMore(false)
      setLoadError('listado')
    }
  }

  // El listado no trae galería/descripción/video/tour (esos campos NUNCA
  // viajan en vw_properties_list) — al abrir el modal se pide el detalle
  // completo por GET /api/properties/[id] (mismo endpoint que usa la ficha).
  async function openPropertyModal(p: Property) {
    // Hallazgo #11: si se abre la ficha A y, antes de que responda el detalle
    // completo, se abre la ficha B, la respuesta tardía de A no debe pisar el
    // modal de B. `modalRequestIdRef` guarda el ÚLTIMO id pedido; cualquier
    // respuesta que llegue para un id distinto se descarta.
    modalRequestIdRef.current = p.id
    setModalProperty({
      id: p.id,
      address: p.address,
      neighborhood: p.neighborhood,
      city: p.city,
      property_type: p.property_type,
      asking_price: p.asking_price,
      currency: p.currency,
      status: p.status,
      photos: p.thumbnail && !p.thumbnail_is_legacy_base64 ? [p.thumbnail] : [],
      rooms: p.rooms,
      bathrooms: p.bathrooms,
      covered_area: p.covered_area,
      assigned_to: p.assigned_to,
    })
    setModalOpen(true)
    setModalLoading(true)
    try {
      const res = await fetch(`/api/properties/${p.id}`)
      const { data } = await res.json()
      if (data && modalRequestIdRef.current === p.id) setModalProperty(data)
    } catch (err) {
      console.error(err)
    } finally {
      if (modalRequestIdRef.current === p.id) setModalLoading(false)
    }
  }

  async function handleBulkDiscard() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`¿Descartar ${ids.length} propiedad${ids.length !== 1 ? 'es' : ''}?\n\nQuedan guardadas en el sistema con status="Descartada" y se pueden restaurar.`)) return
    setBulkActioning(true)
    const results = await Promise.allSettled(
      ids.map(id => fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'descartada' }),
      }))
    )
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
    setBulkActioning(false)
    setSelectedIds(new Set())
    await refreshProperties()
    if (failed > 0) alert(`${failed} no se pudieron descartar. Revisá la consola.`)
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const confirmation = prompt(
      `Vas a ELIMINAR DEFINITIVAMENTE ${ids.length} propiedad${ids.length !== 1 ? 'es' : ''}.\n\n` +
      `Esta acción no se puede deshacer. Se borran publicaciones, métricas, fotos y eventos legales asociados.\n\n` +
      `Para confirmar, escribí ELIMINAR:`
    )
    if (confirmation !== 'ELIMINAR') return
    setBulkActioning(true)
    const results = await Promise.allSettled(
      ids.map(id => fetch(`/api/properties/${id}`, { method: 'DELETE' }))
    )
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
    setBulkActioning(false)
    setSelectedIds(new Set())
    await refreshProperties()
    if (failed > 0) alert(`${failed} no se pudieron eliminar. Probablemente requieren permisos de admin/dueño.`)
  }

  // H4: entre que se escribe el filtro y que la lista se actualiza había una
  // ventana medida de ~486ms (checkbox marcado a los 53ms, spinner recién a los
  // 539ms) en la que los controles decían "filtrado" sobre el listado y el
  // conteo VIEJOS, sin ninguna señal de carga. El espejo ya ES la bandera de
  // "hay una escritura pendiente": mientras esté puesto, el listado va en carga.
  const cargando = loading || escribiendo
  // H1: "Limpiar filtros" solo tiene sentido si hay filtros que limpiar. Sale
  // de `filtros` (la URL aplicada), no del espejo: en estado de error no hay
  // escritura pendiente y lo que importa es qué se pidió realmente.
  const hayFiltros = !!filtros.status || !!filtros.from || !!filtros.to || filtros.mios === '1'

  const columns: Column<Property>[] = [
    { key: 'address', label: 'Direccion', sortable: true, render: r => <span className="font-medium">{r.address}</span> },
    { key: 'neighborhood', label: 'Barrio', sortable: true, render: r => <span className="text-muted-foreground">{r.neighborhood}</span> },
    { key: 'property_type', label: 'Tipo', sortable: true, render: r => <span className="capitalize">{r.property_type}</span> },
    { key: 'asking_price', label: 'Precio', sortable: true, className: 'text-right', render: r => <span className="font-medium">{formatCurrency(r.asking_price, r.currency)}</span> },
    { key: 'status', label: 'Estado', sortable: true, render: r => { const s = getPropertyStatusInfo(r); return <Badge className={`text-xs text-white ${s.color}`}>{s.label}</Badge> } },
    { key: 'origin', label: 'Origen', sortable: true, render: r => r.origin ? <Badge variant="secondary" className="text-xs capitalize">{r.origin}</Badge> : <span>—</span> },
    { key: 'created_at', label: 'Fecha', sortable: true, render: r => <span className="text-sm text-muted-foreground">{formatDate(r.created_at)}</span> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground">
            {/* H4: el conteo es del listado VIEJO hasta que llega el nuevo —
                mientras se está cargando no afirma un número que ya no vale.
                Y si el listado no cargó, "0 propiedades" sería otra mentira
                (no es que no haya: es que no sabemos). */}
            {cargando
              ? 'Cargando…'
              : loadError === 'identidad'
                // Ronda 3: acá el listado no falló — no se pidió, a propósito
                // (ver el gate fail-closed de "Solo mías"). Decir "no se pudo
                // cargar" hacía pensar en un error de la API que no existió.
                ? 'No se pidió el listado'
                : loadError
                  ? 'No se pudo cargar'
                  : <>{properties.length < total ? `${properties.length} de ${total}` : total} propiedad{total !== 1 ? 'es' : ''}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button size="sm" variant={viewMode === 'grid' ? 'default' : 'outline'} onClick={() => setViewMode('grid')} title="Vista grid">
              <LayoutGrid className="size-4" />
            </Button>
            <Button size="sm" variant={viewMode === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')} title="Vista lista">
              <LayoutList className="size-4" />
            </Button>
            <Button size="sm" variant={viewMode === 'table' ? 'default' : 'outline'} onClick={() => setViewMode('table')} title="Vista tabla">
              <Table2 className="size-4" />
            </Button>
          </div>
          <Link href="/properties/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva</Button></Link>
        </div>
      </div>

      {/* Task 16: números de arriba — SOLO datos que la pantalla ya tiene en
          memoria (`total` y `properties.length`, dos useState existentes).
          Cero fetch/consulta nueva. El contexto respeta el filtro puesto: si
          hay filtros, "con los filtros puestos" — nunca "en el sistema"
          cuando eso sería mentira sobre la base del número. Y en estado de
          error (`loadError`), el número se apaga a `null` ("Sin datos") en
          vez de mostrar el 0 que el efecto de datos deja al fallar.

          Revisión final Fase 3 — C1: MIENTRAS CARGA también se apaga. El
          renglón de arriba ya dice "Cargando…" justamente porque `total` y
          `properties.length` todavía valen 0 (o el valor del filtro ANTERIOR):
          la carga de esta pantalla está medida en 2308ms y 2849ms, así que
          afirmar "0 · en el sistema" durante casi tres segundos es decirle al
          dueño que la inmobiliaria no tiene propiedades. Y al cambiar de
          filtro, el `total` viejo aparecía bajo el rótulo "con los filtros
          puestos" — el número de una base y la etiqueta de otra. */}
      <div data-testid="tarjetas-numeros" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Propiedades"
          value={loadError || cargando ? null : total}
          context={
            loadError
              ? 'No se pudo consultar'
              : cargando
                ? 'todavía cargando'
                : hayFiltros ? 'con los filtros puestos' : 'en el sistema'
          }
        />
        <StatTile
          label="En pantalla"
          value={loadError || cargando ? null : properties.length}
          context={loadError ? 'No se pudo consultar' : cargando ? 'todavía cargando' : `de ${total}`}
        />
      </div>

      <FilterBar
        selects={[{ key: 'status', label: 'Estado', options: OPCIONES_ESTADO }]}
        values={mostrado}
        onChange={setFiltro}
        onClear={limpiarTodo}
        extraActivo={!!mostrado.from || !!mostrado.to || mostrado.mios === '1'}
      >
        <DateRangeFilter
          value={{ from: mostrado.from, to: mostrado.to }}
          onChange={r => aplicarFiltros({ from: r.from, to: r.to })}
        />
        <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
          <input
            type="checkbox"
            checked={mostrado.mios === '1'}
            onChange={e => aplicarFiltros({ mios: e.target.checked ? '1' : '' })}
          />
          Solo mías
        </label>
      </FilterBar>

      {/* N3: la señal de que una escritura se descartó. Sin esto, apretar
          "Aplicar" con una fecha imposible es indistinguible de un botón roto.
          H-E (ronda 4): el contenedor con `role="status"` está SIEMPRE montado y
          lo que cambia es su texto. Un contenedor que aparece junto con su
          contenido muchos lectores de pantalla no lo anuncian: la región recién
          entra al árbol de accesibilidad con el texto ya adentro, así que no hay
          "cambio" que leer. Cuando está vacío va en `sr-only`, que lo saca del
          flujo y no deja un hueco en el layout. */}
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
        noun="propiedades"
        actions={[
          { label: 'Descartar', icon: <Archive className="h-4 w-4 mr-1" />, onClick: handleBulkDiscard, disabled: bulkActioning },
          ...(canHardDelete ? [{ label: 'Eliminar', icon: <Trash2 className="h-4 w-4 mr-1" />, variant: 'destructive' as const, onClick: handleBulkDelete, disabled: bulkActioning }] : []),
        ]}
      />

      {cargando ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium mb-1">
              {loadError === 'identidad' ? 'No pudimos confirmar quién sos' : 'No se pudo cargar el listado'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              {loadError === 'identidad'
                ? 'El filtro «Solo mías» necesita saber quién sos y no se pudo averiguar. No mostramos el listado sin filtrar para no enseñarte propiedades de otros asesores.'
                : hayFiltros
                  ? 'Puede ser un filtro inválido en el link o un problema de conexión. Probá de nuevo o limpiá los filtros.'
                  : 'Puede ser un problema de conexión. Probá de nuevo.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={reintentar}>Reintentar</Button>
              {loadError === 'identidad' ? (
                <Button size="sm" variant="outline" onClick={() => aplicarFiltros({ mios: '' })}>
                  Ver todas las propiedades
                </Button>
              ) : hayFiltros ? (
                <Button size="sm" variant="outline" onClick={limpiarTodo}>Limpiar filtros</Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Sin propiedades</h3>
            <p className="text-sm text-muted-foreground mb-4">Crea tu primera propiedad captada.</p>
            <Link href="/properties/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva</Button></Link>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {properties.map(p => (
            <PropertyCard
              key={p.id}
              property={p}
              currentUserId={userInfo?.id}
              statusInfo={getPropertyStatusInfo(p)}
              onClick={() => openPropertyModal(p)}
            />
          ))}
        </div>
      ) : viewMode === 'table' ? (
        <DataTable
          data={properties}
          columns={columns}
          getRowKey={r => r.id}
          onRowClick={r => router.push(`/properties/${r.id}`)}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          // Orden CONTROLADO (server-side, hallazgo #7): `properties` es una
          // página parcial (24 de N), así que ordenarla en memoria acá
          // ordenaría solo lo cargado. `tableSort` dispara un refetch page-0.
          sort={tableSort}
          onSortChange={(key, dir) => setTableSort({ key, dir })}
        />
      ) : (
        <div className="space-y-3">
          {properties.map(prop => {
            const statusInfo = getPropertyStatusInfo(prop)
            return (
              <Link key={prop.id} href={`/properties/${prop.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center gap-4 py-4">
                    {prop.thumbnail ? (
                      <img src={prop.thumbnail} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center"><Building2 className="h-6 w-6 text-muted-foreground" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{prop.address}</span>
                        <Badge className={`text-xs text-white ${statusInfo.color}`}>{statusInfo.label}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{prop.neighborhood}</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(prop.created_at)}</span>
                      </div>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(prop.asking_price, prop.currency)}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {!cargando && hasMore && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Cargar más ({properties.length} de {total})
          </Button>
          {/* H-E: mismo criterio que el aviso de filtros — el contenedor vive
              mientras viva el botón, y lo que cambia es el texto. */}
          <p
            role="status"
            aria-live="polite"
            className={errorMas ? 'text-sm text-destructive' : 'sr-only'}
          >
            {errorMas}
          </p>
        </div>
      )}

      <PropertyDetailModal
        property={modalProperty}
        open={modalOpen}
        loading={modalLoading}
        onOpenChange={setModalOpen}
        currentUserId={userInfo?.id}
        onScheduleVisit={(id) => {
          setScheduleForPropertyId(id)
          setScheduleVisitOpen(true)
          setModalOpen(false)
        }}
      />

      <ScheduleVisitDialog
        propertyId={scheduleForPropertyId}
        propertyAddress={properties.find(p => p.id === scheduleForPropertyId)?.address}
        open={scheduleVisitOpen}
        onOpenChange={setScheduleVisitOpen}
      />
    </div>
  )
}
