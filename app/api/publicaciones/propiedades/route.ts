import { NextResponse } from 'next/server'
import { contenidoAuth } from '@/lib/contenido/route-auth'
import { publicacionesDb } from '@/lib/publicaciones/db'
import { patronDeBusqueda, type PropiedadParaConectar } from '@/lib/publicaciones/propiedades'
import { respuestaDeError } from '@/lib/publicaciones/servidor/http'
import { leerAjustes } from '@/lib/social/reels/procesador'

const ID = /^[0-9a-f-]{36}$/i

// GET ?q=texto  → propiedades cuya dirección lo contiene (para conectar un video).
// GET ?id=uuid  → esa propiedad (para mostrar la ya elegida al recargar).
export async function GET(req: Request) {
  const auth = await contenidoAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const patron = patronDeBusqueda(url.searchParams.get('q') ?? '')
    // Los interruptores generales de la automatización: la pantalla avisa si están apagados.
    const ajustes = await leerAjustes()
    const instagram = { automatizacionGeneral: ajustes.automatizacion_habilitada, privadosActivos: ajustes.dm_habilitado }
    if (!(id && ID.test(id)) && !patron) return NextResponse.json({ propiedades: [], instagram })

    const db = publicacionesDb()
    let q = db.from('properties').select('id, address, neighborhood').neq('status', 'descartada').limit(15)
    q = id && ID.test(id) ? q.eq('id', id) : q.ilike('address', patron ?? '')
    const { data, error } = await q
    if (error) throw new Error(`DB: ${error.message}`)
    const filas = (data ?? []) as { id: string; address: string | null; neighborhood: string | null }[]

    const { data: landings, error: e2 } = filas.length
      ? await db.from('property_landings').select('property_id, status, public_slug').in('property_id', filas.map((f) => f.id))
      : { data: [], error: null }
    if (e2) throw new Error(`DB: ${e2.message}`)
    const publicadas = new Map(
      ((landings ?? []) as { property_id: string; status: string; public_slug: string | null }[])
        .filter((l) => l.status === 'published' && !!l.public_slug)
        .map((l) => [l.property_id, l.public_slug as string]),
    )
    const propiedades: PropiedadParaConectar[] = filas.map((f) => ({
      id: f.id,
      direccion: f.address ?? '(sin dirección)',
      barrio: f.neighborhood,
      landingPublicada: publicadas.has(f.id),
      landingSlug: publicadas.get(f.id) ?? null,
    }))
    return NextResponse.json({ propiedades, instagram })
  } catch (e) {
    return respuestaDeError(e, 'buscar propiedades')
  }
}
