import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { AB_ROLL_COOKIE, AB_ROLL_MAX_AGE } from '@/lib/funnel/ab-test'

export async function middleware(request: NextRequest) {
  // Rutas públicas de landing (no requieren auth)
  // Rutas públicas de funnels (no requieren auth) — staging + producción
  const publicFunnelPaths = [
    '/tasacion-directa',
    '/vsl-clase-propietarios',
    '/gracias-tasacion',
    '/gracias-clase',
  ]
  if (
    request.nextUrl.pathname.startsWith('/p/') ||
    // `/v/<token>` es el link del RECORRIDO que se le manda por WhatsApp a un
    // comprador. Tiene que ser PÚBLICO: la persona no tiene cuenta en el CRM.
    // Faltaba en esta lista, así que el middleware la mandaba a /login y el
    // embudo entero moría ahí — verificado en producción el 2026-08-02: el link
    // devolvía 307 a `/login?redirectTo=/v/...`.
    // La seguridad de esa página NO es la sesión: es el token en sí (10
    // caracteres al azar, alfabeto sin ambigüedades, uno por persona).
    request.nextUrl.pathname.startsWith('/v/') ||
    // `/r/<código>` es el acortador propio: lo abre el asesor desde su WhatsApp,
    // sin sesión del CRM. Mismo criterio que `/v/`: la protección es el código
    // al azar, no el login, y del otro lado solo hay un chat de WhatsApp.
    request.nextUrl.pathname.startsWith('/r/') ||
    publicFunnelPaths.some((p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + '/'))
  ) {
    return withAbRoll(request)
  }
  return await updateSession(request)
}

/**
 * Reparto A/B: el middleware NO decide la variante ni consulta la base — solo se
 * asegura de que el visitante lleve un número al azar estable en una cookie. La
 * variante la resuelve la página con ese número más la configuración vigente.
 *
 * POR QUÉ ASÍ Y NO GUARDANDO LA VARIANTE:
 *  1. El middleware corre en CADA request de la landing. Pegarle a Postgres acá
 *     le sumaría latencia a tráfico pago, en el primer milisegundo que ve la
 *     persona.
 *  2. Guardando el número en vez de la letra, mover la barra de reparto tiene
 *     efecto inmediato y proporcional. Si guardáramos la letra, los que ya
 *     entraron quedarían clavados en su variante y el reparto nuevo solo
 *     aplicaría a gente nueva — el panel diría 70/30 y la realidad sería otra.
 *  3. El número es estable por 90 días, así que la misma persona ve siempre lo
 *     mismo mientras el reparto no se toque.
 */
function withAbRoll(request: NextRequest): NextResponse {
  const res = NextResponse.next()
  const actual = request.cookies.get(AB_ROLL_COOKIE)?.value
  // Solo se acepta lo que ya sabemos leer; cualquier otra cosa se reemplaza.
  if (actual && /^\d{1,3}$/.test(actual) && Number(actual) <= 999) return res
  res.cookies.set(AB_ROLL_COOKIE, String(Math.floor(Math.random() * 1000)), {
    maxAge: AB_ROLL_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    httpOnly: false, // el cliente lo manda de vuelta en el submit
    secure: request.nextUrl.protocol === 'https:',
  })
  return res
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
