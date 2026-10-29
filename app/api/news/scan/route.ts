import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { searchRealEstateNews } from '@/lib/news/perplexity'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST: escanea noticias inmobiliarias argentinas de la última semana.
// Sin PERPLEXITY_API_KEY cae a data de ejemplo y marca { mock: true }.
// Los errores van con status 200 para que el front los muestre.
export async function POST() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const mock = !process.env.PERPLEXITY_API_KEY
  try {
    const candidates = await searchRealEstateNews({ mock })
    return NextResponse.json(mock ? { candidates, mock: true } : { candidates })
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Error al escanear noticias'
    return NextResponse.json({ error })
  }
}
