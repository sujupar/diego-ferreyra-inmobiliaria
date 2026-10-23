import { describe, expect, it } from 'vitest'
import { combinarTextos, cuelloDelRecorrido, datosParaRedactar, numerosDelTexto, validarRedaccion } from './redaccion'
import { resumenDeMetricas } from './resumen'
import type { Fuentes, Informe, PropiedadDelInforme } from './tipos'

const ok = <T,>(datos: T) => ({ estado: 'ok' as const, actualizadoEn: 'x', datos, error: null })

const fuentes: Fuentes = {
  consultas: ok({ total: 3, porPortal: { zonaprop: 1, argenprop: 0, mercadolibre: 2, redes: 0, otros: 0 } }),
  visitas: ok({ realizadas: 0, ficha: { respuestas: 0, leGusto: { si: 0, no: 0 }, precio: { correcto: 0, alto: 0, bajo: 0 }, ofertas: [], moneda: null, masGusto: [], menosGusto: [], comentariosMenosGusto: [] } }),
  reserva: ok({ reservada: false, fecha: null }),
  mercadolibre: ok({ avisos: [{ id: 'MLA1', titulo: null, url: null, origen: 'plataforma' as const }], visitas: 84,
    contactos: { interesados: 2, preguntas: 2, whatsapp: 0, llamadas: 0, otros: 0 }, vistasTelefono: 0 }),
  meta: { estado: 'error', actualizadoEn: 'x', datos: null, error: 'Meta no respondió' },
  instagram: { estado: 'sin_datos', actualizadoEn: 'x', datos: null, error: null },
}

const informe: Informe = {
  id: 'i', propertyId: 'p', desde: '2026-10-01', hasta: '2026-10-15', origen: 'ciclo', estado: 'borrador', fuentes,
  manual: { zonaprop: { exposicion: 930, visualizaciones: 62 }, argenprop: { visualizaciones: 125 } },
  competidoras: [{ url: 'https://x', direccion: 'Quesada 3250', barrio: 'Coghlan', precio: 695000, moneda: 'USD', m2: 436, valorM2: 1678,
    ambientes: 6, banos: 4, dormitorios: 5, antiguedad: 50, cocheras: 3, foto: null, publicadoHace: null, visualizaciones: null, bajoDePrecio: true }],
  candidatas: { detalles: {} }, capturas: {}, pdfPath: null, listoAt: null, createdAt: '', updatedAt: '',
}

const propiedad: PropiedadDelInforme = { id: 'p', direccion: 'Roque Pérez 3059', barrio: 'Coghlan', ciudad: null, tipo: 'casa',
  precio: 850000, moneda: 'USD', capturadaEl: null, foto: null, m2: 445, ambientes: 6 }

const datos = () => datosParaRedactar({ informe, propiedad, resumen: resumenDeMetricas(informe.fuentes, informe.manual), anterior: null })

describe('datosParaRedactar', () => {
  it('junta los números del período con la regla de los ejemplos y el valor del m² propio', () => {
    const d = datos()
    expect(d.portales.vieron).toBe(930 + 125 + 84)
    expect(d.portales.entraron).toBe(62 + 125 + 84)
    expect(d.portales.porcentajeQueEntro).toBe(23.8)
    expect(d.propiedad.valorM2).toBe(1910)
    expect(d.consultas).toEqual({ total: 3, porPortal: { zonaprop: 1, argenprop: 0, mercadolibre: 2, redes: 0, otros: 0 } })
    expect(d.mercadolibre).toMatchObject({ visitas: 84, interesados: 2 })
    expect(d.competidoras[0]).toMatchObject({ direccion: 'Quesada 3250', valorM2: 1678, bajoDePrecio: true })
  })
  it('una fuente caída o sin datos queda en null (la IA no la menciona como 0)', () => {
    const d = datos()
    expect(d.meta).toBeNull()
    expect(d.instagram).toBeNull()
    expect(d.fuentesQueFallaron).toEqual(['Campaña de Meta Ads'])
  })
})

describe('numerosDelTexto', () => {
  it('lee números con punto de miles, coma decimal y porcentajes', () => {
    expect(numerosDelTexto('tuvo 1.139 apariciones y 271 ingresos; el 23,8% entró. USD 1.678/m²')).toEqual([1139, 271, 23.8, 1678])
  })
})

