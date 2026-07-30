import { NextResponse } from 'next/server'
import { issueLeadTicket } from '@/lib/leads/anti-bot'

/**
 * GET /api/leads/ticket — Task 6, ficha de un solo uso contra el bot del
 * formulario público (ver `lib/leads/anti-bot.ts`). El popup de la landing
 * (`LeadCaptureProvider`) la pide al ABRIRSE y la manda en `POST /api/leads`.
 *
 * Público, sin auth (lo llama cualquier visitante anónimo de la landing).
 * Nunca puede tirar 5xx: si algo falla acá, el popup sigue funcionando —
 * simplemente el lead queda sin ficha y se guarda marcado `sospechoso`
 * (nunca se rechaza, ver `evaluateLeadSubmission`).
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return NextResponse.json({ ticket: issueLeadTicket() })
  } catch (err) {
    console.error('[GET /api/leads/ticket]', err)
    return NextResponse.json({ ticket: null })
  }
}
