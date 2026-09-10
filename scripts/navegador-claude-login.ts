/**
 * Inicia sesión en el navegador de Claude con el usuario "Claude · pruebas"
 * SIN tipear contraseñas ni depender de redirecciones:
 *
 *   1. Genera un enlace de acceso de un solo uso (magic link) con la API de
 *      administración de Supabase y lo canjea del lado del servidor
 *      (`verifyOtp` con el `hashed_token`) → sesión completa (tokens + usuario).
 *   2. Escribe esa sesión en las cookies del navegador de Claude (perfil
 *      ~/.cache/claude-browser, puerto 9222) con el MISMO formato que usa
 *      `@supabase/ssr` en la app (`sb-<ref>-auth-token`, `base64-…`, en trozos
 *      de 3180 caracteres). Antes borra todas las cookies: si en esa ventana
 *      había otra sesión (el 2026-09-10 el dueño se había logueado a mano), el
 *      QA correría con un usuario real en vez de "Claude · pruebas".
 *   3. Abre /inicio y verifica que la plataforma no vuelva a /login y que la
 *      cookie sea del usuario esperado.
 *
 * Por qué no el flujo normal del enlace: Supabase lo redirige a la "Site URL"
 * del proyecto (http://localhost:3000) porque inmodf.com.ar no está en su lista
 * de redirecciones permitidas, y la pantalla /login crea el cliente de Supabase
 * recién al enviar el formulario, así que nunca procesa un #access_token.
 *
 * Requisitos: navegador abierto (`scripts/navegador-claude.sh abrir`), Node ≥ 22
 * (WebSocket nativo) y CLAUDE_QA_EMAIL en .env.local.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/navegador-claude-login.ts
 */
import { createClient } from '@supabase/supabase-js'

const EMAIL = process.env.CLAUDE_QA_EMAIL ?? 'claude.qa@inmodf.com.ar'
const SITIO = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar').replace(/\/+$/, '')
const CDP = 'http://127.0.0.1:9222'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anon || !service) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY')
const REF = new URL(url).hostname.split('.')[0]
const COOKIE = `sb-${REF}-auth-token`
const TROZO = 3180 // MAX_CHUNK_SIZE de @supabase/ssr

type Tab = { id: string; type: string; url: string; webSocketDebuggerUrl: string }
const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${CDP}${path}`, init)
  if (!r.ok) throw new Error(`CDP ${path}: ${r.status}`)
  return r.json() as Promise<T>
}

/** Sesión CDP mínima sobre una pestaña (WebSocket nativo de Node ≥ 22). */
class Pestaña {
  private ws!: WebSocket
  private n = 0
  private pendientes = new Map<number, (v: any) => void>()
  constructor(private tab: Tab) {}
  async conectar() {
    this.ws = new WebSocket(this.tab.webSocketDebuggerUrl)
    await new Promise<void>((ok, err) => { this.ws.onopen = () => ok(); this.ws.onerror = e => err(e) })
    this.ws.onmessage = ev => {
      const m = JSON.parse(String(ev.data))
      if (m.id && this.pendientes.has(m.id)) { this.pendientes.get(m.id)!(m); this.pendientes.delete(m.id) }
    }
  }
  enviar(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = ++this.n
    return new Promise(ok => { this.pendientes.set(id, ok); this.ws.send(JSON.stringify({ id, method, params })) })
  }
  async evaluar<T>(expression: string): Promise<T> {
    const r = await this.enviar('Runtime.evaluate', { expression, returnByValue: true })
    return r.result?.result?.value as T
  }
  cerrar() { this.ws.close() }
}

const LEER_USUARIO = `(() => {
  const partes = document.cookie.split(';').map(c => c.trim()).filter(c => c.startsWith('sb-') && c.includes('auth-token'))
    .sort().map(c => c.slice(c.indexOf('=') + 1)).join('')
  if (!partes) return null
  const raw = partes.startsWith('base64-') ? atob(partes.slice(7).replace(/-/g, '+').replace(/_/g, '/')) : decodeURIComponent(partes)
  try { return JSON.parse(raw).user?.email ?? null } catch { return null }
})()`

/** Mismo formato que @supabase/ssr: "base64-" + base64url(JSON), en trozos si es largo. */
function cookiesDeSesion(session: object): Array<{ name: string; value: string }> {
  const valor = 'base64-' + Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
  if (valor.length <= TROZO) return [{ name: COOKIE, value: valor }]
  const trozos: Array<{ name: string; value: string }> = []
  for (let i = 0; i * TROZO < valor.length; i++) trozos.push({ name: `${COOKIE}.${i}`, value: valor.slice(i * TROZO, (i + 1) * TROZO) })
  return trozos
}

async function main() {
  await http('/json/version').catch(() => {
    throw new Error('El navegador de Claude no está abierto: correr scripts/navegador-claude.sh abrir')
  })

  // 1) Enlace de un solo uso → canje en el servidor → sesión.
  const admin = createClient(url!, service!, { auth: { persistSession: false } })
  const { data: link, error: eLink } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
  if (eLink) throw eLink
  const tokenHash = link.properties?.hashed_token
  if (!tokenHash) throw new Error('Supabase no devolvió hashed_token')
  const cliente = createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: otp, error: eOtp } = await cliente.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash })
  if (eOtp) throw eOtp
  const session = otp.session
  if (!session || session.user.email !== EMAIL) throw new Error('El canje no devolvió una sesión de ' + EMAIL)

  // 2) Cookies en el navegador de Claude, sobre una pestaña limpia.
  const tab = await http<Tab>('/json/new?about:blank', { method: 'PUT' })
  const p = new Pestaña(tab)
  await p.conectar()
  await p.enviar('Network.enable')
  await p.enviar('Network.clearBrowserCookies')
  const expira = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 400
  for (const c of cookiesDeSesion(session)) {
    const r = await p.enviar('Network.setCookie', { name: c.name, value: c.value, url: `${SITIO}/`, path: '/', secure: SITIO.startsWith('https'), sameSite: 'Lax', expires: expira })
    if (!r.result?.success) throw new Error(`No se pudo escribir la cookie ${c.name}: ${JSON.stringify(r)}`)
  }

  // 3) Verificar entrando a la plataforma.
  await p.enviar('Page.enable')
  await p.enviar('Page.navigate', { url: `${SITIO}/inicio` })
  await dormir(4000)
  const href = await p.evaluar<string>('location.href')
  const usuario = await p.evaluar<string | null>(LEER_USUARIO)
  if (href.includes('/login')) { p.cerrar(); throw new Error('La plataforma volvió a /login: la sesión no fue aceptada') }
  if (usuario !== EMAIL) { p.cerrar(); throw new Error(`La sesión quedó como ${usuario}, no como ${EMAIL}`) }
  console.log(`Sesión iniciada como ${usuario}. Pestaña en: ${href}`)
  // Cerrar las demás pestañas (podían tener otra sesión).
  const tabs = await http<Tab[]>('/json')
  for (const t of tabs) if (t.type === 'page' && t.id !== tab.id) await http(`/json/close/${t.id}`).catch(() => undefined)
  p.cerrar()
}

main().catch(e => { console.error('ERROR:', e.message ?? e); process.exit(1) })
