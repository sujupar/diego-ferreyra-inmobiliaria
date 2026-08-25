/**
 * Completa `properties.location_refs` (y la provincia faltante) de las fichas
 * cargadas ANTES del selector de ubicación, emparejándolas contra el catálogo
 * real de Argenprop.
 *
 * Solo escribe cuando el resultado es INEQUÍVOCO. Ante dos candidatos posibles
 * no elige: lo informa para revisarlo a mano desde la ficha. Publicar en el
 * partido equivocado manda el aviso a 90 km del lugar — el mismo criterio que
 * `matchLocalizacion`, que devuelve null a propósito ante la duda.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/backfill-property-location.ts            # simulacro
 *   node --env-file=.env.local --import tsx scripts/backfill-property-location.ts --commit   # escribe
 *   ... --solo <propertyId>                                                                  # una sola ficha
 */
import { createClient } from '@supabase/supabase-js'
import { resolveCredentials } from '../lib/portals/credentials'
import {
  getProvincias, getPartidos, getLocalidadesDePartido, getBarrios,
  matchLocalizacion, CABA_LOCALIDAD_ID, type CatalogItem,
} from '../lib/portals/argenprop/catalog'
import { resolverUbicacion, type SeleccionUbicacion } from '../lib/properties/location-selection'
import type { ApCredentials } from '../lib/portals/credentials'

const COMMIT = process.argv.includes('--commit')
// OJO: sin la bandera, `indexOf` da -1 y `argv[0]` es la ruta de node — que
// viajaba como id y Postgres respondía "invalid input syntax for type uuid".
const iSolo = process.argv.indexOf('--solo')
const SOLO = iSolo >= 0 ? process.argv[iSolo + 1] : undefined

const CABA_RE = /\bcaba\b|capital federal|ciudad aut[oó]noma/i
const nombreDe = (i: CatalogItem) => (i.Nombre ?? i.Descripcion ?? '').trim()
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^partido de /, '').trim()
const aItem = (i: CatalogItem) => ({ id: i.Id, nombre: nombreDe(i) })

interface Ficha {
  id: string
  address: string
  province: string | null
  city: string | null
  neighborhood: string | null
  location_refs: Record<string, unknown> | null
}

/**
 * Busca la cadena partido→localidad para una ciudad dentro de UNA provincia.
 * La localidad se busca por el nombre de la ciudad y, si no, por el del barrio
 * (pasa seguido: la ficha guarda la localidad en `neighborhood`).
 */
