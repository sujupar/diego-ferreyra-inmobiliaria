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
import { esVideoDeLaPropiedad } from '@/lib/social/reels/video-propio'
import { limpiarPalabras } from '@/lib/social/reels/palabra-clave'
import { validarMensajes } from '@/lib/social/reels/mensajes'
import { leerAjustes } from '@/lib/social/reels/procesador'
import {
  autorizarReel,
  autorizarVerReels,
  crearReel,
  landingPublicada,
  listarReels,
  resumenDeReels,
} from '@/lib/social/reels/servicio'

/** Lo revisado en el paso "Revisá los mensajes". Topes amplios: los reales los aplica `validarMensajes`. */
const mensajesRevisados = z.object({
  respuestas_con_privado: z.array(z.string().max(1000)).max(10).optional(),
  respuestas_sin_privado: z.array(z.string().max(1000)).max(10).optional(),
  dm_texto: z.string().max(2000).nullable().optional(),
  dm_boton: z.string().max(100).optional(),
  dm_seguimiento: z.string().max(2000).nullable().optional(),
}).optional()

const cuerpoCrear = z.discriminatedUnion('origen', [
  z.object({
    origen: z.literal('subido'),
    videoUrl: z.string().url(),
    palabraClave: z.string().trim().max(500).optional(),
    mensajes: mensajesRevisados,
  }),
  z.object({
    origen: z.literal('existente'),
    igMediaId: z.string().trim().min(1).max(64),
    palabraClave: z.string().trim().max(500).optional(),
    mensajes: mensajesRevisados,
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
    const [resumen, landing, ajustes] = await Promise.all([
      resumenDeReels(reels.map((r) => r.id)),
      landingPublicada(id),
      leerAjustes(),
    ])

    // Solo los dos interruptores, para que la pantalla avise si están apagados.
    // La lista de cuentas de prueba NO viaja al navegador.
    const general = { automatizacion: ajustes.automatizacion_habilitada, privados: ajustes.dm_habilitado }
    return NextResponse.json({ reels, resumen, landing, general })
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

    const palabras = limpiarPalabras(datos.palabraClave)
    if (!palabras.ok) {
      return NextResponse.json({ error: palabras.error }, { status: 400 })
    }
    const mensajes = validarMensajes(datos.mensajes ?? {})
    if (!mensajes.ok) {
      return NextResponse.json({ error: mensajes.error }, { status: 400 })
    }

    if (datos.origen === 'subido') {
      // EL VIDEO TIENE QUE SER NUESTRO, de ESTA propiedad.
      //
      // Sin esta comprobación, el cuerpo del pedido —que lo arma el navegador—
      // podía traer cualquier URL de internet, y el cron se la pasaba a
      // Instagram para que la descargara y la PUBLICARA en la cuenta de la
      // inmobiliaria. O sea: cualquiera con permiso de difundir podía publicar
      // un video arbitrario, de cualquier origen, ante 26.000 seguidores.
      //
      // Es el mismo candado que ya tienen las fotos, el video y los planos en
      // `media/commit`. Ojo con la barra final de NEXT_PUBLIC_SUPABASE_URL: sin
      // normalizarla el prefijo no coincide y se rompen TODAS las subidas
      // (está documentado en CLAUDE.md, ya pasó una vez).
      if (!esVideoDeLaPropiedad(datos.videoUrl, id, process.env.NEXT_PUBLIC_SUPABASE_URL)) {
        return NextResponse.json(
          { error: 'El video tiene que subirse desde esta misma propiedad.' },
          { status: 400 },
        )
      }

      // El formato se vuelve a validar acá aunque el navegador ya lo haya hecho:
      // uno que Instagram no acepta fallaría recién en el cron, minutos después
      // y lejos del asesor.
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
      palabraClave: palabras.valor,
      mensajes: mensajes.valor,
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
