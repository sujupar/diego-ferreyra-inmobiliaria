import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { hasPermission } from '@/lib/auth/roles'
import { whatsappTestMode } from '@/lib/integrations/whatsapp/core'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import * as datos from '@/lib/visitas/encuesta/datos'
import { sanearAjustes, estadoDePlantillas } from '@/lib/visitas/encuesta/ajustes'
import type { AjustesEncuesta } from '@/lib/visitas/encuesta/tipos'
import type { Role } from '@/types/auth.types'

/**
 * Ajustes de la encuesta (adenda §11.1.5): solo `settings.manage` (admin y dueño). Reemplaza el
 * "por SQL" de la spec original: nadie tiene que tocar la base a mano para prender o apagar envíos.
 */
async function permitir(): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  const user = await getUser()
  if (!user || !user.profile.is_active) return { ok: false, res: NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 }) }
  let puede = false
  try { puede = hasPermission(user.profile.role as Role, 'settings.manage') } catch { puede = false }
  if (!puede) return { ok: false, res: NextResponse.json({ error: 'No tenés permiso' }, { status: 403 }) }
  return { ok: true, userId: user.id }
}

function respuesta(ajustes: AjustesEncuesta) {
  return NextResponse.json({
    data: {
      ajustes,
      plantillas: estadoDePlantillas({ encuesta: process.env.WHATSAPP_TEMPLATE_ENCUESTA_VISITA, regalo: process.env.WHATSAPP_TEMPLATE_REGALO_VISITA }),
      whatsappModoPrueba: whatsappTestMode(),
    },
  })
}

export async function GET() {
  const p = await permitir()
  if (!p.ok) return p.res
  const ajustes = await datos.leerAjustesEncuesta()
  if (!ajustes) return NextResponse.json({ error: 'No se pudieron leer los ajustes' }, { status: 500 })
  return respuesta(ajustes)
}

export async function PATCH(req: NextRequest) {
  const p = await permitir()
  if (!p.ok) return p.res
  const s = sanearAjustes(await req.json().catch(() => null), normalizeWhatsappPhone)
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400 })
  try {
    return respuesta(await datos.guardarAjustesEncuesta(s.cambios, p.userId))
  } catch (e) {
    console.error('[PATCH /api/settings/encuesta-visitas]', e)
    return NextResponse.json({ error: 'No se pudieron guardar los ajustes' }, { status: 500 })
  }
}
