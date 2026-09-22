/**
 * El interruptor general de la automatización de Instagram.
 *   PATCH { automatizacion: boolean } → prende o apaga TODOS los reels a la vez.
 *
 * Solo admin y dueño (decisión del dueño, 2026-09-22). Es la llave que está por
 * encima de todos los reels: el resto del equipo la ve pero no la toca. Los
 * privados no se cambian desde acá: dependen del permiso de Meta.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeCambiarInterruptorGeneral } from '@/lib/social/reels/interruptor'
import { cambiarAutomatizacionGeneral, contarReelsActivos } from '@/lib/social/reels/servicio'
import { leerAjustes } from '@/lib/social/reels/procesador'

const cuerpo = z.object({ automatizacion: z.boolean() })

export async function PATCH(req: Request) {
  try {
    const user = await requireAuth()
    if (!puedeCambiarInterruptorGeneral(user.profile.role)) {
      return NextResponse.json({ error: 'Solo el admin o el dueño pueden cambiar la automatización general.' }, { status: 403 })
    }

    const analisis = cuerpo.safeParse(await req.json().catch(() => ({})))
    if (!analisis.success) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
    }

    await cambiarAutomatizacionGeneral(analisis.data.automatizacion)
    // Queda escrito quién lo cambió: la tabla solo guarda la hora, y este es el
    // cambio que decide si el sistema le habla a clientes reales.
    console.log(`[instagram/ajustes] automatización general ${analisis.data.automatizacion ? 'PRENDIDA' : 'APAGADA'} por ${user.id} (${user.profile.role})`)

    const [ajustes, reelsActivos] = await Promise.all([leerAjustes(), contarReelsActivos()])
    return NextResponse.json({
      general: { automatizacion: ajustes.automatizacion_habilitada, privados: ajustes.dm_habilitado, reelsActivos },
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
