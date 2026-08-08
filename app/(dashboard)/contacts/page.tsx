'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FilterBar } from '@/components/filters/FilterBar'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { DataTable, Column } from '@/components/ui/DataTable'
import { BulkActionsBar } from '@/components/ui/BulkActionsBar'
import { Loader2, Plus, User, Phone, Mail, Calendar, ChevronRight, Search, LayoutList, Table2, Trash2 } from 'lucide-react'

interface Contact {
  id: string; full_name: string; phone: string | null; email: string | null
  origin: string | null; created_at: string
}

const ORIGIN_LABELS: Record<string, string> = { embudo: 'Embudo', referido: 'Referido', historico: 'Historico' }

// Mismo arreglo que antes alimentaba los botones de origen — ahora las
// opciones del desplegable de FilterBar. "Todos" = sin filtro (value '').
const OPCIONES_ORIGEN = [
  { value: '', label: 'Todos' },
  ...Object.entries(ORIGIN_LABELS).map(([key, label]) => ({ value: key, label })),
]

// Filtros de esta pantalla en la URL (lib/filters/use-filtros-url). Constantes
// de MÓDULO, no literales dentro del componente — si van adentro cambian de
// identidad en cada render y el listado se re-pide sin parar (ver el hook).
//
// El buscador de texto (`search`, más abajo) NO entra acá — decisión
// deliberada, no un olvido. Filtra en memoria sobre los contactos YA
// cargados, sin tocar la API, así que no tiene ninguno de los problemas que
// esta pieza vino a resolver (carrera de respuestas, F5). Meterlo en el
// mismo `useFiltrosUrl` que origin/from/to tiene un costo real: `escribiendo`
// es UNA sola bandera para todas las claves de la instancia, y la pantalla la
// usa para tapar el listado entero con el spinner (mismo criterio que
// Propiedades). Si `search` viviera acá, cada tecla tapiaría la tabla con un
// spinner hasta que la URL commitee (~200-700 ms medidos en Propiedades) — un
// buscador que hoy filtra al instante pasaría a "parpadear" en cada letra.
// Se lo deja fuera y sigue funcionando exactamente como antes.
const FILTROS_DEFECTO = { origin: '', from: '', to: '' }

const PERMITIDOS = { origin: OPCIONES_ORIGEN.map(o => o.value) }

// Mismo criterio que Propiedades: from/to viajan crudos desde la URL (deep
// link o edición a mano) y `getContacts` los usa tal cual en un
// `.gte()/.lte()` — un valor no-fecha rompe la query. `permitidos` no puede
// validar FORMATO (es una lista cerrada de valores), así que se normaliza acá.
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizarFiltros(f: typeof FILTROS_DEFECTO): typeof FILTROS_DEFECTO {
  return {
    ...f,
    from: FECHA_RE.test(f.from) ? f.from : '',
    to: FECHA_RE.test(f.to) ? f.to : '',
  }
}

const ETIQUETAS_FILTRO: Record<string, string> = {
  origin: 'Origen',
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

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function ContactsPage() {
  // useSearchParams obliga a un límite de Suspense en App Router.
  return (
    <Suspense fallback={<ContactsSkeleton />}>
      <ContactsClient />
    </Suspense>
  )
}

function ContactsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
          <p className="text-muted-foreground">Cargando…</p>
        </div>
      </div>
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  )
}

