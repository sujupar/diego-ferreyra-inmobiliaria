import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { scanRealEstateNews } from '@/lib/news/perplexity'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST: escanea noticias inmobiliarias argentinas de la última semana.
// El mock NUNCA se activa por la sola ausencia de PERPLEXITY_API_KEY (ver
// lib/news/perplexity.ts debeUsarMock): solo con NEWS_SCAN_MOCK=1 fuera de producción.
// Sin key y sin ese flag, scanRealEstateNews lanza un error legible que el front muestra.
// Los errores van con status 200 para que el front los muestre.
export async function POST() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const mock = process.env.NEWS_SCAN_MOCK === '1' && process.env.NODE_ENV !== 'production'
  try {
    const { candidates, failedQueries } = await scanRealEstateNews({ mock })
    return NextResponse.json({
      candidates,
      ...(mock ? { mock: true } : {}),
      ...(failedQueries > 0 ? { failedQueries } : {}),
    })
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Error al escanear noticias'
    return NextResponse.json({ error })
  }
}
