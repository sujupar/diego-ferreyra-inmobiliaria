/**
 * Un reel concreto.
 *   PATCH  → edita lo editable (lista blanca en `lib/social/reels/edicion.ts`).
 *   DELETE → lo saca de la plataforma. NO lo borra de Instagram.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { validarProgramacion } from '@/lib/social/reels/edicion'
import { actualizarReel, autorizarReel, borrarReel, landingPublicada, obtenerReel } from '@/lib/social/reels/servicio'

const cuerpoEditar = z.object({
  descripcion: z.string().max(2200).optional(),
  palabra_clave: z.string().max(60).nullable().optional(),
  dm_texto: z.string().max(1000).nullable().optional(),
  dm_boton: z.string().max(20).optional(),
  dm_seguimiento: z.string().max(1000).nullable().optional(),
  simulacro: z.boolean().optional(),
  automatizacion_activa: z.boolean().optional(),
  programado_para: z.string().nullable().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; reelId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, reelId } = await params
    if (!(await autorizarReel(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const analisis = cuerpoEditar.safeParse(await req.json().catch(() => ({})))
    if (!analisis.success) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
    }
    const cambios = analisis.data

    if (cambios.programado_para !== undefined) {
      const validacion = validarProgramacion(cambios.programado_para, new Date())
      if (!validacion.ok) {
        return NextResponse.json({ error: validacion.error }, { status: 400 })
      }
    }

    // Encender la automatización exige landing publicada: es el momento en que
    // el sistema empieza a prometerle un enlace a gente real.
    if (cambios.automatizacion_activa === true) {
      const actual = await obtenerReel(reelId, id)
      if (!actual) {
        return NextResponse.json({ error: 'No se encontró el reel.' }, { status: 404 })
      }
      // `.trim()`: una palabra de solo espacios se guarda como null (lo hace
      // `camposEditables`), así que sin esto quedaba "Automatización activa"
      // sobre un reel que no puede coincidir con nada, nunca.
      const palabraFinal = (cambios.palabra_clave ?? actual.palabra_clave ?? '').trim()
      if (!palabraFinal) {
        return NextResponse.json(
          { error: 'Antes de activar la automatización hay que escribir la palabra del llamado a la acción.' },
          { status: 400 },
        )
      }
      const { publicada } = await landingPublicada(id)
      if (!publicada) {
        return NextResponse.json(
          { error: 'Falta publicar la landing de esta propiedad: es el enlace que recibe la persona.' },
          { status: 409 },
        )
      }
    }

    const reel = await actualizarReel(reelId, id, cambios)
    return NextResponse.json({ reel })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; reelId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, reelId } = await params
    if (!(await autorizarReel(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    await borrarReel(reelId, id)
    // Aviso explícito: borrar acá NO borra el reel de Instagram. La pantalla lo
    // repite, para que nadie crea que despublicó algo que sigue online.
    return NextResponse.json({ ok: true, avisoInstagram: 'El reel sigue publicado en Instagram.' })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
