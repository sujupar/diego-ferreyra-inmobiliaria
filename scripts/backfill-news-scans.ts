#!/usr/bin/env tsx
/**
 * Backfill de la tabla `news_scans` a partir de los logs markdown del Reportero.
 *
 * Los barridos viven como `log-YYYY-MM-DD.md` en el workspace de OpenClaw:
 *   /Users/apple/.openclaw/workspace/diego-data/reportero/
 * Cada log trae el ranking del día (titular, medio, fecha, impacto 0-100, por qué
 * le sirve al propietario, ángulo, formato, url). El FORMATO VARÍA entre días:
 * algunos usan una tabla markdown, otros una lista numerada. Este parser es
 * best-effort y tolerante — si un campo no está, queda `null`; nunca inventa.
 *
 * Credenciales: NO usa .env.local. Lee la url y el service_role de
 *   /Users/apple/.openclaw/workspace/diego-data/config/supabase.json
 * (mismo proyecto que la app: mncsnastmcjdjxrehdep).
 *
 * Uso:
 *   # ver qué parsearía, sin tocar la base:
 *   npx tsx scripts/backfill-news-scans.ts --dry-run
 *   # upsert real (onConflict scan_date → re-ejecutable, idempotente):
 *   npx tsx scripts/backfill-news-scans.ts --commit
 *
 * Opcionales:
 *   --dir <ruta>   carpeta de los logs (default: la del workspace de arriba)
 *   --verbose      imprime el detalle de cada ítem parseado
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_DIR = '/Users/apple/.openclaw/workspace/diego-data/reportero'
const CONFIG_PATH = '/Users/apple/.openclaw/workspace/diego-data/config/supabase.json'

interface NewsItem {
  rank: number | null
  titulo: string | null
  medio: string | null
  fecha: string | null
  impacto: number | null
  por_que: string | null
  angulo: string | null
  formato: string | null
  url: string | null
}

// ---- helpers de limpieza ----------------------------------------------------

/** Quita negritas/cursivas/comillas tipográficas y espacios de los bordes. */
function clean(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^["“”'']+|["“”'']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toImpacto(s: string | null | undefined): number | null {
  if (!s) return null
  const m = s.match(/\d{1,3}/)
  if (!m) return null
  const n = Number(m[0])
  return n >= 0 && n <= 100 ? n : null
}

function firstUrl(s: string): string | null {
  const m = s.match(/https?:\/\/[^\s)"'\]]+/)
  return m ? m[0] : null
}

// ---- parser de TABLAS markdown ---------------------------------------------
// Detecta una tabla `| ... |`, lee la fila de header para mapear columnas por
// nombre (el orden varía entre logs) y arma un item por fila de datos.

function parseTables(md: string): NewsItem[] {
  const out: NewsItem[] = []
  const lines = md.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]
    if (!/^\s*\|.*\|\s*$/.test(header)) continue
    const sep = lines[i + 1] || ''
    // La fila siguiente a un header de tabla markdown es el separador `|---|---|`.
    if (!/^\s*\|[\s:|-]+\|\s*$/.test(sep)) continue

    const cols = splitRow(header).map((c) => clean(c).toLowerCase())
    const idx = {
      rank: cols.findIndex((c) => c === '#' || c.startsWith('n')),
      titulo: cols.findIndex((c) => c.includes('titular') || c.includes('noticia')),
      medio: cols.findIndex((c) => c.includes('medio') || c.includes('fuente')),
      fecha: cols.findIndex((c) => c.includes('fecha')),
      impacto: cols.findIndex((c) => c.includes('impacto') || c.includes('puntaje') || c.includes('score')),
    }
    // Si la tabla no tiene ni titular ni noticia, no es la tabla de ranking.
    if (idx.titulo === -1) continue

    for (let j = i + 2; j < lines.length; j++) {
      const row = lines[j]
      if (!/^\s*\|.*\|\s*$/.test(row)) break // fin de la tabla
      const cells = splitRow(row)
      const titulo = clean(cells[idx.titulo])
      if (!titulo || titulo === '—' || titulo === '-') continue // filas separadoras/descartadas vacías
      const rankCell = idx.rank >= 0 ? clean(cells[idx.rank]) : ''
      out.push({
        rank: /^\d+$/.test(rankCell) ? Number(rankCell) : null,
        titulo,
        medio: idx.medio >= 0 ? clean(cells[idx.medio]) || null : null,
        fecha: idx.fecha >= 0 ? clean(cells[idx.fecha]) || null : null,
        impacto: idx.impacto >= 0 ? toImpacto(cells[idx.impacto]) : null,
        por_que: null,
        angulo: null,
        formato: null,
        url: firstUrl(row),
      })
    }
    i = i + 1 // saltar el separador; el for externo sigue después de la tabla
  }
  return out
}

