import { describe, it, expect } from 'vitest'
import { clasificarPregunta, juntarRespuestas } from './respuestas'

// Preguntas y respuestas REALES de `property_landings.wizard_state`, relevadas el
// 2026-09-19. Las preguntas las generaba la IA, así que el id no dice el tema.
const wizardDiazColodrero = {
  questions: [
    { id: 'q1', question: '¿Quién creés que sería el comprador ideal para este departamento en Villa Urquiza?' },
    { id: 'q2', question: '¿Qué diferencial real tiene este departamento en comparación con otros en la zona?' },
    { id: 'q3', question: '¿Cuáles son las principales objeciones que suelen tener los interesados en este tipo de propiedad?' },
    { id: 'q4', question: '¿Qué atractivo tiene el entorno de Villa Urquiza que valga la pena destacar en la landing?' },
  ],
  answers: { q1: 'una pareja joven con 1 hhijo', q2: 'la ubicacion es excelente, la lluz', q3: 'la pintura y no tiene balcon', q4: 'transoprtes,' },
}

const wizardSinRespuestas = {
  questions: [
    { id: 'q1', question: '¿Qué características del barrio de Tristán Suárez pueden atraer a los compradores?' },
    { id: 'q2', question: '¿Quiénes son los compradores potenciales para esta casa? ¿Familias, parejas, inversores?' },
  ],
  answers: { q1: null, q2: null },
}

describe('clasificarPregunta', () => {
  it.each([
    ['¿Quién creés que sería el comprador ideal para este departamento en Monserrat?', 'comprador'],
    ['¿Quiénes son los interesados más frecuentes en este tipo de propiedad?', 'comprador'],
    ['¿Cuál es el público objetivo que creés que podría estar interesado en este departamento?', 'comprador'],
    ['¿Cuál es el diferencial real de esta propiedad en comparación con otras en la zona?', 'diferencial'],
    ['¿Qué aspectos de la casa destacarías como más atractivos para los interesados?', 'diferencial'],
    ['¿Qué objeciones suelen tener los interesados al momento de evaluar esta propiedad?', 'objecion'],
    ['¿Qué duda u objeción suele frenar a los interesados en propiedades como esta?', 'objecion'],
    ['¿Qué características del barrio de Tristán Suárez pueden atraer a los compradores?', 'barrio'],
    ['¿Qué beneficios del entorno, como la cercanía a lugares de interés o servicios, valdría la pena?', 'barrio'],
    ['¿Qué servicios y comercios cercanos destacarías que pueden ser un plus para la compra?', 'barrio'],
    ['¿Cuál es el rango de precios de propiedades similares en Villa Pueyrredón?', null],
    ['¿Qué tipo de financiación o facilidades suelen buscar los interesados?', null],
    ['¿Hay algún detalle especial en la construcción o el diseño que debamos resaltar?', null],
  ])('%s → %s', (texto, tema) => {
    expect(clasificarPregunta(texto)).toBe(tema)
  })
})

describe('juntarRespuestas', () => {
  it('sin ninguna respuesta pide las cuatro preguntas fijas de la visita', () => {
    const r = juntarRespuestas({ barrio: 'Almagro', landingAnswers: null, visitaLanding: null, wizardState: null })
    expect(r.conocidas).toEqual([])
    expect(r.pendientes.map(p => p.id)).toEqual(['q1', 'q2', 'q3', 'q4'])
    expect(r.pendientes[0].pregunta).toBe('¿Quién imaginás que es el comprador ideal de esta propiedad en Almagro?')
    expect(r.pendientes[0].tema).toBe('comprador')
  })

  it('con las cuatro respuestas de la propiedad no pregunta nada', () => {
    const r = juntarRespuestas({
      barrio: 'Almagro',
      landingAnswers: { q1: 'Pareja joven', q2: 'Terraza', q3: 'Piso alto sin balcón', q4: 'Hospital Italiano' },
      visitaLanding: null, wizardState: null,
    })
    expect(r.pendientes).toEqual([])
    expect(r.conocidas).toHaveLength(4)
    expect(r.conocidas[0]).toMatchObject({ tema: 'comprador', respuesta: 'Pareja joven', fuente: 'propiedad' })
  })

  it('usa las respuestas dadas al crear la landing (caso real Díaz Colodrero)', () => {
    const r = juntarRespuestas({ barrio: 'Villa Urquiza', landingAnswers: {}, visitaLanding: null, wizardState: wizardDiazColodrero })
    expect(r.pendientes).toEqual([])
    const objecion = r.conocidas.find(c => c.tema === 'objecion')
    expect(objecion).toMatchObject({ respuesta: 'la pintura y no tiene balcon', fuente: 'landing' })
  })

  it('las preguntas de landing sin respuesta no cuentan como contestadas', () => {
    const r = juntarRespuestas({ barrio: 'Tristán Suárez', landingAnswers: null, visitaLanding: null, wizardState: wizardSinRespuestas })
    expect(r.conocidas).toEqual([])
    expect(r.pendientes).toHaveLength(4)
  })

  it('toma la visita del proceso cuando la propiedad no heredó las respuestas', () => {
    const r = juntarRespuestas({ barrio: 'Caballito', landingAnswers: {}, visitaLanding: { q1: 'Familia con chicos' }, wizardState: null })
    expect(r.conocidas).toEqual([
      expect.objectContaining({ tema: 'comprador', respuesta: 'Familia con chicos', fuente: 'visita' }),
    ])
    expect(r.pendientes.map(p => p.id)).toEqual(['q2', 'q3', 'q4'])
  })

  it('lo de la propiedad gana sobre la visita del proceso para la misma pregunta', () => {
    const r = juntarRespuestas({ barrio: null, landingAnswers: { q1: 'Inversor' }, visitaLanding: { q1: 'Familia' }, wizardState: null })
    expect(r.conocidas.filter(c => c.tema === 'comprador')).toEqual([
      expect.objectContaining({ respuesta: 'Inversor', fuente: 'propiedad' }),
    ])
  })

  it('una respuesta de solo espacios no cuenta', () => {
    const r = juntarRespuestas({ barrio: null, landingAnswers: { q1: '   ' }, visitaLanding: null, wizardState: null })
    expect(r.conocidas).toEqual([])
    expect(r.pendientes.map(p => p.id)).toContain('q1')
  })

  it('tolera basura en cualquiera de las fuentes', () => {
    const r = juntarRespuestas({ barrio: null, landingAnswers: 'x', visitaLanding: [1, 2], wizardState: { questions: 'no', answers: 3 } })
    expect(r.conocidas).toEqual([])
    expect(r.pendientes).toHaveLength(4)
  })
})
