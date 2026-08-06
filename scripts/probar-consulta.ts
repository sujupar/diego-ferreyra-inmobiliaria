/**
 * Dispara UNA consulta de prueba, como si hubiera entrado por un portal.
 *
 * Crea la fila en `portal_inquiries` con los datos que se le pasan y llama al
 * mismo `responderConsulta` que va a correr en producción — no una copia. Lo
 * que se ve acá es lo que va a pasar de verdad.
 *
 * MANDA UN WHATSAPP REAL. Por eso exige `--commit` y el teléfono explícito, y
 * por eso el modo prueba (`consulta_test_phones`) sigue vigente: si el número no
 * está en esa lista, no se manda aunque este script diga que sí.
 *
 * Uso:
 *   npm i --no-save server-only    # solo la primera vez, ver abajo
 *   node --env-file=.env.local --import tsx scripts/probar-consulta.ts --tel 573107822955 --propiedad "Entre Ríos"
 *   ...agregando --commit para que salga de verdad.
 *
 * Lo de `server-only`: es un paquete que existe dentro del build de Next y no
 * fuera. La cadena de notificaciones por mail lo importa, así que corriendo esto
 * como script suelto hay que instalarlo (es un archivo vacío, no hace nada).
 */
import { createClient } from '@supabase/supabase-js'

function arg(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i > -1 ? process.argv[i + 1] : undefined
}

async function main() {
  const { responderConsulta } = await import('@/lib/leads/responder-consulta')
  const tel = arg('tel')
  const busqueda = arg('propiedad') ?? 'Entre Ríos'
  const nombre = arg('nombre') ?? 'Julián'
  const mensaje = arg('mensaje') ?? 'Hola, me interesa esta propiedad. ¿Sigue disponible?'
  const commit = process.argv.includes('--commit')
  if (!tel) throw new Error('Falta --tel <telefono en E.164 sin +>')

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: props } = await sb
    .from('properties')
    .select('id, address, plans, video_file_url, photos, status')
    .ilike('address', `%${busqueda}%`)
    .eq('status', 'approved')
    .limit(5)
  const candidatas = (props ?? []) as Array<{ id: string; address: string; plans: string[] | null; video_file_url: string | null; photos: string[] | null }>
  const prop = candidatas.find(p => (p.plans ?? []).length > 0) ?? candidatas[0]
  if (!prop) throw new Error(`No encontré ninguna propiedad publicada que matchee "${busqueda}"`)

  console.log(`Propiedad: ${prop.address}`)
  console.log(`  plano: ${(prop.plans ?? []).length > 0 ? 'sí' : 'no'} · video: ${prop.video_file_url ? 'sí' : 'no'} · fotos: ${(prop.photos ?? []).length}`)
  console.log(`Consulta simulada de ${nombre} (${tel}): "${mensaje}"`)

  const { data: ajustes } = await sb
    .from('ai_agent_settings').select('consulta_respuesta_enabled, consulta_test_phones').eq('id', true).maybeSingle()
  console.log(`Interruptor: ${(ajustes as { consulta_respuesta_enabled: boolean } | null)?.consulta_respuesta_enabled} · lista de prueba: ${JSON.stringify((ajustes as { consulta_test_phones: string[] } | null)?.consulta_test_phones)}`)

  if (!commit) {
    console.log('\nDRY-RUN. Agregá --commit para crear la consulta y mandar el WhatsApp de verdad.')
    return
  }

  const { data: creada, error } = await sb
    .from('portal_inquiries')
    .insert({
      portal: 'zonaprop',
      inquiry_type: 'whatsapp',
      received_at: new Date().toISOString(),
      lead_name: nombre,
      lead_phone: `+${tel}`,
      lead_message: mensaje,
      property_id: prop.id,
      property_address: prop.address,
      // Marca de prueba: para poder distinguirla de las reales después.
      raw_subject: '[PRUEBA] consulta simulada desde scripts/probar-consulta.ts',
    })
    .select('id')
    .single()
  if (error || !creada) throw new Error(`No se pudo crear la consulta: ${error?.message}`)

  const id = (creada as { id: string }).id
  console.log(`\nConsulta creada: ${id}`)
  const r = await responderConsulta(id)
  console.log('Resultado:', JSON.stringify(r, null, 1))
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
