// Comandos del radar que se corren a mano en la Mac del dueño.
//
//   node --import tsx radar/cli.ts login               → abre Chrome con ventana para iniciar sesión
//   node --import tsx radar/cli.ts capturar <usuario>  → lee una cuenta, guarda muestras saneadas y resume
//
// SOLO LEE: ningún comando da like, comenta, sigue ni publica.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InstagramCliente } from './instagram/cliente'
import { abrirContexto, pausa, RUTA_BASE, RUTA_PERFIL, tieneSesion } from './instagram/navegador'
import { sanearMuestra } from './instagram/sanear'

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
async function capturar(usuario: string, guardarEnRepo: boolean): Promise<void> {
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
    const reels = await cliente.reelsDeCuenta(perfil, 12)
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

async function main(): Promise<void> {
  const [comando, arg, ...resto] = process.argv.slice(2)
  if (comando === 'login') return login()
  if (comando === 'capturar') {
    if (!arg) throw new Error('Uso: node --import tsx radar/cli.ts capturar <usuario> [--guardar]')
    return capturar(arg.replace(/^@/, ''), resto.includes('--guardar'))
  }
  console.log('Comandos: login | capturar <usuario>')
  process.exitCode = 1
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exitCode = 1
})
