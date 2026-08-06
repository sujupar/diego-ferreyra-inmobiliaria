import { describe, it, expect } from 'vitest'
import {
  buildBrainUserPrompt,
  coerceBrainDecision,
  validateProposedVisit,
  DEFAULT_AGENT_PROMPT,
  REPLY_MAX,
  SUMMARY_MAX,
  type BrainContext,
} from './agent-brain'

const HOY = '2026-08-03'

function ctx(over: Partial<BrainContext> = {}): BrainContext {
  return {
    clientName: 'Julián',
    propertyLabel: 'la casa de Lares de Canning',
    propertyFacts: ['Precio: USD 199.700', '3 ambientes', 'Tristán Suárez, Ezeiza'],
    todayISO: HOY,
    previousSummary: '',
    newMessages: [{ from: 'cliente', text: 'Quiero agendar una visita' }],
    agentMessagesSent: 0,
    maxMessages: 3,
    hasActiveVisit: false,
    canWrite: true,
    puedeMandar: { fotos: true, plano: true, video: true },
    ...over,
  }
}

describe('buildBrainUserPrompt', () => {
  it('le dice al modelo qué día es hoy — no lo sabe por su cuenta', () => {
    expect(buildBrainUserPrompt(ctx())).toContain(`HOY es ${HOY}`)
  })

  it('avisa cuando ya hay una visita: mover una visita coordinada la decide una persona', () => {
    expect(buildBrainUserPrompt(ctx({ hasActiveVisit: true }))).toMatch(/YA tiene una visita/)
  })

  it('avisa cuando se llegó al tope de mensajes', () => {
    const p = buildBrainUserPrompt(ctx({ agentMessagesSent: 3 }))
    expect(p).toMatch(/tope es 3/)
  })

  it('avisa cuando el agente no puede escribir (interruptor apagado): analiza igual', () => {
    expect(buildBrainUserPrompt(ctx({ canWrite: false }))).toMatch(/no le contestamos automáticamente/)
  })

  it('sin nombre, le pide explícitamente que NO lo invente', () => {
    expect(buildBrainUserPrompt(ctx({ clientName: null }))).toMatch(/no lo inventes/)
  })

  it('le pasa los datos REALES de la propiedad — es lo que le permite contestar preguntas', () => {
    const p = buildBrainUserPrompt(ctx())
    expect(p).toContain('Precio: USD 199.700')
    expect(p).toContain('3 ambientes')
    expect(p).toMatch(/NO lo sabés\. No lo inventes/)
  })

  it('sin datos cargados, le dice que derive a un asesor en vez de improvisar', () => {
    expect(buildBrainUserPrompt(ctx({ propertyFacts: [] }))).toMatch(/lo ve un asesor|consulta la ve un asesor/)
  })

  it('le dice QUÉ material puede mandar — si no, promete lo que no existe', () => {
    expect(buildBrainUserPrompt(ctx())).toMatch(/podés MANDAR ahora mismo.*fotos, plano, video/)
  })

  it('sin material cargado, le prohíbe ofrecerlo', () => {
    const p = buildBrainUserPrompt(ctx({ puedeMandar: { fotos: false, plano: false, video: false } }))
    expect(p).toMatch(/NO hay nada cargado/)
    expect(p).toMatch(/No ofrezcas fotos, plano ni video/)
  })

  it('solo ofrece lo que hay: con fotos pero sin plano ni video, nombra solo fotos', () => {
    const p = buildBrainUserPrompt(ctx({ puedeMandar: { fotos: true, plano: false, video: false } }))
    expect(p).toMatch(/podés MANDAR ahora mismo[^\n]*fotos\./)
  })
})

// El agente atiende personas, no despacha turnos. Estas instrucciones son la
// diferencia entre un asesor y un formulario, y son fáciles de perder de vista
// cuando alguien "limpia" el prompt más adelante.
describe('DEFAULT_AGENT_PROMPT — cómo atiende', () => {
  it('pide entender QUÉ busca la persona, no solo cuándo puede venir', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/TE INTERESA LA PERSONA, NO LA TRANSACCIÓN/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/QUÉ ESTÁ BUSCANDO/)
  })

  it('una pregunta por mensaje: dos juntas es un cuestionario', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/UNA cosa por mensaje/)
  })

  it('cercano NO es adulón — prohíbe explícitamente el lenguaje de vendedor', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/NO es adulón/)
    expect(DEFAULT_AGENT_PROMPT).toContain('excelente pregunta')
  })

  it('a quien va al grano no se lo demora: interesarse no es hacer perder tiempo', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/va directo al grano/)
  })

  it('interpreta lo que la persona QUIERE, no lo que dijo literalmente', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/NO TOMES EL PEDIDO AL PIE DE LA LETRA/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/lo que está pidiendo es CONOCER LA PROPIEDAD/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/INTERPRETÁ LO QUE QUIERE, NO LO QUE DIJO/)
  })

  it('SÍ manda material cuando ayuda — no es un premio por agendar', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/LE PODÉS MANDAR MATERIAL/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/NO es un premio por agendar/)
  })

  it('tiene prohibido rematar cada mensaje empujando a agendar', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/NO HACÉS: EMPUJAR A AGENDAR EN CADA MENSAJE/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/No agregues la pregunta de coordinación/)
  })

  it('sigue sin poder afirmar que la visita está confirmada', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/Nunca digas que la visita está confirmada/)
  })

  it('dice QUIÉN hace qué: "te llamamos para confirmarte el horario", no "el equipo confirma"', () => {
    // "El equipo confirma" no le dice nada a nadie: ni quién, ni cómo, ni cuándo.
    expect(DEFAULT_AGENT_PROMPT).toMatch(/te llamamos para confirmarte el horario/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/Nunca "el equipo confirma" a secas/)
  })
})