function splitRow(row: string): string[] {
  // `| a | b | c |` -> ['a','b','c'] (descarta los extremos vacíos del pipe).
  const parts = row.split('|')
  return parts.slice(1, parts.length - 1)
}

// ---- parser de LISTAS numeradas --------------------------------------------
// Un ítem es una línea `N. ...` más las líneas que le siguen hasta el próximo
// `N.` o encabezado (ahí viven la url y el cuerpo). Formatos vistos en los logs:
//   `1. **89** — Cronista (15/09) — "titular". Por qué... Formato:... Ángulo:...`
//   `1. (86) TN 17/09 — Titular sin comillas, termina en punto.`
//   `1. **(84) Clarín — "titular"** — 2026-10-08`  (url en la línea de abajo)
//   `1. **iProfesional 19/10** — titular largo... **Impacto 90.** ✅ ENVIADA`

const MEDIOS = [
  'Clarín', 'Clarin', 'Infobae', 'Ámbito', 'Ambito', 'La Nación', 'La Nacion', 'LN',
  'El Cronista', 'Cronista', 'iProfesional', 'TN', 'MDZ', 'mdzol', 'Bloomberg Línea',
  'Bloomberg Linea', 'bloomberglinea', 'Reporte Inmobiliario', 'InfoNegocios', 'elonce',
  'Chequeado', 'fortunaweb', 'Forbes', 'Perfil', 'Página 12', 'Pagina 12',
  // medios que a veces se escriben como dominio
  'mercado.com.ar', 'mercado', 'primeraedicion.com.ar', 'tn.com.ar', 'clarin.com',
  'infobae.com', 'ambito.com', 'lanacion.com.ar', 'urgente24', 'parlamentario', 'yahoo',
]

// Alternación ordenada por longitud desc para que el dominio largo
// (`mercado.com.ar`) gane sobre el corto (`mercado`) en los regex.
const MEDIOS_ALT = [...MEDIOS]
  .sort((a, b) => b.length - a.length)
  .map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

