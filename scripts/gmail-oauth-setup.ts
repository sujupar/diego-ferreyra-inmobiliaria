#!/usr/bin/env tsx
/**
 * Obtiene el REFRESH TOKEN de Gmail vía OAuth (NO usa key de cuenta de servicio,
 * así que esquiva la org policy iam.disableServiceAccountKeyCreation).
 *
 * Una sola vez: abrís el link, iniciás sesión COMO la casilla que querés leer
 * (contacto@diegoferreyrainmobiliaria.com), aceptás, y el script imprime el
 * refresh token para pegar en .env.local / Netlify.
 *
 * Requisitos previos (Google Cloud → APIs y servicios → Credenciales):
 *   - Pantalla de consentimiento OAuth: tipo de usuario = **Interno** (Workspace).
 *   - Crear ID de cliente OAuth de tipo **App de escritorio (Desktop app)**.
 *     De ahí salen el Client ID y Client Secret.
 *
 * Uso:
 *   GMAIL_OAUTH_CLIENT_ID=... GMAIL_OAUTH_CLIENT_SECRET=... npx tsx scripts/gmail-oauth-setup.ts
 *   (o ponelos en .env.local y corré:  npx tsx scripts/gmail-oauth-setup.ts)
 */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { exec } from 'node:child_process'

const ENV_LOCAL = path.resolve(process.cwd(), '.env.local')

function loadEnvLocal() {
  if (!fs.existsSync(ENV_LOCAL)) return
  for (const line of fs.readFileSync(ENV_LOCAL, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
loadEnvLocal()

/** Inserta o reemplaza una línea KEY=value en .env.local. */
function upsertEnvLocal(key: string, value: string) {
  const lines = fs.existsSync(ENV_LOCAL) ? fs.readFileSync(ENV_LOCAL, 'utf-8').split(/\r?\n/) : []
  const idx = lines.findIndex(l => l.startsWith(`${key}=`))
  if (idx >= 0) lines[idx] = `${key}=${value}`
  else lines.push(`${key}=${value}`)
  fs.writeFileSync(ENV_LOCAL, lines.join('\n'))
}

const CLIENT_ID = process.env.GMAIL_OAUTH_CLIENT_ID
const CLIENT_SECRET = process.env.GMAIL_OAUTH_CLIENT_SECRET
const LOGIN_HINT = process.env.GMAIL_IMPERSONATE_EMAIL || 'contacto@diegoferreyrainmobiliaria.com'
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const PORT = 53682
const REDIRECT_URI = `http://127.0.0.1:${PORT}`

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Faltan GMAIL_OAUTH_CLIENT_ID y/o GMAIL_OAUTH_CLIENT_SECRET.')
  console.error('   Creá un ID de cliente OAuth tipo "App de escritorio" en Google Cloud →')
  console.error('   Credenciales, y poné esos 2 valores en .env.local. Ver docs/setup-consultas-portales.md §2.')
  process.exit(1)
}

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    login_hint: LOGIN_HINT,
  }).toString()

// Modo solo-mostrar-link (para relayar el link de respaldo sin abrir servidor).
if (process.argv.includes('--print-url')) {
  console.log(authUrl)
  process.exit(0)
}

async function exchangeCode(code: string): Promise<{ refresh_token?: string; access_token?: string; error?: string; error_description?: string }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  })
  return res.json().catch(() => ({}))
}

function openBrowser(url: string) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'
  exec(`${cmd} "${url}"`, () => {})
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', REDIRECT_URI)
  const code = url.searchParams.get('code')
  const err = url.searchParams.get('error')
  if (!code && !err) {
    res.writeHead(204)
    res.end()
    return
  }
  if (err) {
    res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
    res.end(`<h2>Error de autorización: ${err}</h2><p>Podés cerrar esta pestaña.</p>`)
    console.error('\n❌ Autorización cancelada/rechazada:', err)
    server.close()
    process.exit(1)
  }
  try {
    const tokens = await exchangeCode(code!)
    if (!tokens.refresh_token) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' })
      res.end('<h2>No se recibió refresh token</h2><p>Revisá la consola.</p>')
      console.error('\n❌ No vino refresh_token. Respuesta:', JSON.stringify(tokens, null, 2))
      console.error('   Tip: si ya habías autorizado antes, revocá el acceso y volvé a correr (usamos prompt=consent).')
      server.close()
      process.exit(1)
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end('<h2>✅ Listo</h2><p>Ya podés cerrar esta pestaña y volver a la terminal.</p>')
    // Lo guardo directo en .env.local para no exponer el secreto en logs.
    upsertEnvLocal('GMAIL_OAUTH_REFRESH_TOKEN', tokens.refresh_token)
    console.log('\n✅ Listo. Guardé GMAIL_OAUTH_REFRESH_TOKEN en .env.local (no lo muestro por seguridad).')
    console.log('   Para producción, copiá ese valor de .env.local a Netlify cuando deployemos.')
    console.log('   Siguiente:  npx tsx scripts/gmail-portal-diagnostic.ts --days 60\n')
    server.close()
    process.exit(0)
  } catch (e) {
    res.writeHead(500)
    res.end('Error interno, revisá la consola.')
    console.error(e)
    server.close()
    process.exit(1)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log('\n=== Setup OAuth Gmail ===\n')
  console.log(`Iniciá sesión COMO: ${LOGIN_HINT}`)
  console.log('\nAbrí este link en el navegador (intento abrirlo solo):\n')
  console.log(authUrl + '\n')
  openBrowser(authUrl)
  console.log('Esperando la autorización...')
})
