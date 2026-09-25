import { describe, it, expect } from 'vitest'
import { esConsultaDeVerdad, traeInteresado, FORMATOS_DE_CONSULTA } from './es-consulta'
import { isLeadEmail as esLeadEmail } from './extract'
import type { Portal } from './types'

const CASILLA = 'contacto@diegoferreyrainmobiliaria.com'
const vacio = { leadName: null, leadEmail: null, leadPhone: null }

describe('traeInteresado', () => {
  it('un teléfono alcanza', () => {
    expect(traeInteresado({ ...vacio, leadPhone: '1162570820' }, CASILLA)).toBe(true)
  })

  it('un nombre alcanza', () => {
    expect(traeInteresado({ ...vacio, leadName: 'Braulio' }, CASILLA)).toBe(true)
  })

  it('un email de OTRA persona alcanza', () => {
    expect(traeInteresado({ ...vacio, leadEmail: 'm_r_pci@hotmail.com' }, CASILLA)).toBe(true)
  })

  it('NUESTRA propia casilla no es un interesado, escriba como se escriba', () => {
    // La publicidad de Argenprop llega así: el único "email" del correo es el
    // nuestro, porque el destinatario somos nosotros.
    for (const mio of [CASILLA, CASILLA.toUpperCase(), ` ${CASILLA} `]) {
      expect(traeInteresado({ ...vacio, leadEmail: mio }, CASILLA), mio).toBe(false)
    }
  })

  it('sin ningún dato, no hay interesado', () => {
    expect(traeInteresado(vacio, CASILLA)).toBe(false)
    expect(traeInteresado({ leadName: '  ', leadEmail: '', leadPhone: null }, CASILLA)).toBe(false)
  })
})

