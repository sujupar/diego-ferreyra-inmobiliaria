/**
 * Los reels ya publicados en la cuenta de Instagram, para engancharlos a una
 * propiedad.
 *
 * Es de solo lectura contra Instagram. No hay `propertyId` en la dirección —
 * todavía no se eligió la propiedad— así que el permiso se resuelve por ROL:
 * alcanza con que el rol pueda difundir algo. La propiedad concreta se valida
 * después, cuando se crea el reel (`POST /api/properties/[id]/reels`), que es
 * donde efectivamente se escribe.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { alcanceDifusion } from '@/lib/properties/difusion-access'
import { listarReelsPublicados } from '@/lib/integrations/instagram/publicar'
import { mensajeLegible } from '@/lib/integrations/instagram/client'

export const maxDuration = 60

export async function GET() {
  try {
    const user = await requireAuth()
    if (alcanceDifusion('difundir', user.profile.role) === 'ninguna') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const reels = await listarReelsPublicados(30)

    // Los que ya están enganchados se muestran igual, pero marcados: ofrecerlos
    // como disponibles terminaría en un 409 y en un asesor confundido.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data } = await admin
      .from('property_reels')
      .select('ig_media_id')
      .in('ig_media_id', reels.map((r) => r.id))

    const enganchados = new Set(
      ((data ?? []) as Array<{ ig_media_id: string | null }>)
        .map((f) => f.ig_media_id)
        .filter((x): x is string => !!x),
    )

    return NextResponse.json({
      reels: reels.map((r) => ({ ...r, yaEnganchado: enganchados.has(r.id) })),
    })
  } catch (err) {
    // El mensaje de Meta traducido: "(#190) ..." no le dice nada a un asesor.
    return NextResponse.json({ error: mensajeLegible(err) }, { status: 502 })
  }
}
