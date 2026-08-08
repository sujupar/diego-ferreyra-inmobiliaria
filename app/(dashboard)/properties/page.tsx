'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FilterBar } from '@/components/filters/FilterBar'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { leerFiltros, escribirFiltros } from '@/lib/filters/url-state'
import { DataTable, Column } from '@/components/ui/DataTable'
import { BulkActionsBar } from '@/components/ui/BulkActionsBar'
import { Building2, Plus, MapPin, Calendar, Loader2, ChevronRight, LayoutList, LayoutGrid, Table2, Archive, Trash2 } from 'lucide-react'
import { PropertyCard } from './_components/PropertyCard'
import { PropertyDetailModal, type DetailProperty } from './_components/PropertyDetailModal'
import { ScheduleVisitDialog } from './_components/ScheduleVisitDialog'

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-400' },
  pending_docs: { label: 'Pend. Docs', color: 'bg-amber-500' },
  pending_photos: { label: 'Pend. Fotos', color: 'bg-orange-500' },
  pending_review: { label: 'En Revision', color: 'bg-purple-500' },
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

// Filtros de esta pantalla en la URL (lib/filters/url-state). El objeto de
// defaults NO se tipa con `interface`: le falta el index signature que pide
// `Record<string, string>` y no compila (TS2345) — objeto literal, se infiere solo.
const FILTROS_DEFECTO = { status: '', from: '', to: '', mios: '' }

// Hoisteado: se usa tanto al leer (useMemo de abajo) como en `aplicar` — misma
// lista siempre, y no se recomputa el .map() en cada lectura.
// `mios` es booleano disfrazado de string: solo '1' (tildado) o '' (sin filtro).
// Cerrarle la lista evita que un `?mios=banana` viaje de vuelta a la URL en la
// siguiente escritura.
const PERMITIDOS = { status: OPCIONES_ESTADO.map(o => o.value), mios: ['', '1'] }

// Ronda de arreglos 1 — I3: from/to viajan crudos desde la URL (deep link o
// edición a mano) directo a la API, que devuelve 500 ante algo tipo
// `?from=basura` (ver el fetch más abajo). `leerFiltros` no puede validar
// FORMATO — su `permitidos` es una lista cerrada de valores, no un patrón — así
// que se valida acá, después de leer. Si no matchea, cae al default (silencioso,
// igual que un status inventado).
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

// Única puerta de lectura URL → filtros validados. La usan tanto el useMemo
// (URL confirmada por React) como `aplicar` (URL en vivo, ver más abajo) — así
// nunca quedan desincronizados sobre qué es un valor válido.
function leerFiltrosDeUrl(search: string): typeof FILTROS_DEFECTO {
  const f = leerFiltros(new URLSearchParams(search), FILTROS_DEFECTO, PERMITIDOS)
  return {
    ...f,
    from: FECHA_RE.test(f.from) ? f.from : '',
    to: FECHA_RE.test(f.to) ? f.to : '',
  }
}

function mismosFiltros(a: typeof FILTROS_DEFECTO, b: typeof FILTROS_DEFECTO) {
  return a.status === b.status && a.from === b.from && a.to === b.to && a.mios === b.mios
}

// Red de seguridad del espejo optimista (ver más abajo). Las mediciones dan
// 200-700ms entre la escritura y el commit de la URL; si pasado este tiempo la
// URL nunca llegó a lo escrito (p. ej. el usuario tocó Atrás en el medio), se
// suelta el espejo y mandan los valores de la URL. Sin esto, el listado en
// carga que pide H4 podría quedarse girando para siempre.
const ESPEJO_MAX_MS = 3000

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

