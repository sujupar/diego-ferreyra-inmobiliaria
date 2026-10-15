import { NextRequest, NextResponse } from 'next/server'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import * as datos from '@/lib/visitas/encuesta/datos'
import { esTokenEncuesta, estaVencida } from '@/lib/visitas/encuesta/link'
import { cuerpoPatch, patchDelPaso, cuerpoFinal, contactoFinal, esHoneypot, faltaParaTerminar } from '@/lib/visitas/encuesta/respuestas'
import { opcionesDeLaPropiedad, urlDescargaDelRegalo } from '@/lib/visitas/encuesta/publica'
import { monedaDe, type EncuestaConVisita } from '@/lib/visitas/encuesta/tipos'

export const dynamic = 'force-dynamic'

/**
 * La encuesta pública (spec §4.10 + adenda §11.7). La responde alguien SIN cuenta: la seguridad es
 * el token (128 bits) más estas reglas: forma del token antes de tocar la base, Zod estricto por
 * paso, opciones validadas contra ESA propiedad, límite de escrituras por link, honeypot, y un
 * final con reserva atómica (un doble toque no duplica ni re-notifica).
 * Una visita reabierta (status ≠ completed) deja el link sin efecto.
 */
function noDisponible() {
  return NextResponse.json({ error: 'Este link no está disponible' }, { status: 404 })
}

async function cargar(token: string): Promise<EncuestaConVisita | null> {
  if (!esTokenEncuesta(token)) return null
  const ec = await datos.leerEncuestaConVisita({ token })
  if (!ec || ec.visita.status !== 'completed') return null
  return ec
}

/** El MISMO éxito para el primer toque, el segundo y el que llega con la encuesta ya terminada. */
async function exito(ec: EncuestaConVisita) {
  let regalo: { titulo: string; descarga: string } | null = null
  try {
    const r = await datos.leerRegalo(ec.visita.property_id)
    if (r) regalo = { titulo: r.titulo, descarga: urlDescargaDelRegalo(ec.encuesta.token) }
  } catch (e) {
    console.error('[encuesta] no se pudo leer el regalo al terminar', e)
  }
  return NextResponse.json({ data: { completa: true, regalo } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!esTokenEncuesta(token)) return noDisponible()
  const parsed = cuerpoPatch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Respuesta inválida' }, { status: 400 })
  try {
    const ec = await cargar(token)
    if (!ec) return noDisponible()
    const ahora = new Date()
    if (ec.encuesta.completed_at) return NextResponse.json({ error: 'Esta encuesta ya está respondida', code: 'COMPLETA' }, { status: 409 })
    if (estaVencida(ec.encuesta.expires_at, ahora)) return NextResponse.json({ error: 'Este link venció' }, { status: 410 })
    const c = parsed.data
    if (!(await datos.registrarUso(token, c.paso === 'abierta' ? 'abierta' : 'escritura'))) {
      return NextResponse.json({ error: 'Demasiados intentos con este link' }, { status: 429 })
    }
    if (c.paso === 'abierta') return NextResponse.json({ data: { ok: true } })
    const p = ec.visita.propiedad
    const r = patchDelPaso(c, { opciones: opcionesDeLaPropiedad(p), moneda: monedaDe(p?.currency) })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    if (!(await datos.guardarPaso(ec.encuesta.id, r.patch, ahora))) {
      return NextResponse.json({ error: 'Esta encuesta ya no admite cambios' }, { status: 409 })
    }
    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    console.error('[PATCH /api/public/encuesta/[token]]', e)
    return NextResponse.json({ error: 'No pudimos guardar tu respuesta. Probá de nuevo.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!esTokenEncuesta(token)) return noDisponible()
  const parsed = cuerpoFinal.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Revisá tus datos' }, { status: 400 })
  if (esHoneypot(parsed.data)) {
    // Un robot: se le contesta lo mismo que a una persona para que no aprenda nada, sin escribir.
    console.warn('[encuesta] honeypot lleno: éxito falso sin guardar')
    return NextResponse.json({ data: { completa: true, regalo: null } })
  }
  try {
    const ec = await cargar(token)
    if (!ec) return noDisponible()
    if (ec.encuesta.completed_at) return exito(ec)
    const ahora = new Date()
    if (estaVencida(ec.encuesta.expires_at, ahora)) return NextResponse.json({ error: 'Este link venció' }, { status: 410 })
    if (!(await datos.registrarUso(token, 'escritura'))) return NextResponse.json({ error: 'Demasiados intentos con este link' }, { status: 429 })
    const falta = faltaParaTerminar(ec.encuesta)
    if (falta) return NextResponse.json({ error: 'Falta responder una pregunta', paso: falta }, { status: 409 })
    const c = contactoFinal(parsed.data, ec.visita.client_phone, normalizeWhatsappPhone)
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 })
    const fila = await datos.completarEncuesta(ec.encuesta.id, c.contacto, ahora)
    if (fila) return exito(ec)
    // Otro pedido (doble toque) la terminó un instante antes: mismo éxito, sin duplicar nada.
    const deNuevo = await datos.leerEncuestaConVisita({ token })
    if (deNuevo?.encuesta.completed_at) return exito(deNuevo)
    return NextResponse.json({ error: 'Este link venció' }, { status: 410 })
  } catch (e) {
    console.error('[POST /api/public/encuesta/[token]]', e)
    return NextResponse.json({ error: 'No pudimos guardar tus respuestas. Probá de nuevo.' }, { status: 500 })
  }
}
