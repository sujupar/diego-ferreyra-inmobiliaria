/**
 * Controles del texto DESPUÉS de la IA. Lo que tiene que pasar SIEMPRE no se le
 * pide al modelo: se verifica en código.
 *
 *  - El disclaimer es un texto legal y va literal. Las descripciones reales lo
 *    tenían parafraseado (Doblas 248: "Las medidas exactas surgirán…", seguido
 *    de basura pegada del portal). Si el modelo lo cambia, se repone.
 *  - Adjetivos prohibidos, rótulos de la estructura ("Primera parte:") y
 *    markdown se DETECTAN y vuelven como problemas: el servicio pide una
 *    corrección y, si persisten, se muestran al asesor. No se borran a ciegas:
 *    sacar una palabra en medio de una frase deja la frase rota.
 */
import { ADJETIVOS_PROHIBIDOS, DISCLAIMER } from './metodo-diego'
import type { TextoGenerado } from './tipos'
import { esTerreno } from './requisitos'

const MAX_PALABRAS_TITULAR = 10
const MAX_PALABRAS_SUBTITULAR = 50

function sinTildes(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function palabras(t: string): number {
  return t.split(/\s+/).filter(Boolean).length
}

function conDisclaimerLiteral(body: string): string {
  const i = body.search(/la presente publicaci[oó]n/i)
  const antes = (i >= 0 ? body.slice(0, i) : body).trimEnd()
  return antes ? `${antes}\n\n${DISCLAIMER}` : DISCLAIMER
}

const ROTULOS = [
  /\b(primera|segunda|tercera|cuarta|quinta|sexta) parte\b/i,
  /^\s*(recorrido|ubicaci[oó]n|conexi[oó]n emocional|emoci[oó]n|datos del edificio|datos del ph|detalle de la propiedad|call.to.action|invitaci[oó]n|disclaimer)\s*:/im,
]
const MARKDOWN = /\*\*|__|^\s*#{1,6}\s/m

const EN_PALABRAS = ['cero', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez']

/**
 * ¿El texto dice cuántos dormitorios tiene? El prompt lo pide y el modelo igual
 * lo salteaba (Doblas 248 salió hablando solo del "dormitorio de servicio").
 */
function diceDormitorios(texto: string, n: number): boolean {
  const palabra = EN_PALABRAS[n] ?? ''
  const numero = n === 1 ? '(?:1|un|uno)' : `(?:${n}${palabra ? `|${palabra}` : ''})`
  return new RegExp(`\\b${numero}\\s+(?:dormitorio|habitaci[oó]n|cuarto)`, 'i').test(sinTildes(texto))
}

export function controlarTexto(
  t: TextoGenerado,
  ficha?: { bedrooms?: number | null; property_type?: string | null },
): { texto: TextoGenerado; problemas: string[] } {
  const texto: TextoGenerado = {
    title: t.title.trim(),
    subtitle: t.subtitle.trim(),
    body: conDisclaimerLiteral(t.body.trim()),
  }

  const problemas: string[] = []
  // El disclaimer contiene palabras comunes: se controla el texto SIN él.
  const escrito = `${texto.title}\n${texto.subtitle}\n${texto.body.slice(0, texto.body.length - DISCLAIMER.length)}`
  const normalizado = sinTildes(escrito)
  for (const adjetivo of ADJETIVOS_PROHIBIDOS) {
    if (normalizado.includes(sinTildes(adjetivo))) problemas.push(`adjetivo prohibido: "${adjetivo}"`)
  }
  if (ROTULOS.some(r => r.test(escrito))) problemas.push('nombra partes de la estructura (rótulos como "Primera parte:" o "Ubicación:")')
  if (MARKDOWN.test(escrito)) problemas.push('usa formato markdown (** o #)')

  // Un terreno no tiene dormitorios aunque la ficha arrastre un valor de cuando
  // era otra cosa: el modelo no lo recibe (entradas.ts) y no debe inventarlo.
  const exigeDormitorios = !esTerreno(ficha?.property_type)
  if (exigeDormitorios && typeof ficha?.bedrooms === 'number' && ficha.bedrooms > 0 && !diceDormitorios(escrito, ficha.bedrooms)) {
    problemas.push(`no dice cuántos dormitorios tiene (la ficha dice ${ficha.bedrooms})`)
  }

  const enTitular = palabras(texto.title)
  if (enTitular > MAX_PALABRAS_TITULAR) problemas.push(`el titular tiene ${enTitular} palabras (máximo ${MAX_PALABRAS_TITULAR})`)
  const enSubtitular = palabras(texto.subtitle)
  if (enSubtitular > MAX_PALABRAS_SUBTITULAR) problemas.push(`el subtitular tiene ${enSubtitular} palabras (máximo ${MAX_PALABRAS_SUBTITULAR})`)

  return { texto, problemas }
}
