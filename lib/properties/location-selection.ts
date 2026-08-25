/**
 * La ubicación de una propiedad se ELIGE de una lista, no se escribe.
 *
 * Por qué existe este módulo: el 2026-08-24 "Rogelio Vidal 6136" no se pudo
 * publicar en Argenprop porque la ficha no tenía provincia — el alta nunca la
 * pregunta y `deriveProvince` solo sabe reconocer Capital. Pero cargarla a mano
 * tampoco alcanzaba: el catálogo real de Argenprop escribe los nombres a su
 * manera ("Partido de General San Martín", "General San Martin" SIN tilde,
 * "Villa Libertad" que es BARRIO y no localidad), así que emparejar por texto
 * es una apuesta. Y el emparejador, ante la duda, devuelve null a propósito
 * (publicar en el partido equivocado manda el aviso a 90 km).
 *
 * Acá se traduce UNA selección del catálogo a lo que se guarda en la ficha.
 * Módulo PURO (sin Supabase ni red): la ruta queda fina y esto se testea sin
 * mocks. Mismo criterio que `editable-fields.ts` y `commercial-status.ts`.
 */

/** Localidad de Capital Federal en el catálogo de Argenprop. */
export const ID_LOCALIDAD_CABA = 'LOCALIDAD_2102'

/** Un ítem tal como lo devuelve el catálogo de Argenprop. */
export interface ItemCatalogo {
  id: string
  nombre: string
}

export interface SeleccionUbicacion {
  provincia: ItemCatalogo
  partido: ItemCatalogo
  localidad: ItemCatalogo
  /** Opcional fuera de Capital; OBLIGATORIO en Capital (regla de la API de AP). */
  barrio?: ItemCatalogo | null
}

/** Lo que la ficha tiene HOY. Sirve para no degradar las tildes ya escritas. */
export interface UbicacionActual {
  province?: string | null
  city?: string | null
  neighborhood?: string | null
}

export interface RefArgenprop {
  provinciaId: string
  provinciaNombre: string
  partidoId: string
  partidoNombre: string
  localidadId: string
  localidadNombre: string
  barrioId: string | null
  barrioNombre: string | null
}

export interface PatchUbicacion {
  province: string
  city: string
  neighborhood: string
  location_refs: { argenprop: RefArgenprop }
}

export type ResultadoUbicacion =
  | { ok: true; patch: PatchUbicacion }
  | { ok: false; error: string }

const LARGO_MAX_NOMBRE = 120

/**
 * Cada nivel tiene su propio prefijo en el catálogo. Chequearlo no es paranoia
 * decorativa: el cuerpo del pedido llega del navegador, y mandar un id de
 * partido donde va una localidad haría que el aviso se publique en otro lado
 * (o que la API de AP responda un error críptico).
 */
const PREFIJOS: Record<keyof SeleccionUbicacion, RegExp> = {
  provincia: /^PROVINCIA_\d+$/,
  partido: /^PARTIDO_\d+$/,
  localidad: /^LOCALIDAD_\d+$/,
  barrio: /^BARRIO_\d+$/,
}

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

function esItem(v: unknown): v is ItemCatalogo {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const i = v as Record<string, unknown>
  return typeof i.id === 'string' && typeof i.nombre === 'string'
}

function itemValido(v: unknown, nivel: keyof SeleccionUbicacion): v is ItemCatalogo {
  if (!esItem(v)) return false
  const nombre = v.nombre.trim()
  return PREFIJOS[nivel].test(v.id) && nombre.length > 0 && nombre.length <= LARGO_MAX_NOMBRE
}

/** ¿Es Capital Federal? Se decide por el ID de la localidad, no por el nombre. */
function esCapital(seleccion: SeleccionUbicacion): boolean {
  return seleccion.localidad.id === ID_LOCALIDAD_CABA
}

/**
 * Conserva el nombre que YA estaba escrito cuando es el mismo salvo tildes o
 * mayúsculas.
 *
 * El catálogo de Argenprop escribe varios nombres sin tilde ("Villa Pueyrredon",
 * "Constitucion", "General San Martin"). Ese texto no se queda en el aviso: sale
 * también en la landing pública y en el copy de los anuncios pagos. Si la ficha
 * ya decía "Villa Pueyrredón", elegirla de la lista no tiene por qué empeorarla.
 */
function preferirNombreEscrito(delCatalogo: string, actual: string | null | undefined): string {
  const limpio = delCatalogo.trim()
  const yaEscrito = (actual ?? '').trim()
  if (yaEscrito && normalizar(yaEscrito) === normalizar(limpio)) return yaEscrito
  return limpio
}

/** ¿Están los tres niveles obligatorios? (para habilitar el botón de guardar) */
export function esSeleccionCompleta(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<SeleccionUbicacion>
  return itemValido(s.provincia, 'provincia')
    && itemValido(s.partido, 'partido')
    && itemValido(s.localidad, 'localidad')
}

