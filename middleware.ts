import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const ROOT_HOSTS = new Set([
  'inmodf.com.ar',
  'www.inmodf.com.ar',
  'localhost:3000',
  'localhost',
])

// Subdominios técnicos que NO son landings (reservados)
const RESERVED_SUBDOMAINS = new Set([
  'api',
  'www',
  'admin',
  'app',
  'mail',
  'email',
  'webmail',
  'cpanel',
  'ftp',
])

function isRootHost(host: string): boolean {
  // Strip port
  const hostNoPort = host.split(':')[0]
  if (ROOT_HOSTS.has(host) || ROOT_HOSTS.has(hostNoPort)) return true
  // Netlify previews: <branch>--<site>.netlify.app son root host
  if (hostNoPort.endsWith('.netlify.app')) return true
  return false
}

function extractSlug(host: string): string | null {
  const hostNoPort = host.split(':')[0]
  // Solo procesar si es subdominio de inmodf.com.ar
  if (!hostNoPort.endsWith('.inmodf.com.ar')) return null
  const sub = hostNoPort.slice(0, -'.inmodf.com.ar'.length)
  if (!sub) return null
  if (RESERVED_SUBDOMAINS.has(sub)) return null
  // Solo aceptar slugs válidos (a-z, 0-9, guiones)
  if (!/^[a-z0-9-]+$/.test(sub)) return null
  return sub
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? ''
  const pathname = request.nextUrl.pathname

  // Si NO es root host, puede ser subdomain de landing
  if (!isRootHost(host)) {
    const slug = extractSlug(host)
    if (slug) {
      // No reescribir si ya está en /p/[slug] (evita loop)
      if (!pathname.startsWith('/p/')) {
        const url = request.nextUrl.clone()
        url.pathname = `/p/${slug}${pathname === '/' ? '' : pathname}`
        return NextResponse.rewrite(url)
      }
    }
  }

  // Skip auth para rutas públicas de landing
  if (pathname.startsWith('/p/')) {
    return NextResponse.next()
  }

  // Resto del sitio: auth normal
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
