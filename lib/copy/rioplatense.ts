/**
 * Guía de estilo RIOPLATENSE — fuente única para todos los generadores de copy.
 *
 * Por qué existe: cada prompt tenía (o no) su propia línea suelta diciendo
 * "español rioplatense", y los modelos se iban a español neutro (tuteo, "puedes",
 * "apartamento", "piscina"). Acá vive la regla completa y todos los generadores
 * la importan, así el tono es el mismo en landing, avatares, preguntas y
 * descripciones de portal.
 *
 * El rioplatense es la variedad del Río de la Plata (Buenos Aires/Montevideo).
 * Lo que lo define POR ESCRITO — que es lo único que aplica acá — es el voseo y
 * el léxico; el yeísmo rehilado ("sh") y la entonación son fonéticos y no se
 * transcriben. Ver: es.wikipedia.org/wiki/Español_rioplatense
 */

/**
 * Bloque para pegar en el system prompt de cualquier generador de copy.
 * Está redactado como reglas accionables, no como teoría.
 */
export const RIOPLATENSE_STYLE = `ESPAÑOL RIOPLATENSE (Argentina, Buenos Aires) — OBLIGATORIO:
- VOSEO siempre. Nunca tuteo ni "usted".
  Correcto: vos, tenés, podés, querés, sabés, sos, vivís, elegís, conocés, buscás.
  Imperativos: mirá, vení, entrá, escribinos, dejanos, agendá, imaginá, sumate, aprovechá.
  PROHIBIDO: tú, tienes, puedes, quieres, sabes, eres, mira, ven, entra, déjanos, agenda, imagina.
- Plural: ustedes (nunca vosotros/tenéis/podéis).
- Pretérito simple, no compuesto: "ayer la visitamos" (no "hemos visitado").
- LÉXICO ARGENTINO INMOBILIARIO (usar estos, nunca los de España/México):
  departamento (NO apartamento/piso), ambientes (NO habitaciones para contar: "3 ambientes"),
  monoambiente, PH, dúplex, pileta (NO piscina), cochera (NO garaje/estacionamiento),
  baulera, parrilla/quincho, expensas, living, placard (NO armario/clóset),
  lavadero, contrafrente/al frente, a estrenar, apto crédito, escritura, seña,
  barrio (NO colonia), cuadra, vereda (NO acera), subte, colectivo, auto (NO carro/coche),
  heladera (NO nevera), departamento luminoso, semipiso, piso (solo como "piso 7").
- Registro: cálido, cercano y aspiracional, pero PROFESIONAL. Es una inmobiliaria
  de segmento medio-alto: nada de lunfardo pesado ni "che/boludo/quilombo/laburo".
  El voseo natural alcanza para que suene argentino.
- Sin españolismos ni neutro de doblaje: nada de "estupendo", "ahora mismo",
  "coger", "vale", "os", "chévere", "recámara", "alberca", "platicar".
- Moneda y formato local: US$ 135.000 / $ 250.000 (punto de miles, coma decimal).`

/**
 * Formas de TUTEO frecuentes que delatan que el copy se fue al español neutro.
 * Se usa en tests para blindar los textos determinísticos (los que no pasan por
 * IA) y para auditar copy generado.
 *
 * Ojo: solo formas INEQUÍVOCAS. Se excluyen palabras que en 3ª persona son
 * correctas ("un asesor te contacta", "la propiedad tiene") — por eso la lista
 * apunta a 2ª persona del singular tuteante y a imperativos sin tilde.
 */
export const TUTEO_PATTERNS: RegExp[] = [
  /\btú\b/i,
  /\btienes\b/i,
  /\bpuedes\b/i,
  /\bquieres\b/i,
  /\bsabes\b/i,
  /\bdebes\b/i,
  /\bvives\b/i,
  /\beliges\b/i,
  /\bconoces\b/i,
  /\bbuscas\b/i,
  /\bvosotros\b/i,
  /\btenéis\b/i,
  /\bpodéis\b/i,
]

/** Léxico que NO es argentino (España/México/neutro). */
export const NON_ARGENTINE_LEXICON: RegExp[] = [
  /\bapartamento\b/i,
  /\bpiscina\b/i,
  /\bgaraje\b/i,
  /\barmario\b/i,
  /\bclóset\b/i,
  /\bnevera\b/i,
  /\bacera\b/i,
  /\brecámara\b/i,
  /\balberca\b/i,
  /\bchévere\b/i,
  /\bcoche\b/i,
]

export interface RioplatenseIssue {
  term: string
  kind: 'tuteo' | 'lexico'
}

/**
 * Detecta desvíos del rioplatense en un texto. Devuelve [] si está limpio.
 * NO reescribe: reemplazar a ciegas rompe frases (ej. "puedes" dentro de una
 * cita). Sirve para tests y para auditar lo que devuelve la IA.
 */
export function findRioplatenseIssues(text: string): RioplatenseIssue[] {
  const issues: RioplatenseIssue[] = []
  for (const re of TUTEO_PATTERNS) {
    const m = text.match(re)
    if (m) issues.push({ term: m[0], kind: 'tuteo' })
  }
  for (const re of NON_ARGENTINE_LEXICON) {
    const m = text.match(re)
    if (m) issues.push({ term: m[0], kind: 'lexico' })
  }
  return issues
}