/**
 * Traduce la selección del catálogo a las columnas de la ficha.
 *
 * Decisiones que quedan acá y no en la interfaz:
 *  - Capital Federal se guarda como `province = 'CABA'`. Es el valor que ya
 *    entienden el adapter de Argenprop (`dicenCaba`), el mapeo de MercadoLibre
 *    y el geocoder. Guardar "Capital Federal" también andaría, pero dejaría dos
 *    formas de decir lo mismo conviviendo en la base.
 *  - `city` es la LOCALIDAD, no el partido: es lo que la gente llama ciudad
 *    ("Villa Ballester", no "Partido de General San Martín") y es el nivel que
 *    Argenprop publica.
 *  - Sin barrio, `neighborhood` toma el nombre de la localidad: la columna es
 *    NOT NULL y dejarla vacía rompería el alta y los títulos de los avisos.
 */
export function resolverUbicacion(seleccion: SeleccionUbicacion, actual: UbicacionActual): ResultadoUbicacion {
  if (!seleccion || typeof seleccion !== 'object' || Array.isArray(seleccion)) {
    return { ok: false, error: 'No llegó ninguna ubicación para guardar.' }
  }
  if (!itemValido(seleccion.provincia, 'provincia')) {
    return { ok: false, error: 'Elegí la provincia de la lista.' }
  }
  if (!itemValido(seleccion.partido, 'partido')) {
    return { ok: false, error: 'Elegí el partido de la lista.' }
  }
  if (!itemValido(seleccion.localidad, 'localidad')) {
    return { ok: false, error: 'Elegí la localidad de la lista.' }
  }
  const barrio = seleccion.barrio ?? null
  if (barrio !== null && !itemValido(barrio, 'barrio')) {
    return { ok: false, error: 'Elegí el barrio de la lista.' }
  }
  if (esCapital(seleccion) && !barrio) {
    return { ok: false, error: 'En Capital Federal el barrio es obligatorio para publicar en Argenprop.' }
  }

  const enCapital = esCapital(seleccion)
  const provinciaNombre = seleccion.provincia.nombre.trim()
  const localidadNombre = seleccion.localidad.nombre.trim()

  const province = enCapital ? 'CABA' : preferirNombreEscrito(provinciaNombre, actual.province)
  const city = preferirNombreEscrito(localidadNombre, actual.city)
  const neighborhood = barrio
    ? preferirNombreEscrito(barrio.nombre, actual.neighborhood)
    : city

  return {
    ok: true,
    patch: {
      province,
      city,
      neighborhood,
      location_refs: {
        argenprop: {
          provinciaId: seleccion.provincia.id,
          provinciaNombre,
          partidoId: seleccion.partido.id,
          partidoNombre: seleccion.partido.nombre.trim(),
          localidadId: seleccion.localidad.id,
          localidadNombre,
          barrioId: barrio?.id ?? null,
          barrioNombre: barrio?.nombre.trim() ?? null,
        },
      },
    },
  }
}

/**
 * Lee del `location_refs` guardado lo único que necesita el adapter para
 * publicar: el id de localidad y (si hay) el de barrio.
 *
 * Valida la FORMA antes de devolverlo. Un id corrupto guardado hace tiempo no
 * debe viajar a la API de Argenprop: es preferible caer al camino por nombres,
 * que al menos avisa en castellano qué campo revisar.
 */
export function leerRefArgenprop(refs: unknown): { localidadId: string; barrioId: string | null } | null {
  if (!refs || typeof refs !== 'object' || Array.isArray(refs)) return null
  const ap = (refs as Record<string, unknown>).argenprop
  if (!ap || typeof ap !== 'object' || Array.isArray(ap)) return null
  const { localidadId, barrioId } = ap as Record<string, unknown>
  if (typeof localidadId !== 'string' || !PREFIJOS.localidad.test(localidadId)) return null
  const barrio = typeof barrioId === 'string' && PREFIJOS.barrio.test(barrioId) ? barrioId : null
  return { localidadId, barrioId: barrio }
}

/**
 * Busca un ítem del catálogo por su nombre, para PRESELECCIONAR el selector con
 * lo que la ficha ya dice y ahorrarle clics a quien la corrige.
 *
 * Exige coincidencia EXACTA salvo tildes, mayúsculas, espacios de más y el
 * prefijo "Partido de " que la API le pone a todos los partidos. No hay
 * parecidos: esto solo pre-marca una opción que la persona ve y confirma, y una
 * preselección equivocada es peor que ninguna, porque se acepta sin mirar.
 *
 * Vive acá y no en el componente para que se pueda probar sin navegador: los
 * tests de componente de este repo necesitan happy-dom, y la lógica que decide
 * qué queda marcado no debería depender de eso.
 */
export function buscarEnCatalogoPorNombre(
  items: ItemCatalogo[], nombre: string | null | undefined,
): ItemCatalogo | undefined {
  const objetivo = normalizarNombreDeLugar(nombre ?? '')
  if (!objetivo) return undefined
  return items.find(i => normalizarNombreDeLugar(i.nombre) === objetivo)
}

/** Normaliza un nombre de lugar: sin tildes, sin "Partido de", espacios simples. */
export function normalizarNombreDeLugar(s: string): string {
  return normalizar(s).replace(/^partido de /, '')
}

/**
 * La ficha guarda Capital como 'CABA'; el catálogo la llama 'Capital Federal'.
 * Sin esta traducción, una propiedad porteña no preselecciona nada.
 */
export function pistaDeProvincia(province: string | null | undefined): string | null | undefined {
  return /^caba$/i.test((province ?? '').trim()) ? 'Capital Federal' : province
}
