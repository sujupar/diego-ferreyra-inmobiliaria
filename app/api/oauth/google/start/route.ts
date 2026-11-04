import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { crearEstado } from '@/lib/publicaciones/oauth/estado'
import { urlDeAutorizacionGoogle } from '@/lib/publicaciones/oauth/google'
import { configGoogle, cookieNonce, urlBase } from '@/lib/publicaciones/servidor/conexiones'

/** Conectar una cuenta que publica en nombre de la inmobiliaria: igual que el interruptor, solo admin y dueño. */
const ROLES = ['admin', 'dueno']

// GET: lleva a Google para que la cuenta del canal autorice subir videos.
export async function GET() {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!ROLES.includes(auth.user.profile.role)) {
    return NextResponse.redirect(`${urlBase()}/publicaciones?conexion=sin_permiso`)
  }
  const config = configGoogle()
  if (!config) return NextResponse.redirect(`${urlBase()}/publicaciones?conexion=sin_configurar`)

  const { estado, nonce } = crearEstado(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    plataforma: 'youtube',
    usuarioId: auth.user.id,
    ahora: new Date(),
  })
  const res = NextResponse.redirect(urlDeAutorizacionGoogle(config, estado))
  res.cookies.set(cookieNonce('youtube'), nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/oauth/google',
    maxAge: 600,
  })
  return res
}
