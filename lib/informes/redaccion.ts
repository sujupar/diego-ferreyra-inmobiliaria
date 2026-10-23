/**
 * Los textos del informe escritos por la plataforma (pedido del dueño, 2026-10-22: "la data la tiene el
 * sistema; tiene que estar prellenado, tomando como referencia los reportes que te pasé").
 *
 * Puro: arma lo que recibe el modelo, valida lo que devuelve y decide qué texto se reemplaza. La llamada al
 * modelo vive en `servicio.ts` (UNA por pedido, regla de Netlify).
 *
 * Reglas que viven acá y no en el prompt (lo que tiene que pasar siempre va en código):
 * - El modelo recibe SOLO los datos del informe. Una fuente caída llega como null y se lista aparte, para que
 *   no la mencione como cero.
 * - Todo número del texto tiene que estar en los datos: si no, el campo se marca "revisar" (no se bloquea,
 *   porque Paula igual lo lee antes de marcar listo, pero se le señala dónde mirar).
 * - Nunca se pisa lo que Paula corrigió, salvo que pida "Volver a escribir todo".
 */
import { z } from 'zod'
import { textoDelPeriodo } from './periodo'
import { valorDelM2, type Resumen } from './resumen'
import type { Informe, PropiedadDelInforme, Textos } from './tipos'

export const CAMPOS_TEXTO = ['resumenMetricas', 'accionesRealizadas', 'accionesARealizar', 'resumenConsultas', 'analisisFinal'] as const
export type CampoTexto = (typeof CAMPOS_TEXTO)[number]

export interface InformeAnterior { desde: string; hasta: string; vieron: number | null; entraron: number | null; consultas: number | null; visitas: number | null }

const NOMBRE_FUENTE: Record<string, string> = {
  consultas: 'Consultas', visitas: 'Visitas', reserva: 'Reserva', mercadolibre: 'MercadoLibre', meta: 'Campaña de Meta Ads', instagram: 'Reels de Instagram',
}

const unDecimal = (n: number) => Math.round(n * 10) / 10

export function datosParaRedactar(e: { informe: Informe; propiedad: PropiedadDelInforme; resumen: Resumen; anterior: InformeAnterior | null }) {
  const { informe: i, propiedad: p, resumen: r } = e
  const f = i.fuentes
  const okDe = <K extends keyof typeof f>(k: K) => (f[k]?.estado === 'ok' ? f[k]?.datos ?? null : null)
  const ml = okDe('mercadolibre')
  const vis = okDe('visitas')
  const meta = okDe('meta')
  const ig = okDe('instagram')
  const zp = i.manual.zonaprop
  const ap = i.manual.argenprop
  return {
    periodo: { desde: i.desde, hasta: i.hasta, texto: textoDelPeriodo(i.desde, i.hasta) },
    propiedad: {
      direccion: p.direccion, barrio: p.barrio, tipo: p.tipo, ambientes: p.ambientes ?? null,
      precio: p.precio, moneda: p.moneda, m2: p.m2 ?? null, valorM2: valorDelM2(p.precio, p.m2 ?? null),
    },
    portales: {
      vieron: r.vieron.valor,
      entraron: r.entraron.valor,
      porcentajeQueEntro: r.vieron.valor && r.entraron.valor !== null ? unDecimal((r.entraron.valor / r.vieron.valor) * 100) : null,
      zonaprop: zp?.publicado === false ? 'no publicada' : { exposicion: zp?.exposicion ?? null, visualizaciones: zp?.visualizaciones ?? null, interesados: zp?.interesados ?? null },
      argenprop: ap?.publicado === false ? 'no publicada' : { visualizaciones: ap?.visualizaciones ?? null },
    },
    mercadolibre: ml ? {
      avisos: ml.avisos.length, visitas: ml.visitas, interesados: ml.contactos?.interesados ?? null, preguntas: ml.contactos?.preguntas ?? null,
      whatsapp: ml.contactos?.whatsapp ?? null, llamadas: ml.contactos?.llamadas ?? null, vistasTelefono: ml.vistasTelefono ?? null,
    } : null,
    consultas: okDe('consultas'),
    visitas: vis ? {
      realizadas: vis.realizadas, fichasCompletas: vis.ficha.respuestas, leGusto: vis.ficha.leGusto, precio: vis.ficha.precio,
      ofertas: vis.ficha.ofertas, monedaOfertas: vis.ficha.moneda, loQueMenosGusto: vis.ficha.menosGusto, loQueMasGusto: vis.ficha.masGusto,
      comentarios: vis.ficha.comentariosMenosGusto,
    } : null,
    reserva: okDe('reserva')?.reservada ?? null,
    meta: meta ? { alcance: meta.alcance, impresiones: meta.impresiones, clientesPotenciales: meta.resultados } : null,
    instagram: ig ? { reels: ig.reels.length, reproduccionesAcumuladas: ig.reels.reduce((a, x) => a + x.reproducciones, 0) } : null,
    competidoras: i.competidoras.map(c => ({
      direccion: c.direccion, barrio: c.barrio, precio: c.precio, moneda: c.moneda, m2: c.m2, valorM2: c.valorM2,
      ambientes: c.ambientes, antiguedad: c.antiguedad, bajoDePrecio: c.bajoDePrecio, publicadoHace: c.publicadoHace,
    })),
    anterior: e.anterior ? { ...e.anterior, texto: textoDelPeriodo(e.anterior.desde, e.anterior.hasta) } : null,
    fuentesQueFallaron: Object.entries(f).filter(([, v]) => v?.estado === 'error').map(([k]) => NOMBRE_FUENTE[k] ?? k),
  }
}

