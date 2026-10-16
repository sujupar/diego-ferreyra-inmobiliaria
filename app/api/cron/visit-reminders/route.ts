import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as datos from '@/lib/visitas/datos'
import { ventanaDeRecordatorio, decidirRecordatorio, type MotivoSinRecordatorio } from '@/lib/visitas/recordatorio'
import { enviarRecordatorioDeVisita } from '@/lib/email/notifications/visit-reminder-advisor'
import { PREFIJO_ERROR_TIEMPO, type SendEmailResult } from '@/lib/email/resend-client'
import { barrerAvisosPendientes, type ResumenBarrido } from '@/lib/visitas/encuesta/avisos-servicio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Netlify corta la función a los ~26 s (y `maxDuration` no sirve acá). Cada email tiene
 * techo de 8 s (`sendEmail`): con 10 s de presupuesto entra un envío con margen y lo que
 * no entra queda para la corrida siguiente (cada hora) y se cuenta (`pendientesPorTiempo`).
 */
export const PRESUPUESTO_MS = 10_000

/**
 * Compara dos secretos sin filtrar por tiempo CUÁNTO se parecen. `timingSafeEqual` tira
 * si los buffers tienen largo distinto (el secreto correcto siempre tiene el mismo largo;
 * uno provisto más corto o más largo rompería la comparación), así que primero se hashean
 * los dos a un digest de 32 bytes: el largo deja de depender del secreto y nunca hace falta
 * ramificar por longitud (eso sí filtraría cuántos caracteres coinciden).
 */
function compararEnTiempoConstante(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

/**
 * POST/GET /api/cron/visit-reminders — recordatorio "¿se realizó?" al asesor (spec §4.7).
 * La dispara pg_cron cada hora (migración 20261015000001). Antes dependía de una
 * scheduled function de Netlify (no se disparan en este sitio) y leía con la sesión
 * anónima (la RLS devolvía vacío): nunca corrió.
 *
 * Auth DUAL: env CRON_SECRET o cron_config('visit_reminders'). Mismo patrón que
 * app/api/cron/mapa-lugares.
 */
async function autorizado(provisto: string | null): Promise<boolean> {
  if (!provisto) return false
  if (process.env.CRON_SECRET && compararEnTiempoConstante(provisto, process.env.CRON_SECRET)) return true
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) return false
  try {
    const { data, error } = await createClient(url, clave).from('cron_config').select('value').eq('key', 'visit_reminders').maybeSingle()
    if (error) {
      // supabase-js no lanza ante un error de Postgres: sin leer `error` esto fallaba en
      // silencio y el cron quedaba "sin autorizar" sin ningún rastro en los logs.
      console.error('[cron/visit-reminders] no se pudo leer cron_config', error.message)
      return false
    }
    const secretoDb = (data as { value?: string } | null)?.value
    // Un marcador sin reemplazar ('__SECRETO__', público en el repo) nunca es un secreto.
    return !!secretoDb && !secretoDb.startsWith('__') && compararEnTiempoConstante(provisto, secretoDb)
  } catch {
    return false
  }
}

interface Corrida {
  ok: boolean
  ventana: { desde: string; hasta: string }
  revisadas: number
  enviadas: number
  fallidas: number
  /** Subconjunto de `fallidas`: el envío venció y Resend pudo haberlo mandado igual antes del corte. */
  vencidas: number
  salteadas: Array<{ id: string; motivo: MotivoSinRecordatorio | 'reservada_por_otra_corrida' }>
  pendientesPorTiempo: number
  motivo?: string
  firedAt: string
  encuestas?: ResumenBarrido | { error: string }
}

function salio(r: SendEmailResult | null): boolean {
  return !!r && r.ok && r.failed === 0 && r.sent > 0
}

