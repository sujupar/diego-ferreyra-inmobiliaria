/**
 * Receta de datos de prueba de la ficha de contacto (crm-ficha-y-llamadas, tarea 2.5).
 *
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts crear <situación>
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts vincular contacto|proceso|creador|nada
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts borrar
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts verificar
 *
 * Es la BASE DE PRODUCCIÓN (la vista previa de Netlify usa el mismo Supabase). Por eso:
 *  - todo lleva `[TEST]` en el nombre, los procesos van con `origin` vacío (nunca `embudo`
 *    ni `clase_gratuita`: no cuentan en las métricas ni entran a los públicos de Meta) y las
 *    tareas se asignan SOLO a cuentas de prueba ("Claude · pruebas" y "Julian Coordinador");
 *  - las filas se insertan directo, sin pasar por rutas: no sale ningún email ni WhatsApp;
 *  - ANTES de insertar cualquier proceso, `crear` suprime los dos emails de prueba en
 *    `mailchimp_suppressions` y los vuelve a leer: la etiqueta de secuencia de Mailchimp no
 *    mira el origen para `scheduled` con día ni para `visited`, y `undo-lost` y el barrido
 *    `reconcileMailchimp` CREAN al email en la audiencia real si no está suprimido;
 *  - `borrar` filtra solo lo propio: por los ids que guardó `crear` y, si ese archivo no
 *    está, por el nombre exacto y los dos emails exactos. Nunca por un patrón como `[TEST%`,
 *    que se llevaría datos de prueba de otra sesión o del dueño.
 *
 * Situaciones BASE (crean el contacto; cortan si ya hay datos de prueba):
 *   solicitud, solicitud-para-asesor, solicitud-sin-dia, coordinada-con-fecha, clase,
 *   posterior, sin-proceso, sin-ningun-proceso, solicitud-y-clase, sin-telefono
 * Situaciones ADITIVAS (suman filas sobre la base; necesitan el archivo de ids):
 *   dos-asesores, dos-asesores-coordinada (solo sobre `solicitud`; se excluyen entre sí),
 *   tarea-vencida, 25-registros, 60-registros (sobre cualquier base con un proceso)
 *
 * El archivo de ids vive fuera del repo (`QA_FICHA_IDS`, o por defecto en el temporal del
 * usuario). Es de UNA sesión: otra sesión que corra `borrar`/`verificar` usa el respaldo por
 * nombre, que tiene que dar el mismo resultado.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Client } from 'pg'
import {
  CLAUDE_QA, JULIAN_COORDINADOR, archivoDeIds, borrarMailchimpDeProcesos, borrarSupresiones, conectar,
  contarMailchimp, cortar, fechaArgentina, filas, invarianteDeMetricas, perfil, suprimirEmails, uno,
} from './_qa-receta-comun'

const NOMBRE = '[TEST] Ficha QA'
/** Emails que no pueden recibir correo (`example.com` está reservado). En minúsculas. */
const EMAIL_CONTACTO = 'qa-ficha-contacto@example.com'
/** El ÚNICO otro email que el QA puede escribir en un contacto de prueba (tasks.md, reglas). */
const EMAIL_SEGUNDO = 'qa-ficha-segundo@example.com'
const EMAILS = [EMAIL_CONTACTO, EMAIL_SEGUNDO]
const TELEFONO = '+5491199990017'
const DIRECCION = '[TEST] Ficha QA — Calle Falsa 123'
const ARCHIVO_IDS = process.env.QA_FICHA_IDS ?? join(tmpdir(), 'qa-ficha-datos.ids.json')

const BASES = [
  'solicitud', 'solicitud-para-asesor', 'solicitud-sin-dia', 'coordinada-con-fecha', 'clase',
  'posterior', 'sin-proceso', 'sin-ningun-proceso', 'solicitud-y-clase', 'sin-telefono',
] as const
const ADITIVAS = ['dos-asesores', 'dos-asesores-coordinada', 'tarea-vencida', '25-registros', '60-registros'] as const
type Base = (typeof BASES)[number]
type Aditiva = (typeof ADITIVAS)[number]

interface Ids {
  base: Base
  aditivas: Aditiva[]
  contactos: string[]
  /** Procesos de la situación base (los que mueve `vincular proceso`). */
  procesos: string[]
  /** Procesos sumados por una aditiva (`dos-asesores*`). */
  procesosAditivos: string[]
  tareas: string[]
  actividades: string[]
}

