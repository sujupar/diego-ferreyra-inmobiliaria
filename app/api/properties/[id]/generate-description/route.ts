import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { generatePortalDescription } from '@/lib/marketing/portal-descriptions/generator'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const InputSchema = z.object({
  buyerProfile: z.string().max(500).optional(),
  extraNotes: z.string().max(2000).optional(),
  save: z.boolean().optional().default(false),
})

/**
 * POST /api/properties/[id]/generate-description
 * Genera title + subtitle + body con OpenAI según el system prompt GPT Portales.
 *
 * Body:
 *  { buyerProfile?: string, extraNotes?: string, save?: boolean }
 *
 * Si save=true, guarda directamente en properties.title y properties.description.
 * Si save=false (default), solo devuelve el resultado para preview.
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
      return NextResponse.json(
        { error: 'invalid', detail: parsed.error.flatten() },
        { status: 400 },
      )
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

    // Asesor solo puede generar para sus propiedades
    if (user.profile.role === 'asesor' && property.assigned_to !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const generated = await generatePortalDescription({
      property,
      buyerProfile: parsed.data.buyerProfile,
      extraNotes: parsed.data.extraNotes,
    })

    if (parsed.data.save) {
      const { error: updErr } = await supabase
        .from('properties')
        .update({
          title: generated.title,
          description: `${generated.subtitle}\n\n${generated.body}`,
        })
        .eq('id', id)
      if (updErr) {
        return NextResponse.json(
          { error: `Generación OK pero falló al guardar: ${updErr.message}`, generated },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({ ok: true, generated, saved: parsed.data.save })
  } catch (err) {
    console.error('[generate-description]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