async function buscarEnProvincia(
  creds: ApCredentials, provincia: CatalogItem, ficha: Ficha,
): Promise<{ partido: CatalogItem; localidad: CatalogItem } | null> {
  const ciudad = (ficha.city ?? '').trim()
  const barrio = (ficha.neighborhood ?? '').trim()
  if (!ciudad && !barrio) return null

  const partidos = await getPartidos(creds, provincia.Id)
  const partido = matchLocalizacion(partidos, ciudad) ?? (barrio ? matchLocalizacion(partidos, barrio) : null)
  if (!partido) return null

  const localidades = await getLocalidadesDePartido(creds, partido.Id)

  // Si la ciudad de la ficha es el nombre del PARTIDO ("San Isidro"), la
  // localidad precisa suele estar en el barrio ("Martínez", que en el catálogo
  // es una localidad del partido). Si no, manda la ciudad.
  const ciudadEsElPartido = norm(ciudad) === norm(nombreDe(partido))
  const porCiudad = matchLocalizacion(localidades, ciudad)
  const porBarrio = barrio ? matchLocalizacion(localidades, barrio) : null
  const localidad = (ciudadEsElPartido ? (porBarrio ?? porCiudad) : (porCiudad ?? porBarrio))
    ?? (localidades.length === 1 ? localidades[0] : null)
  if (!localidad) return null
  return { partido, localidad }
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const resolved = await resolveCredentials('argenprop', { env: process.env, supabase: supabase as never })
  if (!resolved.ap?.tokenCrm) throw new Error('faltan credenciales de Argenprop en el entorno')
  const creds = resolved.ap

  let q = supabase.from('properties').select('id,address,province,city,neighborhood,location_refs').order('created_at')
  if (SOLO) q = q.eq('id', SOLO)
  const { data, error } = await q
  if (error) throw error
  const fichas = (data ?? []) as unknown as Ficha[]

  const provincias = await getProvincias(creds)
  const capital = provincias.find(p => CABA_RE.test(nombreDe(p)))
  if (!capital) throw new Error('no encontré Capital Federal en el catálogo')

  const listas: string[] = []
  const arregladas: string[] = []
  const aRevisar: string[] = []

  for (const f of fichas) {
    const etiqueta = `${f.address} — ${[f.neighborhood, f.city, f.province].filter(Boolean).join(', ') || 'sin ubicación'}`
    if (f.location_refs && typeof f.location_refs === 'object' && 'argenprop' in f.location_refs) {
      listas.push(etiqueta); continue
    }

    const prov = (f.province ?? '').trim()
    const esCaba = CABA_RE.test(`${prov} ${f.city ?? ''}`)

    let seleccion: SeleccionUbicacion | null = null

    if (esCaba) {
      // En Capital la cadena es fija; lo único que hay que resolver es el barrio.
      const partidos = await getPartidos(creds, capital.Id)
      const localidades = partidos.length ? await getLocalidadesDePartido(creds, partidos[0].Id) : []
      const localidad = localidades.find(l => l.Id === CABA_LOCALIDAD_ID)
      const barrios = localidad ? await getBarrios(creds, localidad.Id) : []
      // En Capital la ficha a veces guarda el barrio en `city` (ej. city="Palermo").
      const barrio = matchLocalizacion(barrios, f.neighborhood ?? '') ?? matchLocalizacion(barrios, f.city ?? '')
      if (localidad && barrio) {
        seleccion = { provincia: aItem(capital), partido: aItem(partidos[0]), localidad: aItem(localidad), barrio: aItem(barrio) }
      }
    } else if (prov) {
      const provincia = matchLocalizacion(provincias, prov)
      const hit = provincia ? await buscarEnProvincia(creds, provincia, f) : null
      if (provincia && hit) {
        const barrios = await getBarrios(creds, hit.localidad.Id)
        const barrio = matchLocalizacion(barrios, f.neighborhood ?? '')
        seleccion = {
          provincia: aItem(provincia), partido: aItem(hit.partido), localidad: aItem(hit.localidad),
          barrio: barrio ? aItem(barrio) : null,
        }
      }
    } else {
      // Sin provincia se recorren TODAS y se exige un único candidato: si dos
      // provincias tienen una localidad con ese nombre, no se elige ninguna.
      const candidatos: SeleccionUbicacion[] = []
      for (const provincia of provincias) {
        const hit = await buscarEnProvincia(creds, provincia, f)
        if (!hit) continue
        const barrios = await getBarrios(creds, hit.localidad.Id)
        const barrio = matchLocalizacion(barrios, f.neighborhood ?? '')
        candidatos.push({
          provincia: aItem(provincia), partido: aItem(hit.partido), localidad: aItem(hit.localidad),
          barrio: barrio ? aItem(barrio) : null,
        })
      }
      if (candidatos.length === 1) seleccion = candidatos[0]
      else if (candidatos.length > 1) {
        aRevisar.push(`${etiqueta}  → ambigua: ${candidatos.map(c => c.provincia.nombre).join(' / ')}`)
        continue
      }
    }

    if (!seleccion) { aRevisar.push(`${etiqueta}  → no se pudo resolver contra el catálogo`); continue }

    const resuelta = resolverUbicacion(seleccion, { province: f.province, city: f.city, neighborhood: f.neighborhood })
    if (!resuelta.ok) { aRevisar.push(`${etiqueta}  → ${resuelta.error}`); continue }

    // El backfill AGREGA el vínculo, no relabela. Reescribir los nombres con los
    // del catálogo convertía "Palermo Soho" en "Palermo", "San Martín Centro" en
    // "Centro" y "Lares de Canning" en "Ezeiza": información que el equipo puso a
    // propósito y que sale en la landing y en el copy de los anuncios. Cambiar el
    // nombre visible es decisión de una persona mirando el selector, no de un
    // script pasando por arriba de 33 fichas.
    const ref = resuelta.patch.location_refs
    const patch: Record<string, unknown> = { location_refs: ref }
    if (!(f.province ?? '').trim()) patch.province = resuelta.patch.province

    arregladas.push(
      `${etiqueta}\n      → ${patch.province ? `provincia: ${patch.province} · ` : ''}` +
      `${ref.argenprop.localidadNombre}${ref.argenprop.barrioNombre ? ` / ${ref.argenprop.barrioNombre}` : ''}` +
      `  [${ref.argenprop.localidadId}${ref.argenprop.barrioId ? ` / ${ref.argenprop.barrioId}` : ''}]`,
    )

    if (COMMIT) {
      const { error: errUpd } = await supabase.from('properties')
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq('id', f.id)
      if (errUpd) aRevisar.push(`${etiqueta}  → FALLÓ al guardar: ${errUpd.message}`)
    }
  }

  console.log(`\n${COMMIT ? 'APLICANDO' : 'SIMULACRO (sin --commit no se escribe nada)'}\n`)
  console.log(`Ya estaban listas: ${listas.length}`)
  console.log(`\nResueltas (${arregladas.length}):`)
  for (const l of arregladas) console.log(`  · ${l}`)
  console.log(`\nPara revisar a mano (${aRevisar.length}):`)
  for (const l of aRevisar) console.log(`  · ${l}`)
}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
