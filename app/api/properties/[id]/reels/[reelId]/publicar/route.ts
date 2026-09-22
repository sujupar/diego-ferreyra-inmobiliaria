/**
 * Pedir la publicación de un reel: ahora o programada.
 *
 * Esta ruta NO habla con Instagram. Publicar son dos pasos separados por minutos
 * —Instagram descarga el video, lo procesa, y recién ahí se publica— y esperar
 * eso adentro de un request lo cortaría el límite de tiempo de Netlify. El
 * gateway devolvería una página HTML de error que del lado del navegador se ve
 * como `Unexpected token '<'`, un mensaje que no dice nada del problema real.
 *
 * Acá solo se deja el pedido anotado. El trabajo lo hace `/api/cron/reels-publish`.
 *
 * `DELETE` cancela una publicación programada que todavía no salió.
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { validarProgramacion } from '@/lib/social/reels/edicion'
import { puedeCancelar, puedePedirPublicacion } from '@/lib/social/reels/estados'
import {
  autorizarReel,
  cancelarProgramacion,
  landingPublicada,
  obtenerReel,
  pedirPublicacion,
} from '@/lib/social/reels/servicio'

const cuerpo = z.object({
  programadoPara: z.string().nullable().optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; reelId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, reelId } = await params
    if (!(await autorizarReel(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const analisis = cuerpo.safeParse(await req.json().catch(() => ({})))
    if (!analisis.success) {
      return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
    }
    const programadoPara = analisis.data.programadoPara ?? null

    const reel = await obtenerReel(reelId, id)
    if (!reel) {
      return NextResponse.json({ error: 'No se encontró el reel.' }, { status: 404 })
    }
    if (reel.origen === 'existente') {
      return NextResponse.json(
        { error: 'Este reel ya está publicado en Instagram: no se vuelve a publicar.' },
        { status: 409 },
      )
    }
    if (!puedePedirPublicacion(reel.estado)) {
      // Pedirlo de nuevo con el contenedor ya creado publicaría un SEGUNDO reel
      // igual en la cuenta.
      return NextResponse.json(
        { error: 'Este reel no se puede publicar en el estado en el que está.' },
        { status: 409 },
      )
    }
    if (!reel.video_url) {
      return NextResponse.json({ error: 'El reel no tiene video cargado.' }, { status: 409 })
    }

    const validacion = validarProgramacion(programadoPara, new Date())
    if (!validacion.ok) {
      return NextResponse.json({ error: validacion.error }, { status: 400 })
    }

    // EL CANDADO. Se comprueba acá y otra vez en el cron: entre el pedido y la
    // publicación pueden pasar horas, y la landing podría despublicarse.
    const { publicada } = await landingPublicada(id)
    if (!publicada) {
      return NextResponse.json(
        { error: 'Falta publicar la landing de esta propiedad antes de publicar el reel.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ reel: await pedirPublicacion(reelId, id, programadoPara) })
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

    const reel = await obtenerReel(reelId, id)
    if (!reel) {
      return NextResponse.json({ error: 'No se encontró el reel.' }, { status: 404 })
    }
    if (!puedeCancelar(reel.estado)) {
      // Una vez creado el contenedor, Instagram ya tiene el video: decir
      // "cancelado" sería prometer algo que no podemos cumplir.
      return NextResponse.json(
        { error: 'Ya no se puede cancelar: Instagram está procesando el video.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ reel: await cancelarProgramacion(reelId, id) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
