import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { fetchApprovedTemplates } from '@/lib/integrations/whatsapp/templates'

/**
 * GET /api/whatsapp/templates
 *
 * Plantillas de WhatsApp APROBADAS (cacheadas 10 min en memoria, ver
 * `lib/integrations/whatsapp/templates.ts`) para el selector del chat que
 * reabre conversaciones fuera de la ventana de 24hs (task 9, prioridad 5).
 *
 * `?refresh=1` ignora el cache (botón "Actualizar" del selector).
 *
 * Gate: mismo criterio que el resto del chat — operaciones + asesor.
 *
 * Respuesta: `{ data: WhatsappTemplateSummary[] }`. Nunca falla con 5xx por
 * culpa de Meta: `fetchApprovedTemplates` devuelve `[]` ante cualquier error
 * (sin credenciales, Meta caído, etc.) — el selector se ve vacío con un aviso,
 * no rompe el chat.
 */
const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador', 'asesor']

export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    if (!ALLOWED_ROLES.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const url = new URL(req.url)
    const force = url.searchParams.get('refresh') === '1'
    const data = await fetchApprovedTemplates({ force })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