export type DatosRedaccion = ReturnType<typeof datosParaRedactar>

/** Los números de un texto en castellano: "1.139" = 1139, "23,8" = 23.8. "m²" y "2026-10" no confunden. */
export function numerosDelTexto(texto: string): number[] {
  return [...texto.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g)].map(m => Number(m[0].replace(/\./g, '').replace(',', '.')))
}

function numerosPermitidos(d: DatosRedaccion): number[] {
  const n: number[] = []
  const recorrer = (v: unknown) => {
    if (typeof v === 'number') n.push(v)
    else if (typeof v === 'string') n.push(...numerosDelTexto(v.replace(/-/g, ' ')))
    else if (Array.isArray(v)) v.forEach(recorrer)
    else if (v && typeof v === 'object') Object.values(v).forEach(recorrer)
  }
  recorrer(d)
  // "estos 15 días", "un 100%": la duración del período y los extremos de un porcentaje.
  const dias = Math.round((Date.parse(d.periodo.hasta) - Date.parse(d.periodo.desde)) / 86_400_000) + 1
  n.push(dias, 15, 100)
  return n
}

const SALIDA = z.object({
  resumenMetricas: z.string().min(1).max(600),
  accionesRealizadas: z.array(z.string().min(1).max(400)).min(1).max(6),
  accionesARealizar: z.array(z.string().min(1).max(400)).min(1).max(6),
  resumenConsultas: z.string().min(1).max(1500),
  analisisFinal: z.string().min(1).max(6000),
}).strict()

/** Esquema JSON estricto para la Responses API (todas las propiedades requeridas). */
export const ESQUEMA_REDACCION = {
  nombre: 'textos_informe_quincenal',
  schema: {
    type: 'object', additionalProperties: false,
    required: [...CAMPOS_TEXTO],
    properties: {
      resumenMetricas: { type: 'string' },
      accionesRealizadas: { type: 'array', items: { type: 'string' } },
      accionesARealizar: { type: 'array', items: { type: 'string' } },
      resumenConsultas: { type: 'string' },
      analisisFinal: { type: 'string' },
    },
  },
}

