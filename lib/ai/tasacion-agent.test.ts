/**
 * El agente de tasación NO puede contradecir al mensaje que la persona acaba de
 * recibir.
 *
 * EL INCIDENTE QUE ORIGINA ESTOS TESTS (2026-09-02). La plantilla y el agente
 * son dos piezas que tienen que decir lo mismo, y vivían en dos sistemas
 * distintos: la plantilla en una variable de Netlify, el agente en una columna
 * de Supabase. El 29/8 se cambió la plantilla a `tasacion_llamada_v1` ("te
 * llamará Paula") y el interruptor del agente quedó prendido. Eduardo recibió
 * "te llamará Paula", contestó "bueno gracias", y el bot le pidió día, horario
 * y dirección POR CHAT. Le prometimos dos caminos y no cumplimos ninguno.
 *
 * Estaba escrito en tres documentos que los dos pasos van juntos. No alcanzó.
 * Ahora el agente lo deduce de la plantilla vigente, y esto lo fija.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

const espias = vi.hoisted(() => ({
  /** Cualquier toque a Supabase. Con la plantilla que solo avisa tiene que quedar VACÍO. */
  supabase: [] as string[],
  /** Cualquier llamada al modelo. Idem: vacío, y además es la que cuesta plata. */
  modelo: [] as unknown[],
  /** Cualquier WhatsApp saliente. Idem. */
  enviados: [] as unknown[],
  /** Lo que devuelve el interruptor de la base. Prendido a propósito en todos los tests. */
  tasacionEnabled: true as boolean | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tabla: string) => {
      espias.supabase.push(tabla)
      const resultado = { data: { tasacion_enabled: espias.tasacionEnabled }, error: null }
      const cadena: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit', 'update']) {
        cadena[m] = () => cadena
      }
      cadena.maybeSingle = async () => resultado
      cadena.then = (r: (v: unknown) => unknown) => r({ data: [], error: null })
      return cadena
    },
  }),
}))
vi.mock('@/lib/ai/chat-client', () => ({
  chatCompletion: async (...args: unknown[]) => {
    espias.modelo.push(args)
    return { content: '{}' }
  },
}))
vi.mock('@/lib/integrations/whatsapp/core', () => ({
  sendWhatsappText: async (...args: unknown[]) => {
    espias.enviados.push(args)
    return { ok: true, skipped: false }
  },
}))

import { modoDePlantilla, runTasacionAgent } from './tasacion-agent'

const ENTRADA = { phoneE164: '+5491173567952', mensaje: 'Bueno gracias', contactName: 'Eduardo' }

beforeEach(() => {
  espias.supabase = []
  espias.modelo = []
  espias.enviados = []
  espias.tasacionEnabled = true
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-prueba'
})
afterEach(() => {
  delete process.env.WHATSAPP_TEMPLATE_TASACION
})

describe('modoDePlantilla', () => {
  it('las que preguntan algo conversan', () => {
    expect(modoDePlantilla('tasacion_coordinar_v2')).toBe('conversa')
    expect(modoDePlantilla('tasacion_coordinar_util')).toBe('conversa')
  })

  it('la del corte telefónico solo avisa', () => {
    expect(modoDePlantilla('tasacion_llamada_v1')).toBe('solo_avisa')
  })

  it('sin plantilla configurada no hay modo', () => {
    expect(modoDePlantilla(null)).toBe('sin_plantilla')
    expect(modoDePlantilla(undefined)).toBe('sin_plantilla')
    expect(modoDePlantilla('')).toBe('sin_plantilla')
  })

  /**
   * Una plantilla nueva NO se asume conversacional. Asumir que sí es justo el
   * error que produjo el incidente: el sistema hablando por su cuenta.
   */
  it('una plantilla que nadie declaró es "desconocida", no "conversa"', () => {
    expect(modoDePlantilla('tasacion_coordinar_v3')).toBe('desconocida')
    expect(modoDePlantilla('cualquier_cosa')).toBe('desconocida')
  })
})