interface Conjunto {
  contactos: string[]
  procesos: string[]
}

function esBase(s: string): s is Base {
  return (BASES as readonly string[]).includes(s)
}
function esAditiva(s: string): s is Aditiva {
  return (ADITIVAS as readonly string[]).includes(s)
}

const archivo = archivoDeIds<Ids>(ARCHIVO_IDS)
const leerIds = (): Ids | null => archivo.leer()
const guardarIds = (ids: Ids): void => archivo.guardar(ids)

/** Contactos de prueba por el respaldo: nombre EXACTO y uno de los dos emails EXACTOS. */
async function contactosPorNombre(c: Client): Promise<string[]> {
  const r = await filas<{ id: string }>(c,
    `SELECT id FROM contacts WHERE full_name = $1 AND lower(email) = ANY($2::text[])`, [NOMBRE, EMAILS])
  return r.map((x) => x.id)
}

/** Lo propio: los ids del archivo más lo que encuentra el respaldo por nombre. */
async function conjuntoDePrueba(c: Client): Promise<{ conjunto: Conjunto; fuente: string }> {
  const ids = leerIds()
  const porNombre = await contactosPorNombre(c)
  const contactos = [...new Set([...(ids?.contactos ?? []), ...porNombre])]
  const procesosDeContactos = contactos.length === 0 ? [] : (await filas<{ id: string }>(c,
    `SELECT id FROM deals WHERE contact_id = ANY($1::uuid[])`, [contactos])).map((x) => x.id)
  const procesos = [...new Set([...(ids?.procesos ?? []), ...(ids?.procesosAditivos ?? []), ...procesosDeContactos])]
  const fuente = ids ? `archivo de ids (${ARCHIVO_IDS}) + respaldo por nombre` : 'respaldo por nombre (sin archivo de ids)'
  if (ids) {
    const faltan = porNombre.filter((x) => !ids.contactos.includes(x))
    if (faltan.length > 0) console.log(`· aviso: el respaldo por nombre encontró ${faltan.length} contacto(s) que no están en el archivo de ids`)
  }
  return { conjunto: { contactos, procesos }, fuente }
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
  const ids = leerIds()
  const n = async (sql: string, valores: unknown[]): Promise<number> =>
    (await uno<{ n: number }>(c, sql, valores)).n
  return {
    contactos: await n(`SELECT count(*)::int AS n FROM contacts WHERE id = ANY($1::uuid[])`, [k.contactos]),
    procesos: await n(`SELECT count(*)::int AS n FROM deals WHERE id = ANY($1::uuid[])`, [k.procesos]),
    actividades: await n(`SELECT count(*)::int AS n FROM contact_activities
      WHERE contact_id = ANY($1::uuid[]) OR deal_id = ANY($2::uuid[]) OR id = ANY($3::uuid[])`,
    [k.contactos, k.procesos, ids?.actividades ?? []]),
    tareas: await n(`SELECT count(*)::int AS n FROM tasks
      WHERE contact_id = ANY($1::uuid[]) OR deal_id = ANY($2::uuid[]) OR id = ANY($3::uuid[])`,
    [k.contactos, k.procesos, ids?.tareas ?? []]),
    historialEtapas: await n(`SELECT count(*)::int AS n FROM deal_stage_history WHERE deal_id = ANY($1::uuid[])`, [k.procesos]),
    ...(await contarMailchimp(c, k.procesos, EMAILS)),
  }
}

function totalDeFilas(x: Conteo): number {
  return x.contactos + x.procesos + x.actividades + x.tareas + x.historialEtapas
    + x.mailchimpEstado + x.mailchimpLog + x.supresiones
}

// ── crear ────────────────────────────────────────────────────────────────────────────────

interface Contexto {
  c: Client
  claude: string
  julian: string
  ids: Ids
}

async function insertarProceso(x: Contexto, contacto: string, datos: {
  stage: string
  notes?: string
  scheduledDate?: string | null
  scheduledTime?: string | null
  assignedTo?: string | null
  createdAt?: string
}, aditivo = false): Promise<string> {
  const r = await uno<{ id: string }>(x.c,
    `INSERT INTO deals (contact_id, property_address, stage, origin, notes, scheduled_date, scheduled_time,
                        assigned_to, created_at)
     VALUES ($1, $2, $3, NULL, $4, $5::date, $6::time, $7, COALESCE($8::timestamptz, now()))
     RETURNING id`,
    [contacto, DIRECCION, datos.stage, datos.notes ?? null, datos.scheduledDate ?? null,
      datos.scheduledTime ?? null, datos.assignedTo ?? null, datos.createdAt ?? null])
  if (aditivo) x.ids.procesosAditivos.push(r.id)
  else x.ids.procesos.push(r.id)
  return r.id
}

