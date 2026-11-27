/**
 * Receta de datos de prueba de la cartera del CRM (crm-cartera-por-rol, tarea 8.1).
 *
 *   node --env-file=.env.local --import tsx scripts/_qa-cartera-datos.ts crear
 *   node --env-file=.env.local --import tsx scripts/_qa-cartera-datos.ts borrar
 *   node --env-file=.env.local --import tsx scripts/_qa-cartera-datos.ts verificar
 *
 * Siempre en este orden: `borrar` → `verificar` (0) → `crear`. Es la BASE DE PRODUCCIÓN
 * (la vista previa de Netlify usa el mismo Supabase). Las protecciones comunes (supresión
 * de Mailchimp antes de cualquier proceso, invariante de métricas, archivo de ids) viven en
 * `_qa-receta-comun.ts`, las mismas que usa la receta de la ficha. Además:
 *  - todo contacto se llama `[TEST] Cartera QA <n>` con el email `qa-cartera-<n>@example.com`
 *    (`example.com` está reservado: no recibe correo), los procesos van con `origin` vacío
 *    (también el de la clase gratuita: la ETAPA es `clase_gratuita`, el origen no) y las
 *    tareas van SOLO a cuentas de prueba ("Claude · pruebas", "Julian Coordinador" y el
 *    asesor de prueba, todas `@passmail.com` o `inmodf.com.ar` del dueño);
 *  - las filas se insertan directo, sin pasar por rutas: no sale ningún email ni WhatsApp;
 *  - `borrar` filtra solo lo propio: por los ids que guardó `crear` y, sin ese archivo, por
 *    los nombres EXACTOS y los emails EXACTOS de los casos (nunca por un patrón `[TEST%`).
 *    Borra las tareas ANTES que los procesos (`tasks.deal_id` es ON DELETE SET NULL: al
 *    revés quedarían tareas huérfanas a nombre de las cuentas de prueba). Si encuentra más
 *    contactos que los que crea la receta, corta sin borrar nada.
 *
 * El juego de casos (fechas relativas a la hora en que corre):
 *   1  solicitud nueva sin contactos, entró hace 2 h
 *   2  solicitud con "No atendió" hace 1 h y su "Llamada 2" vencida, de "Claude · pruebas"
 *   3  coordinada, tasación mañana 11:00 con el asesor de prueba; "Confirmar el horario"
 *      hoy para "Claude · pruebas"
 *   4  solicitud que entró antes de INICIO_REGISTRO_CONTACTOS, sin contactos
 *   5  seguimiento de "Claude · pruebas", sin llamadas, con una visita de hace 30 días
 *   5b coordinada con la tasación hace 3 días, de "Claude · pruebas"
 *   6  seguimiento sin asesor
 *   7  clase gratuita (etapa), con origen vacío
 *   8  descartado sin asesor, marcado `colega`
 *   9  captado de "Claude · pruebas"
 *   10 seguimiento del asesor de prueba, con una tarea suya
 *
 * El archivo de ids vive fuera del repo (`QA_CARTERA_IDS`, o en el temporal del usuario) y
 * lo lee también `_qa-cartera-lectura.ts` para decir dónde cae cada caso (tarea 8.2).
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Client } from 'pg'
import { INICIO_REGISTRO_CONTACTOS } from '../lib/crm/ultimo-contacto'
import {
  ASESOR_DE_PRUEBA, CLAUDE_QA, JULIAN_COORDINADOR, archivoDeIds, borrarMailchimpDeProcesos, borrarSupresiones,
  conectar, contarFilas, contarMailchimp, cortar, enTransaccion, fechaArgentina, filas, invarianteDeMetricas,
  perfil, suprimirEmails, uno,
} from './_qa-receta-comun'

export const CASOS = ['1', '2', '3', '4', '5', '5b', '6', '7', '8', '9', '10'] as const
export type Caso = (typeof CASOS)[number]

const PREFIJO = '[TEST] Cartera QA'
export const nombreDeCaso = (n: Caso): string => `${PREFIJO} ${n}`
const emailDeCaso = (n: Caso): string => `qa-cartera-${n}@example.com`
const NOMBRES = CASOS.map(nombreDeCaso)
const EMAILS = CASOS.map(emailDeCaso)
const DIRECCION = '[TEST] Cartera QA — Calle Falsa'
export const ARCHIVO_IDS = process.env.QA_CARTERA_IDS ?? join(tmpdir(), 'qa-cartera-datos.ids.json')

export interface IdsCartera {
  creadoEn: string
  /** caso → ids de su contacto y su proceso. */
  casos: Record<string, { contacto: string; proceso: string }>
  tareas: string[]
  actividades: string[]
}

