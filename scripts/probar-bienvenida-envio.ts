/**
 * Prueba de punta a punta del primer WhatsApp con video (tasacion-video-bienvenida, tareas 7.2 y
 * 7.3). Llama al MISMO manejador que usa la cola del embudo (`ejecutarTrabajo('whatsapp', …)`)
 * con un contacto `[TEST]` (fuera de toda métrica) y el teléfono que se le pase.
 *
 * Por qué un script y no un registro en la vista previa: la cola la dispara pg_cron contra
 * PRODUCCIÓN, así que un registro hecho en la vista previa lo atiende el código de main.
 *
 *   node --require ./scripts/precarga-server-only.cjs --env-file=<.env.local> --import tsx \
 *     scripts/probar-bienvenida-envio.ts enviar <plantilla> <teléfono E.164 sin +>
 *   … falla-enlace <plantilla> <teléfono>   → sin contacto: tiene que salir tasacion_llamada_v1
 *   … borrar                                 → borra el contacto y el proceso [TEST]
 *
 * MANDA DE VERDAD (fuerza WHATSAPP_TEST_MODE=false solo en este proceso). Usar solo con un
 * teléfono propio del equipo.
 */
import { createClient } from '@supabase/supabase-js'

const NOMBRE = '[TEST] Prueba video bienvenida'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function contactoYProceso(): Promise<{ contactId: string; dealId: string }> {
  const db = sb()
  const { data: ya } = await db.from('contacts').select('id').eq('full_name', NOMBRE).limit(1).maybeSingle()
  const contactId = (ya as { id: string } | null)?.id
    ?? ((await db.from('contacts').insert({ full_name: NOMBRE }).select('id').single()).data as { id: string }).id
  const { data: d } = await db.from('deals').select('id').eq('contact_id', contactId).limit(1).maybeSingle()
  const dealId = (d as { id: string } | null)?.id
    ?? ((await db.from('deals').insert({ contact_id: contactId, stage: 'request', origin: null, property_address: '[TEST] prueba video' })
      .select('id').single()).data as { id: string }).id
  return { contactId, dealId }
}

async function main() {
  const [modo, plantilla, telefono] = process.argv.slice(2)
  if (modo === 'borrar') {
    const db = sb()
    const { data: c } = await db.from('contacts').select('id').eq('full_name', NOMBRE)
    for (const { id } of (c ?? []) as { id: string }[]) {
      const { data: e } = await db.from('video_bienvenida_enlaces').select('codigo').eq('contact_id', id).maybeSingle()
      if (e) {
        const anon = `bv:${(e as { codigo: string }).codigo}`
        await db.from('video_view_state').delete().eq('anon_id', anon)
        await db.from('anon_identity').delete().eq('anon_id', anon)
      }
      await db.from('deals').delete().eq('contact_id', id)
      await db.from('contacts').delete().eq('id', id)
    }
    console.log(`borrados: ${(c ?? []).length} contacto(s) [TEST]`)
    return
  }
  if (!['enviar', 'falla-enlace'].includes(modo) || !plantilla || !/^\d{10,15}$/.test(telefono ?? '')) {
    throw new Error('Uso: enviar|falla-enlace <plantilla> <teléfono E.164 sin +>  ·  borrar')
  }
  process.env.WHATSAPP_TEMPLATE_TASACION = plantilla
  // `--seco`: corre todo en modo prueba (registra pero no llama a Meta).
  process.env.WHATSAPP_TEST_MODE = process.argv.includes('--seco') ? 'true' : 'false'
  const { contactId, dealId } = await contactoYProceso()
  const { ejecutarTrabajo } = await import('@/lib/funnel/side-effect-handlers')
  const payload = {
    funnel: 'tasacion',
    dealId,
    contactId: modo === 'falla-enlace' ? null : contactId,
    nombre: 'Julián Prueba',
    phone: `+${telefono}`,
  }
  const r = await ejecutarTrabajo('whatsapp', payload)
  console.log(`resultado del trabajo: ${r}`)
  const { data: e } = await sb().from('video_bienvenida_enlaces').select('codigo, enviado_at, wamid, deal_envio').eq('contact_id', contactId).maybeSingle()
  console.log('enlace:', e)
  const { data: m } = await sb().from('whatsapp_messages').select('template_name, status, body_preview, created_at')
    .like('phone_e164', `%${telefono.slice(-10)}`).order('created_at', { ascending: false }).limit(1).maybeSingle()
  console.log('último mensaje registrado:', m)
}

main().catch((e) => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
