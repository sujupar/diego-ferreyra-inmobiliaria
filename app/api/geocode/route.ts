import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'

/** POST { address } -> { lat, lng, formatted }. Geocoding server-side con Google. */
export async function POST(req: Request) {
  try {
    await requireAuth()
    const { address } = (await req.json()) as { address?: string }
    if (!address || address.trim().length < 4) {
      return NextResponse.json({ error: 'address requerido' }, { status: 400 })
    }
    const key = process.env.GOOGLE_GEOCODING_API_KEY
    if (!key) return NextResponse.json({ error: 'GOOGLE_GEOCODING_API_KEY no configurada' }, { status: 412 })

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=ar&key=${key}`
    const res = await fetch(url)
    const data = (await res.json()) as {
      status: string
      results: { geometry: { location: { lat: number; lng: number } }; formatted_address: string }[]
    }
    if (data.status !== 'OK' || !data.results[0]) {
      return NextResponse.json({ error: `geocoding falló: ${data.status}` }, { status: 422 })
    }
    const r = data.results[0]
    return NextResponse.json({
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
      formatted: r.formatted_address,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
