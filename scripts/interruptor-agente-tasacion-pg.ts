/**
 * Prende o apaga el agente que coordina la TASACIÓN por WhatsApp
 * (`ai_agent_settings.tasacion_enabled`), y muestra a cuántas conversaciones
 * VIVAS afecta antes de tocar nada.
 *
 * POR QUÉ UN SCRIPT Y NO UN UPDATE SUELTO: este interruptor y la plantilla que
 * elige `WHATSAPP_TEMPLATE_TASACION` en Netlify tienen que moverse JUNTOS.
 *
 *   - Plantilla `tasacion_coordinar_*` (con los dos botones) → agente PRENDIDO.
 *     La plantilla pregunta "¿cómo preferís que la coordinemos?"; apagarlo deja
 *     esa pregunta sin nadie que lea la respuesta.
 *   - Plantilla `tasacion_llamada_v1` (sin botones, avisa que llama el equipo)
 *     → agente APAGADO. Prendido, le pediría día, horario y dirección por chat
 *     a alguien que acaba de leer que lo van a llamar.
 *
 * Cambiar uno solo de los dos rompe el flujo en alguna de las dos direcciones,
 * y el síntoma —"el agente no contesta" / "el agente contesta cualquier cosa"—
 * no señala la causa. Por eso el script IMPRIME la advertencia y las
 * conversaciones abiertas, en vez de solo correr el UPDATE.
 *
 * Apagarlo NO cierra las conversaciones vivas ni las esconde: los mensajes
 * entrantes se siguen guardando y quedan visibles en el Inbox para que los
 * atienda una persona. Lo único que deja de pasar es la respuesta automática.
 *
 * Uso (tsx está roto con Node 24.19; el stripping nativo alcanza). `pg` no es
 * dependencia del proyecto — como el resto de los `*-pg.ts`, se instala al
 * momento con `npm i --no-save pg`:
 *   node --experimental-strip-types --env-file=.env.local scripts/interruptor-agente-tasacion-pg.ts            # solo mira
 *   node --experimental-strip-types --env-file=.env.local scripts/interruptor-agente-tasacion-pg.ts --apagar
 *   node --experimental-strip-types --env-file=.env.local scripts/interruptor-agente-tasacion-pg.ts --prender
 */
import { Client } from 'pg'

/** Igual que `ETAPAS_ABIERTAS` en `lib/ai/tasacion-agent.ts`. Mantener en espejo. */
const ETAPAS_ABIERTAS = ['request', 'scheduled', 'followup']

const apagar = process.argv.includes('--apagar')
const prender = process.argv.includes('--prender')
if (apagar && prender) {
  console.error('--apagar y --prender a la vez no significa nada. Elegí uno.')
  process.exit(1)
}

const password = process.env.SUPABASE_DB_PASSWORD
if (!password) throw new Error('Falta SUPABASE_DB_PASSWORD en el entorno')

const c = new Client({
  host: 'aws-0-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.mncsnastmcjdjxrehdep',
  database: 'postgres',
  password,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

/**
 * Las conversaciones que el agente atendería AHORA MISMO — un TECHO, no un
 * número exacto.
 *
 * Replica las condiciones que `buscarTratoDeTasacion` pone sobre el TRATO
 * (embudo, etapa abierta, guion empezado, sin cerrar ni derivar), pero no las
 * que pone sobre el contacto: aquella función además exige un contacto cuyos
 * últimos 10 dígitos matcheen el teléfono entrante, y se queda con UN solo
 * trato por teléfono. Un trato cuyo contacto perdió el teléfono se cuenta acá y
 * no sería atendido nunca.
 *
 * Redondear para arriba es lo correcto en este uso: el número existe para
 * decidir a cuánta gente hay que avisarle que la atienda una persona. Quedarse
 * corto deja a alguien sin atender; pasarse hace revisar un chat de más.
 */
async function conversacionesVivas(): Promise<number> {
  const { rows } = await c.query(
    `SELECT count(*)::int AS n FROM deals
      WHERE origin = 'embudo'
        AND stage = ANY($1::text[])
        AND tasacion_wa_state IS NOT NULL
        AND coalesce((tasacion_wa_state->>'cerrado')::boolean, false) = false
        AND coalesce((tasacion_wa_state->>'derivado')::boolean, false) = false`,
    [ETAPAS_ABIERTAS],
  )
  return rows[0].n as number
}

const { rows: antes } = await c.query('SELECT tasacion_enabled FROM ai_agent_settings LIMIT 1')
if (antes.length === 0) {
  console.error('No hay ninguna fila en ai_agent_settings. Nada que tocar.')
  await c.end()
  process.exit(1)
}
const estabaPrendido = antes[0].tasacion_enabled === true
const vivas = await conversacionesVivas()

console.log(`agente de tasación: ${estabaPrendido ? 'PRENDIDO' : 'apagado'}`)
console.log(`conversaciones con el guion abierto ahora mismo: ${vivas} (como mucho)`)

if (!apagar && !prender) {
  console.log('\n(solo lectura — pasá --apagar o --prender para cambiarlo)')
  await c.end()
  process.exit(0)
}

const destino = prender
if (destino === estabaPrendido) {
  console.log(`\nYa estaba en ${destino ? 'prendido' : 'apagado'}. No se tocó nada.`)
  await c.end()
  process.exit(0)
}

if (apagar && vivas > 0) {
  console.log(
    `\n⚠️  ${vivas} conversación(es) quedan sin respuesta automática desde este momento.\n` +
      '   Siguen visibles en el Inbox: hay que avisarle al equipo que las atienda a mano.',
  )
}

// UPDATE sin WHERE a propósito: `ai_agent_settings` es un singleton impuesto por
// el esquema — `id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id)` (migración
// 20260803000001) sólo admite la fila `id = true`. No hay una segunda fila que
// pisar. El RETURNING confirma el valor que quedó.
const { rows: despues } = await c.query(
  'UPDATE ai_agent_settings SET tasacion_enabled = $1 RETURNING tasacion_enabled',
  [destino],
)
await c.end()

const quedo = despues[0]?.tasacion_enabled === true
if (quedo !== destino) {
  console.error(`\n❌ El UPDATE no dejó el valor esperado (quedó en ${quedo}).`)
  process.exit(1)
}
console.log(`\n✅ agente de tasación: ${estabaPrendido ? 'PRENDIDO' : 'apagado'} → ${quedo ? 'PRENDIDO' : 'apagado'}`)
console.log(
  destino
    ? '   Acordate de que WHATSAPP_TEMPLATE_TASACION apunte a una plantilla CON botones (tasacion_coordinar_v2).'
    : '   Acordate de que WHATSAPP_TEMPLATE_TASACION apunte a tasacion_llamada_v1 (sin botones).',
)
