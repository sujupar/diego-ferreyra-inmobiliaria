import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

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
    publicFunnelPaths.some((p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next()
  }
  return await updateSession(request)
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
