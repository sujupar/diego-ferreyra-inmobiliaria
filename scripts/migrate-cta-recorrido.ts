/**
 * Actualiza la etiqueta de los CTA en las landings YA PUBLICADAS.
 *
 * El texto del CTA se congela dentro de `property_landings.content` cuando se
 * genera la landing. Cambiar el código solo afecta a las nuevas: las que ya
 * están publicadas siguen mostrando "Quiero saber más". El dueño pidió el
 * 2026-08-02 que TODOS los botones digan lo mismo.
 *
 * Respalda a disco ANTES de escribir. Idempotente. Modo seguro por default:
 *   node --env-file=.env.local --import tsx scripts/migrate-cta-recorrido.ts           # dry-run
 *   node --env-file=.env.local --import tsx scripts/migrate-cta-recorrido.ts --commit  # escribe
 */
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const NUEVA = 'Ver el recorrido de la propiedad'
const CAMPOS = ['ctaLabel', 'label'] as const

function reemplazar(nodo: unknown): { nodo: unknown; cambios: number } {
  let cambios = 0
  if (Array.isArray(nodo)) {
    const out = nodo.map(n => { const r = reemplazar(n); cambios += r.cambios; return r.nodo })
    return { nodo: out, cambios }
  }
  if (nodo && typeof nodo === 'object') {
    const obj = { ...(nodo as Record<string, unknown>) }
    for (const campo of CAMPOS) {
      if (typeof obj[campo] === 'string' && obj[campo] !== NUEVA) {
        obj[campo] = NUEVA
        cambios++
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      if (CAMPOS.includes(k as (typeof CAMPOS)[number])) continue
      const r = reemplazar(v)
      obj[k] = r.nodo
      cambios += r.cambios
    }
    return { nodo: obj, cambios }
  }
  return { nodo, cambios }
}

async function main() {
  const commit = process.argv.includes('--commit')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db.from('property_landings').select('id, public_slug, status, content, draft_content')
  if (error) throw new Error(error.message)
  const filas = data ?? []

  const backup = `/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/63fe1ae4-4cee-4228-8df6-c5ce0669ce7e/scratchpad/landings-cta-backup-${Date.now()}.json`
  writeFileSync(backup, JSON.stringify(filas, null, 2))
  console.log(`respaldo: ${backup}\n`)

  let tocadas = 0
  for (const l of filas) {
    const c = reemplazar(l.content)
    const d = reemplazar(l.draft_content)
    const total = c.cambios + d.cambios
    console.log(`${total > 0 ? '→' : ' '} ${String(l.status).padEnd(10)} ${l.public_slug ?? l.id}  ${total} etiqueta(s)`)
    if (total === 0 || !commit) continue
    const { error: e } = await db.from('property_landings')
      .update({ content: c.nodo, ...(l.draft_content ? { draft_content: d.nodo } : {}) })
      .eq('id', l.id)
    if (e) console.log(`   ⚠️  ${e.message}`); else tocadas++
  }
  console.log(commit ? `\n✅ ${tocadas} landings actualizadas` : '\n(dry-run — corré con --commit para escribir)')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
