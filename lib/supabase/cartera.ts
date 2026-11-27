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
import { opcionesVerComo as opcionesVerComoDe, procesoEnVista, vistaPara, type MotivoVista, type Vista } from '@/lib/crm/cartera-vista'
import {
  armarFilasContactos,
  contactoVisible,
  type ContactoLeido,
  type FilaContacto,
  type TasacionDeContacto,
} from '@/lib/crm/contactos-cartera'
import { alcanceContactos } from '@/lib/auth/contact-access'
import { etapaCRM } from '@/lib/crm/etapas'
import { esUuid } from '@/lib/crm/id-valido'
import { contactoRegistrado, type ContactoRegistrado } from '@/lib/crm/ultimo-contacto'

/**
 * UN solo plazo para todo el servicio (las dos tandas y todas sus páginas). Con un techo
 * por lectura, tres páginas de procesos más la RPC podían sumar 32 s y pasar los ~26 s en
 * que Netlify corta la función, que devuelve una página HTML de error en vez de JSON.
 */
export const PLAZO_LECTURA_MS = 15_000

/** El último contacto: un corte de la RPC por tope cuenta como error, con su línea en el log (H5). */
function ultimoContactoOError(u: { ultimos: Map<string, ContactoRegistrado> | 'error'; truncado: boolean }): Map<string, ContactoRegistrado> | 'error' {
  if (!u.truncado) return u.ultimos
  console.warn(`[crm] tope de ${TOPE_FILAS} filas en el último contacto: se muestra como error`)
  return 'error'
}

/**
 * Las tareas para armar las filas: 'error' si la lectura de pendientes o la (d) fallaron o
 * quedaron cortadas por el tope (con un corte, qué tarea falta es al azar).
 */
export function tareasOError(
  pendientes: { tareas: TareaLeida[] | 'error'; truncado: boolean },
  cerradas: { truncado: boolean } | 'error' | null,
): TareaLeida[] | 'error' {
  if (pendientes.tareas === 'error') return 'error'
  // Un corte por tope no se arregla con "Reintentar": que quede en el log (auditoría, H5).
  if (pendientes.truncado) {
    console.warn(`[crm] tope de ${TOPE_FILAS} filas en las tareas pendientes: se muestran como error`)
    return 'error'
  }
  if (cerradas === 'error') return 'error'
  if (cerradas && cerradas.truncado) {
    console.warn(`[crm] tope de ${TOPE_FILAS} filas en las tareas cerradas de coordinación (d): se muestran como error`)
    return 'error'
  }
  return pendientes.tareas
}

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
const COLS_CONTACTO = 'id, full_name, phone, email, origin, assigned_to, created_by, created_at'
/** Solo esto de `appraisals`: un `select('*')` ancho tumbó la base el 2026-10-10 (fotos en base64). */
export const COLS_TASACION_DE_CONTACTO = 'contact_id, assigned_to, user_id'

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

