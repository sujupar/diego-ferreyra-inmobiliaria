import 'server-only'
/**
 * Lectura de la cartera del CRM y de Contactos (crm-cartera-por-rol, design.md D4 y D6),
 * con SERVICE ROLE: la RLS no frena nada, así que el alcance de cada vista se pone acá, en
 * la consulta (lo grueso), y las reglas puras de `lib/crm/` lo vuelven a aplicar al armar
 * (`procesoEnVista`, `contactoVisible`). Si una de las dos puntas se ensancha por error,
 * igual no sale nada ajeno.
 *
 * Sin lógica de negocio: lee, pasa por las reglas de `lib/crm/` y devuelve datos PLANOS
 * (viajan de un componente de servidor a uno de cliente: nada de funciones).
 *
 * Cliente sin tipar, como lib/consultas/datos.ts: `types/database.types.ts` no conoce
 * `crm_ultimos_contactos` ni `contact_activities`. Cada fila se arma campo por campo: un
 * dato con otra forma tira un error que se ve, no una pantalla con huecos.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { rpcPaginado } from './rpc-paginado'
import {
  TIPOS_TAREA_DE_PROCESO,
  armarFilasCartera,
  type FilaCartera,
  type PerfilCartera,
  type ProcesoLeido,
  type TareaLeida,
} from '@/lib/crm/cartera'
import { procesoEnVista, vistaPara, type MotivoVista, type Vista } from '@/lib/crm/cartera-vista'
import { etapaCRM } from '@/lib/crm/etapas'
import { esUuid } from '@/lib/crm/id-valido'
import { contactoRegistrado, type ContactoRegistrado } from '@/lib/crm/ultimo-contacto'

/**
 * UN solo plazo para todo el servicio (las dos tandas y todas sus páginas). Con un techo
 * por lectura, tres páginas de procesos más la RPC podían sumar 32 s y pasar los ~26 s en
 * que Netlify corta la función, que devuelve una página HTML de error en vez de JSON.
 */
export const PLAZO_LECTURA_MS = 15_000

/** Más filas que esto por fuente no viajan: se avisa `truncado` y la pantalla lo dice. */
export const TOPE_FILAS = 3000

/** La API de Supabase corta cada respuesta en 1000 filas sin avisar. */
const PAGINA = 1000

/** `createTaskForRole` inserta las copias una tras otra: entre hermanas hay milisegundos. */
const MARGEN_COPIAS_MS = 60_000

const COLS_PROCESO =
  'id, stage, scheduled_date, scheduled_time, origin, assigned_to, created_at, property_type, property_type_other, ' +
  'rooms, neighborhood, property_address, tags, captured_at, lost_at, stage_changed_at, contact_id'
const COLS_PROCESO_CON_CONTACTO = `${COLS_PROCESO}, contacto:contact_id(id, full_name, phone, email, created_at)`
const COLS_TAREA =
  'id, type, title, assigned_to, deal_id, contact_id, due_date, due_time, all_day, channel, created_at, source_activity_id, status'
const COLS_CERRADA = 'id, deal_id, type, title, assigned_to, status, created_at, source_activity_id'
const COLS_PERFIL = 'id, full_name, role, is_active'

/** Las etapas que la coordinación puede ver (lo grueso; `procesoEnVista` decide). */
const ETAPAS_BASE_COORDINACION = ['request', 'scheduled', 'not_visited', 'lost']

// ── Tipos de la respuesta ────────────────────────────────────────────────────────────────

export type EstadoFuente = 'ok' | 'error'

export interface AsesorDeLista {
  id: string
  nombre: string
  activo: boolean
}

export interface DatosCartera {
  vista: {
    tipo: Vista['tipo']
    persona: { id: string; nombre: string; rol: string } | null
    /** true = la vista de otra persona ("Ver como"): la pantalla muestra el aviso. */
    mirando: boolean
  }
  filas: FilaCartera[]
  /** Solo si la vista tiene columna Asesor (no en la del asesor). */
  asesores: AsesorDeLista[] | null
  /** Solo para admin y dueño en su propia vista. */
  opcionesVerComo: { id: string; etiqueta: string }[] | null
  fuentes: { ultimoContacto: EstadoFuente; tareas: EstadoFuente }
  truncado: boolean
  generadoEn: string
}

