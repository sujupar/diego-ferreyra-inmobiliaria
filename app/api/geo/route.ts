import { NextResponse } from 'next/server'
import { resolveGeoCountry } from '@/lib/landing/geo'

/**
 * País del visitante para el país-por-defecto del selector de teléfono de la
 * landing (`PhoneField`). Lee el header `x-nf-geo` que agrega el CDN de
 * Netlify — ver `lib/landing/geo.ts` para el porqué de las dos formas
 * (JSON plano / base64) y el fallback a 'AR'.
 *
 * Nunca puede tirar 5xx: sin este dato el selector simplemente arranca en
 * Argentina, nunca bloquea el popup de captura.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const country = resolveGeoCountry(req.headers.get('x-nf-geo'))
    return NextResponse.json({ country })
  } catch {
    return NextResponse.json({ country: 'AR' })
  }
}