export interface DatosContactos {
  filas: FilaContacto[]
  /** Solo para el equipo (el asesor no tiene columna Asesor). */
  asesores: AsesorDeLista[] | null
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

function aContacto(r: Record<string, unknown>): ContactoLeido {
  return {
    id: texto(r, 'id', 'contacto'),
    full_name: textoONulo(r, 'full_name') ?? '',
    phone: textoONulo(r, 'phone'),
    email: textoONulo(r, 'email'),
    origin: textoONulo(r, 'origin'),
    assigned_to: textoONulo(r, 'assigned_to'),
    created_by: textoONulo(r, 'created_by'),
    created_at: texto(r, 'created_at', 'contacto'),
  }
}

function aTasacion(r: Record<string, unknown>): TasacionDeContacto {
  return { contact_id: texto(r, 'contact_id', 'tasación'), assigned_to: textoONulo(r, 'assigned_to'), user_id: textoONulo(r, 'user_id') }
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
      // (d) solo sirve para juntar copias de distintas coordinadoras, y eso pasa solo en la
      // vista del dueño (`deCualquiera`); en las demás cada una ve las suyas (auditoría, B1).
      pendientes.tareas === 'error' || vista.tipo !== 'dueno'
        ? Promise.resolve(null)
        : leerCerradas(cliente, pendientes.tareas, perfiles, senal).catch((e: unknown) => {
            console.error('[crm] tareas cerradas de la coordinación:', e)
            return 'error' as const
          }),
    ])
    const tanda2Ms = Date.now() - t2

    // Sin (d), una copia ya hecha se mostraría como pendiente: su falla es falla de tareas.
    // Y una lectura de tareas o de (d) cortada por el tope deja afuera filas al azar (orden por
    // id): una fila diría "Nada agendado" sin saberlo. Cortada = no se sabe = error (auditoría, M2).
    const tareas = tareasOError(pendientes, cerradas)
    const tareasCerradas = cerradas && cerradas !== 'error' ? cerradas.cerradas : []
    const ultimosOError = ultimoContactoOError(ultimos)

    const filas = armarFilasCartera({ vista, procesos, tareas, tareasCerradas, ultimos: ultimosOError, perfiles, ahora })

    const verComoPermitido = (quien.role === 'admin' || quien.role === 'dueno') && !mirando
    const opcionesVerComo = verComoPermitido ? opcionesVerComoDe(perfiles) : null

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
      fuentes: { ultimoContacto: ultimosOError === 'error' ? 'error' : 'ok', tareas: tareas === 'error' ? 'error' : 'ok' },
      // Solo el corte de PROCESOS es "hay más de los que se pueden traer" (TEXTO_TOPE); los
      // demás cortes ya salen como error de su dato.
      truncado: procesosLeidos.truncado || perfilesLeidos.truncado,
      generadoEn: ahora.toISOString(),
    }
    return { ok: true, datos }
  })
}

/**
 * Las opciones de "Ver como" de un admin o dueño, aparte de la cartera. Hace falta cuando
 * la página abre YA mirando a otra persona (`/crm?ver=<id>`, por ejemplo al recargar): esa
 * respuesta no trae opciones (5.1) y sin esto el selector quedaría vacío. Para cualquier
 * otro rol devuelve `null` sin leer nada.
 */
export async function leerOpcionesVerComo(quien: { role: string }): Promise<{ id: string; etiqueta: string }[] | null> {
  if (quien.role !== 'admin' && quien.role !== 'dueno') return null
  const cliente = sb()
  return conPlazoUnico(async (senal) => {
    const perfiles = await paginar(
      'profiles',
      (a, b) => cliente.from('profiles').select(COLS_PERFIL).order('id').range(a, b).abortSignal(senal),
      senal,
    )
    return opcionesVerComoDe(aPerfiles(perfiles.filas))
  })
}

// ── Contactos ────────────────────────────────────────────────────────────────────────────

/**
 * Las personas que `usuario` puede ver, con la misma fila que el CRM. `null` si su rol no
 * tiene Contactos (la ruta responde 403). Lanza si fallan contactos, procesos, perfiles o
 * tasaciones (sin ellos no se sabe a quién mostrar); tareas, lectura (d) y RPC, como en la
 * cartera.
 *
 * Para el asesor, todo se lee ya recortado a él: procesos con `assigned_to = él` (son los
 * únicos que hacen visible un contacto por proceso y los únicos que su fila puede mostrar),
 * tareas suyas y, de `appraisals`, SOLO tres columnas de las tasaciones suyas. Los contactos
 * se leen todos (871 hoy) y `contactoVisible` deja pasar solo los suyos ANTES de pedir su
 * último contacto: un ajeno nunca entra a la respuesta.
 */
