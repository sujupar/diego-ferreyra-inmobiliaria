import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { logOutbound } from '@/lib/integrations/whatsapp/log'

/**
 * POST /api/whatsapp/conversations/[phone]/agent — prender o apagar el agente
 * EN ESTA CONVERSACIÓN.
 *
 * Es el botón que faltaba: antes de escribirle vos a un cliente, apagás el
 * agente para que no conteste por encima tuyo. Escribe la MISMA columna que usa
 * el agente cuando llega a su tope (`conversation_ai_state.agent_handed_off`),
 * así que no hay dos mecanismos que puedan contradecirse: el freno es uno solo.
 *
 * Deja constancia en el chat con una nota interna. Que el agente se calle es
 * una decisión que el resto del equipo tiene que poder ver, no un cambio
 * invisible en una tabla.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Nota interna: NUNCA sale por la API de Meta (ver la lista blanca de `countsAsReply`). */
const NOTE_STATUS = 'agent_toggled'

/** Copiados de `app/api/whatsapp/conversations/route.ts`: quien ve el Inbox puede apagar el agente. */
const ROLES_INBOX = ['admin', 'dueno', 'coordinador', 'asesor']

export async function POST(request: NextRequest, { params }: { params: Promise<{ phone: string }> }) {
  try {
    const user = await requireAuth()
    // Los mismos roles que ven el Inbox (`app/api/whatsapp/conversations`).
    // El abogado no entra.
    if (!ROLES_INBOX.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { phone } = await params
    const phoneE164 = phone.replace(/\D/g, '')
    if (!phoneE164) return NextResponse.json({ error: 'teléfono inválido' }, { status: 400 })

    const body = (await request.json()) as { activo?: boolean }
    if (typeof body.activo !== 'boolean') {
      return NextResponse.json({ error: 'falta "activo"' }, { status: 400 })
    }
    const handedOff = !body.activo

    const sb = admin()
    // Upsert: si la conversación nunca fue analizada todavía no hay fila, y
    // apagar el agente ANTES de que hable es justamente el caso más útil.
    const { error } = await sb
      .from('conversation_ai_state')
      .upsert({ phone_e164: phoneE164, agent_handed_off: handedOff, updated_at: new Date().toISOString() },
        { onConflict: 'phone_e164' })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const quien = user.profile.full_name ?? 'Alguien del equipo'
    await logOutbound({
      phone: phoneE164,
      bodyPreview: handedOff
        ? `[Agente IA] ${quien} apagó el agente en esta conversación. A partir de acá contesta una persona.`
        : `[Agente IA] ${quien} volvió a prender el agente en esta conversación.`,
      status: NOTE_STATUS,
      sentBy: user.id,
      aiGenerated: false,
    })

    return NextResponse.json({ ok: true, activo: body.activo })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