export type ResultadoRedaccion = { ok: true; textos: Required<Textos>; revisar: CampoTexto[] } | { ok: false; error: string }

export function validarRedaccion(crudo: unknown, d: DatosRedaccion): ResultadoRedaccion {
  let valor = crudo
  if (typeof valor === 'string') {
    try { valor = JSON.parse(valor) } catch { return { ok: false, error: 'El modelo no devolvió un JSON' } }
  }
  const p = SALIDA.safeParse(valor)
  if (!p.success) return { ok: false, error: 'El modelo devolvió los textos con otra forma' }
  const textos: Required<Textos> = {
    resumenMetricas: p.data.resumenMetricas.trim(),
    accionesRealizadas: p.data.accionesRealizadas.map(x => x.trim()).join('\n'),
    accionesARealizar: p.data.accionesARealizar.map(x => x.trim()).join('\n'),
    resumenConsultas: p.data.resumenConsultas.trim(),
    analisisFinal: p.data.analisisFinal.trim(),
  }
  const permitidos = numerosPermitidos(d)
  const respaldado = (x: number) => permitidos.some(y => Math.abs(x - y) <= (Number.isInteger(x) ? 0 : 0.11))
  const revisar = CAMPOS_TEXTO.filter(c => numerosDelTexto(textos[c]).some(x => !respaldado(x)))
  return { ok: true, textos, revisar }
}

/**
 * Qué texto queda: el nuevo, si el campo estaba vacío o tenía lo que escribió la plataforma la vez anterior
 * (nadie lo tocó); lo de Paula, si lo corrigió. "Volver a escribir todo" (`forzar`) reemplaza todo.
 */
export function combinarTextos(e: { actuales: Textos; original: Textos; nuevos: Required<Textos>; forzar: boolean }): Required<Textos> {
  const r = { ...e.nuevos }
  if (e.forzar) return r
  for (const c of CAMPOS_TEXTO) {
    const actual = (e.actuales[c] ?? '').trim()
    if (actual && actual !== (e.original[c] ?? '').trim()) r[c] = actual
  }
  return r
}

// ─── Lo que lee el modelo ────────────────────────────────────────────────────

/** Fragmentos REALES de los informes de Diego (Roque Pérez 3059 y Entre Ríos 2333): referencia de tono. */
const EJEMPLOS = `
Resumen de métricas: "La están viendo mucha cantidad de compradores, y varios entraron al aviso a ver más detalles."

Acciones realizadas:
- "Se publicó la propiedad en todos los portales"
- "En este último periodo se obtuvieron 3 consultas, 2 fueron de colegas y la otra quería ofertar u$s 650.000."
- "Se respondieron las consultas y se concretaron 6 visitas."

Acciones a realizar para lograr vender: "Seguir con la máxima difusión." / "Seguir con la máxima exposición."

Resumen de consultas: "En este último periodo se obtuvieron 3 consultas, 2 fueron de la misma persona que ofrecía 650.000 U$D y la otra persona fue el colega que me había consultado si tenía plano la propiedad anteriormente."

Análisis final:
"Durante el período analizado, sólo en los portales inmobiliarios, la propiedad tuvo 1.139 apariciones y 271 ingresos al aviso, pero generó apenas 3 consultas y ninguna visita.
Esto significa que aproximadamente el 23,8% de las personas que encontraron la propiedad en los resultados decidieron ingresar al aviso para conocerla en detalle. Es un buen número de conversión en portales, sus imágenes y sus características consiguen llamar la atención del comprador.
Sin embargo, una vez que el interesado ingresa, analiza la propiedad completa —jardín, pileta, interiores, distribución, estado, ubicación y precio— prácticamente no avanza hacia la etapa de consulta y, hasta el momento, no se generaron nuevas visitas.
Debido a esto veo que el principal inconveniente no está en la exposición de la propiedad, sino en la conversión de esa exposición en demanda real.
El comprador está viendo la propiedad, pero al compararla con las demás alternativas disponibles continúa evaluando otras opciones.
Comparación con la competencia: las propiedades que actualmente compiten dentro de Coghlan se encuentran publicadas aproximadamente alrededor de los USD 1.700 por m² y, además, varias de ellas vienen realizando reducciones de precio.
Actualmente, Roque Pérez 3059 se encuentra publicada en USD 1.912/m². La diferencia es importante porque el comprador no analiza la propiedad de manera aislada: cuando ingresa al aviso, simultáneamente encuentra otras casas de características similares y compara qué obtiene por el mismo presupuesto."
`.trim()

