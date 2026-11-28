// Comandos del radar que se corren a mano en la Mac del dueño.
//
//   node --import tsx radar/cli.ts login               → abre Chrome con ventana para iniciar sesión
//   node --import tsx radar/cli.ts capturar <usuario>  → lee una cuenta, guarda muestras saneadas y resume
//   node --import tsx radar/cli.ts correr [--seco] [--forzar] → la corrida diaria (log en ~/.radar-referencias/logs/)
//   node --import tsx radar/cli.ts instalar [--rama X]  → clon propio + programación diaria 8:00 (launchd)
//   node --import tsx radar/cli.ts desinstalar          → saca la programación (no toca perfil ni .env)
//
// RADAR_TOPE_CUENTAS_PRUEBA=N (solo para probar en vivo): N cuentas, 3 clasificaciones y 2 términos.
//
// SOLO LEE: ningún comando da like, comenta, sigue ni publica.

import { execFileSync } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { format } from 'node:util'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InstagramCliente } from './instagram/cliente'
import { abrirContexto, pausa, RUTA_BASE, RUTA_PERFIL, tieneSesion } from './instagram/navegador'
import { sanearMuestra } from './instagram/sanear'
import { correr, type OpcionesCorrida } from './correr'
import { diaBA } from './db'
import { ETIQUETA, extraerEnvRadar, parseRama, renderPlist } from './launchd/plist'

const DIR_FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'instagram', 'fixtures')

async function login(): Promise<void> {
  console.log(`Abriendo Chrome con el perfil del robot (${RUTA_PERFIL}).`)
  console.log('Iniciá sesión en Instagram en la ventana. Esto espera hasta 10 minutos.')
  const ctx = await abrirContexto({ headless: false })
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' })
    const limite = Date.now() + 10 * 60 * 1000
    while (Date.now() < limite) {
      if (await tieneSesion(ctx)) {
        // Un respiro para que Instagram termine de escribir el resto de las cookies.
        await pausa(3000, 3000)
        console.log('Sesión lista')
        return
      }
      await pausa(2000, 2000)
    }
    throw new Error('Pasaron 10 minutos sin iniciar sesión. Volvé a correr login.')
  } finally {
    await ctx.close()
  }
}

// Friendly name / nombre interno de cada lectura → archivo de muestra.
const MUESTRAS: Record<string, string> = {
  PolarisProfilePageContentQuery: 'perfil',
  PolarisProfilePostsQuery: 'reels',
  PolarisProfileReelsTabContentQuery: 'reels-pestana',
  PolarisKeywordSearchExplorePageRelayQuery: 'busqueda',
  explorar: 'explorar',
  comentarios: 'comentarios',
  'media-info': 'media-info',
}

/**
 * Lee una cuenta con el cliente real, guarda la primera respuesta cruda de cada tipo
 * (saneada) en radar/instagram/fixtures/ e imprime un resumen de lo parseado.
 */