async function insertarTarea(x: Contexto, datos: {
  type: string
  title: string
  assignedTo: string
  contacto: string
  proceso: string | null
  dueDate?: string | null
}): Promise<string> {
  if (datos.assignedTo !== x.claude && datos.assignedTo !== x.julian) cortar('una tarea de prueba solo va a una cuenta de prueba')
  if (!datos.title.startsWith('[TEST]')) cortar('el título de una tarea de prueba empieza con [TEST]')
  const r = await uno<{ id: string }>(x.c,
    `INSERT INTO tasks (type, title, assigned_to, contact_id, deal_id, due_date)
     VALUES ($1, $2, $3, $4, $5, $6::date) RETURNING id`,
    [datos.type, datos.title, datos.assignedTo, datos.contacto, datos.proceso, datos.dueDate ?? null])
  x.ids.tareas.push(r.id)
  return r.id
}

async function crearBase(c: Client, situacion: Base): Promise<void> {
  // Cualquier dato de prueba previo (por ids o por nombre) → corta sin tocar nada.
  const previos = await contactosPorNombre(c)
  const idsPrevios = leerIds()
  if (previos.length > 0 || (idsPrevios && idsPrevios.contactos.length > 0)) {
    cortar(`ya hay datos de prueba (${previos.length} contacto(s) por nombre${idsPrevios ? ', y un archivo de ids' : ''}): primero correr \`borrar\``)
  }

  const claude = await perfil(c, CLAUDE_QA)
  const julian = await perfil(c, JULIAN_COORDINADOR)

  await suprimirEmails(c, EMAILS)

  const ids: Ids = { base: situacion, aditivas: [], contactos: [], procesos: [], procesosAditivos: [], tareas: [], actividades: [] }
  const x: Contexto = { c, claude, julian, ids }

  await c.query('BEGIN')
  try {
    const telefono = situacion === 'sin-telefono' ? null : TELEFONO
    const contacto = (await uno<{ id: string }>(c,
      `INSERT INTO contacts (full_name, phone, email, origin) VALUES ($1, $2, $3, NULL) RETURNING id`,
      [NOMBRE, telefono, EMAIL_CONTACTO])).id
    ids.contactos.push(contacto)

    const tareaDeEntrada = async (proceso: string, a: string) => insertarTarea(x, {
      type: 'update_contact', title: `[TEST] Solicitud de tasación: ${NOMBRE}`, assignedTo: a, contacto, proceso,
    })

    switch (situacion) {
      case 'solicitud': {
        const p = await insertarProceso(x, contacto, { stage: 'request', notes: '[TEST] nota previa' })
        await tareaDeEntrada(p, claude)
        await tareaDeEntrada(p, julian)
        break
      }
      case 'solicitud-para-asesor': {
        const p = await insertarProceso(x, contacto, { stage: 'request', notes: '[TEST] nota previa' })
        await tareaDeEntrada(p, julian)
        break
      }
      case 'solicitud-sin-dia':
        await insertarProceso(x, contacto, { stage: 'scheduled' })
        break
      case 'coordinada-con-fecha': {
        const p = await insertarProceso(x, contacto, { stage: 'scheduled', scheduledDate: fechaArgentina(1), scheduledTime: '11:00' })
        await insertarTarea(x, { type: 'new_assignment', title: `[TEST] Nueva tasación asignada: ${DIRECCION}`, assignedTo: claude, contacto, proceso: p })
        break
      }
      case 'clase':
        await insertarProceso(x, contacto, { stage: 'clase_gratuita' })
        break
      case 'posterior':
        await insertarProceso(x, contacto, { stage: 'visited', scheduledDate: fechaArgentina(-2), scheduledTime: '11:00' })
        break
      case 'sin-proceso':
        await insertarProceso(x, contacto, { stage: 'lost' })
        break
      case 'sin-ningun-proceso':
        break
      case 'solicitud-y-clase':
        await insertarProceso(x, contacto, { stage: 'request', createdAt: new Date(Date.now() - 3_600_000).toISOString() })
        await insertarProceso(x, contacto, { stage: 'clase_gratuita' })
        break
      case 'sin-telefono':
        await insertarProceso(x, contacto, { stage: 'request' })
        break
    }
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  }
  guardarIds(ids)
  console.log(`✓ creada la situación base «${situacion}»: ${ids.contactos.length} contacto, ${ids.procesos.length} proceso(s), ${ids.tareas.length} tarea(s)`)
  console.log(`  contacto: ${ids.contactos[0]}  ·  ids en ${ARCHIVO_IDS}`)
}

