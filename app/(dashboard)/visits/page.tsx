'use client'

import { Suspense, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { StatTile } from '@/components/ui/StatTile'
import { FilterBar } from '@/components/filters/FilterBar'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { VisitsTable } from './_components/VisitsTable'
import { Loader2 } from 'lucide-react'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

// Filtros de esta pantalla en la URL (lib/filters/use-filtros-url). Constantes
// de MÓDULO, no literales dentro del componente — si van adentro cambian de
// identidad en cada render y el listado se re-pide sin parar (ver el hook).
//
// Mismos filtros que tenía `VisitFiltersBar`, mismo orden: estado, asesor
// (solo admin), desde/hasta, solo mías. `propertyId` NO entra: el `VisitsFilters`
// viejo lo declaraba en el tipo pero `VisitFiltersBar` nunca tenía un control
// para setearlo y no había ningún link a `/visits?...` que lo trajera — era
// estado inalcanzable, nunca un filtro real que alguien pudiera aplicar.
const OPCIONES_STATUS = [
  { value: '', label: 'Todos' },
  { value: 'pending_confirmation', label: 'A confirmar' },
  { value: 'scheduled', label: 'Agendadas' },
  { value: 'completed', label: 'Realizadas' },
  { value: 'no_show', label: 'No se realizó' },
  { value: 'cancelled', label: 'Canceladas' },
]

// `onlyMine` viaja como '' | 'true' — el hook solo trabaja con strings. El
// botón "Solo mías" traduce el booleano de la UI vieja a este par de valores.
const FILTROS_DEFECTO = { status: '', advisorId: '', from: '', to: '', onlyMine: '' }

// `advisorId` NO entra en `permitidos`: son UUIDs dinámicos que vienen de
// `/api/profiles`, cargados DESPUÉS del montaje — no hay forma de tener esa
// lista lista al definir esta constante de módulo (mismo caso que `asesor` en
// CRM). `normalizarFiltros` valida el FORMATO (UUID), no la pertenencia.
const PERMITIDOS = { status: OPCIONES_STATUS.map(o => o.value), onlyMine: ['', 'true'] }

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizarFiltros(f: typeof FILTROS_DEFECTO): typeof FILTROS_DEFECTO {
  return {
    ...f,
    from: FECHA_RE.test(f.from) ? f.from : '',
    to: FECHA_RE.test(f.to) ? f.to : '',
    advisorId: UUID_RE.test(f.advisorId) ? f.advisorId : '',
  }
}

const ETIQUETAS_FILTRO: Record<string, string> = {
  status: 'Estado',
  advisorId: 'Asesor',
  from: 'Desde',
  to: 'Hasta',
  onlyMine: 'Solo mías',
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

export default function VisitsPage() {
  // useSearchParams obliga a un límite de Suspense en App Router.
  return (
    <Suspense fallback={<VisitsSkeleton />}>
      <VisitsClient />
    </Suspense>
  )
}

function VisitsSkeleton() {
  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Visitas</h1>
        <p className="text-muted-foreground">Cargando…</p>
      </div>
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  )
}

function VisitsClient() {
  // Toda la máquina de filtros en la URL vive en `lib/filters/use-filtros-url`
  // (probada aparte, ver `use-filtros-url.test.ts`).
  //  - `mostrado`: lo que ven los CONTROLES (espejo si hay escritura pendiente).
  //  - `filtros`:  lo que hay en la URL — lo único que se le pide al servidor.
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

  const [user, setUser] = useState<{ id: string; role: string } | null>(null)
  const [advisors, setAdvisors] = useState<{ id: string; full_name: string }[]>([])
  const [visits, setVisits] = useState<PropertyVisitWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  // Task 16: sin esto, un /api/visits caído dejaría `visits` en su valor
  // previo (o `[]` inicial) y la tarjeta nueva mostraría un número como si
  // fuera actual — la mentira que la regla del tablero prohíbe.
  const [fetchError, setFetchError] = useState(false)

  // Gana el último PEDIDO, no la última respuesta — ver
  // `lib/filters/use-pedidos-versionados`. Sin esto, con la API lenta, filtrar
  // por "Agendadas" y enseguida por "Realizadas" podía terminar mostrando las
  // visitas de "Agendadas" bajo el rótulo "Realizadas", para siempre.
  const pedidos = usePedidosVersionados()

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setUser(d?.id ? d : null))
      .catch(() => {})
    fetch('/api/profiles?role=asesor')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => setAdvisors(j.data ?? []))
      .catch(() => {})
  }, [])

  // `!!user &&` de entrada evita el parpadeo que ya mordió a CRM: sin él, el
  // desplegable "Asesor" aparecería un instante para un asesor de verdad
  // (mientras `user` todavía es `null`) y desaparecería al resolver el rol.
  const isAdmin = !!user && ['admin', 'dueno', 'coordinador'].includes(user.role)

  useEffect(() => {
    // PRIMERA LÍNEA, antes de cualquier `return` (acá no hay ninguno: a
    // diferencia de Contactos, este listado no depende de la identidad para
    // decidir SI pedir — `onlyMine`/`advisor_id` propio solo afina el pedido
    // una vez que `user` llega, igual que hacía la versión vieja).
    const { gen, signal } = pedidos.abrir()

    const params = new URLSearchParams()
    if (filtros.status) params.set('status', filtros.status)
    if (filtros.advisorId) params.set('advisor_id', filtros.advisorId)
    // A5 (revisión final Fase 2): las DOS puntas se interpretan en hora LOCAL.
    // `new Date('2026-08-05')` (fecha sola) es medianoche UTC por spec, mientras
    // que `new Date('2026-08-05T23:59:59')` (con hora) es local: el "hasta"
    // cerraba bien y el "desde" se corría al día anterior — en UTC-3, un rango
    // de un solo día arrancaba a las 21:00 del día previo y traía visitas de una
    // fecha que nadie pidió. Es el mismo bug que la tarea 8 arregló adentro de
    // `DateRangeFilter.toISO`; de este lado había quedado.
    if (filtros.from) params.set('from', new Date(filtros.from + 'T00:00:00').toISOString())
    if (filtros.to) params.set('to', new Date(filtros.to + 'T23:59:59').toISOString())
    if (filtros.onlyMine === 'true' && user?.id) params.set('advisor_id', user.id)

    setLoading(true)
    setFetchError(false)
    fetch(`/api/visits?${params}`, { signal })
      .then(r => {
        if (!r.ok) throw new Error(`GET /api/visits respondió ${r.status}`)
        return r.json()
      })
      .then(({ data }) => {
        if (!pedidos.vigente(gen)) return
        setVisits(data ?? [])
      })
      .catch(err => {
        if (!pedidos.vigente(gen)) return
        console.error(err)
        setFetchError(true)
      })
      // El spinner del listado va versionado: si lo apagara una respuesta
      // vieja, la pantalla mostraría el listado anterior como si fuera el
      // resultado del filtro nuevo.
      .finally(() => pedidos.siVigente(gen, () => setLoading(false)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, user])

  const cargando = loading || escribiendo
  // Mismos campos que alimentan `extraActivo`/los desplegables de FilterBar
  // — es la forma que esta pantalla ya usa para saber si hay algo que
  // "Limpiar todo". El contexto de la tarjeta tiene que decir la verdad
  // sobre esa misma base.
  const hayFiltros = !!filtros.status || !!filtros.advisorId || !!filtros.from || !!filtros.to || filtros.onlyMine === 'true'

  const opcionesAsesor = [
    { value: '', label: 'Todos los asesores' },
    ...advisors.map(a => ({ value: a.id, label: a.full_name })),
  ]

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Visitas</h1>
        <p className="text-muted-foreground">
          {cargando ? 'Cargando…' : `${visits.length} visita${visits.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Task 16: número de arriba — SOLO el largo del arreglo que esta
          pantalla ya pidió (`visits`). Cero fetch/consulta nueva. En error
          (`fetchError`) se apaga a `null` en vez de mostrar el 0 que deja el
          catch. */}
      <div data-testid="tarjetas-numeros" className="mb-1 max-w-xs">
        <StatTile
          label="Visitas"
          value={fetchError ? null : visits.length}
          context={fetchError ? 'No se pudo consultar' : hayFiltros ? 'con los filtros puestos' : 'en el sistema'}
        />
      </div>

      <FilterBar
        selects={[
          { key: 'status', label: 'Estado', options: OPCIONES_STATUS },
          ...(isAdmin ? [{ key: 'advisorId', label: 'Asesor', options: opcionesAsesor }] : []),
        ]}
        values={mostrado}
        onChange={setFiltro}
        onClear={limpiarTodo}
        extraActivo={!!mostrado.from || !!mostrado.to || mostrado.onlyMine === 'true'}
      >
        <DateRangeFilter
          value={{ from: mostrado.from, to: mostrado.to }}
          onChange={r => aplicarFiltros({ from: r.from, to: r.to })}
        />
        <Button
          type="button"
          variant={mostrado.onlyMine === 'true' ? 'default' : 'outline'}
          onClick={() => aplicarFiltros({ onlyMine: mostrado.onlyMine === 'true' ? '' : 'true' })}
        >
          Solo mías
        </Button>
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

      {cargando
        ? <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
        : <VisitsTable visits={visits} />}
    </div>
  )
}
