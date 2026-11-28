// Claude por la CLI `claude` (Claude Code) con la sesión del plan del dueño.
// Mientras el radar está en pruebas internas la IA corre por acá; para pasar a una
// API alcanza con RADAR_IA=gemini (ver motor.ts).
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ParteIA } from './motor'

// launchd no tiene ~/.local/bin en el PATH: por eso la ruta absoluta.
function binarioClaude(): string {
  return process.env.RADAR_CLAUDE_BIN ?? path.join(os.homedir(), '.local/bin/claude')
}

/**
 * Argumentos de la CLI. Aislamiento medido el 2026-11-28 (ver el reporte del Task 5b):
 * - `--setting-sources ''`: no carga los settings del usuario (hooks, plugins). La sesión
 *   del plan vive en el llavero, no en los settings, así que se conserva.
 * - `--tools Read` + `--allowedTools Read`: la única herramienta que existe es Read (para
 *   mirar las imágenes) y no pide permiso. Nada de escribir ni ejecutar.
 * - NO `--bare`: en ese modo la autenticación es solo ANTHROPIC_API_KEY, no el plan.
 * - NUNCA `--dangerously-skip-permissions`.
 */
export function armarArgsClaude(opts: { system: string; modelo: string }): string[] {
  return [
    '-p',
    '--output-format', 'json',
    '--model', opts.modelo,
    '--system-prompt', opts.system,
    '--setting-sources', '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--tools', 'Read',
    '--allowedTools', 'Read',
  ]
}

/** Del primer `{` a su `}` de cierre, respetando strings. null si no hay objeto. */
function primerObjetoJSON(texto: string): string | null {
  const inicio = texto.indexOf('{')
  if (inicio < 0) return null
  let nivel = 0
  let enString = false
  let escape = false
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i]
    if (enString) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') enString = false
      continue
    }
    if (c === '"') enString = true
    else if (c === '{') nivel++
    else if (c === '}') {
      nivel--
      if (nivel === 0) return texto.slice(inicio, i + 1)
    }
  }
  return null
}

interface SobreClaude {
  type?: string
  is_error?: boolean
  result?: unknown
  usage?: { cache_creation_input_tokens?: number; cache_read_input_tokens?: number }
}

function parsearSobre(salidaStdout: string): SobreClaude {
  let sobre: unknown
  try {
    sobre = JSON.parse(salidaStdout.trim())
  } catch {
    throw new Error('Claude no devolvió el sobre JSON esperado')
  }
  if (!sobre || typeof sobre !== 'object') throw new Error('Claude no devolvió el sobre JSON esperado')
  return sobre as SobreClaude
}

/** Saca el texto JSON de la respuesta (`--output-format json`). Tira si no hay JSON. */
export function extraerResultado(salidaStdout: string): string {
  const sobre = parsearSobre(salidaStdout)
  if (sobre.is_error) {
    const msg = typeof sobre.result === 'string' ? sobre.result : 'error sin detalle'
    throw new Error(`Claude respondió con error: ${msg.slice(0, 300)}`)
  }
  if (typeof sobre.result !== 'string') throw new Error('La respuesta de Claude no trae result')
  const objeto = primerObjetoJSON(sobre.result)
  if (!objeto) throw new Error('La respuesta de Claude no trae un objeto JSON')
  return objeto
}

function armarPrompt(partes: ParteIA[], imagenes: string[]): string {
  const textos = partes.flatMap((p) => ('texto' in p ? [p.texto] : []))
  const aviso = imagenes.length
    ? [`Mirá las imágenes ${imagenes.map((n) => `./${n}`).join(', ')} con la herramienta Read antes de responder.`]
    : []
  return [...aviso, ...textos].join('\n\n')
}

export async function pedirAClaude(opts: {
  system: string
  partes: ParteIA[]
  modelo: string
  timeoutMs: number
}): Promise<string> {
  // Directorio propio: así no hay CLAUDE.md de ningún proyecto que se cuele en el contexto.
  const base = path.join(os.homedir(), '.radar-referencias', 'tmp')
  await mkdir(base, { recursive: true, mode: 0o700 })
  const dir = path.join(base, `ia-${randomUUID()}`)
  await mkdir(dir, { mode: 0o700 })
  try {
    const imagenes: string[] = []
    for (const p of opts.partes) {
      if (!('imagen' in p)) continue
      const nombre = `imagen-${String(imagenes.length + 1).padStart(2, '0')}.jpg`
      await copyFile(p.imagen, path.join(dir, nombre))
      imagenes.push(nombre)
    }
    const stdout = await correrClaude(
      armarArgsClaude({ system: opts.system, modelo: opts.modelo }),
      armarPrompt(opts.partes, imagenes),
      dir,
      opts.timeoutMs,
    )
    if (process.env.RADAR_IA_DEBUG === '1') {
      // Solo números: nunca el prompt ni la respuesta.
      try {
        const u = parsearSobre(stdout).usage
        console.error(
          `[ia] claude: cache_creation=${u?.cache_creation_input_tokens ?? '?'} cache_read=${u?.cache_read_input_tokens ?? '?'}`,
        )
      } catch {
        /* el error real lo tira extraerResultado */
      }
    }
    return extraerResultado(stdout)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

function correrClaude(args: string[], prompt: string, cwd: string, timeoutMs: number): Promise<string> {
  // Sin ANTHROPIC_API_KEY: que nunca se facture por API sin querer; usa el plan.
  // Sin CLAUDECODE: que no se crea anidado dentro de otra sesión de Claude Code.
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.CLAUDECODE

  return new Promise((resolve, reject) => {
    const hijo = spawn(binarioClaude(), args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let vencido = false
    hijo.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d))
    hijo.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d))

    const reloj = setTimeout(() => {
      vencido = true
      hijo.kill('SIGTERM')
      setTimeout(() => hijo.kill('SIGKILL'), 2000).unref()
    }, timeoutMs)

    hijo.on('error', (e) => {
      clearTimeout(reloj)
      reject(new Error(`No se pudo ejecutar Claude (${(e as NodeJS.ErrnoException).code ?? e.name})`))
    })
    hijo.on('close', (codigo) => {
      clearTimeout(reloj)
      if (vencido) return reject(new Error('Claude no respondió a tiempo'))
      if (codigo === 0 || stdout.trim().startsWith('{')) return resolve(stdout)
      reject(new Error(`Claude terminó con código ${codigo}: ${stderr.trim().slice(0, 300)}`))
    })

    // El texto va por stdin, nunca como argumento (límites de argv y escapes).
    hijo.stdin.on('error', () => {
      /* si el proceso murió antes de leer, lo reporta 'close' */
    })
    hijo.stdin.end(prompt)
  })
}
