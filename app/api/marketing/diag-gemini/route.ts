/**
 * GET /api/marketing/diag-gemini
 *
 * Endpoint de diagnóstico (read-only) que reporta el estado de las
 * variables de entorno Gemini Y verifica que el modelo de texto responda.
 *
 * NO expone la API key — solo confirma presencia y un fingerprint.
 *
 * Útil cuando el wizard v2 se atasca en "paso 4 sin avatares" para
 * verificar empíricamente si Gemini está accesible desde el deploy.
 *
 * Acceso: cualquier usuario autenticado que NO sea abogado.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'

function maskKey(key: string | undefined): string {
  if (!key) return 'MISSING'
  if (key.length < 8) return 'TOO_SHORT'
  return `${key.slice(0, 4)}…${key.slice(-4)} (${key.length} chars)`
}

export async function GET() {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    const textModel = process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.0-flash'
    const visionModel = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.0-flash'
    const imageModel = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image'

    const envState = {
      GEMINI_API_KEY: maskKey(apiKey),
      GEMINI_TEXT_MODEL: textModel,
      GEMINI_VISION_MODEL: visionModel,
      GEMINI_IMAGE_MODEL: imageModel,
    }

    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        reason: 'GEMINI_API_KEY no está cargada en el deploy.',
        envState,
      })
    }

    // Probe rápido al modelo de texto: ping de un par de tokens.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${apiKey}`
    const probeStart = Date.now()
    let probeStatus = 0
    let probeText = ''
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Responde solo con OK' }] }],
        }),
      })
      probeStatus = r.status
      probeText = await r.text()
    } catch (err) {
      return NextResponse.json({
        ok: false,
        reason: `Probe a Gemini text falló: ${err instanceof Error ? err.message : String(err)}`,
        envState,
      })
    }
    const elapsedMs = Date.now() - probeStart

    let parsed: unknown
    try {
      parsed = JSON.parse(probeText)
    } catch {
      parsed = probeText.slice(0, 300)
    }

    return NextResponse.json({
      ok: probeStatus >= 200 && probeStatus < 300,
      envState,
      probe: {
        model: textModel,
        statusCode: probeStatus,
        elapsedMs,
        response: parsed,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