export const archivo = archivoDeIds<IdsCartera>(ARCHIVO_IDS)

const HORA = 3_600_000
const DIA = 86_400_000
const hace = (ms: number): string => new Date(Date.now() - ms).toISOString()

/** Mediodía de Argentina, `dias` antes del inicio del registro de llamadas. */
function antesDelRegistro(dias: number): string {
  return new Date(Date.parse(`${INICIO_REGISTRO_CONTACTOS}T12:00:00-03:00`) - dias * DIA).toISOString()
}

// ── Lo propio ────────────────────────────────────────────────────────────────────────────

/** Contactos de prueba por el respaldo: nombre EXACTO de un caso y email EXACTO de un caso. */
async function contactosPorNombre(c: Client): Promise<string[]> {
  const r = await filas<{ id: string }>(c,
    `SELECT id FROM contacts WHERE full_name = ANY($1::text[]) AND lower(email) = ANY($2::text[])`, [NOMBRES, EMAILS])
  return r.map((x) => x.id)
}

interface Conjunto {
  contactos: string[]
  procesos: string[]
  tareas: string[]
  actividades: string[]
}

async function conjuntoDePrueba(c: Client): Promise<{ conjunto: Conjunto; fuente: string }> {
  const ids = archivo.leer()
  const porNombre = await contactosPorNombre(c)
  const delArchivo = ids ? Object.values(ids.casos) : []
  const contactos = [...new Set([...delArchivo.map((x) => x.contacto), ...porNombre])]
  const procesosDeContactos = contactos.length === 0 ? [] : (await filas<{ id: string }>(c,
    `SELECT id FROM deals WHERE contact_id = ANY($1::uuid[])`, [contactos])).map((x) => x.id)
  const procesos = [...new Set([...delArchivo.map((x) => x.proceso), ...procesosDeContactos])]
  if (ids) {
    const faltan = porNombre.filter((x) => !delArchivo.some((d) => d.contacto === x))
    if (faltan.length > 0) console.log(`· aviso: el respaldo por nombre encontró ${faltan.length} contacto(s) que no están en el archivo de ids`)
  }
  return {
    conjunto: { contactos, procesos, tareas: ids?.tareas ?? [], actividades: ids?.actividades ?? [] },
    fuente: ids ? `archivo de ids (${ARCHIVO_IDS}) + respaldo por nombre` : 'respaldo por nombre (sin archivo de ids)',
  }
}

interface Conteo {
  contactos: number
  procesos: number
  actividades: number
  tareas: number
  historialEtapas: number
  mailchimpEstado: number
  mailchimpLog: number
  supresiones: number
}