/** Para la prueba real contra producción (`scripts/_qa-cartera-lectura.ts`): no viaja. */
export interface Medicion {
  previaMs: number | null
  tanda1Ms: number
  tanda2Ms: number
  cerradasLeidas: number | null
  cerradasDesde: string | null
}

interface Opciones {
  alMedir?: (m: Medicion) => void
}

// ── Utilidades ───────────────────────────────────────────────────────────────────────────

function sb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan las credenciales de Supabase en el servidor')
  return createClient(url, key)
}

class PlazoVencido extends Error {
  constructor() {
    super(`La lectura del CRM tardó más de ${PLAZO_LECTURA_MS / 1000} segundos`)
  }
}

/**
 * La promesa, o un error en cuanto vence el plazo. La señal también viaja a supabase-js
 * (cancela el pedido), pero no se confía solo en eso: un cliente que la ignore dejaría la
 * función colgada hasta que Netlify la mate.
 */
function conPlazo<T>(p: PromiseLike<T>, senal: AbortSignal): Promise<T> {
  if (senal.aborted) return Promise.reject(new PlazoVencido())
  return new Promise<T>((resolver, rechazar) => {
    const alVencer = () => rechazar(new PlazoVencido())
    senal.addEventListener('abort', alVencer, { once: true })
    Promise.resolve(p).then(
      (v) => {
        senal.removeEventListener('abort', alVencer)
        resolver(v)
      },
      (e: unknown) => {
        senal.removeEventListener('abort', alVencer)
        rechazar(e)
      },
    )
  })
}

type Respuesta = { data: unknown[] | null; error: { message: string } | null }

/**
 * De a 1000 filas con el orden que trae `pedir` (fijo: sin orden, paginar repite o saltea
 * filas), hasta TOPE_FILAS. Si la última página llegó llena se avisa `truncado`: puede que
 * justo sean 3000, pero decir "faltan" de más es mejor que callarlo.
 */
async function paginar(
  contexto: string,
  pedir: (desde: number, hasta: number) => PromiseLike<Respuesta>,
  senal: AbortSignal,
): Promise<{ filas: Record<string, unknown>[]; truncado: boolean }> {
  const filas: Record<string, unknown>[] = []
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await conPlazo(pedir(desde, desde + PAGINA - 1), senal)
    if (error) throw new Error(`${contexto}: ${error.message}`)
    const lote = (data ?? []).filter(esObjeto)
    filas.push(...lote)
    if (lote.length < PAGINA) return { filas, truncado: false }
  }
  return { filas, truncado: true }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function texto(r: Record<string, unknown>, k: string, contexto: string): string {
  const v = r[k]
  if (typeof v !== 'string') throw new Error(`${contexto}: falta "${k}"`)
  return v
}
function textoONulo(r: Record<string, unknown>, k: string): string | null {
  const v = r[k]
  return typeof v === 'string' ? v : null
}
function numeroONulo(r: Record<string, unknown>, k: string): number | null {
  const v = r[k]
  return typeof v === 'number' ? v : null
}

function aProceso(r: Record<string, unknown>): ProcesoLeido {
  const c = r.contacto
  const contacto = esObjeto(c)
    ? {
        id: texto(c, 'id', 'contacto'),
        full_name: textoONulo(c, 'full_name') ?? '',
        phone: textoONulo(c, 'phone'),
        email: textoONulo(c, 'email'),
        created_at: texto(c, 'created_at', 'contacto'),
      }
    : null
  return {
    id: texto(r, 'id', 'proceso'),
    stage: texto(r, 'stage', 'proceso'),
    scheduled_date: textoONulo(r, 'scheduled_date'),
    scheduled_time: textoONulo(r, 'scheduled_time'),
    origin: textoONulo(r, 'origin'),
    assigned_to: textoONulo(r, 'assigned_to'),
    created_at: texto(r, 'created_at', 'proceso'),
    property_type: textoONulo(r, 'property_type'),
    property_type_other: textoONulo(r, 'property_type_other'),
    rooms: numeroONulo(r, 'rooms'),
    neighborhood: textoONulo(r, 'neighborhood'),
    property_address: textoONulo(r, 'property_address'),
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : null,
    captured_at: textoONulo(r, 'captured_at'),
    lost_at: textoONulo(r, 'lost_at'),
    stage_changed_at: textoONulo(r, 'stage_changed_at'),
    contact_id: textoONulo(r, 'contact_id'),
    contacto,
  }
}