describe('coerceBrainDecision', () => {
  const base = {
    summary: 'Julián quiere ver la casa.',
    intent: 'agendar',
    priorityScore: 90,
    priorityReason: 'Pidió coordinar una visita.',
    suggestedNextStep: 'Confirmarle el horario.',
    reply: '¿Qué día te viene bien?',
    visitDate: null,
    visitHour: null,
    send: [],
  }

  it('acepta una respuesta bien formada', () => {
    const d = coerceBrainDecision(base)
    expect(d?.intent).toBe('agendar')
    expect(d?.reply).toBe('¿Qué día te viene bien?')
  })

  it('null si falta lo mínimo — mejor sin análisis que con basura', () => {
    expect(coerceBrainDecision(null)).toBeNull()
    expect(coerceBrainDecision({ ...base, summary: 123 })).toBeNull()
    expect(coerceBrainDecision('texto suelto')).toBeNull()
  })

  it('un intent inventado cae en "desconocido" en vez de romper', () => {
    expect(coerceBrainDecision({ ...base, intent: 'comprarlo_ya' })?.intent).toBe('desconocido')
  })

  it('la prioridad se acota a 0-100', () => {
    expect(coerceBrainDecision({ ...base, priorityScore: 999 })?.priorityScore).toBe(100)
    expect(coerceBrainDecision({ ...base, priorityScore: -5 })?.priorityScore).toBe(0)
  })

  it('una respuesta vacía o en blanco es "no contestar", no un texto vacío', () => {
    expect(coerceBrainDecision({ ...base, reply: '   ' })?.reply).toBeNull()
    expect(coerceBrainDecision({ ...base, reply: null })?.reply).toBeNull()
  })

  it('recorta textos desbocados en vez de mandarle un ensayo al cliente', () => {
    const d = coerceBrainDecision({ ...base, reply: 'x'.repeat(2000), summary: 'y'.repeat(2000) })
    expect(d?.reply?.length).toBe(REPLY_MAX)
    expect(d?.summary.length).toBe(SUMMARY_MAX)
  })

  it('un "send" inventado se descarta: el código resuelve los archivos, el modelo solo pide el tipo', () => {
    expect(coerceBrainDecision({ ...base, send: ['https://mi-url-inventada/foto.jpg'] })?.send).toEqual([])
    expect(coerceBrainDecision({ ...base })?.send).toEqual([])
  })

  it('acepta lista o string suelto: los modelos devuelven las dos formas', () => {
    expect(coerceBrainDecision({ ...base, send: 'FOTOS' })?.send).toEqual(['fotos'])
    expect(coerceBrainDecision({ ...base, send: ['fotos', 'video'] })?.send).toEqual(['fotos', 'video'])
  })

  it('como mucho dos tipos por turno, y sin repetir', () => {
    expect(coerceBrainDecision({ ...base, send: ['fotos', 'plano', 'video'] })?.send).toEqual(['fotos', 'plano'])
    expect(coerceBrainDecision({ ...base, send: ['fotos', 'fotos'] })?.send).toEqual(['fotos'])
  })

  it('una fecha con formato raro se descarta (después la valida el código igual)', () => {
    expect(coerceBrainDecision({ ...base, visitDate: 'mañana' })?.visitDate).toBeNull()
    expect(coerceBrainDecision({ ...base, visitDate: '2026-08-04' })?.visitDate).toBe('2026-08-04')
  })
})

// El código verifica la fecha por su cuenta: el modelo propone, esto decide.
describe('validateProposedVisit', () => {
  it('acepta mañana a una hora de visita', () => {
    expect(validateProposedVisit('2026-08-04', 16, HOY)).toEqual({ ok: true, dateISO: '2026-08-04', hour: 16 })
  })

  it('rechaza HOY: la visita más temprana es mañana', () => {
    expect(validateProposedVisit(HOY, 16, HOY).ok).toBe(false)
  })

  it('rechaza el pasado', () => {
    expect(validateProposedVisit('2026-08-01', 16, HOY).ok).toBe(false)
  })

  it('rechaza una fecha que NO EXISTE (el 31 de febrero, que un modelo puede inventar)', () => {
    expect(validateProposedVisit('2026-02-31', 16, HOY).ok).toBe(false)
  })

  it('rechaza más allá de 90 días — mismo límite que el formulario público', () => {
    expect(validateProposedVisit('2027-08-04', 16, HOY).ok).toBe(false)
  })

  it('rechaza horas fuera del horario de visitas', () => {
    expect(validateProposedVisit('2026-08-04', 3, HOY).ok).toBe(false)
    expect(validateProposedVisit('2026-08-04', 23, HOY).ok).toBe(false)
  })

  it('sin día o sin hora, no se agenda nada', () => {
    expect(validateProposedVisit(null, 16, HOY).ok).toBe(false)
    expect(validateProposedVisit('2026-08-04', null, HOY).ok).toBe(false)
  })
})