async function crearAditiva(c: Client, situacion: Aditiva): Promise<void> {
  const ids = leerIds()
  if (!ids) cortar(`«${situacion}» suma sobre una base y no hay archivo de ids (${ARCHIVO_IDS}): primero \`crear solicitud\` (u otra base) en esta sesión`)
  const porNombre = await contactosPorNombre(c)
  if (porNombre.length !== 1 || ids.contactos.length !== 1 || porNombre[0] !== ids.contactos[0]) {
    cortar(`«${situacion}» exige exactamente un contacto de prueba, el del archivo de ids (hay ${porNombre.length} por nombre)`)
  }
  const contacto = ids.contactos[0]
  const vivos = await filas<{ id: string }>(c, `SELECT id FROM deals WHERE id = ANY($1::uuid[])`, [ids.procesos])
  const claude = await perfil(c, CLAUDE_QA)
  const julian = await perfil(c, JULIAN_COORDINADOR)
  const x: Contexto = { c, claude, julian, ids }

  if (situacion === 'dos-asesores' || situacion === 'dos-asesores-coordinada') {
    if (ids.base !== 'solicitud') cortar(`«${situacion}» va solo sobre la base «solicitud» (la base es «${ids.base}»)`)
    if (ids.aditivas.includes('dos-asesores') || ids.aditivas.includes('dos-asesores-coordinada') || ids.procesosAditivos.length > 0) {
      cortar('el segundo proceso ya existe: dos-asesores y dos-asesores-coordinada se excluyen entre sí')
    }
  } else {
    if (vivos.length === 0) cortar(`«${situacion}» necesita una base con al menos un proceso (la base es «${ids.base}»)`)
    if (ids.aditivas.includes(situacion)) cortar(`«${situacion}» ya se sumó`)
    if ((situacion === '25-registros' || situacion === '60-registros')
      && (ids.aditivas.includes('25-registros') || ids.aditivas.includes('60-registros'))) {
      cortar('ya hay registros de prueba: 25-registros y 60-registros se excluyen entre sí')
    }
  }

  await c.query('BEGIN')
  try {
    switch (situacion) {
      case 'dos-asesores':
        await insertarProceso(x, contacto, { stage: 'request', assignedTo: julian }, true)
        break
      case 'dos-asesores-coordinada':
        await insertarProceso(x, contacto, {
          stage: 'scheduled', scheduledDate: fechaArgentina(1), scheduledTime: '15:00', assignedTo: julian,
        }, true)
        break
      case 'tarea-vencida':
        await insertarTarea(x, {
          type: 'follow_up', title: '[TEST] Tarea vencida', assignedTo: claude, contacto,
          proceso: vivos[0]?.id ?? null, dueDate: fechaArgentina(-2),
        })
        break
      case '25-registros':
      case '60-registros': {
        const cantidad = situacion === '25-registros' ? 25 : 60
        const proceso = vivos[0]?.id ?? null
        // Horas escalonadas cada 2 h hacia atrás: 60 registros = 5 días, dentro de los 7 que
        // permite el CHECK de `occurred_at`. Se mezclan notas, llamadas «No atendió» y WhatsApp.
        for (let i = 1; i <= cantidad; i++) {
          const tipo = i % 7 === 0 ? 'whatsapp_sent' : i % 5 === 0 ? 'call' : 'note'
          const r = await uno<{ id: string }>(c,
            `INSERT INTO contact_activities (contact_id, deal_id, kind, call_outcome, body, occurred_at, created_by)
             VALUES ($1, $2, $3, $4, $5, now() - make_interval(hours => $6), $7) RETURNING id`,
            [contacto, tipo === 'note' ? null : proceso, tipo, tipo === 'call' ? 'no_atendio' : null,
              tipo === 'note' ? `[TEST] registro ${i}` : null, i * 2, claude])
          ids.actividades.push(r.id)
        }
        break
      }
    }
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  }
  ids.aditivas.push(situacion)
  guardarIds(ids)
  console.log(`✓ sumada «${situacion}» sobre «${ids.base}»`)
}

