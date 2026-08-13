import { describe, it, expect } from 'vitest'
import { esPalabraDeReinicio, puedeReiniciar, mensajeDeConfirmacion } from './reset-prueba'

describe('esPalabraDeReinicio', () => {
  it('reconoce la palabra como se escribe desde un teléfono', () => {
    for (const v of ['reiniciar prueba', 'Reiniciar Prueba', 'REINICIAR PRUEBA', '  reiniciar  prueba  ', 'reiniciar prueba.']) {
      expect(esPalabraDeReinicio(v), v).toBe(true)
    }
  })

  it('acepta "reiniciar" a secas, que es lo que sale escribir', () => {
    // El freno real es la lista blanca de teléfonos, no la longitud de la frase.
    for (const v of ['reiniciar', 'Reiniciar', 'REINICIAR', 'reiniciar.']) {
      expect(esPalabraDeReinicio(v), v).toBe(true)
    }
  })

  it('NO se dispara con una frase que apenas la contiene', () => {
    // Un reinicio accidental le arruina la prueba a quien la esté corriendo.
    expect(esPalabraDeReinicio('che, habría que reiniciar prueba mañana')).toBe(false)
    expect(esPalabraDeReinicio('quiero reiniciar')).toBe(false)
    expect(esPalabraDeReinicio('prueba')).toBe(false)
  })

  it('no explota con vacío', () => {
    expect(esPalabraDeReinicio('')).toBe(false)
    expect(esPalabraDeReinicio(null)).toBe(false)
    expect(esPalabraDeReinicio(undefined)).toBe(false)
  })
})

describe('puedeReiniciar', () => {
  it('deja pasar a un teléfono de la lista, con o sin +', () => {
    expect(puedeReiniciar('573107822955', ['+573107822955'])).toBe(true)
    expect(puedeReiniciar('573107822955', ['573107822955'])).toBe(true)
  })

  it('no deja pasar a nadie más', () => {
    expect(puedeReiniciar('5491199998888', ['+573107822955'])).toBe(false)
  })

  it('FAIL-CLOSED: sin lista o con lista vacía, nadie reinicia', () => {
    // Lista vacía significa "no hay modo prueba configurado", no "cualquiera".
    expect(puedeReiniciar('573107822955', [])).toBe(false)
    expect(puedeReiniciar('573107822955', null)).toBe(false)
    expect(puedeReiniciar('573107822955', undefined)).toBe(false)
  })

  it('un teléfono vacío no matchea nunca', () => {
    expect(puedeReiniciar('', ['+573107822955'])).toBe(false)
  })
})

describe('mensajeDeConfirmacion', () => {
  it('dice qué se reinició y aclara que no se borró nada', () => {
    const m = mensajeDeConfirmacion(['la memoria y el contador de mensajes'])
    expect(m).toContain('arranca de cero')
    expect(m).toContain('no se borró nada')
  })

  it('funciona aunque no haya nada que enumerar', () => {
    expect(mensajeDeConfirmacion([])).toContain('arranca de cero')
  })
})

describe('parcheDeReinicio — reiniciar es "ya leí todo", no "nunca leí nada"', () => {
  const AHORA = '2026-08-13T13:48:27.000Z'

  it('ADELANTA la marca de lectura hasta ahora, no la borra', async () => {
    // EL BUG. Ponerla en null parece "empezar de cero" y es lo contrario:
    // `mensajesNuevosDesde` la usa como ancla y sin ancla devuelve la
    // conversación ENTERA. El 2026-08-13 eso le entregó al modelo 166 mensajes
    // de pruebas viejas; escribió "Sí, mandame el video" y recibió fotos, video
    // y un cierre de visita, porque en ese historial figuraba que había pedido
    // planos y aceptado ir mañana. Tres rondas corrigiendo el prompt de alguien
    // que leía el libreto equivocado.
    const { parcheDeReinicio } = await import('./reset-prueba')
    expect(parcheDeReinicio(AHORA).last_analyzed_at).toBe(AHORA)
    expect(parcheDeReinicio(AHORA).last_analyzed_at).not.toBeNull()
  })

  it('la memoria acumulada sí se borra: eso es lo que hay que olvidar', async () => {
    const { parcheDeReinicio } = await import('./reset-prueba')
    const p = parcheDeReinicio(AHORA)
    expect(p.summary).toBe('')
    expect(p.intent).toBe('desconocido')
    expect(p.suggested_next_step).toBeNull()
    expect(p.priority_score).toBe(0)
  })

  it('el cupo de mensajes del agente vuelve a cero y se le devuelve la palabra', async () => {
    const { parcheDeReinicio } = await import('./reset-prueba')
    const p = parcheDeReinicio(AHORA)
    expect(p.agent_messages_sent).toBe(0)
    expect(p.agent_handed_off).toBe(false)
  })

  it('NO toca los contadores de costo: esos tokens se gastaron de verdad', async () => {
    const { parcheDeReinicio } = await import('./reset-prueba')
    const p = parcheDeReinicio(AHORA) as Record<string, unknown>
    expect(p).not.toHaveProperty('tokens_used_total')
    expect(p).not.toHaveProperty('analyses_count')
  })
})