function groupNumberedBlocks(md: string): { rank: number; block: string }[] {
  const lines = md.split('\n')
  const blocks: { rank: number; block: string }[] = []
  let cur: { rank: number; parts: string[] } | null = null
  const flush = () => { if (cur) blocks.push({ rank: cur.rank, block: cur.parts.join(' ').trim() }) }
  for (const raw of lines) {
    const m = raw.match(/^\s*(\d+)\.\s+(.*)$/)
    if (m) {
      flush()
      cur = { rank: Number(m[1]), parts: [m[2]] }
    } else if (cur) {
      // Un encabezado (`## ...`) corta el ítem actual.
      if (/^\s*#{1,6}\s/.test(raw)) { flush(); cur = null; continue }
      if (raw.trim()) cur.parts.push(raw.trim())
    }
  }
  flush()
  return blocks
}

function parseNumberedList(md: string): NewsItem[] {
  const out: NewsItem[] = []
  for (const { rank, block } of groupNumberedBlocks(md)) {
    const url = firstUrl(block)

    // Impacto: `(86)`/`**89**`/`**(84)` al arranque, `(impacto 88)`, o `Impacto 90`.
    let impacto: number | null = null
    const impLabel = block.match(/\bimpacto\s*(\d{1,3})/i)
    // Número al principio del ítem, con o sin paréntesis, con o sin bold, con o
    // sin un separador después. `**89** —`, `(86) TN`, `(82) Menos…`, `**(84) …`.
    const impStart = block.match(/^\s*\**\s*\(\s*(\d{1,3})\s*\)/) || block.match(/^\s*\*\*\s*(\d{1,3})\s*\*\*/)
    if (impLabel) impacto = toImpacto(impLabel[1])
    else if (impStart) impacto = toImpacto(impStart[1])

    // Trabajamos sobre la "cabecera" del ítem: hasta el primer salto fuerte
    // (la url, o una etiqueta de cuerpo). Ahí viven medio/fecha/titular.
    let head = url ? block.slice(0, block.indexOf(url)) : block
    head = head
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[✅❌⚠️🟢🟡🔴👋]/g, ' ')
      .replace(/\bImpacto\s*\d{1,3}\.?/gi, ' ')
      .replace(/\b(VERIFICADO|VERIF ok|ENVIADA|DESCARTADA)\b\.?/gi, ' ')
      .trim()
    // Sacar el impacto del arranque para que no contamine el titular.
    head = head.replace(/^\s*\**\s*\(\s*\d{1,3}\s*\)\s*\**\s*(?:—|-|—)?\s*/, '')
    head = head.replace(/^\s*\*\*\s*\d{1,3}\s*\*\*\s*(?:—|-|—)?\s*/, '').trim()

    // Medio: el primer medio conocido que aparezca en la cabecera.
    let medio: string | null = null
    let fecha: string | null = null
    const headPlain = clean(head)
    const medioRe = new RegExp(`\\b(${MEDIOS_ALT})\\b`, 'i')
    const mm = headPlain.match(medioRe)
    if (mm) medio = mm[1]

    // Fecha: `(dd/mm)`, `dd/mm`, o ISO, donde esté.
    const iso = head.match(/\b(\d{4}-\d{2}-\d{2})\b/)
    const dm = head.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/)
    if (iso) fecha = iso[1]
    else if (dm) fecha = dm[1]

    // Titular. Los logs casi siempre abren el ítem con el metadato
    // (`(NN) Medio (fecha) —`) y luego el titular. Estrategia:
    //  1) pelar ese prefijo de metadato de la cabecera;
    //  2) si lo que queda arranca con comillas o es un bold, usar ese span;
    //  3) si no, tomar la primera oración.
    // Un bold que es sólo medio+fecha NO es titular.
    const esMetadato = (s: string) =>
      new RegExp(`^(${MEDIOS_ALT})\\b[\\s(,/\\d)]*\\.?$`, 'i').test(s) ||
      /^\(?\d{1,2}\/\d{1,2}(\/\d{2,4})?\)?\.?$/.test(s) ||
      /^\d{4}-\d{2}-\d{2}\.?$/.test(s) ||
      (new RegExp(`^(${MEDIOS_ALT})\\b`, 'i').test(s) && s.replace(medioRe, '').replace(/[\d/()\s.,-]/g, '').length < 4)

    // Quita un prefijo `Medio (fecha) —` o `Medio dd/mm —` del arranque de un texto.
    const pelarMetaInicio = (s: string) => {
      let r = s.replace(/^\s*\(?\s*\d{1,3}\s*\)?\s*/, '') // (NN) residual
      r = r.replace(new RegExp(`^\\s*(${MEDIOS_ALT})\\b\\s*\\(?\\s*(\\d{1,2}[/-]\\d{1,2}([/-]\\d{2,4})?|\\d{4}-\\d{2}-\\d{2})?\\s*\\)?\\s*(?:—|-|—|:)?\\s*`, 'i'), '')
      return clean(r)
    }

    let titulo = ''
    // (a) bold que no sea puro metadato → es el titular (puede traer el medio
    //     pegado adelante: `(84) Clarín — "titular"` o `Cronista 09-10 — "..."`).
    const bolds = [...block.matchAll(/\*\*(.+?)\*\*/g)]
      .map((b) => clean(b[1]))
      .filter((b) => b && !/^\(?\s*\d{1,3}\s*\)?$/.test(b) && !/^impacto/i.test(b) && !esMetadato(b))
    if (bolds.length) {
      const best = bolds.sort((a, b) => b.length - a.length)[0]
      const pelado = pelarMetaInicio(best)
      const q = pelado.match(/["“]([^"“”]{6,})["”]/)
      titulo = q ? clean(q[1]) : pelado
    }
    // (b) comillas en la cabecera.
    if (!titulo || esMetadato(titulo)) {
      const quoted = head.match(/["“]([^"“”]{10,})["”]/)
      if (quoted) titulo = clean(quoted[1])
    }
    // (c) primera oración de la cabecera, tras pelar el metadato del inicio.
    if (!titulo || esMetadato(titulo)) {
      const sinMeta = pelarMetaInicio(clean(head))
      const firstSentence = sinMeta.split(/(?<=[a-záéíóúñ0-9%])\.\s/)[0]
      // si todavía arranca con un `—` (el titular iba después), tomar el tramo
      // más largo entre guiones.
      const porGuion = firstSentence.split(/\s[——-]\s/).map(clean).filter((s) => s && !esMetadato(s))
      titulo = clean(porGuion.sort((a, b) => b.length - a.length)[0] || firstSentence)
    }
    // normalizar: sacar medio/fecha que a veces quedan pegados a los bordes
    titulo = clean(titulo
      .replace(new RegExp(`^(${MEDIOS_ALT})\\b[\\s(]*\\d{0,4}[-/\\d]*\\)?\\s*(?:—|-|—|:)?\\s*`, 'i'), '')
      .replace(/[—,-]?\s*\d{4}-\d{2}-\d{2}\.?\s*$/, '')
      .replace(/[—,-]?\s*\(?\d{1,2}\/\d{1,2}(\/\d{2,4})?\)?\.?\s*$/, ''))

    // Campos etiquetados (viven en el cuerpo tras la cabecera).
    const por_que = field(block, ['por qué te sirve', 'por qué sirve', 'por que te sirve', 'por que sirve'])
    const angulo = field(block, ['ángulo', 'angulo'])
    const formato = field(block, ['formato'])

    out.push({
      rank,
      titulo: titulo || null,
      medio: medio ? clean(medio) : null,
      fecha: fecha ? clean(fecha) : null,
      impacto,
      por_que,
      angulo,
      formato: formato ? clean(formato) : null,
      url,
    })
  }
  return out
}

/** Extrae `Etiqueta: <texto hasta la próxima etiqueta o fin>`. */
function field(body: string, labels: string[]): string | null {
  const stops = ['por qué', 'por que', 'ángulo', 'angulo', 'formato', 'decisión', 'decision']
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, 'i')
    const m = body.match(re)
    if (!m) continue
    let txt = m[1]
    // cortar en la próxima etiqueta conocida
    let cut = txt.length
    for (const s of stops) {
      const si = txt.toLowerCase().indexOf(s + ':')
      if (si > 0 && si < cut) cut = si
    }
    txt = txt.slice(0, cut)
    const c = clean(txt).replace(/[.\s]+$/, '')
    if (c) return c
  }
  return null
}

