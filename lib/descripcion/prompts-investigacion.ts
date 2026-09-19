/**
 * Prompts de los dos pasos de INVESTIGACIÓN: mirar las fotos y buscar la zona.
 *
 * Ninguno de los dos escribe la descripción: juntan hechos para el paso de
 * escritura. Por eso los dos insisten en lo mismo: lo que no se ve o no se
 * encuentra, no existe. El redactor ya tiene la orden de no inventar; si acá se
 * inventa, el redactor lo recibe como un hecho.
 */
import type { InventarioFotos } from './tipos'
import type { ParteEntrada } from '@/lib/ai/openai-responses'

export const PROMPT_FOTOS = `Sos el asistente de un tasador inmobiliario de Buenos Aires. Vas a ver TODAS las fotos de una propiedad en venta, numeradas ("Foto 1", "Foto 2"…), y a hacer un inventario objetivo para que después un redactor escriba la descripción del aviso.

Qué hacer:
- Recorré TODAS las fotos. Agrupalas por ambiente (living comedor, cocina, dormitorio principal, dormitorio 2, baño, toilette, lavadero, escritorio, pasillo…) e indicá los números de foto de cada uno.
- Para cada ambiente describí lo que SE VE: pisos (parquet, porcelanato, cerámica, alfombra…), aberturas y ventanas, luz natural, placards, artefactos, terminaciones y estado. Frases cortas y concretas.
- Exteriores (balcón, terraza, patio, jardín, parrilla): qué son, cómo son y DE QUIÉN son: "propio" solo si la foto lo deja claro (por ejemplo, un balcón al que se sale desde el living de la unidad); "comun" si claramente es del edificio (terraza con tendederos compartidos, patio con varias puertas); "no_se_sabe" en cualquier otro caso. Ante la duda, "no_se_sabe".
- Edificio: las partes comunes que se ven (hall, palier, ascensores, amenities, fachada).
- Vistas desde las ventanas, si se ven.
- Estilo general (clásico, moderno, reciclado…) y estado general de conservación.
- Los 5 puntos fuertes más vendedores, en orden.
- Lo que las fotos NO permiten saber y convendría preguntar (orientación, medidas, expensas, antigüedad, si la terraza es propia…).
- Las fotos que sean renders o tengan ambientación virtual (muebles agregados digitalmente): sus números.
- El comprador ideal más probable según lo que ves (tamaño, estilo, estado, tipo de edificio) y por qué, en una frase.

Reglas:
- NUNCA inventes. Si no se ve, no existe. No supongas lo que hay detrás de una puerta cerrada.
- No calcules metros cuadrados. No afirmes orientación.
- No afirmes cómo se conectan los ambientes salvo que una foto lo muestre.
- Castellano rioplatense.`

/** Todas las fotos, cada una precedida por su número: así el modelo no pierde la cuenta. */
export function entradaFotos(urls: string[]): ParteEntrada[] {
  const partes: ParteEntrada[] = []
  urls.forEach((url, i) => {
    partes.push({ tipo: 'texto', texto: `Foto ${i + 1}` })
    // 'low' (512 px) alcanza para pisos, luz y estado y entra en el tiempo:
    // medido 2026-09-19, 22 fotos en 10 s.
    partes.push({ tipo: 'imagen', url, detalle: 'low' })
  })
  partes.push({ tipo: 'texto', texto: `Esas son las ${urls.length} fotos de la propiedad. Hacé el inventario.` })
  return partes
}

const lista = { type: 'array', items: { type: 'string' } }
const numeros = { type: 'array', items: { type: 'integer' } }