export async function cargarContactos(
  usuario: { id: string; role: string },
  ahora: Date,
  opciones: Opciones = {},
): Promise<DatosContactos | null> {
  const alcance = alcanceContactos(usuario.role)
  if (alcance === 'ninguno') return null
  const propios = alcance === 'propios'
  // El id viaja dentro de un `or()` de PostgREST: nunca algo que no sea un uuid.
  if (propios && !esUuid(usuario.id)) return null

  const cliente = sb()
  return conPlazoUnico(async (senal) => {
    const t1 = Date.now()
    const [contactosLeidos, procesosLeidos, tasacionesLeidas, pendientes, perfilesLeidos] = await Promise.all([
      paginar(
        'contacts',
        (a, b) =>
          cliente.from('contacts').select(COLS_CONTACTO).order('created_at', { ascending: false }).order('id').range(a, b).abortSignal(senal),
        senal,
      ),
      paginar(
        'deals',
        (a, b) => {
          let q = cliente.from('deals').select(COLS_PROCESO).not('contact_id', 'is', null)
          if (propios) q = q.eq('assigned_to', usuario.id)
          return q.order('created_at', { ascending: false }).order('id').range(a, b).abortSignal(senal)
        },
        senal,
      ),
      propios
        ? paginar(
            'appraisals',
            (a, b) =>
              cliente
                .from('appraisals')
                .select(COLS_TASACION_DE_CONTACTO)
                .or(`assigned_to.eq.${usuario.id},user_id.eq.${usuario.id}`)
                .not('contact_id', 'is', null)
                .order('id')
                .range(a, b)
                .abortSignal(senal),
            senal,
          )
        : Promise.resolve({ filas: [], truncado: false }),
      leerPendientes((a, b) => {
        let q = cliente
          .from('tasks')
          .select(COLS_TAREA)
          .eq('status', 'pending')
          .in('type', [...TIPOS_TAREA_DE_PROCESO])
          .or('deal_id.not.is.null,contact_id.not.is.null')
        if (propios) q = q.eq('assigned_to', usuario.id)
        return q.order('id').range(a, b).abortSignal(senal)
      }, senal),
      paginar('profiles', (a, b) => cliente.from('profiles').select(COLS_PERFIL).order('id').range(a, b).abortSignal(senal), senal),
    ])
    const tanda1Ms = Date.now() - t1
    const perfiles = aPerfiles(perfilesLeidos.filas)
    const procesos = procesosLeidos.filas.map((r) => aProceso({ ...r, contacto: null }))
    const tasaciones = tasacionesLeidas.filas.map(aTasacion)

    // Quién es visible se decide ANTES de la tanda 2: la RPC no se pide por personas ajenas.
    const asesoresDeProcesos = new Map<string, (string | null)[]>()
    for (const p of procesos) if (p.contact_id) asesoresDeProcesos.set(p.contact_id, [...(asesoresDeProcesos.get(p.contact_id) ?? []), p.assigned_to])
    const asesoresDeTasaciones = new Map<string, (string | null)[]>()
    for (const t of tasaciones) asesoresDeTasaciones.set(t.contact_id, [...(asesoresDeTasaciones.get(t.contact_id) ?? []), t.assigned_to, t.user_id])
    const contactos = contactosLeidos.filas.map(aContacto).filter((c) =>
      contactoVisible(usuario, {
        assigned_to: c.assigned_to,
        created_by: c.created_by,
        asesoresDeProcesos: asesoresDeProcesos.get(c.id) ?? [],
        asesoresDeTasaciones: asesoresDeTasaciones.get(c.id) ?? [],
      }),
    )

    const t2 = Date.now()
    const [ultimos, cerradas] = await Promise.all([
      leerUltimos(cliente, contactos.map((c) => c.id), senal),
      // Con alcance propio cada uno ve solo sus tareas: no hay copias que juntar (B1).
      pendientes.tareas === 'error' || propios
        ? Promise.resolve(null)
        : leerCerradas(cliente, pendientes.tareas, perfiles, senal).catch((e: unknown) => {
            console.error('[crm] tareas cerradas de la coordinación (contactos):', e)
            return 'error' as const
          }),
    ])
    const tanda2Ms = Date.now() - t2

    const tareas = tareasOError(pendientes, cerradas)
    const ultimosOError = ultimoContactoOError(ultimos)
    const filas = armarFilasContactos({
      usuario,
      contactos,
      procesos,
      tasaciones,
      tareas,
      tareasCerradas: cerradas && cerradas !== 'error' ? cerradas.cerradas : [],
      ultimos: ultimosOError,
      perfiles,
      ahora,
    })

    opciones.alMedir?.({
      previaMs: null,
      tanda1Ms,
      tanda2Ms,
      cerradasLeidas: cerradas && cerradas !== 'error' && cerradas.desde ? cerradas.cerradas.length : null,
      cerradasDesde: cerradas && cerradas !== 'error' ? cerradas.desde : null,
    })

    return {
      filas,
      asesores: propios ? null : asesoresDe(filas),
      fuentes: { ultimoContacto: ultimosOError === 'error' ? 'error' : 'ok', tareas: tareas === 'error' ? 'error' : 'ok' },
      truncado: contactosLeidos.truncado || procesosLeidos.truncado || tasacionesLeidas.truncado || perfilesLeidos.truncado,
      generadoEn: ahora.toISOString(),
    }
  })
}