function ContactsClient() {
  const router = useRouter()

  // Toda la máquina de filtros en la URL vive en `lib/filters/use-filtros-url`
  // (probada aparte, ver `use-filtros-url.test.ts`).
  //  - `mostrado`: lo que ven los CONTROLES (espejo si hay escritura pendiente).
  //  - `filtros`:  lo que hay en la URL — lo único que se le pide al servidor.
  //    El buscador (`search`, más abajo) NO pasa por acá — ver el porqué junto
  //    a `FILTROS_DEFECTO`.
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

  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'table'>('table')
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActioning, setBulkActioning] = useState(false)
  const canHardDelete = userInfo?.role === 'admin' || userInfo?.role === 'dueno'

  // Gana el último PEDIDO, no la última respuesta — ver
  // `lib/filters/use-pedidos-versionados`. Sin esto, con la API lenta, filtrar
  // por "Embudo" y enseguida por "Referido" podía terminar mostrando los
  // contactos de "Embudo" bajo el rótulo "Referido", para siempre.
  const pedidos = usePedidosVersionados()

  // A4 (revisión final Fase 2) — mismo blindaje que Propiedades. `/api/auth/me`
  // devuelve JSON TAMBIÉN en 401/404/500 (`{error:'...'}`), así que un
  // `.then(r => r.json()).then(setUserInfo)` pelado dejaba `userInfo` TRUTHY con
  // `role`/`id` undefined: el gate `if (!userInfo) return` pasaba igual y el
  // pedido salía SIN `assigned_to` → un asesor veía el listado completo. Sin
  // identidad no se pide nada (fail-closed).
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

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const confirmation = prompt(
      `Vas a ELIMINAR DEFINITIVAMENTE ${ids.length} contacto${ids.length !== 1 ? 's' : ''}.\n\n` +
      `Las tasaciones, propiedades, agendas y deals asociados quedan con contact_id en blanco.\n\n` +
      `Para confirmar, escribí ELIMINAR:`
    )
    if (confirmation !== 'ELIMINAR') return
    setBulkActioning(true)
    const results = await Promise.allSettled(
      ids.map(id => fetch(`/api/contacts/${id}`, { method: 'DELETE' }))
    )
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
    const deletedIds = new Set(
      ids.filter((_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<Response>).value.ok)
    )
    setContacts(prev => prev.filter(c => !deletedIds.has(c.id)))
    setSelectedIds(new Set())
    setBulkActioning(false)
    if (failed > 0) alert(`${failed} no se pudieron eliminar. Probablemente requieren permisos de admin/dueño.`)
  }

  useEffect(() => {
    // PRIMERA LÍNEA, antes de cualquier `return` — si no, una respuesta vieja
    // (o la del `return` temprano de abajo) puede pintar sobre una pantalla
    // que ya decidió mostrar otra cosa.
    //
    // TRAMPA PARA EL PRÓXIMO EDIT (ronda 1 de arreglos, caso D): hoy mover
    // `abrir()` DESPUÉS del `if (!userInfo) return` no rompe nada observable
    // — `userInfo` pasa de `null` a un valor UNA sola vez en toda la vida del
    // componente (no hay logout ni "reintentar" que lo vuelva a `null`), así
    // que jamás hay una generación con un fetch en vuelo en el instante en que
    // este return temprano se ejecuta una segunda vez. El día que se agregue
    // una segunda condición de early-return (ej. un botón "Reintentar" como
    // el de Propiedades, que resetea `userInfoLoaded`), la mutación sí pasa a
    // ser observable — no lo pierdas de vista si tocás este efecto. Ver el
    // comentario de cabecera de `page.test.tsx` (caso D): se investigó y no
    // hay forma de fijar esto con un test de comportamiento sin inventar un
    // camino que el componente no puede producir hoy.
    const { gen, signal } = pedidos.abrir()
    // No pedir nada hasta saber quién es el usuario: `assigned_to` depende de
    // `userInfo.id` para un asesor, y pedir antes mostraría (por un instante)
    // contactos ajenos.
    if (!userInfo) return

    const params = new URLSearchParams()
    if (filtros.origin) params.set('origin', filtros.origin)
    if (filtros.from) params.set('from', filtros.from)
    if (filtros.to) params.set('to', filtros.to)
    if (userInfo.role === 'asesor') params.set('assigned_to', userInfo.id)

    setLoading(true)
    fetch(`/api/contacts?${params}`, { signal })
      .then(r => {
        if (!r.ok) throw new Error(`GET /api/contacts respondió ${r.status}`)
        return r.json()
      })
      .then(({ data }) => {
        if (!pedidos.vigente(gen)) return
        setContacts(data || [])
      })
      .catch(err => {
        if (!pedidos.vigente(gen)) return
        console.error(err)
      })
      // El spinner del listado va versionado: si lo apagara una respuesta
      // vieja, la pantalla mostraría el listado anterior como si fuera el
      // resultado del filtro nuevo.
      .finally(() => pedidos.siVigente(gen, () => setLoading(false)))
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, userInfo])

  const filtered = search
    ? contacts.filter(c =>
        c.full_name.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase()) ||
        c.phone?.includes(search)
      )
    : contacts

  const cargando = loading || escribiendo
  const hayFiltros = !!filtros.origin || !!filtros.from || !!filtros.to || !!search

  const columns: Column<Contact>[] = [
    { key: 'full_name', label: 'Nombre', sortable: true, render: r => <span className="font-medium">{r.full_name}</span> },
    { key: 'phone', label: 'Telefono', sortable: true, render: r => <span className="text-muted-foreground">{r.phone || '—'}</span> },
    { key: 'email', label: 'Email', sortable: true, render: r => <span className="text-muted-foreground">{r.email || '—'}</span> },
    { key: 'origin', label: 'Origen', sortable: true, render: r => r.origin ? <Badge variant="secondary" className="text-xs">{ORIGIN_LABELS[r.origin] || r.origin}</Badge> : <span>—</span> },
    { key: 'created_at', label: 'Fecha', sortable: true, render: r => <span className="text-sm text-muted-foreground">{formatDate(r.created_at)}</span> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contactos</h1>
          <p className="text-muted-foreground">
            {cargando ? 'Cargando…' : `${filtered.length} contacto${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><LayoutList className="h-4 w-4" /></button>
            <button onClick={() => setViewMode('table')} className={`p-2 ${viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><Table2 className="h-4 w-4" /></button>
          </div>
          <Link href="/contacts/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo</Button></Link>
        </div>
      </div>

      <FilterBar
        selects={[{ key: 'origin', label: 'Origen', options: OPCIONES_ORIGEN }]}
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {canHardDelete && (
        <BulkActionsBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          noun="contactos"
          actions={[
            { label: 'Eliminar', icon: <Trash2 className="h-4 w-4 mr-1" />, variant: 'destructive', onClick: handleBulkDelete, disabled: bulkActioning },
          ]}
        />
      )}

      {cargando ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Sin contactos</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {hayFiltros ? 'Ningún contacto coincide con los filtros.' : 'Crea un contacto o agenda una tasacion.'}
            </p>
            <Link href="/contacts/new"><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo Contacto</Button></Link>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <DataTable
          data={filtered}
          columns={columns}
          getRowKey={r => r.id}
          onRowClick={r => router.push(`/contacts/${r.id}`)}
          selectable={canHardDelete}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Link key={c.id} href={`/contacts/${c.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center gap-4 py-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.full_name}</span>
                      {c.origin && <Badge variant="secondary" className="text-xs">{ORIGIN_LABELS[c.origin] || c.origin}</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
                      {c.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{c.email}</span>}
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(c.created_at)}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
