/**
 * GET /api/locations/argenprop?nivel=provincias|partidos|localidades|barrios&padre=<id>
 *
 * Sirve el catálogo de localización REAL de Argenprop para el selector de
 * ubicación. La ficha ya no depende de que alguien escriba "Partido de General
 * San Martín" igual que lo escribe el portal.
 *
 * No pega a la API en cada tecla: `lib/portals/argenprop/catalog.ts` cachea 24h
 * en memoria por proceso (lo recomienda la doc de AP para no gastar la cuota).
 *
 * Si Argenprop no está configurado o no responde, devuelve 503 con un mensaje
 * en castellano: la interfaz cae a los campos de texto de siempre en vez de
 * dejar a alguien sin poder cargar una propiedad.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { resolveCredentials } from '@/lib/portals/credentials'
import {
  getProvincias, getPartidos, getLocalidadesDePartido, getBarrios,
  type CatalogItem,
} from '@/lib/portals/argenprop/catalog'
import type { Database } from '@/types/database.types'

export const dynamic = 'force-dynamic'

const NIVELES = ['provincias', 'partidos', 'localidades', 'barrios'] as const
type Nivel = (typeof NIVELES)[number]

/** Cada nivel hijo se pide con el id de su padre, y ese id tiene forma conocida. */
const PADRE_ESPERADO: Record<Nivel, RegExp | null> = {
  provincias: null,
  partidos: /^PROVINCIA_\d+$/,
  localidades: /^PARTIDO_\d+$/,
  barrios: /^LOCALIDAD_\d+$/,
}

function esNivel(v: string | null): v is Nivel {
  return v !== null && (NIVELES as readonly string[]).includes(v)
}

/** El catálogo de localización usa `Nombre`; se normaliza a { id, nombre }. */
function aOpciones(items: CatalogItem[] | null | undefined) {
  return (items ?? [])
    .filter(i => typeof i?.Id === 'string' && (i.Nombre ?? i.Descripcion))
    .map(i => ({ id: i.Id, nombre: (i.Nombre ?? i.Descripcion ?? '').trim() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth()
    // Mismo criterio que el resto de las rutas de propiedades: el abogado no
    // participa de la carga ni de la publicación.
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const nivel = searchParams.get('nivel')
    const padre = searchParams.get('padre')
    if (!esNivel(nivel)) {
      return NextResponse.json({ error: `Nivel inválido. Valores: ${NIVELES.join(', ')}.` }, { status: 400 })
    }
    const formaPadre = PADRE_ESPERADO[nivel]
    if (formaPadre && (!padre || !formaPadre.test(padre))) {
      return NextResponse.json({ error: `Falta el identificador del nivel superior para pedir ${nivel}.` }, { status: 400 })
    }

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const creds = await resolveCredentials('argenprop', { env: process.env, supabase })
    if (!creds.ap?.tokenCrm || !creds.ap.usr || !creds.ap.psd) {
      return NextResponse.json(
        { error: 'Argenprop no está configurado, así que no se puede traer la lista de ubicaciones.', catalogoNoDisponible: true },
        { status: 503 },
      )
    }

    const items =
      nivel === 'provincias' ? await getProvincias(creds.ap)
      : nivel === 'partidos' ? await getPartidos(creds.ap, padre!)
      : nivel === 'localidades' ? await getLocalidadesDePartido(creds.ap, padre!)
      : await getBarrios(creds.ap, padre!)

    return NextResponse.json({ nivel, padre: padre ?? null, items: aOpciones(items) })
  } catch (err) {
    // Un fallo del catálogo NO es un error de la plataforma: la interfaz lo usa
    // para caer a los campos de texto. Por eso 503 y no 500.
    console.error('[locations/argenprop]', err)
    return NextResponse.json(
      {
        error: 'No se pudo traer la lista de ubicaciones de Argenprop. Probá de nuevo en un rato.',
        catalogoNoDisponible: true,
        detalle: err instanceof Error ? err.message : String(err),
      },
      { status: 503 },
    )
  }
}