describe('validarRedaccion', () => {
  const respuesta = (extra: Record<string, unknown> = {}) => ({
    resumenMetricas: 'La están viendo muchos compradores y varios entraron al aviso a ver más detalles.',
    accionesRealizadas: ['Se publicó la propiedad en todos los portales', 'Se respondieron las 3 consultas'],
    accionesARealizar: ['Seguir con la máxima difusión'],
    resumenConsultas: 'En este último periodo se obtuvieron 3 consultas.',
    analisisFinal: 'Durante el período la propiedad tuvo 1.139 apariciones y 271 ingresos al aviso; el 23,8% entró a verla.',
    ...extra,
  })
  it('acepta una respuesta con los números de los datos y arma los textos (acciones de a una por renglón)', () => {
    const r = validarRedaccion(respuesta(), datos())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.textos.accionesRealizadas).toBe('Se publicó la propiedad en todos los portales\nSe respondieron las 3 consultas')
    expect(r.revisar).toEqual([])
  })
  it('un número que no está en los datos se marca para revisar (no se publica un dato inventado sin que alguien lo mire)', () => {
    const r = validarRedaccion(respuesta({ resumenConsultas: 'Se obtuvieron 45 consultas.' }), datos())
    expect(r.ok && r.revisar).toEqual(['resumenConsultas'])
  })
  it('una respuesta sin la forma pedida es un error', () => {
    expect(validarRedaccion({ resumenMetricas: 'x' }, datos()).ok).toBe(false)
    expect(validarRedaccion('no es json', datos()).ok).toBe(false)
  })
})

describe('combinarTextos', () => {
  const nuevos = { resumenMetricas: 'nuevo A', accionesRealizadas: 'nuevo B', accionesARealizar: 'nuevo C', resumenConsultas: 'nuevo D', analisisFinal: 'nuevo E' }
  it('escribe los vacíos y los que la plataforma escribió y nadie tocó; respeta lo que corrigió Paula', () => {
    const r = combinarTextos({
      actuales: { resumenMetricas: 'viejo A', accionesRealizadas: 'Paula escribió esto', analisisFinal: '' },
      original: { resumenMetricas: 'viejo A', accionesRealizadas: 'viejo B' },
      nuevos, forzar: false,
    })
    expect(r).toMatchObject({ resumenMetricas: 'nuevo A', accionesRealizadas: 'Paula escribió esto', accionesARealizar: 'nuevo C', analisisFinal: 'nuevo E' })
  })
  it('"Volver a escribir todo" reemplaza también lo corregido', () => {
    expect(combinarTextos({ actuales: { accionesRealizadas: 'Paula' }, original: {}, nuevos, forzar: true }).accionesRealizadas).toBe('nuevo B')
  })
})

describe('cuelloDelRecorrido (lo decide el código: el modelo recomendó fotos con 25% de ingreso y 0 consultas)', () => {
  const base = { porcentajeQueEntro: 25, entraron: 825, consultas: 0, visitasRealizadas: 0, precioAlto: 0, precioNoAlto: 0 }
  it('menos del 10% entra al aviso → la presentación', () => {
    expect(cuelloDelRecorrido({ ...base, porcentajeQueEntro: 6 })?.etapa).toBe('presentacion')
  })
  it('entra 10% o más y casi nadie consulta → el precio, no las fotos', () => {
    expect(cuelloDelRecorrido(base)?.etapa).toBe('precio')
    expect(cuelloDelRecorrido({ ...base, consultas: 4 })?.etapa).toBe('precio')
  })
  it('hay consultas pero no visitas → seguimiento a los interesados', () => {
    expect(cuelloDelRecorrido({ ...base, consultas: 20 })?.etapa).toBe('seguimiento')
  })
  it('los que visitaron dicen que el precio está alto → ajuste de precio', () => {
    expect(cuelloDelRecorrido({ ...base, consultas: 20, visitasRealizadas: 3, precioAlto: 2, precioNoAlto: 1 })?.etapa).toBe('ajuste_precio')
  })
  it('avanza en todas las etapas → seguir con la difusión', () => {
    expect(cuelloDelRecorrido({ ...base, consultas: 20, visitasRealizadas: 3, precioAlto: 0, precioNoAlto: 3 })?.etapa).toBe('difusion')
  })
  it('sin el porcentaje o sin consultas confiables no decide nada', () => {
    expect(cuelloDelRecorrido({ ...base, porcentajeQueEntro: null })).toBeNull()
    expect(cuelloDelRecorrido({ ...base, consultas: null })).toBeNull()
  })
})

describe('validarRedaccion marca un texto que contradice el cuello', () => {
  const salida = {
    resumenMetricas: 'Buena visibilidad.', accionesRealizadas: ['Publicada en portales.'],
    accionesARealizar: ['Mejorar las fotos y la portada del aviso.'], resumenConsultas: 'Sin consultas.', analisisFinal: 'Hay que revisar las fotos.',
  }
  it('con el cuello en el precio, recomendar fotos queda para revisar', () => {
    const d = { ...datos(), cuello: { etapa: 'precio' as const, recomendacion: 'x' } }
    const r = validarRedaccion(salida, d)
    expect(r.ok && r.revisar).toEqual(expect.arrayContaining(['accionesARealizar', 'analisisFinal']))
  })
  it('con el cuello en la presentación, recomendar fotos es lo correcto', () => {
    const d = { ...datos(), cuello: { etapa: 'presentacion' as const, recomendacion: 'x' } }
    const r = validarRedaccion(salida, d)
    expect(r.ok && r.revisar).not.toContain('accionesARealizar')
  })
})