async function capturar(usuario: string, guardarEnRepo: boolean, nReels: number): Promise<void> {
  // Por defecto las muestras van FUERA del repo: las pruebas están fijadas a las muestras
  // guardadas, y pisarlas con datos nuevos (más vistas, otros reels) las rompería.
  const destino = guardarEnRepo ? DIR_FIXTURES : join(RUTA_BASE, 'tmp', 'muestras')
  mkdirSync(destino, { recursive: true })
  const crudos = new Map<string, unknown>()
  const cliente = await InstagramCliente.abrir({
    headless: true,
    alLeerCrudo: (nombre, json) => {
      const archivo = MUESTRAS[nombre]
      if (archivo && !crudos.has(archivo)) crudos.set(archivo, json)
    },
  })
  try {
    const sessionid = (await cliente.cookie('sessionid')) ?? ''
    const secretos: Array<[string, string]> = [
      [sessionid, '<SESSIONID>'],
      [decodeURIComponent(sessionid), '<SESSIONID>'],
      [(await cliente.cookie('csrftoken')) ?? '', '<CSRF>'],
      [(await cliente.cookie('ds_user_id')) ?? '', '<VIEWER_ID>'],
    ]

    console.log(`Leyendo @${usuario}…`)
    const perfil = await cliente.perfil(usuario)
    console.log(`  perfil: @${perfil.usuario} (id ${perfil.igUserId}), ${perfil.seguidores ?? '?'} seguidores`)
    const reels = await cliente.reelsDeCuenta(perfil, nReels)
    const primero = reels[0]
    console.log(`  reels: ${reels.length}; el primero ${primero?.shortcode ?? '-'} con ${primero?.vistas ?? '?'} vistas (${primero?.publicadoAt ?? '-'})`)
    const cuentas = await cliente.buscarCuentas('inmobiliaria', 10)
    console.log(`  búsqueda "inmobiliaria": ${cuentas.join(', ')}`)
    const explorar = await cliente.explorar(10)
    console.log(`  explorar: ${explorar.length} reels; el primero de @${explorar[0]?.cuenta ?? '-'} con ${explorar[0]?.vistas ?? '?'} vistas`)
    const conComentarios = reels.find((r) => (r.comentarios ?? 0) > 0)
    if (conComentarios) {
      const cs = await cliente.comentarios(conComentarios.pk, 10)
      console.log(`  comentarios de ${conComentarios.shortcode}: ${cs.length} (“${(cs[0] ?? '').slice(0, 50)}”)`)
    }
    if (primero) {
      const info = await cliente.reelPorShortcode(primero.shortcode)
      console.log(`  media-info ${primero.shortcode}: ${info?.vistas ?? '?'} vistas, ${info?.duracionSeg?.toFixed(1) ?? '?'} s`)
    }

    for (const [archivo, json] of crudos) {
      const texto = sanearMuestra(json, secretos)
      writeFileSync(join(destino, `${archivo}.json`), texto + '\n')
      console.log(`  ✓ ${join(destino, archivo)}.json (${texto.length} bytes)`)
    }
  } finally {
    await cliente.cerrar()
  }
}

/** git short sha del código que corre; '?' si no se puede leer (no frena la corrida). */
function versionGit(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: dirname(fileURLToPath(import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || '?'
  } catch {
    return '?'
  }
}

/** Todo lo que se imprime también va a ~/.radar-referencias/logs/AAAA-MM-DD.log (día de Buenos Aires). */
function duplicarSalidaAlLog(): string {
  const dir = join(RUTA_BASE, 'logs')
  mkdirSync(dir, { recursive: true })
  const archivo = join(dir, `${diaBA(new Date())}.log`)
  for (const nivel of ['log', 'warn', 'error'] as const) {
    const original = console[nivel].bind(console)
    console[nivel] = (...args: unknown[]) => {
      original(...args)
      try {
        appendFileSync(archivo, `${new Date().toISOString()} ${nivel === 'log' ? '' : `${nivel.toUpperCase()} `}${format(...args)}\n`)
      } catch {
        // el log en disco nunca frena la corrida
      }
    }
  }
  return archivo
}

async function correrComando(args: string[]): Promise<void> {
  const archivo = duplicarSalidaAlLog()
  const opts: OpcionesCorrida = { seco: args.includes('--seco'), forzar: args.includes('--forzar'), version: versionGit() }
  const prueba = Number(process.env.RADAR_TOPE_CUENTAS_PRUEBA)
  if (Number.isInteger(prueba) && prueba > 0) {
    opts.prueba = { cuentas: prueba, clasificaciones: 3, terminos: 2 }
    console.log(`[radar] topes de prueba: ${prueba} cuentas, 3 clasificaciones, 2 términos`)
  }
  console.log(`[radar] corrida ${opts.seco ? 'EN SECO ' : ''}v${opts.version} — log en ${archivo}`)
  const r = await correr(opts)
  console.log(`[radar] resultado: ${r.estado}, ${r.publicadas} publicadas`)
  if (r.estado === 'error' || r.estado === 'frenada_por_instagram') process.exitCode = 1
}


const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const RUTA_PLIST = join(homedir(), 'Library', 'LaunchAgents', `${ETIQUETA}.plist`)

function sh(cmd: string, args: string[], cwd?: string, tolerar = false): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    if (tolerar) return ''
    throw e
  }
}

