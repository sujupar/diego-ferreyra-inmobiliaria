import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { verificarEstado } from '@/lib/publicaciones/oauth/estado'
import { canjearCodigoTiktok, usuarioDeTiktok } from '@/lib/publicaciones/oauth/tiktok'
import { configTiktok, cookieNonce, guardarConexion, urlBase } from '@/lib/publicaciones/servidor/conexiones'

const ROLES = ['admin', 'dueno']

function volver(resultado: string): NextResponse {
  const res = NextResponse.redirect(`${urlBase()}/publicaciones?conexion=${encodeURIComponent(resultado)}`)
  res.cookies.set(cookieNonce('tiktok'), '', { path: '/api/oauth/tiktok', maxAge: 0 })
  return res
}

// GET: TikTok vuelve acá con el código. Se canjea, se lee el nombre y se guarda la llave.
export async function GET(req: Request) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!ROLES.includes(auth.user.profile.role)) return volver('sin_permiso')

  const url = new URL(req.url)
  if (url.searchParams.get('error')) return volver('cancelada')
  const codigo = url.searchParams.get('code')
  const estado = url.searchParams.get('state')
  const config = configTiktok()
  if (!codigo || !estado) return volver('invalida')
  if (!config) return volver('sin_configurar')

  const nonce = (await cookies()).get(cookieNonce('tiktok'))?.value ?? null
  const v = verificarEstado(estado, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { plataforma: 'tiktok', nonce, ahora: new Date() })
  // El que vuelve tiene que ser el mismo que salió: si no, alguien podría colgarnos SU cuenta.
  if (!v.ok || v.usuarioId !== auth.user.id) return volver(v.ok ? 'invalida' : v.motivo)

  try {
    const tokens = await canjearCodigoTiktok(config, codigo, new Date())
    const nombre = await usuarioDeTiktok(tokens.access_token)
    await guardarConexion('tiktok', nombre, tokens, auth.user.id)
    return volver('tiktok_ok')
  } catch (e) {
    console.error('[oauth/tiktok] no se pudo conectar', e instanceof Error ? e.message : e)
    return volver('fallo')
  }
}