// ── vincular ─────────────────────────────────────────────────────────────────────────────

async function vincular(c: Client, modo: string): Promise<void> {
  const modos = ['contacto', 'proceso', 'creador', 'nada']
  if (!modos.includes(modo)) cortar(`vincular ${modos.join('|')}`)
  const ids = leerIds()
  if (!ids || ids.contactos.length !== 1) cortar('vincular necesita el archivo de ids de esta sesión (no tiene respaldo por nombre)')
  const claude = await perfil(c, CLAUDE_QA)
  const contacto = ids.contactos[0]
  // Cada modo deja UN solo vínculo con "Claude · pruebas" y saca los otros dos, para probar
  // cada camino de acceso por separado. `proceso` mueve los procesos de la base, no los aditivos.
  await c.query('BEGIN')
  try {
    await c.query(`UPDATE contacts SET assigned_to = $1, created_by = $2 WHERE id = $3`,
      [modo === 'contacto' ? claude : null, modo === 'creador' ? claude : null, contacto])
    await c.query(`UPDATE deals SET assigned_to = $1 WHERE id = ANY($2::uuid[])`,
      [modo === 'proceso' ? claude : null, ids.procesos])
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  }
  console.log(`✓ vínculo con "Claude · pruebas": ${modo}`)
}

// ── borrar ───────────────────────────────────────────────────────────────────────────────

async function borrar(c: Client): Promise<void> {
  const { conjunto: k, fuente } = await conjuntoDePrueba(c)
  const antes = await contar(c, k)
  console.log(`fuente: ${fuente}`)
  console.log(`va a borrar: ${JSON.stringify(antes)}`)
  if (antes.contactos > 1) cortar(`hay ${antes.contactos} contactos de prueba: no se borra nada; mirar a mano de quién es cada uno`)

  const ids = leerIds()
  await c.query('BEGIN')
  try {
    // Mailchimp primero: el log no tiene FK y no se borra solo.
    await borrarMailchimpDeProcesos(c, k.procesos, EMAILS)
    await c.query(`DELETE FROM tasks WHERE contact_id = ANY($1::uuid[]) OR deal_id = ANY($2::uuid[]) OR id = ANY($3::uuid[])`,
      [k.contactos, k.procesos, ids?.tareas ?? []])
    await c.query(`DELETE FROM contact_activities WHERE contact_id = ANY($1::uuid[]) OR deal_id = ANY($2::uuid[]) OR id = ANY($3::uuid[])`,
      [k.contactos, k.procesos, ids?.actividades ?? []])
    await c.query(`DELETE FROM deal_stage_history WHERE deal_id = ANY($1::uuid[])`, [k.procesos])
    await c.query(`DELETE FROM deals WHERE id = ANY($1::uuid[])`, [k.procesos])
    await c.query(`DELETE FROM contacts WHERE id = ANY($1::uuid[])`, [k.contactos])
    // Al final, las supresiones: mientras existió un proceso de prueba tenían que estar.
    await borrarSupresiones(c, EMAILS)
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK')
    throw e
  }
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

  if (fallas.length > 0) cortar(`verificación en rojo:\n  - ${fallas.join('\n  - ')}`)
  console.log('✓ verificación en verde')
}

async function main(): Promise<void> {
  const [modo, arg] = process.argv.slice(2)
  const c = await conectar()
  try {
    if (modo === 'crear') {
      if (!arg) cortar(`crear <situación>: ${[...BASES, ...ADITIVAS].join(', ')}`)
      if (esBase(arg)) await crearBase(c, arg)
      else if (esAditiva(arg)) await crearAditiva(c, arg)
      else cortar(`situación desconocida «${arg}». Base: ${BASES.join(', ')}. Aditivas: ${ADITIVAS.join(', ')}`)
    } else if (modo === 'vincular') {
      await vincular(c, arg ?? '')
    } else if (modo === 'borrar') {
      await borrar(c)
    } else if (modo === 'verificar') {
      await verificar(c)
    } else {
      cortar('modos: crear <situación> | vincular contacto|proceso|creador|nada | borrar | verificar')
    }
  } finally {
    await c.end()
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
