/**
 * E1.3 — GET /api/properties/[id]/landing/preview?template=<id>
 *
 * Devuelve el LandingDocument que produciría un template para ESTA propiedad,
 * SIN persistir. La UI de co-creación (E1.4) lo usa para previsualizar cada
 * diseño antes de elegir. Read-only.
 *
 * Respuesta: { templateId, document, funnelType, suggestedTemplateId }.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { buildFromTemplate, suggestTemplateId, TEMPLATES } from '@/lib/landing/templates'
import { deriveFunnelType } from '@/lib/landing/funnel-type'
import type { Database } from '@/types/database.types'
import type { LandingProperty } from '@/lib/landing/registry'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function authorize(propertyId: string, userId: string, role: string): Promise<boolean> {
  if (role === 'abogado') return false
  if (['admin', 'dueno', 'coordinador'].includes(role)) return true
  if (role === 'asesor') {
    const supabase = getAdmin()
    const { data } = await supabase.from('properties').select('assigned_to').eq('id', propertyId).single()
    return !!data && data.assigned_to === userId
  }
  return false
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getAdmin()
    const { data: property, error } = await supabase.from('properties').select('*').eq('id', id).single()
    if (error || !property) {
      return NextResponse.json({ error: 'property not found' }, { status: 404 })
    }

    const url = new URL(req.url)
    const requestedTemplate = url.searchParams.get('template')

    const funnelType = deriveFunnelType(property as LandingProperty)
    const suggested = suggestTemplateId(funnelType)
    // Si no pidieron template explícito, usamos el sugerido por perfil.
    const { templateId, document } = buildFromTemplate(
      requestedTemplate ?? suggested,
      property as LandingProperty,
    )

    return NextResponse.json({
      templateId,
      document,
      funnelType,
      suggestedTemplateId: suggested,
      templates: TEMPLATES.map(t => ({
        id: t.id, label: t.label, description: t.description, bestFor: t.bestFor,
      })),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
