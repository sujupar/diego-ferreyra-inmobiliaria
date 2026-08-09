import { NextResponse } from 'next/server'
import { getPropertiesPendientesDeRevisionLegal } from '@/lib/supabase/properties'
import { requireAuth } from '@/lib/auth/require-role'
import { hasPermission } from '@/lib/auth/roles'

/**
 * GET /api/properties/revision-legal — la bandeja del abogado.
 *
 * Reemplaza a `GET /api/properties?status=pending_review`. Ese filtro ataba el
 * circuito legal a la columna de CAPTACIÓN: para que una propiedad apareciera
 * en la bandeja había que sacarla de 'approved', y eso apagaba su landing, sus
 * consultas y su difusión. Ahora la bandeja es `legal_status='pending'` +
 * `legal_submitted_at IS NOT NULL`, y una propiedad puede estar publicada y en
 * revisión al mismo tiempo.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    if (!hasPermission(user.profile.role, 'properties.review')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { data, total } = await getPropertiesPendientesDeRevisionLegal()
    return NextResponse.json({ data, total })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
