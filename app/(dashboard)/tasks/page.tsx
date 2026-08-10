'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2, CheckCircle, X, User, FileCheck, Home, Scale,
  AlertTriangle, ChevronRight, Bell, MessageSquare, Phone, Mail, Calendar, Clock,
  MapPin, FileText, Plus
} from 'lucide-react'
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog'
import { UnidentifiedBanner } from '@/components/inbox/UnidentifiedBanner'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; label: string; urgent?: boolean }> = {
  update_contact: { icon: User, color: 'bg-amber-100 text-amber-800', label: 'Actualizar Contacto' },
  new_assignment: { icon: FileCheck, color: 'bg-[color:var(--brand)] text-white', label: 'Tasación Coordinada', urgent: true },
  review_property: { icon: Scale, color: 'bg-purple-100 text-purple-800', label: 'Revisión Legal' },
  rejected_docs: { icon: AlertTriangle, color: 'bg-red-100 text-red-800', label: 'Docs Rechazados' },
  follow_up: { icon: MessageSquare, color: 'bg-orange-100 text-orange-800', label: 'Seguimiento' },
  complete_imported_property: { icon: Home, color: 'bg-blue-100 text-blue-800', label: 'Completar Propiedad' },
}

const CHANNEL_CONFIG: Record<string, { icon: typeof Phone; label: string }> = {
  call: { icon: Phone, label: 'Llamada' },
  email: { icon: Mail, label: 'Correo' },
  message: { icon: MessageSquare, label: 'Mensaje' },
  visit: { icon: MapPin, label: 'Visita' },
  document: { icon: FileText, label: 'Documentación' },
  other: { icon: Bell, label: 'Otro' },
}

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completada',
  dismissed: 'Descartada',
}

/**
 * D12 — "Todas" mandaba `/api/tasks` SIN `status`, y del otro lado
 * `getMyTasks` (`lib/supabase/tasks.ts:123`) hace `status ?? 'pending'`: la
 * ausencia del parámetro significa "pendientes", no "todos". O sea que el
 * botón corría la consulta IDÉNTICA a "Pendientes" y las tareas descartadas
 * no eran alcanzables desde ningún filtro de la pantalla.
 *
 * El arreglo de una línea vive del lado del servidor (que `status=all`
 * signifique "no filtrar"), pero `lib/supabase/tasks.ts` y `app/api/tasks`
 * son de otro grupo en esta tanda. Acá se resuelve pidiendo los tres estados
 * por su nombre —que la ruta SÍ sabe atender— y uniendo los lotes.
 */
const ESTADOS_DE_TODAS = ['pending', 'completed', 'dismissed'] as const

/**
 * D13 — `getMyTasks` cierra con `.limit(50)` y la ruta no devuelve ningún
 * total, así que la pantalla no puede saber cuántas tareas hay realmente:
 * lo único observable es que un lote volvió LLENO, y eso significa "hay al
 * menos una más que no estás viendo".
 *
 * Es el mismo número que `TOPE_PENDIENTES` en `app/(dashboard)/inicio/page.tsx`
 * y sale del mismo `.limit(50)`: si ese techo cambia, los dos tienen que
 * cambiar con él. El arreglo bueno (un `count: 'exact'` en la ruta + "cargar
 * más") necesita esos archivos de servidor.
 */
const TOPE_POR_ESTADO = 50

interface Task {
  id: string
  type: string
  title: string
  description: string | null
  deal_id: string | null
  appraisal_id: string | null
  property_id: string | null
  contact_id: string | null
  status: string
  created_at: string
  due_date: string | null
  due_time: string | null
  all_day: boolean | null
  channel: 'call' | 'email' | 'message' | 'visit' | 'document' | 'other' | null
}