describe('el agente sigue a la plantilla, no a su propio interruptor', () => {
  it('con la plantilla que avisa, NO actúa aunque el interruptor esté prendido', async () => {
    process.env.WHATSAPP_TEMPLATE_TASACION = 'tasacion_llamada_v1'
    const r = await runTasacionAgent(ENTRADA)
    expect(r.actuo).toBe(false)
    expect('motivo' in r && r.motivo).toContain('avisa, no pregunta')
  })

  /**
   * El corazón del arreglo: con la plantilla que solo avisa, el agente frena
   * ANTES de tocar nada. Ni una query, ni una llamada paga al modelo, ni un
   * mensaje. Un `return` más abajo también evitaría el mensaje, pero seguiría
   * gastando en cada "gracias" que conteste alguien.
   */
  it('y frena antes de tocar la base, el modelo o WhatsApp', async () => {
    process.env.WHATSAPP_TEMPLATE_TASACION = 'tasacion_llamada_v1'
    await runTasacionAgent(ENTRADA)
    expect(espias.supabase).toEqual([])
    expect(espias.modelo).toEqual([])
    expect(espias.enviados).toEqual([])
  })

  it('sin plantilla configurada frena por la plantilla, no por casualidad', async () => {
    delete process.env.WHATSAPP_TEMPLATE_TASACION
    const r = await runTasacionAgent(ENTRADA)
    expect(r.actuo).toBe(false)
    // El motivo importa: sin el freno también daría `actuo:false`, pero por
    // "no encontré el trato" — y eso deja de valer apenas el trato exista.
    expect('motivo' in r && r.motivo).toBe('no hay plantilla de tasación configurada')
    expect(espias.supabase).toEqual([])
    expect(espias.modelo).toEqual([])
  })

  it('ante una plantilla desconocida se calla y lo AVISA por consola', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.WHATSAPP_TEMPLATE_TASACION = 'tasacion_algo_nuevo'
    const r = await runTasacionAgent(ENTRADA)
    expect(r.actuo).toBe(false)
    expect(espias.modelo).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('PLANTILLAS_QUE_CONVERSAN')
    warn.mockRestore()
  })

  /**
   * El otro lado: con la plantilla que pregunta, el freno nuevo NO se mete en el
   * camino. Si no, "arreglar" el incidente habría apagado el agente para siempre
   * y nadie se enteraría hasta que alguien vuelva a la coordinación por chat.
   */
  it('con la plantilla que pregunta, sigue de largo y consulta el interruptor', async () => {
    process.env.WHATSAPP_TEMPLATE_TASACION = 'tasacion_coordinar_v2'
    await runTasacionAgent(ENTRADA)
    expect(espias.supabase).toContain('ai_agent_settings')
  })

  it('y el interruptor de la base sigue mandando por encima de eso', async () => {
    process.env.WHATSAPP_TEMPLATE_TASACION = 'tasacion_coordinar_v2'
    espias.tasacionEnabled = false
    const r = await runTasacionAgent(ENTRADA)
    expect(r.actuo).toBe(false)
    expect('motivo' in r && r.motivo).toBe('apagado')
    expect(espias.modelo).toEqual([])
  })

  /**
   * `consumioModelo` es lo que le dice al webhook si todavía puede gastar su
   * única llamada de IA analizando la conversación para ordenar el Inbox.
   * Marcar mal un freno que ni llegó al modelo deja estas conversaciones sin
   * resumen ni prioridad — que es exactamente lo que se rompió al apagar el
   * agente, y lo que este campo arregla.
   */
  it('los frenos que ni llegan al modelo lo declaran, para que el webhook pueda analizar', async () => {
    process.env.WHATSAPP_TEMPLATE_TASACION = 'tasacion_llamada_v1'
    const porPlantilla = await runTasacionAgent(ENTRADA)
    expect(porPlantilla.actuo === false && porPlantilla.consumioModelo).toBe(false)

    process.env.WHATSAPP_TEMPLATE_TASACION = 'tasacion_coordinar_v2'
    espias.tasacionEnabled = false
    const porInterruptor = await runTasacionAgent(ENTRADA)
    expect(porInterruptor.actuo === false && porInterruptor.consumioModelo).toBe(false)
  })
})
