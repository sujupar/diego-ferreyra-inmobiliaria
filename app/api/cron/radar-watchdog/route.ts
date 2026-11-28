import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calcularEstadoRadar, textoAlerta } from '@/lib/video-refs/estado-radar'
import { leerCorridas } from '@/lib/video-refs/corridas'
import { sendEmail } from '@/lib/email/resend-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/cron/radar-watchdog — el vigilante del radar de referencias de Instagram.
 *
 * Corre cada hora por pg_cron y le avisa por mail a Julián UNA vez por incidente cuando el
 * radar deja de funcionar (Instagram lo frenó, la búsqueda falló, o hace más de 36 h que no
 * corre). Sin esto, el radar podía quedarse mudo semanas y nadie se enteraba.
 *
 * Cómo no repetir el aviso:
 *  - frenado / error: el incidente ES una corrida; se marca `radar_corridas.notificada_at`.
 *  - atrasado / sin_corridas: no hay corrida a la que marcar, así que se guarda cuándo se
 *    avisó en `radar_config('ultimo_aviso_atraso')` y se vuelve a avisar recién a las 24 h.
 * La marca se escribe SOLO si el mail salió: si falló, la próxima hora reintenta.
 * Un error al LEER (corridas, conteo, último aviso) responde 500 sin mandar mail ni escribir
 * la marca: no se avisa de un atraso que puede no existir.
 *
 * Auth: header `x-cron-secret` == env CRON_SECRET o cron_config('send_report') (el mismo
 * secreto que reusan los demás jobs).
 */
const REPETIR_ATRASO_MS = 24 * 3_600_000
const CLAVE_AVISO_ATRASO = 'ultimo_aviso_atraso'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

async function isAuthorized(provided: string | null): Promise<boolean> {
  if (!provided) return false
  // Un marcador sin reemplazar nunca autoriza.
  if (provided === '__SECRETO__') return false
  if (process.env.CRON_SECRET && provided === process.env.CRON_SECRET) return true
  try {
    const { data } = await admin().from('cron_config').select('value').eq('key', 'send_report').maybeSingle()
    const dbSecret = (data as { value?: string } | null)?.value
    return !!dbSecret && dbSecret !== '__SECRETO__' && provided === dbSecret
  } catch {
    return false
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** GET solo responde `?ping=1` (verificación de deploy); nunca ejecuta trabajo. */
export async function GET(req: NextRequest): Promise<Response> {
  if (new URL(req.url).searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'radar-watchdog' })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!(await isAuthorized(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const db = admin()
    const ahora = new Date()

    const { ultima, ultimaOk } = await leerCorridas(db)
    const estado = calcularEstadoRadar(ultimaOk, ultima, ahora)
    if (!estado.alerta) return NextResponse.json({ ok: true, alerta: null, avisado: false })

    // Radar todavía no instalado (nunca hubo ninguna corrida, ni siquiera fallida): no se
    // avisa, sería un mail por algo que todavía no se configuró.
    if (estado.alerta === 'sin_corridas') {
      const { count, error: errCount } = await db.from('radar_corridas').select('id', { count: 'exact', head: true })
      // Sin poder contar no se sabe si es "no instalado" o "nunca corrió": 500, sin mail ni marca.
      if (errCount) throw new Error(`no se pudo contar radar_corridas: ${errCount.message}`)
      if (!count) return NextResponse.json({ ok: true, alerta: 'sin_corridas', avisado: false, motivo: 'radar no instalado' })
    }

    // ¿Ya se avisó de ESTE incidente?
    const porCorrida = estado.alerta === 'frenado' || estado.alerta === 'error'
    if (porCorrida) {
      if (!ultima || ultima.notificada_at) return NextResponse.json({ ok: true, alerta: estado.alerta, avisado: false, motivo: 'ya avisado' })
    } else {
      const { data, error: errAviso } = await db.from('radar_config').select('valor').eq('clave', CLAVE_AVISO_ATRASO).maybeSingle()
      if (errAviso) throw new Error(`no se pudo leer ${CLAVE_AVISO_ATRASO}: ${errAviso.message}`)
      const ultimoAviso = (data as { valor?: string | null } | null)?.valor
      if (ultimoAviso && ahora.getTime() - new Date(ultimoAviso).getTime() < REPETIR_ATRASO_MS) {
        return NextResponse.json({ ok: true, alerta: estado.alerta, avisado: false, motivo: 'ya avisado' })
      }
    }

    const destino = process.env.EMAIL_ALERTAS_RADAR || process.env.EMAIL_REPLY_TO || 'contacto.julianparra@gmail.com'
    const titulo = textoAlerta(estado, ahora) ?? 'El radar tiene un problema'
    const detalle = estado.ultima?.mensaje
    const r = await sendEmail({
      notificationType: 'radar_watchdog',
      to: destino,
      subject: `Radar de referencias: ${estado.alerta}`,
      html: [
        `<p><b>${esc(titulo)}</b></p>`,
        detalle ? `<p>Detalle: ${esc(detalle)}</p>` : '',
        '<p>Mientras no se arregle, no van a aparecer referencias nuevas en la pantalla Referencias. Lo que ya estaba cargado sigue ahí.</p>',
        '<p style="color:#888">Este aviso se manda una sola vez por problema.</p>',
      ].join('\n'),
      idempotent: false,
      // Un aviso operativo para Julián: el modo prueba de los mails de clientes no lo desvía.
      ignorarModoPrueba: true,
    })
    if (!r.ok) return NextResponse.json({ ok: true, alerta: estado.alerta, avisado: false, motivo: 'no salió el mail' })

    // Marca del aviso (solo si el mail salió).
    if (porCorrida && ultima) {
      await db.from('radar_corridas').update({ notificada_at: ahora.toISOString() }).eq('id', ultima.id)
    } else {
      await db.from('radar_config').upsert({ clave: CLAVE_AVISO_ATRASO, valor: ahora.toISOString() })
    }
    return NextResponse.json({ ok: true, alerta: estado.alerta, avisado: true })
  } catch (e) {
    console.error('[radar-watchdog] la corrida falló:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'error' }, { status: 500 })
  }
}