export const INSTRUCCIONES_REDACCION = `
Sos Diego Ferreyra, martillero (CUCICBA 8266), y escribís los textos del informe quincenal que recibe el dueño de una
propiedad que tenés a la venta. Escribís en castellano rioplatense, con voseo, cercano y profesional, frases simples,
como en tus informes reales (ejemplos abajo). Primera persona cuando analizás ("veo que…"), impersonal para las
acciones ("Se publicó…").

REGLA DURA: usá SOLO los datos del JSON. Todo número que escribas tiene que estar en el JSON (podés redondear un
porcentaje que ya viene calculado). Si un dato es null o una fuente está en "fuentesQueFallaron", no lo menciones:
nunca lo presentes como cero. No inventes consultas, visitas, ofertas, colegas ni conversaciones que no estén.
Tampoco hables de lo que NO hay ("no hay competidoras para comparar", "no hay comentarios de visitas"): lo que no
está, simplemente no se trata. El informe lo lee el propietario, no un analista.

Cómo leer los números: portales.vieron y portales.entraron YA SUMAN los tres portales (exposición de Zonaprop +
visualizaciones de Argenprop + visitas de MercadoLibre). No los sumes de nuevo ni nombres MercadoLibre aparte como si
fuera otro total. "vieron" son apariciones en búsquedas; "entraron" son ingresos al aviso.

Qué va en cada campo:
- resumenMetricas: 1 o 2 frases sobre cómo se está viendo la propiedad en el período.
- accionesRealizadas: SOLO hechos que están en los datos: dónde está publicada, campaña de Meta si hubo, reels si
  hubo, visitas realizadas si hubo. NO digas que se respondieron consultas ni que se hizo algo que el JSON no dice.
  Una acción por elemento, frase corta.
- accionesARealizar: una recomendación coherente con el análisis, según dónde se corta el recorrido:
  · porcentajeQueEntro menor a 10 → la presentación no atrae: mejorar fotos, título o portada.
  · porcentajeQueEntro de 10 o más y pocas consultas → la presentación SÍ funciona (no recomiendes cambiar fotos);
    el comprador entra y no avanza: revisar el precio frente a la competencia.
  · consultas sin visitas → hacer seguimiento a los interesados para coordinar visitas.
  · visitas que opinan "precio por encima del valor de mercado" → conversar un ajuste de precio.
  · si avanza bien en todas las etapas: "Seguir con la máxima difusión."
  Una por elemento.
- resumenConsultas: cuántas consultas hubo y por dónde; si hay datos de visitas/encuesta que agreguen contexto, sumalo.
- analisisFinal: 3 a 6 párrafos como el ejemplo: apariciones → ingresos (con el porcentaje que entró) → consultas →
  visitas; dónde está el cuello; qué dijeron los que visitaron (si hay fichas); comparación con la competencia por
  valor del m² SOLO si hay competidoras y valor del m² propio; si hay informe anterior, cómo evolucionó. Cerrá con la
  conclusión, sin promesas.

Ejemplos reales tuyos (tono y estructura, NO copies los números):
${EJEMPLOS}
`.trim()

export function entradaDeRedaccion(d: DatosRedaccion): string {
  return `Datos del informe (JSON):\n${JSON.stringify(d, null, 1)}`
}
