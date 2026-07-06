import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Versión deployada. `NEXT_PUBLIC_COMMIT_REF` se hornea en el BUILD desde el
 * `COMMIT_REF` que inyecta Netlify (ver next.config.ts). Público a propósito:
 * no expone nada sensible (el repo es privado; un SHA no dice nada) y permite
 * verificar QUÉ código sirve producción — los deploys de Netlify pueden fallar
 * sin que lo veamos desde acá.
 */
export async function GET() {
    const full = process.env.NEXT_PUBLIC_COMMIT_REF || ''
    return NextResponse.json({
        commit: full ? full.slice(0, 7) : 'desconocido',
        full: full || null,
    })
}
