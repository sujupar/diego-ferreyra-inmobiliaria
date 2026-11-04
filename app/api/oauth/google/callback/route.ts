import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { verificarEstado } from '@/lib/publicaciones/oauth/estado'
import { canalDeYoutube, canjearCodigoGoogle } from '@/lib/publicaciones/oauth/google'
import { configGoogle, cookieNonce, guardarConexion, urlBase } from '@/lib/publicaciones/servidor/conexiones'

const ROLES = ['admin', 'dueno']

function volver(resultado: string): NextResponse {
  const res = NextResponse.redirect(`${urlBase()}/publicaciones?conexion=${encodeURIComponent(resultado)}`)
  res.cookies.set(cookieNonce('youtube'), '', { path: '/api/oauth/google', maxAge: 0 })
  return res
}

// GET: Google vuelve acá con el código. Se canjea, se lee el canal y se guarda la llave.
export async function GET(req: Request) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!ROLES.includes(auth.user.profile.role)) return volver('sin_permiso')

  const url = new URL(req.url)
  // La persona tocó "Cancelar" en Google, o Google rechazó algo: se vuelve con el motivo, sin guardar nada.
  if (url.searchParams.get('error')) return volver('cancelada')
  const codigo = url.searchParams.get('code')
  const estado = url.searchParams.get('state')
  const config = configGoogle()
  if (!codigo || !estado) return volver('invalida')
  if (!config) return volver('sin_configurar')

  const nonce = (await cookies()).get(cookieNonce('youtube'))?.value ?? null
  const v = verificarEstado(estado, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { plataforma: 'youtube', nonce, ahora: new Date() })
  // El que vuelve tiene que ser el mismo que salió: si no, alguien podría colgarnos SU canal.
  if (!v.ok || v.usuarioId !== auth.user.id) return volver(v.ok ? 'invalida' : v.motivo)

  try {
    const tokens = await canjearCodigoGoogle(config, codigo, new Date())
    const canal = await canalDeYoutube(tokens.access_token)
    await guardarConexion('youtube', canal.titulo, { ...tokens, canal_id: canal.id }, auth.user.id)
    return volver('youtube_ok')
  } catch (e) {
    console.error('[oauth/google] no se pudo conectar', e instanceof Error ? e.message : e)
    return volver('fallo')
  }
}
