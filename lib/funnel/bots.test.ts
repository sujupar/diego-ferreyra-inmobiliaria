import { describe, it, expect } from 'vitest'
import { esRastreador } from './bots'

describe('esRastreador', () => {
  it('marca el rastreador que causó el problema', () => {
    // Este es, textualmente, el que generó 192 visitas falsas en una sola hora
    // y sesgó el A/B hacia la variante A.
    expect(
      esRastreador('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'),
    ).toBe(true)
  })

  it('marca los rastreadores habituales', () => {
    const agentes = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'TelegramBot (like TwitterBot)',
      'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
      'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)',
      'WhatsApp/2.19.81 A',
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36',
      'curl/8.4.0',
      'python-requests/2.31.0',
    ]
    for (const ua of agentes) expect(esRastreador(ua), ua).toBe(true)
  })

  it('NO marca navegadores de personas reales', () => {
    // Los tres primeros son user-agents reales sacados de las visitas que sí
    // convirtieron: si alguno se marcara, se perderían conversiones del conteo.
    const agentes = [
      'Mozilla/5.0 (Linux; Android 16; SM-S918W Build/BP4A.251205.006) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Linux; Android 11; moto e20 Build/RONS31.267-94-14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    ]
    for (const ua of agentes) expect(esRastreador(ua), ua).toBe(false)
  })

  it('no confunde marcas que CONTIENEN la palabra bot', () => {
    // "Cubot" es una marca de celulares: con un /bot/i suelto, cada visitante
    // con uno de esos teléfonos desaparecería de las métricas.
    expect(
      esRastreador('Mozilla/5.0 (Linux; Android 10; CUBOT NOTE 20) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'),
    ).toBe(false)
    expect(
      esRastreador('Mozilla/5.0 (Linux; Android 12; Spiderman Edition) AppleWebKit/537.36 Chrome/120.0'),
    ).toBe(false)
  })

  it('ante la duda, persona: user-agent ausente o vacío no es rastreador', () => {
    // Marcarlo descartaría visitas reales, que es peor que dejar pasar un bot.
    expect(esRastreador(null)).toBe(false)
    expect(esRastreador(undefined)).toBe(false)
    expect(esRastreador('')).toBe(false)
    expect(esRastreador('   ')).toBe(false)
  })

  it('no explota con entradas que no son texto', () => {
    expect(esRastreador(12345 as unknown as string)).toBe(false)
    expect(esRastreador({} as unknown as string)).toBe(false)
  })
})