function aTarea(r: Record<string, unknown>): TareaLeida {
  return {
    id: texto(r, 'id', 'tarea'),
    type: texto(r, 'type', 'tarea'),
    title: textoONulo(r, 'title') ?? '',
    assigned_to: textoONulo(r, 'assigned_to'),
    deal_id: textoONulo(r, 'deal_id'),
    contact_id: textoONulo(r, 'contact_id'),
    due_date: textoONulo(r, 'due_date'),
    due_time: textoONulo(r, 'due_time'),
    all_day: typeof r.all_day === 'boolean' ? r.all_day : null,
    channel: textoONulo(r, 'channel'),
    created_at: texto(r, 'created_at', 'tarea'),
    source_activity_id: textoONulo(r, 'source_activity_id'),
    status: texto(r, 'status', 'tarea'),
  }
}

function aPerfiles(filas: Record<string, unknown>[]): Map<string, PerfilCartera> {
  const m = new Map<string, PerfilCartera>()
  for (const r of filas) {
    m.set(texto(r, 'id', 'perfil'), {
      nombre: textoONulo(r, 'full_name')?.trim() || 'Sin nombre',
      role: textoONulo(r, 'role') ?? '',
      activo: r.is_active === true,
    })
  }
  return m
}

/** Distintos asesores de las filas, por nombre: el filtro ofrece solo a quien tiene procesos. */
function asesoresDe(filas: { asesor: AsesorDeLista | null }[]): AsesorDeLista[] {
  const m = new Map<string, AsesorDeLista>()
  for (const f of filas) if (f.asesor && !m.has(f.asesor.id)) m.set(f.asesor.id, f.asesor)
  return [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Último contacto por persona, por la RPC paginada (los ids van en el cuerpo, no en la URL). */
async function leerUltimos(
  cliente: SupabaseClient,
  contactos: string[],
  senal: AbortSignal,
): Promise<{ ultimos: Map<string, ContactoRegistrado> | 'error'; truncado: boolean }> {
  if (contactos.length === 0) return { ultimos: new Map(), truncado: false }
  try {
    const r = await conPlazo(
      rpcPaginado<Record<string, unknown>>(cliente, 'crm_ultimos_contactos', { p_contactos: contactos }, ['contacto_id'], {
        senal,
        maxPaginas: TOPE_FILAS / PAGINA,
      }),
      senal,
    )
    if (r.error) throw new Error(r.error)
    const ultimos = new Map<string, ContactoRegistrado>()
    for (const f of r.filas) {
      const id = textoONulo(f, 'contacto_id')
      const c = contactoRegistrado({
        actividad_at: textoONulo(f, 'actividad_at'),
        actividad_tipo: textoONulo(f, 'actividad_tipo'),
        actividad_resultado: textoONulo(f, 'actividad_resultado'),
        visita_at: textoONulo(f, 'visita_at'),
      })
      if (id && c) ultimos.set(id, c)
    }
    return { ultimos, truncado: r.truncado }
  } catch (e) {
    console.error('[crm] último contacto:', e)
    return { ultimos: 'error', truncado: false }
  }
}

/**
 * Lectura (d): las copias de coordinación completadas o descartadas, para no mostrar como
 * pendiente una copia de una tarea que otra coordinadora ya hizo. Desde la copia pendiente
 * MÁS VIEJA menos 60 s (no "los últimos 90 días": una copia que nadie completa puede tener
 * meses; y sin el margen quedaría afuera la hermana creada milisegundos antes en el mismo
 * bucle de `createTaskForRole`). Sin copias pendientes no hay nada que anular: no se lee.
 */
async function leerCerradas(
  cliente: SupabaseClient,
  pendientes: TareaLeida[],
  perfiles: Map<string, PerfilCartera>,
  senal: AbortSignal,
): Promise<{ cerradas: TareaLeida[]; truncado: boolean; desde: string | null }> {
  const coordinadores = [...perfiles.entries()].filter(([, p]) => p.role === 'coordinador').map(([id]) => id)
  const copias = pendientes.filter((t) => !!t.assigned_to && coordinadores.includes(t.assigned_to) && !t.source_activity_id)
  if (copias.length === 0) return { cerradas: [], truncado: false, desde: null }
  const masVieja = Math.min(...copias.map((t) => Date.parse(t.created_at)))
  const desde = new Date(masVieja - MARGEN_COPIAS_MS).toISOString()
  const r = await paginar(
    'tareas cerradas de la coordinación',
    (a, b) =>
      cliente
        .from('tasks')
        .select(COLS_CERRADA)
        .in('status', ['completed', 'dismissed'])
        .in('type', [...TIPOS_TAREA_DE_PROCESO])
        .in('assigned_to', coordinadores)
        .is('source_activity_id', null)
        .gte('created_at', desde)
        .order('id')
        .range(a, b)
        .abortSignal(senal),
    senal,
  )
  const cerradas = r.filas.map((f) =>
    aTarea({ due_date: null, due_time: null, all_day: null, channel: null, contact_id: null, ...f }),
  )
  return { cerradas, truncado: r.truncado, desde }
}

/** Tareas pendientes de los tipos del proceso; ante un error, `'error'` (nunca un vacío). */
async function leerPendientes(
  pedir: (desde: number, hasta: number) => PromiseLike<Respuesta>,
  senal: AbortSignal,
): Promise<{ tareas: TareaLeida[] | 'error'; truncado: boolean }> {
  try {
    const r = await paginar('tareas pendientes', pedir, senal)
    return { tareas: r.filas.map(aTarea), truncado: r.truncado }
  } catch (e) {
    console.error('[crm] tareas pendientes:', e)
    return { tareas: 'error', truncado: false }
  }
}

function conPlazoUnico<T>(trabajo: (senal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController()
  const reloj = setTimeout(() => ctrl.abort(), PLAZO_LECTURA_MS)
  return trabajo(ctrl.signal).finally(() => clearTimeout(reloj))
}

// ── La cartera ───────────────────────────────────────────────────────────────────────────

/**
 * La cartera de quien pide, o la de la persona elegida en "Ver como". Devuelve el motivo si
 * no corresponde (la ruta lo vuelve 403/400) ANTES de leer un solo proceso. Lanza si falla
 * la lectura de procesos o de perfiles (sin eso no hay lista); si fallan las tareas, la
 * lectura (d) o la RPC, las filas salen igual con `'error'` y `fuentes` lo dice.
 */
export async function cargarCartera(
  pedido: { quien: { id: string; role: string }; verComo: string | null },
  ahora: Date,
  opciones: Opciones = {},
): Promise<{ ok: true; datos: DatosCartera } | { ok: false; motivo: MotivoVista }> {
  const { quien, verComo } = pedido
  // Primero sin leer nada: un rol sin vista, o un asesor que pide "Ver como", no gastan
  // una lectura ni se les confirma si la otra persona existe.
  const previa = vistaPara(quien, verComo, [])
  if (!previa.ok && previa.motivo !== 'persona_invalida') return previa
  if (verComo && !esUuid(verComo)) return { ok: false, motivo: 'persona_invalida' }

  const cliente = sb()
  return conPlazoUnico(async (senal) => {
    let previaMs: number | null = null
    let vista: Vista
    let mirando = false
    if (verComo) {
      const t0 = Date.now()
      const { data, error } = await conPlazo(
        cliente.from('profiles').select('id, role, is_active, full_name').eq('id', verComo).abortSignal(senal),
        senal,
      )
      if (error) throw new Error(`perfil de "Ver como": ${error.message}`)
      previaMs = Date.now() - t0
      const elegido = (data ?? []).filter(esObjeto).map((r) => ({
        id: texto(r, 'id', 'perfil'),
        role: textoONulo(r, 'role') ?? '',
        is_active: typeof r.is_active === 'boolean' ? r.is_active : null,
      }))
      const r = vistaPara(quien, verComo, elegido)
      if (!r.ok) return r
      vista = r.vista
      mirando = r.mirando !== null
    } else {
      if (!previa.ok) return previa
      vista = previa.vista
    }
    const personaId = vista.tipo === 'dueno' ? null : vista.personaId

    // Tanda 1, en paralelo: procesos del alcance, tareas pendientes y perfiles.
    const t1 = Date.now()
    const [procesosLeidos, pendientes, perfilesLeidos] = await Promise.all([
      paginar(
        'deals',
        (a, b) => {
          let q = cliente.from('deals').select(COLS_PROCESO_CON_CONTACTO)
          if (vista.tipo === 'coordinacion') q = q.in('stage', ETAPAS_BASE_COORDINACION)
          if (vista.tipo === 'asesor') q = q.eq('assigned_to', vista.personaId)
          return q.order('created_at', { ascending: false }).order('id').range(a, b).abortSignal(senal)
        },
        senal,
      ),
      leerPendientes((a, b) => {
        let q = cliente
          .from('tasks')
          .select(COLS_TAREA)
          .eq('status', 'pending')
          .in('type', [...TIPOS_TAREA_DE_PROCESO])
          .not('deal_id', 'is', null)
        if (personaId) q = q.eq('assigned_to', personaId)
        return q.order('id').range(a, b).abortSignal(senal)
      }, senal),
      paginar('profiles', (a, b) => cliente.from('profiles').select(COLS_PERFIL).order('id').range(a, b).abortSignal(senal), senal),
    ])
    const tanda1Ms = Date.now() - t1
    const perfiles = aPerfiles(perfilesLeidos.filas)
    // procesoEnVista otra vez ANTES de la tanda 2: la RPC no se pide por personas ajenas.
    const procesos = procesosLeidos.filas
      .map(aProceso)
      .filter((p) => procesoEnVista({ etapa: etapaCRM(p), origin: p.origin, assigned_to: p.assigned_to }, vista))

    // Tanda 2, en paralelo: el último contacto de las personas de la vista y la lectura (d).
    const t2 = Date.now()
    const idsContactos = [...new Set(procesos.flatMap((p) => (p.contacto ? [p.contacto.id] : [])))]
    const [ultimos, cerradas] = await Promise.all([
      leerUltimos(cliente, idsContactos, senal),
      pendientes.tareas === 'error'
        ? Promise.resolve(null)
        : leerCerradas(cliente, pendientes.tareas, perfiles, senal).catch((e: unknown) => {
            console.error('[crm] tareas cerradas de la coordinación:', e)
            return 'error' as const
          }),
    ])
    const tanda2Ms = Date.now() - t2

    // Sin (d), una copia ya hecha se mostraría como pendiente: su falla es falla de tareas.
    const tareas: TareaLeida[] | 'error' = pendientes.tareas === 'error' || cerradas === 'error' ? 'error' : pendientes.tareas
    const tareasCerradas = cerradas && cerradas !== 'error' ? cerradas.cerradas : []

    const filas = armarFilasCartera({ vista, procesos, tareas, tareasCerradas, ultimos: ultimos.ultimos, perfiles, ahora })

    const verComoPermitido = (quien.role === 'admin' || quien.role === 'dueno') && !mirando
    const opcionesVerComo = verComoPermitido
      ? [...perfiles.entries()]
          .filter(([, p]) => p.activo && (p.role === 'coordinador' || p.role === 'asesor'))
          .sort(([, a], [, b]) => a.nombre.localeCompare(b.nombre, 'es'))
          .map(([id, p]) => ({ id, etiqueta: `${p.nombre} · ${p.role === 'coordinador' ? 'coordinación' : 'asesor'}` }))
      : null

    opciones.alMedir?.({
      previaMs,
      tanda1Ms,
      tanda2Ms,
      cerradasLeidas: cerradas && cerradas !== 'error' && cerradas.desde ? cerradas.cerradas.length : null,
      cerradasDesde: cerradas && cerradas !== 'error' ? cerradas.desde : null,
    })

    const datos: DatosCartera = {
      vista: {
        tipo: vista.tipo,
        persona: personaId
          ? { id: personaId, nombre: perfiles.get(personaId)?.nombre ?? 'Sin nombre', rol: perfiles.get(personaId)?.role ?? '' }
          : null,
        mirando,
      },
      filas,
      asesores: vista.tipo === 'asesor' ? null : asesoresDe(filas),
      opcionesVerComo,
      fuentes: { ultimoContacto: ultimos.ultimos === 'error' ? 'error' : 'ok', tareas: tareas === 'error' ? 'error' : 'ok' },
      truncado:
        procesosLeidos.truncado ||
        pendientes.truncado ||
        perfilesLeidos.truncado ||
        ultimos.truncado ||
        (!!cerradas && cerradas !== 'error' && cerradas.truncado),
      generadoEn: ahora.toISOString(),
    }
    return { ok: true, datos }
  })
}