async function contar(c: Client, k: Conjunto): Promise<Conteo> {
  return {
    contactos: await contarFilas(c, `SELECT count(*)::int AS n FROM contacts WHERE id = ANY($1::uuid[])`, [k.contactos]),
    procesos: await contarFilas(c, `SELECT count(*)::int AS n FROM deals WHERE id = ANY($1::uuid[])`, [k.procesos]),
    actividades: await contarFilas(c, `SELECT count(*)::int AS n FROM contact_activities
      WHERE contact_id = ANY($1::uuid[]) OR deal_id = ANY($2::uuid[]) OR id = ANY($3::uuid[])`,
    [k.contactos, k.procesos, k.actividades]),
    tareas: await contarFilas(c, `SELECT count(*)::int AS n FROM tasks
      WHERE contact_id = ANY($1::uuid[]) OR deal_id = ANY($2::uuid[]) OR id = ANY($3::uuid[])`,
    [k.contactos, k.procesos, k.tareas]),
    historialEtapas: await contarFilas(c, `SELECT count(*)::int AS n FROM deal_stage_history WHERE deal_id = ANY($1::uuid[])`, [k.procesos]),
    ...(await contarMailchimp(c, k.procesos, EMAILS)),
  }
}

const totalDeFilas = (x: Conteo): number =>
  x.contactos + x.procesos + x.actividades + x.tareas + x.historialEtapas + x.mailchimpEstado + x.mailchimpLog + x.supresiones

// ── crear ────────────────────────────────────────────────────────────────────────────────

interface Contexto {
  c: Client
  cuentas: { claude: string; julian: string; asesor: string }
  ids: IdsCartera
}

interface DatosProceso {
  stage: string
  createdAt: string
  assignedTo?: string | null
  scheduledDate?: string | null
  scheduledTime?: string | null
  visitedAt?: string | null
  capturedAt?: string | null
  lostAt?: string | null
  tags?: string[] | null
}

async function insertarCaso(x: Contexto, n: Caso, d: DatosProceso): Promise<{ contacto: string; proceso: string }> {
  const contacto = (await uno<{ id: string }>(x.c,
    `INSERT INTO contacts (full_name, phone, email, origin, created_at) VALUES ($1, $2, $3, NULL, $4::timestamptz) RETURNING id`,
    [nombreDeCaso(n), `+549119999${String(200 + CASOS.indexOf(n)).padStart(4, '0')}`, emailDeCaso(n), d.createdAt])).id
  const proceso = (await uno<{ id: string }>(x.c,
    `INSERT INTO deals (contact_id, property_address, stage, origin, assigned_to, scheduled_date, scheduled_time,
                        visited_at, captured_at, lost_at, tags, created_at)
     VALUES ($1, $2, $3, NULL, $4, $5::date, $6::time, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10::text[], $11::timestamptz)
     RETURNING id`,
    [contacto, `${DIRECCION} ${n}`, d.stage, d.assignedTo ?? null, d.scheduledDate ?? null, d.scheduledTime ?? null,
      d.visitedAt ?? null, d.capturedAt ?? null, d.lostAt ?? null, d.tags ?? null, d.createdAt])).id
  x.ids.casos[n] = { contacto, proceso }
  return { contacto, proceso }
}

async function insertarTarea(x: Contexto, d: {
  type: 'update_contact' | 'follow_up'
  title: string
  assignedTo: string
  caso: { contacto: string; proceso: string }
  dueDate: string
  dueTime?: string | null
  sourceActivityId?: string | null
}): Promise<void> {
  const { claude, julian, asesor } = x.cuentas
  if (![claude, julian, asesor].includes(d.assignedTo)) cortar('una tarea de prueba solo va a una cuenta de prueba')
  if (!d.title.startsWith('[TEST]')) cortar('el título de una tarea de prueba empieza con [TEST]')
  const r = await uno<{ id: string }>(x.c,
    `INSERT INTO tasks (type, title, assigned_to, contact_id, deal_id, due_date, due_time, all_day, channel, source_activity_id)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7::time, $8, 'call', $9) RETURNING id`,
    [d.type, d.title, d.assignedTo, d.caso.contacto, d.caso.proceso, d.dueDate, d.dueTime ?? null, !d.dueTime, d.sourceActivityId ?? null])
  x.ids.tareas.push(r.id)
}

