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
    ultimoMensajePropio: null,
    yaMandado: [],
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

  it('le muestra su PROPIO mensaje anterior — sin eso preguntaba por el día una y otra vez', () => {
    const p = buildBrainUserPrompt(ctx({ ultimoMensajePropio: '¿Qué día te viene bien?' }))
    expect(p).toContain('Tu mensaje anterior a esta persona fue')
    expect(p).toContain('¿Qué día te viene bien?')
    expect(p).toMatch(/NO lo vuelvas a preguntar/)
  })

  it('le dice qué material YA le mandó — si no, repite las mismas fotos en cada turno', () => {
    const p = buildBrainUserPrompt(ctx({ yaMandado: ['fotos', 'video'] }))
    expect(p).toMatch(/YA recibió en este chat: fotos, video/)
  })

  it('lo ya mandado NO se presenta como material que dejó de tener', () => {
    // El 6 de agosto de 2026 el agente resolvió el empate entre "no repitas" y
    // "me lo están pidiendo" diciéndole a un cliente que no tenía el plano.
    const p = buildBrainUserPrompt(ctx({ yaMandado: ['plano'] }))
    expect(p).toMatch(/lo seguís teniendo/)
    expect(p).toMatch(/te lo vuelve a pedir, mandáselo igual/i)
  })

  it('sin material mandado todavía, no ensucia el prompt con esa línea', () => {
    expect(buildBrainUserPrompt(ctx())).not.toMatch(/YA recibió en este chat/)
  })

  it('la voz: tiene ejemplos de MAL y BIEN, que es lo único que corrige el tono', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/HABLÁS COMO UNA PERSONA, NO COMO UNA FICHA/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/no enumerás, CONTÁS/)
  })

  it('la hora 0 se lee como "no dijo hora", no como medianoche', () => {
    expect(coerceBrainDecision({
      summary: 's', intent: 'agendar', priorityScore: 50, priorityReason: 'r',
      suggestedNextStep: '', reply: 'x', visitDate: '2026-08-07', visitHour: 0,
    })?.visitHour).toBeNull()
  })

  it('en el primer contacto se lo dice explícito', () => {
    expect(buildBrainUserPrompt(ctx())).toMatch(/Todavía no le escribiste nada/)
  })

  it('le dice QUÉ material puede mandar, en positivo y con cantidades', () => {
    // Una lista de palabras sueltas es fácil de desoír; "SÍ. Hay 12 fotos
    // cargadas" no. El inventario es lo único que separa "no lo tengo" de la
    // verdad.
    const p = buildBrainUserPrompt(ctx({ cantidades: { fotos: 12, plano: 1, video: 1 } }))
    expect(p).toMatch(/fotos: SÍ\. Hay 12 fotos/)
    expect(p).toMatch(/plano: SÍ\. Hay 1 plano/)
    expect(p).toMatch(/video: SÍ\./)
  })

  it('lo que NO está cargado es lo ÚNICO que puede decir que no tiene', () => {
    const p = buildBrainUserPrompt(ctx({ puedeMandar: { fotos: false, plano: false, video: false } }))
    expect(p).toMatch(/fotos: NO hay cargado/)
    expect(p).toMatch(/plano: NO hay cargado/)
    expect(p).toMatch(/único que podés decir que no tenés/)
  })

  it('con fotos pero sin plano ni video, dice SÍ a una y NO a las otras dos', () => {
    const p = buildBrainUserPrompt(ctx({ puedeMandar: { fotos: true, plano: false, video: false } }))
    expect(p).toMatch(/fotos: SÍ/)
    expect(p).toMatch(/plano: NO hay cargado/)
    expect(p).toMatch(/video: NO hay cargado/)
  })

  it('el prompt PROHÍBE explícitamente negar material que existe', () => {
    // La frase "Plano no tengo a mano" estaba escrita en el prompt como ejemplo
    // y el modelo la copió literal a un cliente real. No puede volver.
    expect(DEFAULT_AGENT_PROMPT).not.toMatch(/no tengo a mano/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/NUNCA DIGAS QUE NO TENÉS ALGO QUE SÍ TENÉS/)
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
    expect(DEFAULT_AGENT_PROMPT).toMatch(/INTERPRETÁ LO QUE QUIERE, NO LO QUE DIJO/)
  })

  it('manda LO QUE PIDIÓ, no todo lo que hay', () => {
    // El 2026-08-12 el dueño tocó "Sí, mandame el video" y recibió el video Y
    // las fotos de una sola vez: tres archivos taparon la conversación y el
    // texto —que llevaba la pregunta— quedó fuera de pantalla. Antes había una
    // "REGLA FIJA" que obligaba a mandar los dos. Se fue.
    expect(DEFAULT_AGENT_PROMPT).toMatch(/MANDÁ LO QUE TE PIDIÓ/)
    expect(DEFAULT_AGENT_PROMPT).not.toMatch(/REGLA FIJA/)
    expect(DEFAULT_AGENT_PROMPT).not.toMatch(/mandá SIEMPRE los dos/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/Un tipo de material por turno/)
  })

  it('no dice "te lo paso de nuevo" cuando es la primera vez', () => {
    // Le pasó las fotos y el video, después le pidieron el plano —que nunca
    // había mandado— y contestó "Te lo paso de nuevo". La persona revisa el
    // chat y ve que es mentira.
    expect(DEFAULT_AGENT_PROMPT).toMatch(/NO digas "de nuevo"/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/es la primera vez/)
  })

  it('el objetivo es AYUDAR, y la pregunta de cierre no empuja a agendar', () => {
    // Mientras el objetivo decía "llevá la conversación a que diga cuándo
    // puede", el modelo empujaba en cada mensaje aunque más abajo hubiera
    // reglas que lo prohibían. La contradicción la ganaba el objetivo.
    expect(DEFAULT_AGENT_PROMPT).toMatch(/AYUDAR a la persona con esta propiedad/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/¿En qué más te puedo ayudar con la propiedad\?/)
    expect(DEFAULT_AGENT_PROMPT).not.toMatch(/llevá la conversación a que diga CUÁNDO PUEDE/)
  })

  it('la frase de cierre exige DÍA Y HORA: un día suelto no alcanza', () => {
    // "Sí, mañana está bien" disparó el cierre como si estuviera coordinado.
    expect(DEFAULT_AGENT_PROMPT).toMatch(/SOLO cuando tenés DÍA \*\*Y\*\* HORA/)
    expect(DEFAULT_AGENT_PROMPT).toContain('"Sí, mañana está bien"')
    expect(DEFAULT_AGENT_PROMPT).toMatch(/es un día SIN hora\. NO cierres/)
  })

  it('SÍ manda material cuando ayuda — no es un premio por agendar', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/LE PODÉS MANDAR MATERIAL/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/NO es un premio por agendar/)
  })

  it('tiene prohibido rematar cada mensaje empujando a agendar', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/ARRUINA TODO: EMPUJAR A AGENDAR/)
    expect(DEFAULT_AGENT_PROMPT).toMatch(/No agregues la pregunta de coordinación/)
  })

  it('no propone el día por su cuenta: eso lo elige la persona', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/Nunca propongas vos un día/)
  })

  it('ante la duda, NO pregunta: siempre hay un próximo mensaje', () => {
    expect(DEFAULT_AGENT_PROMPT).toMatch(/Si no estás seguro de si corresponde preguntar, NO preguntes/)
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
