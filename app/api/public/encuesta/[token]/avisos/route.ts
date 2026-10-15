import { NextRequest, NextResponse } from 'next/server'
import * as datos from '@/lib/visitas/encuesta/datos'
import { esTokenEncuesta } from '@/lib/visitas/encuesta/link'
import { procesarAvisosDeEncuesta } from '@/lib/visitas/encuesta/avisos-servicio'

export const dynamic = 'force-dynamic'

/**
 * La pantalla de gracias lo pide (con keepalive) apenas la persona termina: el pedido final ya
 * respondió y la persona no espera a nadie. Público por token; repetirlo no duplica nada (cada
 * canal se reserva de forma atómica) y cuenta contra el límite del link.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const inicio = Date.now()
  const { token } = await params
  if (!esTokenEncuesta(token)) return NextResponse.json({ error: 'Este link no está disponible' }, { status: 404 })
  try {
    const ec = await datos.leerEncuestaConVisita({ token })
    if (!ec) return NextResponse.json({ error: 'Este link no está disponible' }, { status: 404 })
    if (!ec.encuesta.completed_at) return NextResponse.json({ error: 'La encuesta todavía no está terminada' }, { status: 409 })
    if (!(await datos.registrarUso(token, 'escritura'))) return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 })
    const resultado = await procesarAvisosDeEncuesta(ec.encuesta.id, { inicio, ahora: new Date() })
    return NextResponse.json({ data: resultado })
  } catch (e) {
    console.error('[POST /api/public/encuesta/[token]/avisos]', e)
    return NextResponse.json({ error: 'No pudimos procesar los avisos' }, { status: 500 })
  }
}