async function crear(c: Client): Promise<void> {
  const previos = await contactosPorNombre(c)
  if (previos.length > 0 || archivo.leer()) {
    cortar(`ya hay datos de prueba (${previos.length} contacto(s) por nombre${archivo.leer() ? ', y un archivo de ids' : ''}): primero correr \`borrar\``)
  }
  const cuentas = {
    claude: await perfil(c, CLAUDE_QA),
    julian: await perfil(c, JULIAN_COORDINADOR),
    asesor: await perfil(c, ASESOR_DE_PRUEBA),
  }

  // ANTES de cualquier proceso, en su propio commit.
  await suprimirEmails(c, EMAILS)

  const ids: IdsCartera = { creadoEn: new Date().toISOString(), casos: {}, tareas: [], actividades: [] }
  const x: Contexto = { c, cuentas, ids }
  const { claude, asesor } = cuentas

  await enTransaccion(c, async () => {
    await insertarCaso(x, '1', { stage: 'request', createdAt: hace(2 * HORA) })

    const c2 = await insertarCaso(x, '2', { stage: 'request', createdAt: hace(3 * HORA) })
    const llamada = (await uno<{ id: string }>(c,
      `INSERT INTO contact_activities (contact_id, deal_id, kind, call_outcome, occurred_at, created_by)
       VALUES ($1, $2, 'call', 'no_atendio', now() - interval '1 hour', $3) RETURNING id`,
      [c2.contacto, c2.proceso, claude])).id
    ids.actividades.push(llamada)
    await insertarTarea(x, {
      type: 'update_contact', title: '[TEST] Llamada 2', assignedTo: claude, caso: c2,
      dueDate: fechaArgentina(-1), dueTime: '09:00', sourceActivityId: llamada,
    })

    const c3 = await insertarCaso(x, '3', {
      stage: 'scheduled', createdAt: hace(DIA), assignedTo: asesor, scheduledDate: fechaArgentina(1), scheduledTime: '11:00',
    })
    await insertarTarea(x, { type: 'follow_up', title: '[TEST] Confirmar el horario', assignedTo: claude, caso: c3, dueDate: fechaArgentina(0) })

    await insertarCaso(x, '4', { stage: 'request', createdAt: antesDelRegistro(2) })
    await insertarCaso(x, '5', { stage: 'followup', createdAt: hace(40 * DIA), assignedTo: claude, visitedAt: hace(30 * DIA) })
    await insertarCaso(x, '5b', {
      stage: 'scheduled', createdAt: hace(5 * DIA), assignedTo: claude, scheduledDate: fechaArgentina(-3), scheduledTime: '11:00',
    })
    await insertarCaso(x, '6', { stage: 'followup', createdAt: hace(20 * DIA) })
    await insertarCaso(x, '7', { stage: 'clase_gratuita', createdAt: hace(DIA) })
    await insertarCaso(x, '8', { stage: 'lost', createdAt: hace(10 * DIA), lostAt: hace(2 * DIA), tags: ['colega'] })
    await insertarCaso(x, '9', { stage: 'captured', createdAt: hace(30 * DIA), assignedTo: claude, capturedAt: hace(5 * DIA) })

    const c10 = await insertarCaso(x, '10', { stage: 'followup', createdAt: hace(15 * DIA), assignedTo: asesor })
    await insertarTarea(x, { type: 'follow_up', title: '[TEST] Seguimiento', assignedTo: asesor, caso: c10, dueDate: fechaArgentina(1) })
  })
  archivo.guardar(ids)
  console.log(`✓ creados ${Object.keys(ids.casos).length} casos: ${Object.keys(ids.casos).length} contactos, ${Object.keys(ids.casos).length} procesos, ${ids.tareas.length} tareas, ${ids.actividades.length} actividad(es)`)
  console.log(`  ids en ${ARCHIVO_IDS}`)
}

// ── borrar ───────────────────────────────────────────────────────────────────────────────

