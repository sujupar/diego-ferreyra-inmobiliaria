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