function getPropertyStatusInfo(p: Property) {
  if (p.status === 'pending_review' && p.legal_status === 'approved') {
    return { label: 'Pend. Fotos', color: 'bg-amber-500' }
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
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Clave primitiva (string) para el useMemo de abajo — NO usar `searchParams`
  // directo como dependencia de un efecto/memo: cada render de este componente
  // (ej. el setSelectedIds de más abajo) puede volver a llamar a leerFiltros y,
  // sin esta memoización por valor, `filtros` sería un objeto nuevo en CADA
  // render → el useEffect que trae los datos lo vería "cambiado" siempre →
  // loop infinito de fetch. Con la clave primitiva, `filtros` solo cambia de
  // identidad cuando el querystring realmente cambió.
  const searchParamsKey = searchParams.toString()
  // Fuente de verdad = la URL confirmada por React. `permitidos.status` hace
  // que un valor viejo o inventado (`?status=noexiste`) caiga al default en
  // vez de romper la pantalla (el default está incluido en esa misma lista).
  const filtros = useMemo(() => leerFiltrosDeUrl(searchParamsKey), [searchParamsKey])

  // Ronda de arreglos 1 — I1: espejo optimista. `filtros` (arriba) solo se
  // actualiza cuando `searchParams` refleja el `router.replace` ya
  // commiteado — medido en vivo por el revisor: hasta ~665ms para la URL,
  // ~425ms para lo que se ve en pantalla. Sin este espejo, tocar "7d" o el
  // checkbox de "solo mías" no se refleja al instante — quedan "congelados"
  // ese rato. `mostrado` es el espejo si hay uno pendiente, la URL si no.
  const [espejo, setEspejo] = useState<typeof FILTROS_DEFECTO | null>(null)
  const mostrado = espejo ?? filtros

  // El espejo se suelta SOLO cuando la URL confirmada (`filtros`) ya coincide
  // con lo que el espejo venía mostrando — no ante cualquier cambio de
  // searchParams. Si soltara ante cualquier cambio, un tercer click rápido
  // podría parpadear hacia un estado viejo mientras la URL no alcanzó al
  // último click todavía.
  // Depende de `espejo` ADEMÁS de `filtros` (ronda 2): si dependiera solo de
  // `filtros`, un `aplicar` que no mueve la URL nunca volvería a evaluarse y el
  // espejo quedaría puesto para siempre — con H4 eso sería un spinner eterno.
  useEffect(() => {
    if (!espejo) return
    if (mismosFiltros(espejo, filtros)) setEspejo(null)
  }, [espejo, filtros])

  // Red de seguridad: si la URL nunca alcanza al espejo (ver ESPEJO_MAX_MS), se
  // suelta igual. El timer se reinicia con cada escritura nueva y se cancela al
  // soltarlo, así que en el camino normal (200-700ms) no llega a disparar.
  useEffect(() => {
    if (!espejo) return
    const t = setTimeout(() => setEspejo(null), ESPEJO_MAX_MS)
    return () => clearTimeout(t)
  }, [espejo])

  // Ronda de arreglos 1 — I1: NUNCA partir de `filtros` (la foto de ESTE
  // render) para armar el patch. Primer intento: leer `window.location.search`
  // "en vivo" en vez del render — DESCARTADO tras medirlo: `router.replace`
  // tarda 200-700ms en commitear la URL real del navegador en este entorno
  // (dev, Next 16), así que a los 150-197ms el segundo click TODAVÍA lee la
  // URL vieja y pierde el primero igual que antes (reproducido en vivo: el
  // rango de fechas desaparecía, quedaba solo `?mios=1`). Fix real: un ref de
  // JS puro, escrito SINCRÓNICAMENTE en cada `aplicar` — no depende de que
  // React, el navegador o Next terminen de procesar nada. El próximo click
  // (aunque sea 10ms después) ya lo ve actualizado. Se resincroniza desde
  // `filtros` cuando la URL cambia por afuera de `aplicar` (F5, Atrás, link
  // pegado).
  // `ultimaBusquedaRef` es el hermano del anterior para el querystring COMPLETO
  // (H5): guarda también los parámetros que no son filtros de esta pantalla.
  const ultimoFiltroRef = useRef(filtros)
  const ultimaBusquedaRef = useRef(searchParamsKey)
  // GUARDARRAÍL (ronda 2): no resincronizar mientras hay una escritura
  // pendiente. Next puede commitear una URL INTERMEDIA cuando dos escrituras
  // van bien separadas; este efecto no sabe distinguir "es una escritura mía
  // vieja llegando tarde" de "esta URL vino de afuera", y pisar el ref con la
  // intermedia perdería lo ya escrito. Hoy no falla porque Next ordena los
  // commits a favor — o sea, la seguridad la pone Next, no el código. El espejo
  // ES la bandera de escritura pendiente: mientras esté puesto, no se pisa nada.
  useEffect(() => {
    if (espejo) return
    ultimoFiltroRef.current = filtros
    ultimaBusquedaRef.current = searchParamsKey
  }, [filtros, searchParamsKey, espejo])

  // H5: la URL puede traer parámetros que NO son filtros de esta pantalla
  // (`utm_source` de una campaña hoy; `id`, `tab`, `highlight` en los deep links
  // de CRM/Contactos/Visitas mañana). Reconstruir el querystring solo desde las
  // 4 claves conocidas los borraba en cuanto se tocaba un filtro. Se parte de lo
  // que ya hay y se sobrescriben SOLO las claves propias.
  function construirBusqueda(nuevos: typeof FILTROS_DEFECTO) {
    const params = new URLSearchParams(ultimaBusquedaRef.current)
    for (const clave of Object.keys(FILTROS_DEFECTO)) params.delete(clave)
    // `escribirFiltros` ordena las claves y omite las que están en su valor por
    // defecto — el resultado sigue siendo estable e idempotente.
    new URLSearchParams(escribirFiltros(nuevos, FILTROS_DEFECTO))
      .forEach((valor, clave) => params.set(clave, valor))
    return params.toString()
  }

  function aplicar(patch: Partial<typeof FILTROS_DEFECTO>) {
    const nuevos = { ...ultimoFiltroRef.current, ...patch }
    // H3: el espejo tiene que guardar lo que devolvería una LECTURA de lo que
    // se acaba de escribir, no el parche crudo. Todo valor que sobreviva a la
    // escritura pero no a la lectura dejaba el espejo clavado PARA SIEMPRE (el
    // efecto de arriba solo lo suelta si `filtros` coincide exacto, y `filtros`
    // sale de la lectura, que valida). Reproducido con un año de 5 dígitos: el
    // `<input type=date>` de Chrome lo acepta, `FECHA_RE` lo rechaza, y los
    // controles quedaban diciendo "filtrado" sobre un listado sin filtrar.
    const validados = leerFiltrosDeUrl(escribirFiltros(nuevos, FILTROS_DEFECTO))
    // Escritura que no cambia nada (tocar dos veces el mismo preset, o aplicar
    // un valor que la lectura descarta): ni URL nueva ni espejo — si no, H4
    // dejaría el listado en carga por una escritura que nunca va a commitear.
    if (mismosFiltros(validados, ultimoFiltroRef.current)) return
    const busqueda = construirBusqueda(validados)
    ultimoFiltroRef.current = validados
    ultimaBusquedaRef.current = busqueda
    setEspejo(validados)
    // replace y no push: con push, cada ajuste del rango de fechas deja una
    // entrada en el historial y el botón Atrás se vuelve inusable.
    router.replace(busqueda ? `${pathname}?${busqueda}` : pathname, { scroll: false })
  }

  function setFiltro(key: string, value: string) {
    aplicar({ [key]: value } as Partial<typeof FILTROS_DEFECTO>)
  }

  // Limpiar = un `aplicar` con las 4 claves en su valor por defecto. Pasa por el
  // mismo camino (mismo ref, mismo espejo, mismos parámetros ajenos
  // preservados) en vez de tener su propia versión que se desincronice.
  function limpiarTodo() {
    aplicar(FILTROS_DEFECTO)
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
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    fetch(`/api/properties?${buildParams(0)}`)
      .then(async r => {
        // Ronda de arreglos 1 — I3: un 500 devuelve un body JSON válido
        // ({error:...}); sin este chequeo el .then de abajo desestructuraba
        // {data,total,hasMore} de un error → todo undefined → "Sin
        // propiedades", mintiendo que el sistema está vacío.
        if (!r.ok) throw new Error(`GET /api/properties respondió ${r.status}`)
        return r.json()
      })
      .then(({ data, total, hasMore }) => {
        setProperties(data || [])
        setTotal(total ?? (data || []).length)
        setHasMore(!!hasMore)
      })
      .catch(err => {
        console.error(err)
        setLoadError('listado')
        setProperties([])
        setTotal(0)
        setHasMore(false)
      })
      .finally(() => setLoading(false))
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
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/properties?${buildParams(properties.length)}`)
      if (!res.ok) throw new Error(`GET /api/properties respondió ${res.status}`)
      const { data, total: newTotal, hasMore: newHasMore } = await res.json()
      setProperties(prev => [...prev, ...(data || [])])
      setTotal(newTotal ?? 0)
      setHasMore(!!newHasMore)
    } catch (err) {
      console.error(err)
    } finally {
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
    try {
      const res = await fetch(`/api/properties?${buildParams(0, keep)}`)
      if (!res.ok) throw new Error(`GET /api/properties respondió ${res.status}`)
      const { data, total: newTotal, hasMore: newHasMore } = await res.json()
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
  const cargando = loading || espejo !== null
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

      <FilterBar
        selects={[{ key: 'status', label: 'Estado', options: OPCIONES_ESTADO }]}
        values={mostrado}
        onChange={setFiltro}
        onClear={limpiarTodo}
        extraActivo={!!mostrado.from || !!mostrado.to || mostrado.mios === '1'}
      >
        <DateRangeFilter
          value={{ from: mostrado.from, to: mostrado.to }}
          onChange={r => aplicar({ from: r.from, to: r.to })}
        />
        <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm">
          <input
            type="checkbox"
            checked={mostrado.mios === '1'}
            onChange={e => aplicar({ mios: e.target.checked ? '1' : '' })}
          />
          Solo mías
        </label>
      </FilterBar>

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
                <Button size="sm" variant="outline" onClick={() => aplicar({ mios: '' })}>
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
        <div className="flex justify-center py-4">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Cargar más ({properties.length} de {total})
          </Button>
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