/** Esquema estricto de OpenAI: todas las propiedades requeridas, sin extras. */
export const ESQUEMA_INVENTARIO: Record<string, unknown> & { properties: Record<string, unknown>; required: string[] } = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ambientes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['nombre', 'fotos', 'detalle'],
        properties: { nombre: { type: 'string' }, fotos: numeros, detalle: { type: 'string' } },
      },
    },
    exteriores: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['espacio', 'detalle', 'uso', 'fotos'],
        properties: {
          espacio: { type: 'string' }, detalle: { type: 'string' },
          uso: { type: 'string', enum: ['propio', 'comun', 'no_se_sabe'] }, fotos: numeros,
        },
      },
    },
    edificio: lista,
    vistas: lista,
    estilo: { type: 'string' },
    estadoGeneral: { type: 'string' },
    puntosFuertes: lista,
    noSeVe: lista,
    fotosAmbientadas: numeros,
    compradorSugerido: {
      type: 'object', additionalProperties: false, required: ['perfil', 'porque'],
      properties: { perfil: { type: 'string' }, porque: { type: 'string' } },
    },
  },
  required: [
    'ambientes', 'exteriores', 'edificio', 'vistas', 'estilo', 'estadoGeneral',
    'puntosFuertes', 'noSeVe', 'fotosAmbientadas', 'compradorSugerido',
  ],
}

const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])
const enteros = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Valida y normaliza lo que devolvió el modelo (o lo que había en la caché).
 * Un `uso` desconocido cae en "no_se_sabe", nunca en "propio": publicar una
 * terraza común como propia es el error caro.
 */
export function validarInventario(json: unknown): InventarioFotos | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  if (!Array.isArray(o.ambientes)) return null
  const comprador = o.compradorSugerido && typeof o.compradorSugerido === 'object'
    ? (o.compradorSugerido as Record<string, unknown>) : {}
  return {
    ambientes: o.ambientes
      .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && typeof (a as Record<string, unknown>).nombre === 'string')
      .map(a => ({ nombre: str(a.nombre), fotos: enteros(a.fotos), detalle: str(a.detalle) })),
    exteriores: (Array.isArray(o.exteriores) ? o.exteriores : [])
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .map(e => ({
        espacio: str(e.espacio), detalle: str(e.detalle), fotos: enteros(e.fotos),
        uso: e.uso === 'propio' || e.uso === 'comun' ? e.uso : 'no_se_sabe' as const,
      })),
    edificio: textos(o.edificio),
    vistas: textos(o.vistas),
    estilo: str(o.estilo),
    estadoGeneral: str(o.estadoGeneral),
    puntosFuertes: textos(o.puntosFuertes),
    noSeVe: textos(o.noSeVe),
    fotosAmbientadas: enteros(o.fotosAmbientadas),
    compradorSugerido: { perfil: str(comprador.perfil), porque: str(comprador.porque) },
  }
}

export const INSTRUCCIONES_ZONA = `Sos un investigador inmobiliario de Buenos Aires. Buscás en la web datos REALES y verificables del entorno de una dirección, para que después un redactor escriba la sección "Ubicación" de un aviso. No escribís el aviso: juntás hechos.`

export function promptZonaWeb(p: { address: string; neighborhood: string; city?: string | null }): string {
  const lugar = [p.address, p.neighborhood, p.city].map(x => (x ?? '').trim()).filter(Boolean).join(', ')
  return `Investigá el entorno de ${lugar}, Argentina.

Contá, en frases cortas y concretas (máximo 150 palabras en total):
1. El carácter del barrio y de esa zona puntual (residencial, comercial, tranquilo, arbolado, de oficinas…).
2. Las zonas comerciales, gastronómicas o de paseo cercanas, y lugares emblemáticos.
3. Hitos cercanos relevantes (hospitales, universidades, parques grandes, avenidas principales).

Reglas:
- NO des distancias, tiempos de caminata ni líneas de colectivo: se sacan aparte de un mapa.
- Sin introducción ni cierre: empezá directo por el punto 1 y no cuentes las palabras.
- Solo datos que encuentres; si algo no lo encontrás, no lo pongas.
- Preferí fuentes oficiales, mapas, Wikipedia y medios. Los avisos de otras inmobiliarias, solo como último recurso para datos del barrio y NUNCA para describir la propiedad.
- Sin links. Castellano rioplatense.`
}