/**
 * "01/08/26, 12:00" — la misma forma corta que usa la agenda (`VisitsTable`).
 *
 * `toLocaleString('es-AR')` a secas imprime "1/8/2026, 12:00:00": los SEGUNDOS
 * no le sirven a nadie y en un teléfono cada carácter que sobra le come ancho
 * al dato que sigue. Va en DOS llamadas a propósito: pidiendo fecha y hora
 * juntas, es-AR ignora el `2-digit` del día y del mes; y `hour:'2-digit'` sin
 * `hourCycle` devuelve "12:00 p. m.", reloj de 12 horas que acá no se usa.
 */
function fechaHoraCorta(d: string): string {
  const cuando = new Date(d)
  const dia = cuando.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const hora = cuando.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return `${dia}, ${hora}`
}

function getTaskLink(task: Task): string {
  // Para tareas de "actualizar contacto", abrimos directamente el editor
  // en la superficie más útil (deal > appraisal > contact directo).
  // El query param dispara el modal en la página destino.
  if (task.type === 'update_contact') {
    if (task.deal_id) return `/pipeline/${task.deal_id}?editContact=1`
    if (task.appraisal_id) return `/appraisals/${task.appraisal_id}?editContact=1`
    if (task.contact_id) return `/contacts/${task.contact_id}?edit=1`
    return '#'
  }
  if (task.deal_id) return `/pipeline/${task.deal_id}`
  if (task.property_id) return `/properties/${task.property_id}`
  if (task.appraisal_id) return `/appraisals/${task.appraisal_id}`
  if (task.contact_id) return `/contacts/${task.contact_id}`
  return '#'
}

/** Sort: urgentes (new_assignment) → atrasadas → hoy → sin fecha → futuras */
function ordenarTareas(tareas: Task[]): Task[] {
  const today = new Date().toISOString().slice(0, 10)
  const priorityOf = (t: Task): number => {
    if (t.type === 'new_assignment') return 0
    if (!t.due_date) return 3
    if (t.due_date < today) return 1
    if (t.due_date === today) return 2
    return 4
  }
  return tareas.slice().sort((a, b) => {
    const pa = priorityOf(a), pb = priorityOf(b)
    if (pa !== pb) return pa - pb
    // Dentro del mismo bucket, ordenar por due_date ASC luego por hora
    if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1
    if (a.due_time && b.due_time && a.due_time !== b.due_time) return a.due_time < b.due_time ? -1 : 1
    return 0
  })
}

