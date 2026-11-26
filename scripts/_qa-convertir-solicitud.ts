/**
 * Prueba contra la BASE REAL del `update` de `convertirSolicitud` y del trigger de etapas
 * (crm-ficha-y-llamadas, tarea 8.4), SIN mandar emails: todo corre dentro de una
 * transacción que termina en ROLLBACK, y no se pasa por ninguna ruta.
 *
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts crear solicitud
 *   node --env-file=.env.local --import tsx scripts/_qa-convertir-solicitud.ts notas-vacias
 *   node --env-file=.env.local --import tsx scripts/_qa-convertir-solicitud.ts notas-nuevas
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts borrar
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts verificar
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts crear solicitud-sin-dia
 *   node --env-file=.env.local --import tsx scripts/_qa-convertir-solicitud.ts sin-dia
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts borrar
 *   node --env-file=.env.local --import tsx scripts/_qa-ficha-datos.ts verificar
 *
 * Trabaja SOLO sobre el contacto de la receta 2.5 ("[TEST] Ficha QA" con su email fijo
 * de prueba): si no lo encuentra, o no está en la situación esperada, corta sin tocar
 * nada. El `update` es el mismo de `convertirSolicitud` (`lib/supabase/deals.ts`): las
 * mismas columnas y el mismo filtro de etapa; las notas, con la regla de la ruta. Tira
 * ante el primer resultado que no coincide, y el ROLLBACK corre igual.
 */
import { Client } from 'pg'

const NOMBRE = '[TEST] Ficha QA'
const EMAIL_CONTACTO = 'qa-ficha-contacto@example.com'
const NOTA_PREVIA = '[TEST] nota previa'
const TEXTO_NUEVO = '[TEST] nota agregada al coordinar'
const CLAUDE_QA = 'claude.qa@inmodf.com.ar'
const MODOS = ['notas-vacias', 'notas-nuevas', 'sin-dia'] as const
type Modo = (typeof MODOS)[number]

function esperar(condicion: boolean, mensaje: string): void {
  if (!condicion) throw new Error(`FALLA: ${mensaje}`)
  console.log(`  ✓ ${mensaje}`)
}

async function conectar(): Promise<Client> {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD en el entorno')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  return c
}

interface FilaProceso {
  id: string
  stage: string
  origin: string | null
  notes: string | null
  scheduled_date: string | null
  scheduled_at: string | null
  created_by: string | null
}

const COLUMNAS = `id, stage, origin, notes, scheduled_date::text AS scheduled_date,
                  scheduled_at::text AS scheduled_at, created_by`

/** Lo que no tiene que cambiar por la prueba: se cuenta antes y después del ROLLBACK. */
async function contar(c: Client, dealId: string, contactId: string) {
  const n = async (sql: string, v: unknown[]) => Number((await c.query<{ n: string }>(sql, v)).rows[0].n)
  return {
    historial: await n(`SELECT count(*) AS n FROM deal_stage_history WHERE deal_id = $1`, [dealId]),
    tareas: await n(`SELECT count(*) AS n FROM tasks WHERE deal_id = $1 OR contact_id = $2`, [dealId, contactId]),
    emails: await n(`SELECT count(*) AS n FROM email_notifications_log WHERE entity_id LIKE $1 || '%'`, [dealId]),
    procesos: await n(`SELECT count(*) AS n FROM deals WHERE contact_id = $1`, [contactId]),
  }
}

