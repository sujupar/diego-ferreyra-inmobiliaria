/**
 * Completa el enlace y la foto del aviso en las consultas SIN propiedad que ya
 * entraron (spec 2026-10-30-conectar-avisos). Lee UN mail por aviso (portal +
 * código agrupable) y escribe en todas las consultas de ese aviso que no los
 * tienen; las que no agrupan, de a una. Nunca pisa un dato que ya está.
 *
 * Simula por defecto. Con --commit escribe.
 *   node --env-file=../../../.env.local --import tsx scripts/completar-enlaces-avisos.ts [--commit]
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getMessage } from '@/lib/integrations/gmail/core'
import { codigoAgrupable } from '@/lib/consultas/avisos'
import { fotoDelAviso, resolverAvisoZonaprop } from '@/lib/integrations/portal-inquiries/aviso-del-mail'

const COMMIT = process.argv.includes('--commit')

interface Fila {
  id: string
  portal: string
  property_external_code: string | null
  property_url: string | null
  property_photo_url: string | null
  gmail_message_id: string | null
  received_at: string | null
}

async function leerSinPropiedad(sb: SupabaseClient): Promise<Fila[]> {
  const filas: Fila[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from('portal_inquiries')
      .select('id, portal, property_external_code, property_url, property_photo_url, gmail_message_id, received_at')
      .is('property_id', null)
      .in('portal', ['zonaprop', 'argenprop'])
      .order('id', { ascending: true })
      .range(desde, desde + 999)
    if (error) throw new Error(`leer consultas: ${error.message}`)
    filas.push(...((data ?? []) as Fila[]))
    if ((data ?? []).length < 1000) return filas
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan las credenciales de Supabase')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const filas = await leerSinPropiedad(sb)
  const grupos = new Map<string, Fila[]>()
  for (const f of filas) {
    const clave = codigoAgrupable(f.portal, f.property_external_code) ? `${f.portal}\u0000${f.property_external_code}` : f.id
    grupos.set(clave, [...(grupos.get(clave) ?? []), f])
  }
  console.log(`${filas.length} consultas sin propiedad en ${grupos.size} grupos — ${COMMIT ? 'ESCRIBIENDO' : 'simulacro'}`)

  const totales = { gruposLeidos: 0, conEnlace: 0, conFoto: 0, consultasEnlace: 0, consultasFoto: 0, sinMail: 0, fallos: 0 }
  for (const grupo of grupos.values()) {
    const faltaEnlace = grupo.filter((f) => !f.property_url)
    const faltaFoto = grupo.filter((f) => !f.property_photo_url)
    if (faltaEnlace.length === 0 && faltaFoto.length === 0) continue
    const portal = grupo[0].portal
    // El mail más nuevo del aviso: si cambió de título o de foto, se ve la actual.
    const fuente = [...grupo].filter((f) => f.gmail_message_id)
      .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))[0]
    if (!fuente?.gmail_message_id) { totales.sinMail++; continue }
    try {
      const mail = await getMessage(fuente.gmail_message_id)
      totales.gruposLeidos++
      const foto = fotoDelAviso(portal, mail.html ?? '')
      const yaConocido = grupo.find((f) => f.property_url)?.property_url ?? null
      const enlace = yaConocido ?? (portal === 'zonaprop'
        ? await resolverAvisoZonaprop(mail.html ?? '', { fetch: (u, i) => fetch(u, i), techoMs: 8000 })
        : null)
      const codigo = grupo[0].property_external_code ?? '(sin código)'
      console.log(`${portal} ${codigo} · ${grupo.length} consultas · enlace ${enlace ? 'sí' : 'NO'} · foto ${foto ? 'sí' : 'NO'}`)

      if (enlace && faltaEnlace.length > 0) {
        totales.conEnlace++
        totales.consultasEnlace += faltaEnlace.length
        if (COMMIT) {
          const { error } = await sb.from('portal_inquiries').update({ property_url: enlace })
            .in('id', faltaEnlace.map((f) => f.id)).is('property_url', null)
          if (error) throw new Error(`escribir enlace: ${error.message}`)
        }
      }
      if (foto && faltaFoto.length > 0) {
        totales.conFoto++
        totales.consultasFoto += faltaFoto.length
        if (COMMIT) {
          const { error } = await sb.from('portal_inquiries').update({ property_photo_url: foto })
            .in('id', faltaFoto.map((f) => f.id)).is('property_photo_url', null)
          if (error) throw new Error(`escribir foto: ${error.message}`)
        }
      }
    } catch (e) {
      totales.fallos++
      console.error(`  falló ${portal} ${grupo[0].property_external_code}:`, e instanceof Error ? e.message : e)
    }
  }
  console.log(totales)
  if (!COMMIT) console.log('Simulacro: no se escribió nada. Repetir con --commit.')
}

main().catch((e) => { console.error(e); process.exit(1) })
