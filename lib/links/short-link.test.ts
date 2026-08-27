import { describe, it, expect } from 'vitest'
import {
  LARGO_DEL_CODIGO,
  generarCodigo,
  urlCorta,
  esDestinoPermitido,
  deepLinkDeWhatsapp,
  paginaDeRebote,
} from './short-link'

describe('generarCodigo', () => {
  it('tiene el largo fijo y solo caracteres que se pueden dictar por teléfono', () => {
    for (let i = 0; i < 50; i++) {
      const c = generarCodigo()
      expect(c).toHaveLength(LARGO_DEL_CODIGO)
      // Sin O/0/I/l/1: el link se lee en voz alta y se copia a mano.
      expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789]+$/)
    }
  })

  it('no repite: dos códigos seguidos son distintos', () => {
    const vistos = new Set(Array.from({ length: 200 }, () => generarCodigo()))
    expect(vistos.size).toBe(200)
  })
})

describe('urlCorta', () => {
  it('arma el link con el dominio propio', () => {
    expect(urlCorta('Kx7mQ2p', 'https://inmodf.com.ar')).toBe('https://inmodf.com.ar/r/Kx7mQ2p')
  })

  it('no duplica la barra si la base la trae', () => {
    expect(urlCorta('Kx7mQ2p', 'https://inmodf.com.ar/')).toBe('https://inmodf.com.ar/r/Kx7mQ2p')
  })

  it('es más corto que el tinyurl que reemplaza', () => {
    expect(urlCorta(generarCodigo(), 'https://inmodf.com.ar').length).toBeLessThanOrEqual(
      'https://tinyurl.com/22swlcgs'.length + 4,
    )
  })
})

describe('esDestinoPermitido', () => {
  it('acepta los dominios de WhatsApp, que es lo único que acortamos', () => {
    expect(esDestinoPermitido('https://wa.me/541154974791?text=Hola')).toBe(true)
    expect(esDestinoPermitido('https://api.whatsapp.com/send?phone=54115497')).toBe(true)
  })

  it('RECHAZA cualquier otro destino: un acortador abierto es un redirector para estafas', () => {
    expect(esDestinoPermitido('https://banco-falso.com/login')).toBe(false)
    expect(esDestinoPermitido('https://tinyurl.com/abc')).toBe(false)
  })

  it('RECHAZA un dominio que solo PARECE de WhatsApp', () => {
    expect(esDestinoPermitido('https://wa.me.evil.com/541154974791')).toBe(false)
    expect(esDestinoPermitido('https://evil.com/wa.me/541154974791')).toBe(false)
    expect(esDestinoPermitido('https://notwa.me/54115')).toBe(false)
  })

  it('RECHAZA esquemas que no son https', () => {
    expect(esDestinoPermitido('http://wa.me/541154974791')).toBe(false)
    expect(esDestinoPermitido('javascript:alert(1)')).toBe(false)
    expect(esDestinoPermitido('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('no explota con basura', () => {
    expect(esDestinoPermitido('')).toBe(false)
    expect(esDestinoPermitido('no es una url')).toBe(false)
  })
})

describe('deepLinkDeWhatsapp', () => {
  it('convierte el wa.me en el deep link que abre la app sin pasar por la web', () => {
    expect(deepLinkDeWhatsapp('https://wa.me/541154974791?text=Hola%20Ana')).toBe(
      'whatsapp://send?phone=541154974791&text=Hola%20Ana',
    )
  })

  it('sin mensaje precargado, solo abre el chat', () => {
    expect(deepLinkDeWhatsapp('https://wa.me/541154974791')).toBe('whatsapp://send?phone=541154974791')
  })

  it('el saludo con acentos y signos sobrevive el ida y vuelta', () => {
    const saludo = 'Hola Viviana López, buen día! ¿Cómo estás?'
    const deep = deepLinkDeWhatsapp(`https://wa.me/54115?text=${encodeURIComponent(saludo)}`)!
    expect(new URLSearchParams(deep.split('?')[1]).get('text')).toBe(saludo)
  })

  it('entiende también el formato api.whatsapp.com', () => {
    expect(deepLinkDeWhatsapp('https://api.whatsapp.com/send?phone=54115&text=Hola')).toBe(
      'whatsapp://send?phone=54115&text=Hola',
    )
  })

  it('devuelve null si no es un link de WhatsApp: no se inventa un deep link', () => {
    expect(deepLinkDeWhatsapp('https://banco-falso.com')).toBeNull()
    expect(deepLinkDeWhatsapp('cualquier cosa')).toBeNull()
  })

  it('sin teléfono no hay deep link posible', () => {
    expect(deepLinkDeWhatsapp('https://wa.me/')).toBeNull()
  })
})

describe('paginaDeRebote', () => {
  const WA = 'https://wa.me/541154974791?text=Hola'

  it('manda al deep link de la app, que es lo que evita el clic de "Continuar al chat"', () => {
    const html = paginaDeRebote(WA)
    expect(html).toContain('whatsapp://send?phone=541154974791')
  })

  it('deja el wa.me como respaldo visible por si la app no está instalada', () => {
    expect(paginaDeRebote(WA)).toContain('https://wa.me/541154974791?text=Hola')
  })

  it('pide a los buscadores que no lo indexen', () => {
    expect(paginaDeRebote(WA)).toContain('noindex')
  })

  it('ESCAPA el saludo: el nombre del interesado lo escribe un desconocido en un portal', () => {
    const malicioso = `https://wa.me/54115?text=${encodeURIComponent('</script><script>alert(1)</script>')}`
    const html = paginaDeRebote(malicioso)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toContain('</script><script>')
  })

  it('ESCAPA las comillas: sin esto se sale del atributo href', () => {
    const html = paginaDeRebote(`https://wa.me/54115?text=${encodeURIComponent('" onload="alert(1)')}`)
    expect(html).not.toMatch(/href="[^"]*"\s+onload=/)
  })

  it('sin deep link posible, igual sirve la página con el respaldo', () => {
    const html = paginaDeRebote('https://wa.me/')
    expect(html).toContain('wa.me')
    expect(html).not.toContain('whatsapp://send?phone=&')
  })
})