// ---- un log -> items --------------------------------------------------------

function parseLog(md: string): NewsItem[] {
  // Preferimos la tabla (más estructurada). Si no hay tabla con titular,
  // caemos a la lista numerada.
  const fromTable = parseTables(md)
  if (fromTable.length > 0) return fromTable
  return parseNumberedList(md)
}

// ---- main -------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const commit = args.includes('--commit')
  const dryRun = args.includes('--dry-run') || !commit
  const verbose = args.includes('--verbose')
  const dirArg = args.indexOf('--dir')
  const dir = dirArg >= 0 ? args[dirArg + 1] : DEFAULT_DIR

  const files = readdirSync(dir)
    .filter((f) => /^log-\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
  if (files.length === 0) {
    console.error(`No encontré ningún log-YYYY-MM-DD.md en ${dir}`)
    process.exit(1)
  }
  console.log(`${files.length} logs encontrados en ${dir}`)

  const rows: { scan_date: string; items: NewsItem[] }[] = []
  let totalItems = 0
  for (const f of files) {
    const scan_date = f.slice(4, 14) // log-YYYY-MM-DD.md -> YYYY-MM-DD
    const md = readFileSync(join(dir, f), 'utf8')
    const items = parseLog(md)
    totalItems += items.length
    rows.push({ scan_date, items })
    const sample = items[0] ? ` — top: "${(items[0].titulo || '').slice(0, 50)}" (impacto ${items[0].impacto ?? '?'})` : ''
    console.log(`  ${scan_date}: ${items.length} noticias${sample}`)
    if (verbose) for (const it of items) console.log('      ', JSON.stringify(it))
  }
  console.log(`\nTotal: ${totalItems} noticias en ${rows.length} barridos.`)

  const vacios = rows.filter((r) => r.items.length === 0).map((r) => r.scan_date)
  if (vacios.length) {
    console.log(`⚠️  ${vacios.length} logs no parsearon ninguna noticia (formato atípico — revisar a mano):`)
    console.log('   ' + vacios.join(', '))
  }

  if (dryRun) {
    console.log('\n[dry-run] No se escribió nada. Corré con --commit para hacer el upsert.')
    return
  }

  const cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  if (!cfg.url || !cfg.service_role) {
    console.error(`Falta url o service_role en ${CONFIG_PATH}`)
    process.exit(1)
  }
  const db = createClient(cfg.url, cfg.service_role, { auth: { persistSession: false } })

  const payload = rows.map((r) => ({ scan_date: r.scan_date, items: r.items, updated_at: new Date().toISOString() }))
  const { error } = await db.from('news_scans').upsert(payload, { onConflict: 'scan_date' })
  if (error) {
    console.error('Error en el upsert:', error.message)
    process.exit(1)
  }
  console.log(`\n✅ Upsert completo: ${payload.length} barridos en news_scans.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