async function main(): Promise<void> {
  const modo = process.argv[2]
  if (!(MODOS as readonly string[]).includes(modo ?? '')) throw new Error(`modo: ${MODOS.join(' | ')}`)
  const m = modo as Modo
  const c = await conectar()
  try {
    // ── Datos de la receta ──────────────────────────────────────────────────────────
    const contactos = (await c.query<{ id: string }>(
      `SELECT id FROM contacts WHERE full_name = $1 AND lower(email) = $2`, [NOMBRE, EMAIL_CONTACTO])).rows
    if (contactos.length !== 1) throw new Error(`se esperaba 1 contacto «${NOMBRE}» y hay ${contactos.length}: correr la receta`)
    const contactId = contactos[0].id
    const procesos = (await c.query<FilaProceso>(`SELECT ${COLUMNAS} FROM deals WHERE contact_id = $1`, [contactId])).rows
    if (procesos.length !== 1) throw new Error(`se esperaba 1 proceso y hay ${procesos.length}`)
    const antes = procesos[0]
    if (antes.origin !== null) throw new Error('el proceso de prueba tiene que tener origin vacío')
    if (m === 'sin-dia') {
      if (antes.stage !== 'scheduled' || antes.scheduled_date !== null) {
        throw new Error('para `sin-dia` la receta tiene que estar en `solicitud-sin-dia` (scheduled sin día)')
      }
    } else if (antes.stage !== 'request' || antes.notes !== NOTA_PREVIA) {
      throw new Error('para `notas-*` la receta tiene que estar en `solicitud` (request con la nota previa)')
    }
    const claude = (await c.query<{ id: string }>(`SELECT id FROM profiles WHERE email = $1`, [CLAUDE_QA])).rows[0]?.id
    if (!claude) throw new Error(`no se encontró la cuenta ${CLAUDE_QA}`)
    const dealId = antes.id
    console.log(`Modo ${m} · contacto ${contactId} · proceso ${dealId} (${antes.stage})`)
    const conteoAntes = await contar(c, dealId, contactId)

    // Las notas con la regla de la ruta (`notasParaConvertir`): vacío → la columna no va;
    // con texto → anteriores + renglón en blanco + texto nuevo.
    const textoNuevo = m === 'notas-nuevas' ? TEXTO_NUEVO : ''
    const notas = textoNuevo ? (antes.notes?.trim() ? `${antes.notes}\n\n${textoNuevo}` : textoNuevo) : undefined
    const diaNuevo = '2026-12-15'

    await c.query('BEGIN')
    try {
      // El mismo `update` de `convertirSolicitud`: mismas columnas, `notes` y `created_by`
      // solo cuando corresponden, y el filtro de etapa EN el update.
      const sets = [
        `scheduled_date = $2::date`, `scheduled_time = $3::time`, `assigned_to = $4`,
        `property_address = property_address`, `property_type = $5`, `property_type_other = NULL`,
        `neighborhood = $6`, `rooms = $7`, `covered_area = NULL`,
        `stage = 'scheduled'`, `stage_changed_at = now()`, `updated_at = now()`,
      ]
      const valores: unknown[] = [dealId, diaNuevo, '10:00', claude, 'departamento', '[TEST] Barrio', 2]
      if (notas !== undefined) {
        valores.push(notas)
        sets.push(`notes = $${valores.length}`)
      }
      if (!antes.created_by) {
        valores.push(claude)
        sets.push(`created_by = $${valores.length}`)
      }
      const cambiadas = await c.query<{ id: string }>(
        `UPDATE deals SET ${sets.join(', ')}
          WHERE id = $1 AND (stage = 'request' OR (stage = 'scheduled' AND scheduled_date IS NULL))
          RETURNING id`, valores)
      console.log('\nDentro de la transacción:')
      esperar(cambiadas.rowCount === 1, 'el update cambió exactamente una fila, sin error')

      const despues = (await c.query<FilaProceso>(`SELECT ${COLUMNAS} FROM deals WHERE id = $1`, [dealId])).rows[0]
      const conteoDentro = await contar(c, dealId, contactId)
      esperar(conteoDentro.procesos === 1, 'sigue habiendo un solo proceso para la persona (no se duplicó)')
      esperar(despues.stage === 'scheduled', 'el proceso quedó en scheduled')
      esperar(despues.scheduled_date === diaNuevo, `quedó con el día nuevo (${diaNuevo})`)
      esperar(despues.scheduled_at !== null, `scheduled_at cargado (${despues.scheduled_at})`)
      if (m === 'sin-dia') {
        // Efecto conocido (Risks): la etapa no cambia → el trigger no hace nada.
        esperar(conteoDentro.historial === conteoAntes.historial, 'deal_stage_history NO sumó ninguna fila (la etapa no cambió)')
        esperar(despues.scheduled_at === antes.scheduled_at, 'scheduled_at quedó con el valor de antes (no el de esta coordinación)')
      } else {
        esperar(conteoDentro.historial === conteoAntes.historial + 1, 'deal_stage_history sumó una fila')
        const ultima = (await c.query<{ from_stage: string | null; to_stage: string }>(
          `SELECT from_stage, to_stage FROM deal_stage_history WHERE deal_id = $1 ORDER BY changed_at DESC LIMIT 1`, [dealId])).rows[0]
        esperar(ultima?.from_stage === 'request' && ultima?.to_stage === 'scheduled', 'la fila nueva es request → scheduled')
      }
      if (m === 'notas-vacias') esperar(despues.notes === NOTA_PREVIA, `con el campo vacío la nota sigue igual («${despues.notes}»)`)
      if (m === 'notas-nuevas') {
        esperar(despues.notes === `${NOTA_PREVIA}\n\n${TEXTO_NUEVO}`, 'con texto nuevo: la nota previa, un renglón en blanco y el texto nuevo')
      }
      esperar(conteoDentro.tareas === conteoAntes.tareas, 'no se creó ninguna tarea')
      esperar(conteoDentro.emails === conteoAntes.emails, 'no hay filas nuevas en email_notifications_log')
    } finally {
      await c.query('ROLLBACK')
    }

    console.log('\nDespués del ROLLBACK:')
    const final = (await c.query<FilaProceso>(`SELECT ${COLUMNAS} FROM deals WHERE id = $1`, [dealId])).rows[0]
    const conteoFinal = await contar(c, dealId, contactId)
    esperar(final.stage === antes.stage, `el proceso volvió a ${antes.stage}`)
    esperar(final.scheduled_date === antes.scheduled_date, 'el día volvió a como estaba')
    esperar(final.notes === antes.notes, 'las notas volvieron a como estaban')
    esperar(final.scheduled_at === antes.scheduled_at, 'scheduled_at volvió a como estaba')
    esperar(conteoFinal.historial === conteoAntes.historial, 'deal_stage_history sin filas nuevas')
    esperar(conteoFinal.tareas === conteoAntes.tareas, 'ninguna tarea nueva')
    esperar(conteoFinal.emails === conteoAntes.emails, 'ningún email registrado para ese proceso')
    console.log('\nOK')
  } finally {
    await c.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