/**
 * Un vencimiento de `sendEmail` aborta el socket de ESTE lado, pero Resend pudo haber
 * aceptado y encolado el mensaje antes del corte (ver el comentario de `enviarConTecho`
 * en resend-client.ts). Si liberáramos la reserva igual que ante cualquier otro fallo, la
 * corrida siguiente reintentaría y podría DUPLICAR un email que en realidad sí salió.
 * Ante esa ambigüedad se prefiere perder un aviso a duplicarlo: no se libera, y queda
 * contado aparte (`vencidas`) para poder mirarlo.
 */
function fueVencimiento(r: SendEmailResult | null): boolean {
  return !!r && r.errors.some(e => e.startsWith(PREFIJO_ERROR_TIEMPO))
}

async function handle(req: NextRequest): Promise<Response> {
  if (new URL(req.url).searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'visit-reminders', auth: 'db+env' })
  }
  if (!(await autorizado(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const inicio = Date.now()
  const ahora = new Date()
  const corrida: Corrida = {
    ok: true, ventana: ventanaDeRecordatorio(ahora), revisadas: 0, enviadas: 0, fallidas: 0, vencidas: 0,
    salteadas: [], pendientesPorTiempo: 0, firedAt: ahora.toISOString(),
  }
  try {
    const visitas = await datos.visitasParaRecordar(corrida.ventana)
    corrida.revisadas = visitas.length
    for (const v of visitas) {
      if (Date.now() - inicio > PRESUPUESTO_MS) { corrida.pendientesPorTiempo++; continue }
      const decision = decidirRecordatorio(v, ahora)
      if (!decision.enviar) { corrida.salteadas.push({ id: v.id, motivo: decision.motivo }); continue }
      const marca = await datos.reservarRecordatorio(v.id, ahora)
      if (!marca) { corrida.salteadas.push({ id: v.id, motivo: 'reservada_por_otra_corrida' }); continue }
      let resultado: SendEmailResult | null = null
      try {
        resultado = await enviarRecordatorioDeVisita({
          visitaId: v.id, scheduledAt: v.scheduled_at, cliente: v.client_name, direccion: v.direccion, asesor: decision.destino,
        })
      } catch (e) {
        console.error('[cron/visit-reminders] no se pudo armar el email', v.id, e)
      }
      if (salio(resultado)) { corrida.enviadas++; continue }
      corrida.fallidas++
      if (fueVencimiento(resultado)) {
        corrida.vencidas++
        console.error('[cron/visit-reminders] el envío venció; Resend pudo haberlo mandado igual: NO se libera (se prefiere perder a duplicar)', v.id)
        continue
      }
      console.error('[cron/visit-reminders] el aviso no salió; se libera para reintentar', v.id, resultado?.errors ?? [])
      try {
        await datos.liberarRecordatorio(v.id, marca)
      } catch (e) {
        // Queda marcada como avisada sin haberlo sido: no se reintenta sola. Va al log con el id.
        console.error('[cron/visit-reminders] no se pudo liberar la reserva; esta visita NO se va a reintentar', v.id, e)
      }
    }
    // Avisos de encuestas que la pantalla de gracias no llegó a disparar (la persona cerró la
    // página). Corre con el MISMO reloj que el recordatorio: cada canal mira cuánto queda.
    try {
      corrida.encuestas = await barrerAvisosPendientes({ inicio, ahora })
    } catch (e) {
      console.error('[cron/visit-reminders] el barrido de encuestas falló', e)
      corrida.encuestas = { error: e instanceof Error ? e.message : 'Error' }
    }
    if (visitas.length === 0) {
      corrida.motivo = 'No hay visitas confirmadas de las últimas 48 h que hayan pasado sin resultado ni aviso.'
    }
    console.log('[cron/visit-reminders]', JSON.stringify(corrida))
    return NextResponse.json(corrida)
  } catch (e) {
    console.error('[cron/visit-reminders] la corrida falló entera:', e)
    return NextResponse.json({ ...corrida, ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> { return handle(req) }
export async function GET(req: NextRequest): Promise<Response> { return handle(req) }
