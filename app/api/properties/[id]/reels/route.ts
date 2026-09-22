/**
 * Reels de una propiedad.
 *   GET  → la lista con sus contadores y el estado del candado de la landing.
 *   POST → crea uno: subido (con la URL del video) o enganchado (con el id de
 *          Instagram del reel que ya está publicado).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { REEL_EXTS } from '@/lib/properties/media'
import {
  autorizarReel,
  autorizarVerReels,
  crearReel,
  landingPublicada,
  listarReels,
  resumenDeReels,
} from '@/lib/social/reels/servicio'

const cuerpoCrear = z.discriminatedUnion('origen', [
  z.object({
    origen: z.literal('subido'),
    videoUrl: z.string().url(),
    palabraClave: z.string().trim().max(60).optional(),
  }),
  z.object({
    origen: z.literal('existente'),
    igMediaId: z.string().trim().min(1).max(64),
    palabraClave: z.string().trim().max(60).optional(),
  }),
])

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    // Para MIRAR alcanza con ver_difusion: el abogado entra, pero sin botones.
    if (!(await autorizarVerReels(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const reels = await listarReels(id)
    const [resumen, landing] = await Promise.all([
      resumenDeReels(reels.map((r) => r.id)),
      landingPublicada(id),
    ])

    return NextResponse.json({ reels, resumen, landing })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await autorizarReel(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const analisis = cuerpoCrear.safeParse(await req.json().catch(() => ({})))
    if (!analisis.success) {
      return NextResponse.json({ error: 'Datos incompletos o inválidos.' }, { status: 400 })
    }
    const datos = analisis.data

    if (datos.origen === 'subido') {
      // Se vuelve a validar acá aunque el navegador ya lo haya hecho: el cuerpo
      // viene de afuera y un formato que Instagram no acepta fallaría recién en
      // el cron, minutos después y lejos del asesor.
      if (!datos.videoUrl.startsWith('https://')) {
        return NextResponse.json({ error: 'La URL del video tiene que ser https.' }, { status: 400 })
      }
      const extension = new URL(datos.videoUrl).pathname.split('.').pop()?.toLowerCase() ?? ''
      if (!(REEL_EXTS as readonly string[]).includes(extension)) {
        return NextResponse.json(
          { error: `Instagram solo acepta ${REEL_EXTS.join(' y ')}.` },
          { status: 400 },
        )
      }
    }

    const reel = await crearReel({
      propertyId: id,
      creadoPor: user.id,
      origen: datos.origen,
      videoUrl: datos.origen === 'subido' ? datos.videoUrl : null,
      igMediaId: datos.origen === 'existente' ? datos.igMediaId : null,
      palabraClave: datos.palabraClave ?? null,
    })

    return NextResponse.json({ reel })
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error'
    // "Ya está enganchado" es culpa del pedido, no del servidor: 409 para que la
    // pantalla lo muestre como un aviso y no como una caída.
    const estado = mensaje.includes('ya está enganchado') ? 409 : 500
    return NextResponse.json({ error: mensaje }, { status: estado })
  }
}
