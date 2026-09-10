/**
 * Inicia sesión en el navegador de Claude con el usuario "Claude · pruebas"
 * SIN tipear contraseñas: genera un enlace de acceso de un solo uso (magic link)
 * con la API de administración de Supabase y lo abre en el Chrome de Claude
 * (perfil ~/.cache/claude-browser, puerto 9222). La sesión queda guardada en
 * ese perfil para el QA.
 *
 * Requisitos: el navegador abierto (`scripts/navegador-claude.sh abrir`) y
 * CLAUDE_QA_EMAIL en .env.local (lo escribe `crear-usuario-claude-qa.ts`).
 *
 * Correr: node --env-file=.env.local --import tsx scripts/navegador-claude-login.ts
 */
import { createClient } from '@supabase/supabase-js'

const EMAIL = process.env.CLAUDE_QA_EMAIL ?? 'claude.qa@inmodf.com.ar'
const SITIO = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'
const CDP = 'http://127.0.0.1:9222'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

async function cdp<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${CDP}${path}`, init)
  if (!r.ok) throw new Error(`CDP ${path}: ${r.status}`)
  return r.json() as Promise<T>
}

async function main() {
  // 0) ¿Está abierto el navegador de Claude?
  await cdp('/json/version').catch(() => {
    throw new Error('El navegador de Claude no está abierto: correr scripts/navegador-claude.sh abrir')
  })

  // 1) Enlace de acceso de un solo uso.
  const admin = createClient(url!, key!, { auth: { persistSession: false } })
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: EMAIL,
    options: { redirectTo: `${SITIO}/` },
  })
  if (error) throw error
  const enlace = data.properties?.action_link
  if (!enlace) throw new Error('Supabase no devolvió action_link')

  // 2) Abrirlo en una pestaña nueva del navegador de Claude (endpoint HTTP de CDP).
  const tab = await cdp<{ id: string; url: string }>(`/json/new?${encodeURIComponent(enlace)}`, { method: 'PUT' })
  console.log('Enlace abierto en la pestaña', tab.id)

  // 3) Esperar y comprobar que la plataforma dejó de mandar al login.
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 2500))
    const tabs = await cdp<Array<{ id: string; url: string; title: string }>>('/json')
    const t = tabs.find(x => x.id === tab.id)
    if (t && t.url.startsWith(SITIO) && !t.url.includes('/login') && !t.url.includes('access_token')) {
      console.log('Sesión iniciada. Pestaña en:', t.url)
      return
    }
  }
  const tabs = await cdp<Array<{ id: string; url: string }>>('/json')
  console.log('No se pudo confirmar el login. Pestañas:', tabs.map(t => t.url).join(' | '))
  process.exit(1)
}

main().catch(e => { console.error('ERROR:', e.message ?? e); process.exit(1) })
