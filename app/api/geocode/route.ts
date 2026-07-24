import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { geocodeAddress, type GeocodeExpected } from '@/lib/properties/geocoder'

/** POST { address, expected? } -> { lat, lng, formatted, confidence, provider }. Google→OSM. */
export async function POST(req: Request) {
  try {
    await requireAuth()
    const { address, expected } = (await req.json()) as { address?: string; expected?: GeocodeExpected }
    if (!address || address.trim().length < 4) {
      return NextResponse.json({ error: 'address requerido' }, { status: 400 })
    }
    const r = await geocodeAddress(address, expected)
    if (!r) {
      return NextResponse.json({ error: 'No se pudo geolocalizar la dirección. Colocá el pin a mano en el mapa.' }, { status: 422 })
    }
    return NextResponse.json(r)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
