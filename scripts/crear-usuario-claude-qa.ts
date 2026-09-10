/**
 * Crea (o reutiliza) el usuario de pruebas de Claude en la plataforma:
 * "Claude · pruebas", rol admin. Con él Claude entra a la plataforma desde su
 * navegador propio para hacer el QA de cada desarrollo, y lo que hace queda
 * atribuido a ese usuario y no a una persona real.
 *
 * La contraseña se genera al azar y se guarda UNA vez en .env.local como
 * CLAUDE_QA_EMAIL / CLAUDE_QA_PASSWORD (archivo ignorado por git). Si ya
 * están, no se toca nada. Idempotente: se puede correr las veces que sea.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/crear-usuario-claude-qa.ts
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'

const EMAIL = process.env.CLAUDE_QA_EMAIL ?? 'claude.qa@inmodf.com.ar'
const NOMBRE = 'Claude · pruebas'
const ROL = 'admin'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
const admin = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  // 1) ¿Ya existe el usuario de auth?
  const { data: lista, error: eLista } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (eLista) throw eLista
  let usuario = lista.users.find(u => u.email?.toLowerCase() === EMAIL)
  let passwordNueva: string | null = null

  if (!usuario) {
    passwordNueva = randomBytes(24).toString('base64url')
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: passwordNueva,
      email_confirm: true,
      user_metadata: { full_name: NOMBRE },
    })
    if (error) throw error
    usuario = data.user
    console.log('Usuario de auth creado.')
  } else if (!process.env.CLAUDE_QA_PASSWORD) {
    // Existe pero no tenemos la contraseña guardada: se rota para poder usarla.
    passwordNueva = randomBytes(24).toString('base64url')
    const { error } = await admin.auth.admin.updateUserById(usuario.id, { password: passwordNueva })
    if (error) throw error
    console.log('Usuario existente; contraseña rotada porque no estaba guardada.')
  } else {
    console.log('Usuario existente; contraseña ya guardada en .env.local.')
  }

  // 2) Perfil con rol admin y activo (el trigger handle_new_user puede haberlo
  //    creado con otro rol; acá se fija el definitivo).
  const { error: ePerfil } = await admin.from('profiles').upsert(
    { id: usuario.id, email: EMAIL, full_name: NOMBRE, role: ROL, is_active: true },
    { onConflict: 'id' },
  )
  if (ePerfil) throw ePerfil
  const { data: perfil } = await admin.from('profiles').select('email, role, is_active, full_name').eq('id', usuario.id).single()
  console.log('Perfil:', perfil)

  // 3) Guardar credenciales en .env.local (una sola vez).
  const env = readFileSync('.env.local', 'utf8')
  const lineas: string[] = []
  if (!/^CLAUDE_QA_EMAIL=/m.test(env)) lineas.push(`CLAUDE_QA_EMAIL=${EMAIL}`)
  if (passwordNueva) {
    if (/^CLAUDE_QA_PASSWORD=/m.test(env)) throw new Error('CLAUDE_QA_PASSWORD ya existe pero se rotó la contraseña: actualizarla a mano')
    lineas.push(`CLAUDE_QA_PASSWORD=${passwordNueva}`)
  }
  if (lineas.length) {
    appendFileSync('.env.local', `\n# Usuario de pruebas de Claude (QA en el navegador de Claude)\n${lineas.join('\n')}\n`)
    console.log('Credenciales guardadas en .env.local:', lineas.map(l => l.split('=')[0]).join(', '))
  }
}

main().catch(e => { console.error('ERROR:', e.message ?? e); process.exit(1) })
