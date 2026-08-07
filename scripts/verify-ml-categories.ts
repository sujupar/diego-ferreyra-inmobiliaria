/**
 * Verifica CADA combinación tipo × operación del CATEGORY_MAP contra la API
 * REAL de MercadoLibre. Falla si alguna categoría no es hoja publicable.
 *
 * Correr: npx tsx scripts/verify-ml-categories.ts
 *
 * POR QUÉ EXISTE: el 2026-08-06 falló una publicación en vivo frente al dueño
 * porque las 11 categorías del mapa estaban mal — tres ni existían y tres
 * publicaban en el rubro equivocado sin dar error. Este script habría fallado
 * once veces la primera vez que se corriera. No necesita credenciales: el
 * árbol de categorías de ML es público.
 *
 * CORRERLO cada vez que se toque el mapa, y cada tanto sin motivo: los IDs son
 * datos de un tercero y se pudren solos (MLA1471 estaba en el mapa y hoy da 404).
 */
import { todasLasCategorias, ML_TIPOS_SOPORTADOS, ML_OPERACIONES_SOPORTADAS } from '../lib/portals/mercadolibre/mapping'
import { ML_MAX_FOTOS_AVISO } from '../lib/portals/photo-limits'

interface CategoriaML {
  id?: string
  name?: string
  children_categories?: { id: string; name: string }[]
  settings?: { listing_allowed?: boolean; max_pictures_per_item?: number }
  path_from_root?: { id: string; name: string }[]
}

async function traerCategoria(id: string): Promise<CategoriaML | null> {
  const r = await fetch(`https://api.mercadolibre.com/categories/${id}`)
  if (!r.ok) return null
  return (await r.json()) as CategoriaML
}

async function main() {
  const combos = todasLasCategorias()
  console.log(`verificando ${combos.length} combinaciones contra la API de MercadoLibre…\n`)

  const problemas: string[] = []

  for (const { operacion, tipo, categoria } of combos) {
    const cat = await traerCategoria(categoria)
    const etiqueta = `${tipo} + ${operacion} → ${categoria}`

    if (!cat || !cat.id) {
      problemas.push(`${etiqueta}: la categoría NO EXISTE en MercadoLibre (404)`)
      console.log(`✘ ${etiqueta} — no existe`)
      continue
    }

    const esHoja = (cat.children_categories ?? []).length === 0
    const publicable = cat.settings?.listing_allowed === true
    const ruta = (cat.path_from_root ?? []).map(p => p.name).join(' > ')

    if (!esHoja) {
      problemas.push(`${etiqueta}: NO es hoja (tiene ${cat.children_categories!.length} hijas). ML rechaza publicar acá. Ruta: ${ruta}`)
      console.log(`✘ ${etiqueta} — no es hoja · ${ruta}`)
      continue
    }
    if (!publicable) {
      problemas.push(`${etiqueta}: listing_allowed = false. ML no deja publicar acá. Ruta: ${ruta}`)
      console.log(`✘ ${etiqueta} — no publicable · ${ruta}`)
      continue
    }

    // Coherencia semántica: la ruta tiene que hablar de la operación correcta.
    // Sin esto, "departamento en venta → Departamentos > Alquiler" pasaría el
    // chequeo técnico (es hoja y es publicable) siendo un desastre comercial.
    const rutaMin = ruta.toLowerCase()
    const esperado = operacion === 'venta' ? 'venta'
      : operacion === 'temporario' ? 'temporario'
      : 'alquiler'
    const coincide = operacion === 'alquiler'
      ? rutaMin.includes('alquiler') && !rutaMin.includes('temporario')
      : rutaMin.includes(esperado)

    if (!coincide) {
      problemas.push(`${etiqueta}: la categoría no corresponde a la operación "${operacion}". Ruta real: ${ruta}`)
      console.log(`✘ ${etiqueta} — operación equivocada · ${ruta}`)
      continue
    }

    // Nuestro payload manda hasta ML_MAX_FOTOS_AVISO fotos. Si ML baja el
    // máximo de la categoría por debajo de eso, los avisos empezarían a
    // rechazarse: mejor que falle este script primero.
    const maxFotos = cat.settings?.max_pictures_per_item
    if (typeof maxFotos === 'number' && maxFotos < ML_MAX_FOTOS_AVISO) {
      problemas.push(
        `${etiqueta}: max_pictures_per_item = ${maxFotos} < ML_MAX_FOTOS_AVISO (${ML_MAX_FOTOS_AVISO}). ` +
        `Bajar la constante en lib/portals/photo-limits.ts.`,
      )
      console.log(`✘ ${etiqueta} — admite solo ${maxFotos} fotos · ${ruta}`)
      continue
    }

    console.log(`✔ ${etiqueta} · ${ruta} · fotos ≤ ${maxFotos ?? '?'}`)
  }

  // El mapa tiene que cubrir todo lo que el formulario deja elegir.
  console.log('')
  for (const op of ML_OPERACIONES_SOPORTADAS) {
    for (const tipo of ML_TIPOS_SOPORTADOS) {
      if (!combos.some(c => c.operacion === op && c.tipo === tipo)) {
        problemas.push(`falta mapear: ${tipo} + ${op}`)
        console.log(`✘ sin mapear: ${tipo} + ${op}`)
      }
    }
  }

  if (problemas.length > 0) {
    console.error(`\n❌ ${problemas.length} problema(s):`)
    problemas.forEach(p => console.error('   ·', p))
    process.exit(1)
  }

  console.log(`\n✅ las ${combos.length} categorías son hojas publicables y coinciden con su operación`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
