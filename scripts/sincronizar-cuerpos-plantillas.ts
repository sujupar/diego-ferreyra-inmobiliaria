/**
 * Regenera `lib/integrations/whatsapp/cuerpos-aprobados.ts` con el texto EXACTO
 * de las plantillas aprobadas en Meta.
 *
 * POR QUÉ SE GENERA Y NO SE ESCRIBE A MANO: ese archivo alimenta lo que el
 * equipo LEE en el Inbox como "el mensaje que recibió el cliente". Si el texto
 * local se desincroniza del aprobado, la pantalla mostraría un mensaje que la
 * persona nunca recibió — peor que mostrar los parámetros sueltos, porque nadie
 * sospecharía nada. Transcribir diez cuerpos a mano garantiza que tarde o
 * temprano uno quede viejo; generarlos no.
 *
 * Correlo después de crear o editar cualquier plantilla en Meta, y commiteá el
 * archivo resultante.
 *
 * Uso (tsx está roto con Node 24.19; el stripping nativo alcanza porque este
 * script no usa alias `@/`):
 *   node --experimental-strip-types --env-file=.env.local scripts/sincronizar-cuerpos-plantillas.ts
 */
import { writeFileSync } from 'node:fs'

const DESTINO = 'lib/integrations/whatsapp/cuerpos-aprobados.ts'

interface Componente { type?: string; text?: string }
interface Plantilla { name: string; status: string; components?: Componente[] }

function env(nombre: string): string {
  const v = process.env[nombre]
  if (!v) throw new Error(`Falta ${nombre} en el entorno`)
  return v
}

async function main() {
  const api = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
  const waba = env('WHATSAPP_BUSINESS_ACCOUNT_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')

  const res = await fetch(
    `https://graph.facebook.com/${api}/${waba}/message_templates?limit=200&fields=name,status,components&access_token=${encodeURIComponent(token)}`,
  )
  const j = (await res.json()) as { data?: Plantilla[]; error?: unknown }
  if (!res.ok || j.error) throw new Error(`Meta rechazó la consulta: ${JSON.stringify(j.error ?? j).slice(0, 300)}`)

  const aprobadas = (j.data ?? []).filter(t => t.status === 'APPROVED')
  const entradas: Array<[string, string]> = []
  for (const t of aprobadas) {
    const cuerpo = (t.components ?? []).find(c => c.type === 'BODY')?.text
    // Sin cuerpo no hay nada que mostrar; se saltea en vez de escribir vacío.
    if (cuerpo && cuerpo.trim()) entradas.push([t.name, cuerpo])
  }
  entradas.sort((a, b) => a[0].localeCompare(b[0]))

  const lineas = entradas.map(([n, c]) => `  ${JSON.stringify(n)}: ${JSON.stringify(c)},`).join('\n')
  const archivo = `/**
 * GENERADO por \`scripts/sincronizar-cuerpos-plantillas.ts\`. NO EDITAR A MANO.
 *
 * Es el texto EXACTO de las plantillas APROBADAS en Meta, y de acá sale lo que
 * el equipo lee en el Inbox como el mensaje que recibió el cliente. Editarlo a
 * mano lo desincroniza de lo aprobado y la pantalla pasaría a mostrar mensajes
 * que nadie recibió.
 *
 * Última sincronización: ${new Date().toISOString().slice(0, 10)} — ${entradas.length} plantillas.
 */
export const CUERPOS_APROBADOS: Record<string, string> = {
${lineas}
}
`
  writeFileSync(DESTINO, archivo, 'utf8')
  console.log(`${entradas.length} plantillas escritas en ${DESTINO}:`)
  for (const [n] of entradas) console.log(`  ${n}`)
  const sinCuerpo = aprobadas.length - entradas.length
  if (sinCuerpo > 0) console.log(`\n(${sinCuerpo} aprobadas sin componente BODY, se saltearon)`)
}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