async function borrar(c: Client): Promise<void> {
  const { conjunto: k, fuente } = await conjuntoDePrueba(c)
  const antes = await contar(c, k)
  console.log(`fuente: ${fuente}`)
  console.log(`va a borrar: ${JSON.stringify(antes)}`)
  if (antes.contactos > CASOS.length) {
    cortar(`hay ${antes.contactos} contactos de prueba y la receta crea ${CASOS.length}: no se borra nada; mirar a mano de quién es cada uno`)
  }
  await enTransaccion(c, async () => {
    // Mailchimp primero: el log no tiene FK y no se borra solo.
    await borrarMailchimpDeProcesos(c, k.procesos, EMAILS)
    // Tareas ANTES que los procesos: tasks.deal_id es ON DELETE SET NULL.
    await c.query(`DELETE FROM tasks WHERE contact_id = ANY($1::uuid[]) OR deal_id = ANY($2::uuid[]) OR id = ANY($3::uuid[])`,
      [k.contactos, k.procesos, k.tareas])
    await c.query(`DELETE FROM contact_activities WHERE contact_id = ANY($1::uuid[]) OR deal_id = ANY($2::uuid[]) OR id = ANY($3::uuid[])`,
      [k.contactos, k.procesos, k.actividades])
    await c.query(`DELETE FROM deal_stage_history WHERE deal_id = ANY($1::uuid[])`, [k.procesos])
    await c.query(`DELETE FROM deals WHERE id = ANY($1::uuid[])`, [k.procesos])
    await c.query(`DELETE FROM contacts WHERE id = ANY($1::uuid[])`, [k.contactos])
    await borrarSupresiones(c, EMAILS)
  })
  archivo.borrar()
  const despues = await contar(c, k)
  console.log(`después: ${JSON.stringify(despues)}`)
  if (totalDeFilas(despues) !== 0) cortar('quedaron filas de prueba después de borrar')
  console.log('✓ borrado: 0 filas de prueba')
}

// ── verificar ────────────────────────────────────────────────────────────────────────────

async function verificar(c: Client): Promise<void> {
  const { conjunto: k, fuente } = await conjuntoDePrueba(c)
  const conteo = await contar(c, k)
  console.log(`fuente: ${fuente}`)
  console.log(`filas de prueba: ${JSON.stringify(conteo)} (total ${totalDeFilas(conteo)})`)
  const fallas = await invarianteDeMetricas(c, k.procesos, EMAILS)
  // Ninguna tarea de prueba a nombre de una persona real.
  const ajenas = await contarFilas(c, `SELECT count(*)::int AS n FROM tasks t JOIN profiles p ON p.id = t.assigned_to
     WHERE (t.contact_id = ANY($1::uuid[]) OR t.deal_id = ANY($2::uuid[]) OR t.id = ANY($3::uuid[]))
       AND p.email <> ALL($4::text[])`,
  [k.contactos, k.procesos, k.tareas, [CLAUDE_QA, JULIAN_COORDINADOR, ASESOR_DE_PRUEBA]])
  console.log(`· tareas de prueba a nombre de una persona real: ${ajenas}`)
  if (ajenas !== 0) fallas.push(`${ajenas} tarea(s) de prueba a nombre de una persona real`)
  if (fallas.length > 0) cortar(`verificación en rojo:\n  - ${fallas.join('\n  - ')}`)
  console.log('✓ verificación en verde')
}

async function main(): Promise<void> {
  const [modo] = process.argv.slice(2)
  const c = await conectar()
  try {
    if (modo === 'crear') await crear(c)
    else if (modo === 'borrar') await borrar(c)
    else if (modo === 'verificar') await verificar(c)
    else cortar('modos: crear | borrar | verificar')
  } finally {
    await c.end()
  }
}

// Solo como programa: `_qa-cartera-lectura.ts` importa los nombres y el archivo de ids.
if (process.argv[1]?.endsWith('_qa-cartera-datos.ts')) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
