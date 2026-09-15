/**
 * Detección de rastreadores. Lógica PURA (sin DOM, sin red).
 *
 * POR QUÉ EXISTE: el 2026-09-15, con el A/B de tasación recién encendido, 234 de
 * 919 visitas registradas (25%) resultaron ser rastreadores — casi todas
 * `facebookexternalhit`, el que previsualiza el enlace cuando se crea o comparte
 * un anuncio. Y 227 de esas 234 cayeron en la variante A. El panel mostraba
 * A=790 / B=35 cuando lo real era A=563 / B=34: le inflaba las visitas a una sola
 * variante y le hundía la tasa de conversión, sesgando el experimento.
 *
 * Las visitas de rastreador NO se descartan: se MARCAN. Borrarlas perdería la
 * señal (un pico de `facebookexternalhit` indica que se tocó un anuncio) y haría
 * imposible auditar por qué un número cambió.
 *
 * CONSERVADOR A PROPÓSITO: ante la duda, NO es bot. Marcar de más borra visitas
 * de personas reales del denominador, que es peor que dejar pasar algún bot.
 */

/**
 * Agentes conocidos. Se listan explícitos en vez de usar un `/bot/i` suelto
 * porque ese patrón marca "Cubot" —una marca de celulares— como rastreador.
 * Los genéricos van con límite de palabra por el mismo motivo.
 */
const PATRONES: RegExp[] = [
  // Redes: los que más aparecen acá, al previsualizar enlaces.
  /facebookexternalhit/i,
  /facebookcatalog/i,
  /meta-externalagent/i,
  /\bwhatsapp\b/i,
  /telegrambot/i,
  /twitterbot/i,
  /linkedinbot/i,
  /slackbot/i,
  /discordbot/i,
  /pinterest(bot|\/)/i,
  // Buscadores.
  /googlebot/i,
  /google-inspectiontool/i,
  /bingbot/i,
  /bingpreview/i,
  /applebot/i,
  /yandex(bot|images)/i,
  /baiduspider/i,
  /duckduckbot/i,
  /petalbot/i,
  // SEO y scrapers.
  /ahrefsbot/i,
  /semrushbot/i,
  /mj12bot/i,
  /dotbot/i,
  /bytespider/i,
  // Agentes de IA.
  /gptbot/i,
  /claudebot/i,
  /anthropic-ai/i,
  /perplexitybot/i,
  /ccbot/i,
  // Automatización y monitoreo.
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /\bcurl\//i,
  /python-requests/i,
  /\bwget\b/i,
  // Genéricos, con límite de palabra para no pisar marcas ("Cubot", "Spiderman").
  /\bbot\b/i,
  /\bcrawler\b/i,
  /\bspider\b/i,
]

/**
 * ¿El user-agent es de un rastreador y no de una persona?
 *
 * Un user-agent vacío NO cuenta como rastreador: es sospechoso, pero marcarlo
 * descartaría visitas reales de navegadores que lo omiten o de clientes con
 * privacidad extrema. Ante la duda, persona.
 */
export function esRastreador(userAgent: string | null | undefined): boolean {
  if (typeof userAgent !== 'string') return false
  const ua = userAgent.trim()
  if (ua.length === 0) return false
  return PATRONES.some((p) => p.test(ua))
}
