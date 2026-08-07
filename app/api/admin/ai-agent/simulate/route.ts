import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { hasPermission } from '@/lib/auth/roles'
import { chatCompletion } from '@/lib/ai/chat-client'
import {
  DEFAULT_AGENT_PROMPT,
  buildBrainUserPrompt,
  coerceBrainDecision,
  validateProposedVisit,
  type MaterialTipo,
} from '@/lib/ai/agent-brain'
import { propertyFacts, materialDisponible, archivosParaEnviar } from '@/lib/ai/scheduling-agent'
import { hoyEnArgentina } from '@/lib/leads/visit-scheduling'

/**
 * POST /api/admin/ai-agent/simulate — el BANCO DE PRUEBAS del agente.
 *
 * Escribís lo que diría un cliente y ves exactamente qué contestaría el agente,
 * SIN mandar un solo WhatsApp. Existe porque probar contra el chat real es
 * carísimo en tiempo: hay que esperar un deploy, escribir desde el teléfono,
 * y si algo sale mal no se ve por qué. Acá se ve el prompt entero, la respuesta
 * cruda del modelo y qué archivos habría mandado.
 *
 * NO TOCA NADA: no escribe en `conversation_ai_state`, no crea visitas, no
 * manda mensajes. Solo llama al modelo y devuelve lo que devolvería.
 *
 * ## Por qué esto no rompe el chokepoint del interruptor
 *
 * `analyzeConversation` es el único camino AUTOMÁTICO al modelo y ahí vive
 * `analysis_enabled` (ver ese archivo). Esta ruta lo esquiva a propósito: no es
 * automática, la dispara una persona con permiso de configuración apretando un
 * botón, una vez. Apagar el agente no debería impedir probarlo — al revés, es
 * exactamente cuando más se quiere probar.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Tiene que traer LO MISMO que `COLUMNAS_PROPIEDAD` en `lib/ai/scheduling-agent.ts`.
// Si el banco de pruebas lee menos columnas que la conversación real, muestra un
// agente que no existe — y el banco deja de servir justo para lo que se hizo.
const COLUMNAS =
  'id, address, title, assigned_to, ai_scheduling_enabled, neighborhood, city, property_type, operation_type, rooms, bedrooms, bathrooms, covered_area, total_area, asking_price, currency, expensas, garages, floor, amenities, photos, plans, video_file_url, video_url, description'

interface Turno {
  from: 'cliente' | 'nosotros'
  text: string
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    if (!hasPermission(user.profile.role, 'settings.manage')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = (await request.json()) as {
      propertyId?: string
      mensajes?: Turno[]
      resumenPrevio?: string
      clientName?: string | null
      yaHayVisita?: boolean
      /**
       * Material que esta persona YA recibió antes de este turno.
       *
       * Estaba fijo en vacío y por eso el simulador NO PODÍA reproducir el peor
       * bug que tuvo el agente (6 de agosto de 2026): con el plano ya entregado
       * por la plantilla de la consulta, volvía a mandarlo. Un banco de pruebas
       * que no puede reproducir la falla real no sirve para diagnosticarla.
       */
      yaMandado?: MaterialTipo[]
    }
    const TIPOS: MaterialTipo[] = ['fotos', 'plano', 'video']
    const yaMandado = (body.yaMandado ?? []).filter((t): t is MaterialTipo => TIPOS.includes(t))
    const mensajes = (body.mensajes ?? []).filter(m => m && typeof m.text === 'string' && m.text.trim())
    if (mensajes.length === 0) {
      return NextResponse.json({ error: 'Escribí al menos un mensaje del cliente.' }, { status: 400 })
    }
    if (!body.propertyId) {
      return NextResponse.json({ error: 'Elegí una propiedad.' }, { status: 400 })
    }

    const sb = admin()
    const { data: prop, error } = await sb.from('properties').select(COLUMNAS).eq('id', body.propertyId).maybeSingle()
    if (error || !prop) {
      return NextResponse.json({ error: 'No se encontró la propiedad.' }, { status: 404 })
    }
    const p = prop as Parameters<typeof propertyFacts>[0]

    const { data: settings } = await sb
      .from('ai_agent_settings')
      .select('max_messages_per_conversation')
      .eq('id', true)
      .maybeSingle()

    // El último mensaje NUESTRO del guion es lo que en la conversación real
    // sería "tu mensaje anterior": es lo que evita que se repita.
    const ultimoPropio = [...mensajes].reverse().find(m => m.from === 'nosotros')?.text ?? null

    const propertyLabel = p.address ? `la propiedad de ${p.address}` : p.title || 'la propiedad'
    const todayISO = hoyEnArgentina(new Date())

    const userPrompt = buildBrainUserPrompt({
      clientName: body.clientName ?? 'Julián',
      propertyLabel,
      propertyFacts: propertyFacts(p),
      todayISO,
      previousSummary: body.resumenPrevio ?? '',
      newMessages: mensajes,
      agentMessagesSent: mensajes.filter(m => m.from === 'nosotros').length,
      maxMessages: (settings as { max_messages_per_conversation: number } | null)?.max_messages_per_conversation ?? 10,
      hasActiveVisit: body.yaHayVisita === true,
      canWrite: true,
      puedeMandar: materialDisponible(p),
      ultimoMensajePropio: ultimoPropio,
      yaMandado,
    })

    const res = await chatCompletion({
      messages: [
        { role: 'system', content: DEFAULT_AGENT_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      jsonMode: true,
      maxTokens: 500,
      timeoutMs: 20_000,
    })

    const decision = coerceBrainDecision(JSON.parse(res.content))
    if (!decision) {
      return NextResponse.json({ error: 'El modelo devolvió algo que no se pudo leer.', crudo: res.content }, { status: 502 })
    }

    // Las mismas dos reglas que corren en la conversación real, para que lo que
    // se ve acá sea de verdad lo que pasaría.
    const visita = validateProposedVisit(decision.visitDate, decision.visitHour, todayISO)
    const archivos = decision.send.length > 0 ? archivosParaEnviar(p, decision.send) : []

    return NextResponse.json({
      respuesta: decision.reply,
      archivos: archivos.map(a => ({ tipo: a.mediaType, link: a.link })),
      visita: visita.ok
        ? { fecha: visita.dateISO, hora: visita.hour }
        : decision.visitDate
          ? { rechazada: visita.reason, propuestaPorElModelo: `${decision.visitDate} ${decision.visitHour ?? ''}` }
          : null,
      analisis: {
        resumen: decision.summary,
        intencion: decision.intent,
        prioridad: decision.priorityScore,
        motivo: decision.priorityReason,
        proximoPaso: decision.suggestedNextStep,
      },
      material: materialDisponible(p),
      /**
       * Lo que el agente TENÍA EN LA MANO al decidir. Es la mitad que faltaba:
       * viendo solo la respuesta no hay forma de distinguir "el modelo entendió
       * mal" de "le pasamos un dato falso" — y las tres fallas del 6 de agosto
       * de 2026 fueron lo segundo.
       */
      loQueSabe: {
        propiedad: propertyLabel,
        datos: propertyFacts(p),
        materialDisponible: materialDisponible(p),
        materialYaEntregado: yaMandado,
        suMensajeAnterior: ultimoPropio,
        resumenPrevio: body.resumenPrevio ?? '',
        hoy: todayISO,
      },
      prompts: { sistema: DEFAULT_AGENT_PROMPT, contexto: userPrompt },
      tokens: res.usage?.totalTokens ?? 0,
      modelo: res.model,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
