import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  ESQUEMA_META,
  ETAPAS_CON_TASACION,
  ETAPA_LOG,
  PUBLICO_EXCLUIR_PIDIERON_TASACION,
  armarListaDeExclusion,
  decidirReemplazo,
  problemaDeRecepcion,
  type ContactoDeProceso,
} from '@/lib/marketing/exclusion-pidieron-tasacion'
import { reemplazarListaDeClientes } from '@/lib/marketing/meta-custom-audiences'

export const dynamic = 'force-dynamic'

/**
 * POST|GET /api/cron/meta-exclusion-sync  (?simular=1 calcula sin llamar a Meta)
 *
 * Reemplaza todos los días la lista de Meta "DF · EXCLUIR Pidieron tasación" con quienes pidieron
 * tasación por el embudo o ya tuvieron una coordinada (cualquier origen), para que dejen de ver los
 * anuncios de "pedí tu tasación". Reglas en `lib/marketing/exclusion-pidieron-tasacion.ts`.
 *
 * Lo dispara pg_cron (job `meta-exclusion-sync`, 06:30 UTC). Cada corrida —también un freno o un
 * error— deja una fila en `funnel_meta_sync_log` con stage `excluir_pidieron_tasacion`.
 */
function servicio(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function autorizado(sb: SupabaseClient, provisto: string | null): Promise<boolean> {
  if (!provisto) return false
  if (process.env.CRON_SECRET && provisto === process.env.CRON_SECRET) return true
  const { data, error } = await sb.from('cron_config').select('value').eq('key', 'meta_exclusion_sync').maybeSingle()
  if (error) {
    console.error('[meta-exclusion-sync] no pude leer cron_config:', error.message)
    return false
  }
  const secreto = (data as { value?: string } | null)?.value
  return !!secreto && provisto === secreto
}

interface FilaProceso {
  id: string
  contact: { full_name: string | null; email: string | null; phone_norm: string | null }
    | { full_name: string | null; email: string | null; phone_norm: string | null }[]
    | null
}

/** Contactos de los procesos que cuentan, paginado: PostgREST corta en 1000 filas sin avisar. */
async function leerContactos(sb: SupabaseClient): Promise<ContactoDeProceso[]> {
  const contactos: ContactoDeProceso[] = []
  const filtro = `origin.eq.embudo,stage.in.(${ETAPAS_CON_TASACION.join(',')})`
  const PAGINA = 1000
  for (let desde = 0; desde < 50_000; desde += PAGINA) {
    const { data, error } = await sb
      .from('deals')
      .select('id, contact:contacts(full_name, email, phone_norm)')
      .or(filtro)
      .order('id')
      .range(desde, desde + PAGINA - 1)
    if (error) throw new Error(`No pude leer los procesos: ${error.message}`)
    const filas = (data ?? []) as unknown as FilaProceso[]
    for (const f of filas) {
      const c = Array.isArray(f.contact) ? f.contact[0] : f.contact
      if (c) contactos.push({ fullName: c.full_name, email: c.email, phoneNorm: c.phone_norm })
    }
    if (filas.length < PAGINA) return contactos
  }
  throw new Error('Más de 50.000 procesos: revisar la consulta antes de reemplazar nada.')
}

/** Cuántas personas mandó la última corrida que salió bien (para el freno del 80 %). */
async function cantidadAnterior(sb: SupabaseClient): Promise<number | null> {
  const { data, error } = await sb
    .from('funnel_meta_sync_log')
    .select('added')
    .eq('stage', ETAPA_LOG)
    .is('error', null)
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`No pude leer la corrida anterior: ${error.message}`)
  return (data as { added?: number } | null)?.added ?? null
}

async function anotar(sb: SupabaseClient, fila: { added?: number; num_received?: number; error?: string }) {
  const { error } = await sb.from('funnel_meta_sync_log').insert({ stage: ETAPA_LOG, ...fila })
  if (error) console.error('[meta-exclusion-sync] no pude anotar la corrida:', error.message)
}

async function handle(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'meta-exclusion-sync' })
  }

  const sb = servicio()
  if (!(await autorizado(sb, req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const simular = searchParams.get('simular') === '1'
  // ?forzar=1 (con el secreto): para una baja legítima de más del 20 %, que si no frenaría todos los días.
  const forzar = searchParams.get('forzar') === '1'

  try {
    const lista = armarListaDeExclusion(await leerContactos(sb))
    const anterior = await cantidadAnterior(sb)
    const decision = decidirReemplazo(lista.length, anterior, forzar)

    if (simular) {
      return NextResponse.json({ ok: true, simulado: true, personas: lista.length, anterior, decision })
    }
    if (!decision.reemplazar) {
      await anotar(sb, { added: 0, error: `Freno: ${decision.motivo}` })
      return NextResponse.json({ ok: false, frenado: true, motivo: decision.motivo, personas: lista.length, anterior })
    }

    const r = await reemplazarListaDeClientes(PUBLICO_EXCLUIR_PIDIERON_TASACION, ESQUEMA_META, lista)
    const problema = problemaDeRecepcion(lista.length, r.numInvalid)
    // Con problema queda como error: tampoco sirve de base para el freno de la próxima corrida.
    await anotar(sb, { added: lista.length, num_received: r.numReceived, ...(problema ? { error: problema } : {}) })
    return NextResponse.json({ ok: !problema, enviadas: lista.length, recibidas: r.numReceived, invalidas: r.numInvalid, anterior, ...(problema ? { problema } : {}) })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[meta-exclusion-sync] falló:', msg)
    if (!simular) await anotar(sb, { error: msg.slice(0, 1000) })
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