function uid(): number {
  return process.getuid?.() ?? Number(sh('id', ['-u']).trim())
}

function desprogramar(): void {
  // bootout falla si no estaba cargado: es lo esperado en una primera instalación.
  sh('launchctl', ['bootout', `gui/${uid()}/${ETIQUETA}`], undefined, true)
}

/** Clon propio fuera de iCloud + .env + plist + launchctl bootstrap. Idempotente. */
function instalar(args: string[]): void {
  const rama = parseRama(args)
  const home = homedir()
  const app = join(RUTA_BASE, 'app')
  mkdirSync(join(RUTA_BASE, 'logs'), { recursive: true })
  writeFileSync(join(RUTA_BASE, 'rama'), rama + '\n')

  if (!existsSync(join(app, '.git'))) {
    const remoto = sh('git', ['remote', 'get-url', 'origin'], RAIZ_REPO).trim()
    console.log(`Clonando el repo en ${app} (rama ${rama})…`)
    sh('git', ['clone', '--branch', rama, remoto, app])
  } else {
    console.log(`El clon ya existe: lo llevo a la rama ${rama}.`)
    sh('git', ['fetch', 'origin', rama], app)
    sh('git', ['checkout', rama], app)
    sh('git', ['merge', '--ff-only', `origin/${rama}`], app)
  }

  console.log('Instalando dependencias (npm ci)…')
  sh('npm', ['ci'], app)
  writeFileSync(join(RUTA_BASE, 'lock-hash'), sh('shasum', ['-a', '256', 'package-lock.json'], app).split(' ')[0] + '\n')

  const envRuta = join(RUTA_BASE, '.env')
  if (existsSync(envRuta)) {
    console.log('.env: ya existe, no se toca.')
  } else {
    const local = join(RAIZ_REPO, '.env.local')
    const contenido = existsSync(local) ? extraerEnvRadar(readFileSync(local, 'utf8')) : null
    if (contenido) {
      writeFileSync(envRuta, contenido, { mode: 0o600 })
      chmodSync(envRuta, 0o600)
      console.log('.env: creado con las 2 claves de Supabase del .env.local.')
    } else {
      console.log(`⚠ Falta ${envRuta}: crealo con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (modo 600).`)
    }
  }

  const plantilla = readFileSync(join(app, 'radar', 'launchd', `${ETIQUETA}.plist.tpl`), 'utf8')
  mkdirSync(dirname(RUTA_PLIST), { recursive: true })
  writeFileSync(RUTA_PLIST, renderPlist(plantilla, { home }))
  desprogramar()
  sh('launchctl', ['bootstrap', `gui/${uid()}`, RUTA_PLIST])
  console.log(`Instalado: corre todos los días a las 8:00 desde ${app} (rama ${rama}).`)
  console.log(`Ver: launchctl print gui/${uid()}/${ETIQUETA}`)
}

function desinstalar(): void {
  desprogramar()
  rmSync(RUTA_PLIST, { force: true })
  console.log('Programación quitada. El perfil, el .env y el clon quedan donde estaban.')
}

async function main(): Promise<void> {
  const [comando, arg, ...resto] = process.argv.slice(2)
  if (comando === 'login') return login()
  if (comando === 'capturar') {
    if (!arg) throw new Error('Uso: node --import tsx radar/cli.ts capturar <usuario> [--reels=N] [--guardar]')
    const nReels = Number(resto.find((x) => x.startsWith('--reels='))?.slice('--reels='.length) ?? 12)
    if (!Number.isInteger(nReels) || nReels < 1 || nReels > 48) throw new Error('--reels=N tiene que ser un entero entre 1 y 48')
    return capturar(arg.replace(/^@/, ''), resto.includes('--guardar'), nReels)
  }
  if (comando === 'instalar') return instalar([arg, ...resto].filter(Boolean))
  if (comando === 'desinstalar') return desinstalar()
  if (comando === 'correr') return correrComando([arg, ...resto].filter(Boolean))
  console.log('Comandos: login | capturar <usuario> | correr [--seco] [--forzar] | instalar [--rama X] | desinstalar')
  process.exitCode = 1
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