describe('esConsultaDeVerdad', () => {
  const publicitario = (subject: string) => ({ portal: 'argenprop' as Portal, subject, ...vacio, leadEmail: CASILLA })

  it('descarta la publicidad de Argenprop — los 10 casos reales que se colaron', () => {
    const asuntos = [
      '✨ Diego encontrá tu lugar en el mundo con esta novedad',
      '💎 Diego: ¿Querés encontrar el PH de tus sueños? ¡Mira lo nuevo!',
      '🌟 Diego abrí camino a nuevas posibilidades: Tenemos nuevas propiedades para vos',
      '📣 Diego: ¡Alerta de novedades! Propiedad perfecta para vos',
      '🚩 Hoy ingresó esta nueva propiedad Diego!',
      '🌟 Diego no te duermas: Hay una nueva propiedad esperando por vos!',
      '🏡 Para vos Diego: ¿Será este tu futuro hogar? Descubrilo hoy',
    ]
    for (const s of asuntos) {
      const r = esConsultaDeVerdad(publicitario(s), CASILLA)
      expect(r.esConsulta, s).toBe(false)
      expect(r.motivo).toContain('sin interesado')
    }
  })

  it('con un interesado de verdad NO se descarta, aunque el asunto sea desconocido', () => {
    // El freno es doble a propósito: si Argenprop inventa un formato nuevo de
    // consulta mañana, mientras traiga a una persona sigue entrando.
    const r = esConsultaDeVerdad(
      { portal: 'argenprop', subject: '🆕 Formato que todavía no existe', ...vacio, leadPhone: '1162570820' },
      CASILLA,
    )
    expect(r.esConsulta).toBe(true)
  })

  it('sin datos pero con un formato CONOCIDO de consulta, entra igual', () => {
    // Argenprop: "Felicitaciones... hay alguien interesado" es una consulta real
    // y a veces viene sin datos (pasó con la #73 en julio).
    expect(esConsultaDeVerdad(
      { portal: 'argenprop', subject: 'Felicitaciones Diego Ferreyra Inmobiliaria, hay alguien interesado en tu propiedad', ...vacio, leadEmail: CASILLA },
      CASILLA,
    ).esConsulta).toBe(true)

    // MercadoLibre OCULTA el contacto de quien pregunta: sus consultas llegan
    // sin datos SIEMPRE. Descartarlas sería perder leads reales.
    expect(esConsultaDeVerdad(
      { portal: 'mercadolibre', subject: 'Te preguntaron en Venta Departamento 2 Ambientes', ...vacio, leadEmail: CASILLA },
      CASILLA,
    ).esConsulta).toBe(true)
  })

  it('reconoce los formatos aunque cambien mayúsculas, tildes o espacios', () => {
    // El asunto llega como lo manda el portal, y en esta Mac el texto puede
    // venir DESCOMPUESTO (la "ó" como dos caracteres) — ver CLAUDE.md.
    const variantes = [
      'juan@gmail.com contactó por Amenábar 1500 en Colegiales',
      'JUAN@GMAIL.COM CONTACTÓ POR AMENÁBAR 1500',
      'juan@gmail.com contacto por Amenabar 1500',
      'juan@gmail.com contactó por Amenábar 1500'.normalize('NFD'),
    ]
    for (const s of variantes) {
      expect(esConsultaDeVerdad({ portal: 'argenprop', subject: s, ...vacio, leadEmail: CASILLA }, CASILLA).esConsulta, s).toBe(true)
    }
  })

  it('los tres formatos de ZonaProp siguen entrando', () => {
    for (const s of [
      '📩 ¡Recibiste una nueva consulta por el aviso Departamento 3 Ambientes! CÓD:2E1SO4',
      '📱 ¡Consultaron tu WhatsApp en el aviso Excelente Lote en Coghlan!',
      '📞 ¡Vieron tu teléfono, Diego Ferreyra Inmobiliaria! REF:#310567470#',
    ]) {
      expect(esConsultaDeVerdad({ portal: 'zonaprop', subject: s, ...vacio, leadEmail: CASILLA }, CASILLA).esConsulta, s).toBe(true)
    }
  })

  it('el motivo dice por qué se descartó, para poder revisarlo después', () => {
    const r = esConsultaDeVerdad(publicitario('🚩 Hoy ingresó esta nueva propiedad Diego!'), CASILLA)
    expect(r.motivo.length).toBeGreaterThan(10)
    expect(r.motivo).toMatch(/interesado/i)
  })

  it('sin saber cuál es nuestra casilla, un email cualquiera cuenta como interesado', () => {
    // Fail-safe: si falta la variable de entorno, se peca de dejar pasar.
    expect(esConsultaDeVerdad(
      { portal: 'argenprop', subject: '🚩 Hoy ingresó esta nueva propiedad Diego!', ...vacio, leadEmail: CASILLA },
      null,
    ).esConsulta).toBe(true)
  })

  it('cada portal tiene declarados sus formatos de consulta', () => {
    for (const portal of ['argenprop', 'zonaprop', 'mercadolibre'] as Portal[]) {
      expect(FORMATOS_DE_CONSULTA[portal].length, portal).toBeGreaterThan(0)
    }
  })

  /**
   * MercadoLibre es el caso delicado: como OCULTA el contacto, sus consultas
   * llegan siempre sin datos y el asunto es la ÚNICA red que las salva. Si esta
   * lista fuera más angosta que la del filtro de entrada (`isLeadEmail`), un
   * correo entraría por la puerta y esta regla lo tiraría — un lead perdido, y
   * en silencio.
   */
  it('TODO asunto que el filtro de entrada acepta para ML, esta regla lo deja pasar', () => {
    const comoLosManda = [
      'Te preguntaron en Venta Departamento 2 Ambientes',
      'Te contactaron por tu publicación',
      'Alguien está interesado en tu publicación',
      'Te contactó un interesado por tu aviso',
      'Un comprador quiere saber más de tu publicación',
      'Nueva consulta en tu publicación',
      'Tenés una pregunta nueva',
    ]
    for (const s of comoLosManda) {
      expect(esLeadEmail('vendedor@mercadolibre.com.ar', s, 'mercadolibre'), `puerta: ${s}`).toBe(true)
      expect(
        esConsultaDeVerdad({ portal: 'mercadolibre', subject: s, ...vacio, leadEmail: CASILLA }, CASILLA).esConsulta,
        `regla: ${s}`,
      ).toBe(true)
    }
  })
})
