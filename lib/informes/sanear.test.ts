import { describe, it, expect } from 'vitest'
import { sanearCambios } from './sanear'

describe('sanearCambios (lo que manda la pantalla del informe)', () => {
  it('acepta los números de los portales, los textos y el aviso de ML', () => {
    const r = sanearCambios({
      manual: {
        zonaprop: { exposicion: 930, visualizaciones: 62, interesados: 1 },
        argenprop: { publicado: false },
        mercadolibre: { aviso: 'MLA-3968141346', contactos: 2, whatsapp: 2 },
        tiktok: { visualizaciones: 264, tiempoPromedio: '4.98s' },
        textos: { accionesRealizadas: '  Se publicó en todos los portales  ', analisisFinal: '' },
      },
    })
    expect(r).toEqual({ ok: true, cambios: { manual: {
      zonaprop: { exposicion: 930, visualizaciones: 62, interesados: 1 },
      argenprop: { publicado: false },
      mercadolibre: { aviso: 'MLA3968141346', contactos: 2, whatsapp: 2 },
      tiktok: { visualizaciones: 264, tiempoPromedio: '4.98s' },
      textos: { accionesRealizadas: 'Se publicó en todos los portales', analisisFinal: '' },
    } } })
  })
  it('un aviso de ML que no se reconoce es un error claro (no se guarda basura)', () => {
    expect(sanearCambios({ manual: { mercadolibre: { aviso: 'https://www.zonaprop.com.ar/x' } } }))
      .toEqual({ ok: false, error: 'No reconocemos ese aviso de MercadoLibre. Pegá el link del aviso o su código (MLA…)' })
  })
  it('rechaza negativos, decimales en conteos, textos larguísimos y claves desconocidas', () => {
    expect(sanearCambios({ manual: { zonaprop: { exposicion: -1 } } }).ok).toBe(false)
    expect(sanearCambios({ manual: { zonaprop: { exposicion: 1.5 } } }).ok).toBe(false)
    expect(sanearCambios({ manual: { textos: { analisisFinal: 'x'.repeat(6001) } } }).ok).toBe(false)
    expect(sanearCambios({ manual: { estado: 'listo' } }).ok).toBe(false)
    expect(sanearCambios({ estado: 'listo' }).ok).toBe(false)
  })
  it('competidoras: solo links https, hasta 8, y el valor del m² se propone si no viene', () => {
    const r = sanearCambios({ competidoras: [{
      url: 'https://www.zonaprop.com.ar/propiedades/quesada-3250-1.html', direccion: 'Quesada 3250', barrio: 'Coghlan',
      precio: 695000, moneda: 'USD', m2: 436, valorM2: null, ambientes: 6, banos: 4, dormitorios: 5, antiguedad: 50, cocheras: 3,
      foto: 'https://img.zonaprop.com.ar/x.jpg', publicadoHace: 'Publicado hace 84 días', visualizaciones: 346, bajoDePrecio: true,
    }] })
    expect(r.ok && r.cambios.competidoras?.[0].valorM2).toBe(1594)
    expect(sanearCambios({ competidoras: [{ url: 'javascript:alert(1)', direccion: 'x' }] }).ok).toBe(false)
    expect(sanearCambios({ competidoras: [{ url: 'https://x.com', direccion: 'x', foto: 'data:image/png;base64,AAA' }] }).ok).toBe(false)
    expect(sanearCambios({ competidoras: Array.from({ length: 9 }, () => ({ url: 'https://x.com', direccion: 'x' })) }).ok).toBe(false)
  })
  it('un valor del m² cargado a mano (homogeneizado) se respeta', () => {
    const r = sanearCambios({ competidoras: [{ url: 'https://x.com', direccion: 'Quesada 3250', precio: 695000, m2: 436, valorM2: 1678 }] })
    expect(r.ok && r.cambios.competidoras?.[0].valorM2).toBe(1678)
  })
  it('un cuerpo vacío o que no es objeto se rechaza', () => {
    expect(sanearCambios(null).ok).toBe(false)
    expect(sanearCambios({}).ok).toBe(false)
  })
})