/** Error con el código HTTP adentro: la pantalla trata el 401 distinto del resto. */
class ErrorHttp extends Error {
  readonly status: number
  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

async function pedirTareas(userId: string, status: string): Promise<Task[]> {
  // D11 — sin `res.ok` un 500 de Supabase (la ruta responde JSON `{error}`)
  // resolvía normalmente, el destructuring daba `undefined` y `setTasks([])`
  // escribía un vacío EXPLÍCITO que la pantalla pintaba como "Todo al día".
  const res = await fetch(`/api/tasks?user_id=${encodeURIComponent(userId)}&status=${status}`)
  if (!res.ok) throw new ErrorHttp(res.status, `GET /api/tasks?status=${status} respondió ${res.status}`)
  const cuerpo: unknown = await res.json()
  const data = (cuerpo as { data?: unknown } | null)?.data
  return Array.isArray(data) ? (data as Task[]) : []
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'completed' | 'all'>('pending')
  const [userInfo, setUserInfo] = useState<{ id: string } | null>(null)
  const [cargandoIdentidad, setCargandoIdentidad] = useState(true)
  // Tres estados distinguibles: cargando / falló (con motivo y salida) / vacío
  // de verdad. `null` es "no falló nada", NO "no hay nada".
  const [loadError, setLoadError] = useState<null | 'identidad' | 'listado'>(null)
  const [estadoHttp, setEstadoHttp] = useState<number | null>(null)
  const [truncado, setTruncado] = useState(false)
  const [reintentos, setReintentos] = useState(0)
  const [completing, setCompleting] = useState<string | null>(null)
  const [overdueVisits, setOverdueVisits] = useState<PropertyVisitWithRelations[]>([])
  // Con "Todas" salen tres pedidos en paralelo: si el usuario cambia de filtro
  // mientras vuelan, la respuesta vieja no puede pisar la nueva.
  const generacion = useRef(0)

  // D35 — `/api/auth/me` responde JSON también en 401/404/500, así que sin
  // chequear `r.ok` (y sin exigir un `id` real) `userInfo` quedaba en
  // `{error:'unauthorized'}`: `loadTasks` hacía `return` ANTES de tocar
  // `loading`, que arranca en `true`, y el spinner giraba para siempre sin
  // mensaje ni salida. Mismo gate que `/inicio` y `/properties`.
  useEffect(() => {
    let cancelado = false
    setCargandoIdentidad(true)
    fetch('/api/auth/me')
      .then(r => {
        if (!r.ok) throw new ErrorHttp(r.status, `GET /api/auth/me respondió ${r.status}`)
        return r.json()
      })
      .then((perfil: { id?: unknown } | null) => {
        if (!perfil || typeof perfil.id !== 'string' || !perfil.id) {
          throw new Error('GET /api/auth/me no devolvió una identidad completa')
        }
        if (cancelado) return
        setUserInfo({ id: perfil.id })
      })
      .catch(err => {
        console.error(err)
        if (cancelado) return
        setUserInfo(null)
        setLoadError('identidad')
        setEstadoHttp(err instanceof ErrorHttp ? err.status : null)
      })
      .finally(() => { if (!cancelado) setCargandoIdentidad(false) })
    return () => { cancelado = true }
  }, [reintentos])

  useEffect(() => {
    if (!userInfo?.id) return
    let cancelado = false
    fetch(`/api/visits?advisor_id=${userInfo.id}&status=scheduled&to=${encodeURIComponent(new Date().toISOString())}`)
      .then(r => {
        // El cartel es informativo y no afirma lo contrario cuando falla (si no
        // hay dato, no se dibuja), pero igual no queremos que un cuerpo de error
        // pase por "lista de visitas".
        if (!r.ok) throw new Error(`GET /api/visits respondió ${r.status}`)
        return r.json()
      })
      .then(({ data }) => { if (!cancelado) setOverdueVisits(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelado) setOverdueVisits([]) })
    return () => { cancelado = true }
  }, [userInfo])

  const loadTasks = useCallback(() => {
    const userId = userInfo?.id
    if (!userId) return
    const gen = ++generacion.current
    setLoading(true)
    setLoadError(null)
    setEstadoHttp(null)

    const estados: string[] = filter === 'all' ? [...ESTADOS_DE_TODAS] : [filter]
    Promise.all(estados.map(estado => pedirTareas(userId, estado)))
      .then(lotes => {
        if (gen !== generacion.current) return
        // El techo es POR consulta: un lote que vuelve lleno significa que hay
        // más de las que se pueden mostrar.
        setTruncado(lotes.some(lote => lote.length >= TOPE_POR_ESTADO))
        setTasks(ordenarTareas(lotes.flat()))
      })
      .catch(err => {
        if (gen !== generacion.current) return
        console.error(err)
        // Nada de vaciar en silencio: la pantalla pasa a decir que NO pudo traerlas.
        setTasks([])
        setTruncado(false)
        setLoadError('listado')
        setEstadoHttp(err instanceof ErrorHttp ? err.status : null)
      })
      .finally(() => { if (gen === generacion.current) setLoading(false) })
    // `reintentos` no se LEE acá, y por eso el linter lo marca de más: está
    // para que "Reintentar" vuelva a pedir aunque no hayan cambiado ni el
    // usuario ni el filtro. Sin él, el botón dependería de que el efecto de
    // identidad devuelva un objeto nuevo cada vez — cierto hoy, y una trampa
    // el día que alguien lo memoice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInfo, filter, reintentos])

  useEffect(() => { loadTasks() }, [loadTasks])

  function reintentar() {
    setLoadError(null)
    setEstadoHttp(null)
    setLoading(true)
    setReintentos(n => n + 1)
  }

  async function handleAction(taskId: string, action: 'complete' | 'dismiss') {
    setCompleting(taskId)
    try {
      // D14 — sin `res.ok`, un 401 (sesión vencida) o un 500 resolvían la
      // promesa y la fila se sacaba igual: el usuario "vaciaba" su bandeja sin
      // que se guardara nada. La fila SOLO se saca si el servidor confirmó.
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null) as { error?: unknown } | null
        toast.error(
          res.status === 401
            ? 'Se venció tu sesión: el cambio no se guardó. Volvé a entrar.'
            : typeof cuerpo?.error === 'string' && cuerpo.error
              ? `No se pudo guardar: ${cuerpo.error}`
              : `No se pudo guardar el cambio (error ${res.status}).`
        )
        return
      }
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch (e) {
      toast.error(e instanceof Error ? `No se pudo guardar el cambio: ${e.message}` : 'No se pudo guardar el cambio.')
    }
    finally { setCompleting(null) }
  }

  const cargando = cargandoIdentidad || loading

  // El encabezado no puede afirmar "0 tareas" cuando lo que pasó es que no se
  // pudieron traer, ni "N tareas" cuando N es un recorte del servidor.
  const resumen = loadError
    ? 'No se pudo consultar'
    : cargando
      ? 'Cargando…'
      : `${tasks.length} tarea${tasks.length !== 1 ? 's' : ''}${filter === 'pending' ? ` pendiente${tasks.length !== 1 ? 's' : ''}` : ''}` +
        (truncado
          ? ` · las primeras ${TOPE_POR_ESTADO}${filter === 'all' ? ' por estado' : ''} — puede haber más`
          : '')

  return (
    <div className="space-y-8">
      <UnidentifiedBanner />

      {overdueVisits.length > 0 && (
        <Card className="border-orange-500 border-2 mb-4">
          <CardContent className="pt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-orange-700">
                Visitas pendientes de marcar ({overdueVisits.length})
              </h3>
              {/* 44px de alto en celular sin dejar de ser un enlace de texto. */}
              <Link href="/visits" className="inline-flex items-center text-sm text-primary underline max-md:min-h-11">
                Ver todas
              </Link>
            </div>
            <ul className="space-y-2 max-md:space-y-0 max-md:divide-y">
              {overdueVisits.map(v => (
                <li key={v.id} className="text-sm">
                  {/* En celular cada visita atrasada es una fila tocable de 44px
                      —el asesor las marca de a una, en la calle— y la dirección
                      va en su propio renglón: pegada al cliente y a la fecha con
                      puntos medios, a 358px quedaba una sopa de tres datos. */}
                  <Link
                    href={`/visits/${v.id}`}
                    className="block hover:underline max-md:flex max-md:min-h-11 max-md:flex-col max-md:justify-center max-md:py-2"
                  >
                    <span className="font-medium break-words">{v.property?.address ?? '-'}</span>
                    <span className="text-muted-foreground max-md:block max-md:text-xs">
                      <span className="max-md:hidden"> · </span>
                      {v.client_name} · {fechaHoraCorta(v.scheduled_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <p className="eyebrow">Hoy · Bandeja</p>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h1 className="display text-4xl max-md:text-3xl">Pendientes</h1>
          {/* `flex-wrap` + `min-w-0`: el resumen puede decir "50 tareas
              pendientes · las primeras 50 por estado — puede haber más" y sin
              esto empujaba al botón "Nueva tarea" fuera de la tarjeta. */}
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground tabular-n">{resumen}</p>
            <AddTaskDialog
              onCreated={loadTasks}
              trigger={<Button size="sm"><Plus className="h-4 w-4 mr-1" /> Nueva tarea</Button>}
            />
          </div>
        </div>
      </div>

      {/* A 320px los tres filtros piden ~305px y el contenido útil son 288: sin
          `flex-wrap` el tercero se cortaba contra el borde. */}
      <div className="flex flex-wrap gap-2">
        <Button variant={filter === 'pending' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('pending')}>Pendientes</Button>
        <Button variant={filter === 'completed' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('completed')}>Completadas</Button>
        <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>Todas</Button>
      </div>

      {/* El orden manda: el error se muestra ANTES que el spinner. Si la
          identidad no resuelve, `loading` se queda en `true` para siempre
          (`loadTasks` hace `return` antes de tocarlo) — y esta rama es lo único
          que evita el spinner eterno de D35. */}
      {loadError ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
            <h3 className="display text-2xl">
              {loadError === 'identidad' ? 'No pudimos confirmar quién sos' : 'No se pudieron traer tus tareas'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {estadoHttp === 401
                ? 'Se venció tu sesión. Volvé a entrar para ver tus pendientes.'
                : loadError === 'identidad'
                  ? 'Esta bandeja es la tuya, y no se pudo averiguar quién sos. No mostramos tareas sin saberlo.'
                  : 'Puede ser un problema de conexión o del servidor. Esto NO quiere decir que no tengas tareas.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" onClick={reintentar}>Reintentar</Button>
              {estadoHttp === 401 && (
                <Link href="/login"><Button size="sm" variant="outline">Volver a entrar</Button></Link>
              )}
            </div>
          </CardContent>
        </Card>
      ) : cargando ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <CheckCircle className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="display text-2xl">Todo al día</h3>
            <p className="text-sm text-muted-foreground">
              {filter === 'completed'
                ? 'Todavía no completaste ninguna tarea.'
                : filter === 'all'
                  ? 'No hay tareas registradas.'
                  : 'No hay tareas pendientes.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const config = TYPE_CONFIG[task.type] || { icon: Bell, color: 'bg-gray-100 text-gray-800', label: task.type }
            const Icon = config.icon
            const link = getTaskLink(task)

            return (
              <Card
                key={task.id}
                className={`transition-all ${config.urgent
                  ? 'border-[color:var(--brand)]/40 shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--brand)_30%,transparent)] bg-[color:var(--brand-soft)]/30 hover:shadow-md'
                  : 'hover:bg-muted/30'}`}
              >
                {/*
                  En celular la fila se APILA: el bloque de texto arriba a ancho
                  completo, las acciones abajo en su propio renglón.

                  Antes era una sola fila `flex items-center` que nunca se
                  partía: a 390px quedaban ~310px adentro de la tarjeta y se los
                  repartían el ícono (40px), dos gaps (32px) y los tres botones
                  (~130px) — al título de la tarea le sobraban ~110px, o sea
                  cuatro o cinco renglones de dos palabras, y la descripción
                  truncada se leía "Se ne…". La bandeja del día era una columna
                  de palabras sueltas.

                  El ícono y el texto van en un envoltorio propio para que en
                  escritorio el resultado sea EXACTAMENTE el de antes (mismo
                  gap-4 entre ícono, texto y acciones) y en celular solo se
                  parta por la juntura de arriba.
                */}
                <CardContent className="flex items-center gap-4 py-3 max-md:flex-col max-md:items-stretch max-md:gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                  <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${config.color} ${config.urgent ? 'ring-1 ring-inset ring-white/30' : ''}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`font-medium ${config.urgent ? 'text-foreground' : ''}`}>{task.title}</span>
                      <span className="eyebrow">{config.label}</span>
                      {/* Con "Todas" conviven los tres estados: sin esto no se
                          distingue una tarea viva de una ya cerrada. */}
                      {task.status !== 'pending' && (
                        <Badge variant="outline" className="text-[10px] font-medium">
                          {STATUS_LABEL[task.status] ?? task.status}
                        </Badge>
                      )}
                      {task.channel && CHANNEL_CONFIG[task.channel] && (() => {
                        const ChIcon = CHANNEL_CONFIG[task.channel].icon
                        return (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50 text-orange-800 text-[10px] font-medium">
                            <ChIcon className="h-3 w-3" />
                            {CHANNEL_CONFIG[task.channel].label}
                          </span>
                        )
                      })()}
                      {config.urgent && (
                        <span className="eyebrow text-[color:var(--brand)] border-l border-[color:var(--brand)]/30 pl-2">
                          Acción Requerida
                        </span>
                      )}
                    </div>
                    {/* Con la fila apilada el texto tiene el ancho entero, así
                        que en celular en vez de recortar a una línea se muestran
                        dos: `truncate` fija `white-space:nowrap`, por eso hace
                        falta también soltarlo. */}
                    {task.description && (
                      <p className="text-sm text-muted-foreground max-md:whitespace-normal max-md:line-clamp-2 md:truncate">
                        {task.description}
                      </p>
                    )}
                    <div className="row-meta mt-0.5 text-[11px] text-muted-foreground tabular-n">
                      {task.due_date && (() => {
                        const today = new Date().toISOString().slice(0, 10)
                        const isOverdue = task.due_date < today
                        const isToday = task.due_date === today
                        const dateLabel = new Date(task.due_date + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
                        return (
                          <span className={`inline-flex items-center gap-1 ${isOverdue ? 'text-red-700 font-medium' : isToday ? 'text-orange-700 font-medium' : ''}`}>
                            <Calendar className="h-3 w-3" />
                            {isToday ? 'Hoy' : isOverdue ? `Vencida (${dateLabel})` : dateLabel}
                            {!task.all_day && task.due_time && (
                              <>
                                <Clock className="h-3 w-3 ml-1" />
                                {task.due_time.slice(0, 5)}
                              </>
                            )}
                          </span>
                        )
                      })()}
                      {!task.due_date && <span>{fechaHoraCorta(task.created_at)}</span>}
                    </div>
                  </div>
                  </div>
                  {/*
                    Completar y descartar son acciones OPUESTAS y hasta acá eran
                    dos cuadraditos de 32px, solo ícono, separados por 8px: por
                    debajo del mínimo táctil y sin nada que los distinga salvo el
                    dibujo. Tocar mal descartaba una tarea en vez de completarla.

                    En celular pasan a tener ETIQUETA visible y 44px de alto, y
                    se reparten el ancho de la tarjeta (la flecha de "Abrir"
                    queda fija a un costado, que es la acción que no destruye
                    nada). El `aria-label` se queda en los tres casos: en
                    escritorio siguen siendo solo íconos.
                  */}
                  <div className="flex items-center gap-2 max-md:w-full">
                    {task.status === 'pending' && (
                      <>
                        <Button size="sm" variant="outline" aria-label="Completar tarea" className="max-md:h-11 max-md:flex-1" onClick={() => handleAction(task.id, 'complete')} disabled={completing === task.id}>
                          {completing === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          <span className="md:hidden">Listo</span>
                        </Button>
                        <Button size="sm" variant="ghost" aria-label="Descartar tarea" className="max-md:h-11 max-md:flex-1" onClick={() => handleAction(task.id, 'dismiss')} disabled={completing === task.id}>
                          <X className="h-3.5 w-3.5" />
                          <span className="md:hidden">Descartar</span>
                        </Button>
                      </>
                    )}
                    {link !== '#' && (
                      <Link href={link} aria-label={`Abrir ${task.title}`} className="shrink-0">
                        <Button
                          size="sm"
                          tabIndex={-1}
                          className={`max-md:h-11 max-md:w-11 ${config.urgent ? 'bg-[color:var(--brand)] text-white hover:bg-[color:var(--brand)]/90' : ''}`}
                          variant={config.urgent ? 'default' : 'ghost'}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
