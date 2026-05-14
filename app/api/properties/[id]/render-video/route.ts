import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { buildPropertyTourProps } from '@/lib/video/property-tour-props'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const InputSchema = z.object({
  compositionId: z.enum(['PropertyTour', 'PropertyTourVertical']).default('PropertyTour'),
  save: z.boolean().optional().default(false),
})

/**
 * POST /api/properties/[id]/render-video
 *
 * Dispara el render del video tour de Remotion para la propiedad.
 * Soporta 3 modos según env vars:
 *   1. REMOTION_RENDER_URL: POST a un servidor de render externo (Cloud Run,
 *      Render.com, etc.) que devuelve { url: "https://..." } al MP4.
 *   2. REMOTION_LAMBDA_FUNCTION + AWS creds: render vía Remotion Lambda.
 *      (Requiere setup de @remotion/lambda separadamente.)
 *   3. Ninguno → endpoint devuelve los props y bundleUrl para que el usuario
 *      renderice manualmente con CLI: npx remotion render ...
 *
 * Si save=true, guarda la URL del video en properties.video_url tras renderizar.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const allowed = ['admin', 'dueno', 'coordinador', 'asesor']
    if (!allowed.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const parsed = InputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    const supabase = getAdmin()
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !property) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (user.profile.role === 'asesor' && property.assigned_to !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!property.photos || property.photos.length === 0) {
      return NextResponse.json(
        { error: 'La propiedad no tiene fotos cargadas' },
        { status: 400 },
      )
    }

    const tourProps = buildPropertyTourProps({
      property,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    })

    // Modo 1: servidor de render externo
    const renderUrl = process.env.REMOTION_RENDER_URL
    if (renderUrl) {
      const renderRes = await fetch(renderUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(process.env.REMOTION_RENDER_TOKEN
            ? { authorization: `Bearer ${process.env.REMOTION_RENDER_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({
          compositionId: parsed.data.compositionId,
          inputProps: tourProps,
        }),
      })
      if (!renderRes.ok) {
        const text = await renderRes.text()
        return NextResponse.json(
          { error: `Render falló: ${text}` },
          { status: 502 },
        )
      }
      const { url } = (await renderRes.json()) as { url: string }
      if (parsed.data.save && url) {
        await supabase.from('properties').update({ video_url: url }).eq('id', id)
      }
      return NextResponse.json({ ok: true, url, mode: 'external-server' })
    }

    // Modo 3: devolver props para render manual
    return NextResponse.json({
      ok: true,
      mode: 'manual',
      compositionId: parsed.data.compositionId,
      inputProps: tourProps,
      cliCommand: `npx remotion render remotion/index.ts ${parsed.data.compositionId} property-${id}.mp4 --props='${JSON.stringify(tourProps).replace(/'/g, "'\\''")}'`,
      note: 'No hay servidor de render configurado. Usá el CLI command o configurá REMOTION_RENDER_URL.',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
