/**
 * La puerta por la que Meta nos avisa de los comentarios y de los botones.
 *
 * `GET`  → el desafío del alta. Meta llama una vez, al dar de alta el webhook.
 * `POST` → los avisos.
 *
 * ## Lo que protege esta ruta
 *
 * Es pública por necesidad: Meta no tiene sesión del CRM. Lo único que separa un
 * aviso legítimo de uno inventado es la firma `x-hub-signature-256`. Sin
 * verificarla, cualquiera que descubra esta dirección puede hacer que la cuenta
 * de Instagram le escriba a quien quiera.
 *
 * ## Por qué responde 200 aunque algo falle adentro
 *
 * Meta reintenta lo que no recibe 200, y si algo falla siempre, reintenta
 * siempre. Como el registro de cada comentario es idempotente (UNIQUE en
 * `ig_comment_id`), un reintento no duplica nada — pero devolver error igual
 * dejaría a Meta golpeando esta ruta indefinidamente. Los fallos se registran;
 * la respuesta es 200.
 *
 * El único caso que NO responde 200 es la firma inválida: ahí 403, a propósito.
 */
import { NextRequest, NextResponse } from 'next/server'
import { parsearAviso, verificarFirmaInstagram } from '@/lib/integrations/instagram/webhook'
import { leerAjustes, procesarBoton, procesarComentario } from '@/lib/social/reels/procesador'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const modo = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const desafio = searchParams.get('hub.challenge')

  const esperado = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN
  if (modo === 'subscribe' && esperado && token === esperado && desafio) {
    // Meta espera el desafío como TEXTO PLANO. Envuelto en JSON, rechaza el alta.
    return new NextResponse(desafio, { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  // El cuerpo CRUDO, antes de cualquier parseo: la firma se calcula sobre los
  // bytes exactos que mandó Meta. Parsear y volver a serializar cambia el texto
  // (espacios, orden de las claves) y la firma deja de coincidir.
  const crudo = await req.text()

  if (!verificarFirmaInstagram(crudo, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'firma inválida' }, { status: 403 })
  }

  let cuerpo: unknown
  try {
    cuerpo = JSON.parse(crudo)
  } catch {
    console.error('[webhook/instagram] cuerpo que no es JSON')
    return NextResponse.json({ ok: true })
  }

  const { comentarios, botones } = parsearAviso(cuerpo)
  if (comentarios.length === 0 && botones.length === 0) {
    return NextResponse.json({ ok: true, nada: true })
  }

  const ajustes = await leerAjustes()
  const resultados: string[] = []

  for (const comentario of comentarios) {
    try {
      const r = await procesarComentario(comentario, ajustes)
      resultados.push(r.accion === 'ignorado' ? `ignorado:${r.motivo}` : r.accion)
    } catch (e) {
      // Cada comentario en su propio try: uno que falla no puede tumbar a los
      // demás del mismo lote.
      console.error('[webhook/instagram] comentario', comentario.comentarioId, e)
      resultados.push('error')
    }
  }

  for (const boton of botones) {
    try {
      const r = await procesarBoton(boton.remitenteId, boton.dato, ajustes)
      resultados.push(r.ok ? 'boton' : `boton_ignorado:${r.motivo}`)
    } catch (e) {
      console.error('[webhook/instagram] botón de', boton.remitenteId, e)
      resultados.push('error')
    }
  }

  // Queda en los registros qué hizo cada aviso: un webhook que no deja rastro es
  // imposible de diagnosticar cuando alguien pregunta "¿por qué no contestó?".
  console.log('[webhook/instagram]', resultados.join(' · '))
  return NextResponse.json({ ok: true, resultados })
}
