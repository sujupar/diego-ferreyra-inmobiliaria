/**
 * POST /api/properties/[id]/meta-launch-v2/start
 *
 * Inicia un job de lanzamiento de campaña Meta Ads con el flow de 11 etapas.
 * Si ya existe un job activo para la propiedad, lo devuelve.
 *
 * Etapa 1-4 del flow: confirma datos, recupera descripción, analiza con
 * Vision, genera 3 avatares. Estas 4 etapas se ejecutan en cadena aquí
 * (10-30s total).
 *
 * Después el frontend hace polling de /status y avanza al usuario por las
 * etapas que necesitan input (avatar, fotos, presupuesto, etc.)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { analyzePropertyPhotos } from '@/lib/marketing/property-vision-analyzer'
import { generateThreeAvatars } from '@/lib/marketing/buyer-avatar-generator'
import { getOrGenerateBridgedDescription } from '@/lib/marketing/portal-description-bridge'
import type { Database } from '@/types/database.types'

// Máximo timeout Netlify Pro — start corre análisis Vision + 3 avatares en
// cadena, ~30-50s worst case. Default de 26s no alcanza.
export const maxDuration = 60

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function authorize(propertyId: string, userId: string, role: string): Promise<boolean> {
  if (role === 'abogado') return false
  if (role === 'asesor') {
    const supabase = getAdmin()
    const { data } = await supabase
      .from('properties')
      .select('assigned_to')
      .eq('id', propertyId)
      .single()
    return data?.assigned_to === userId
  }
  return ['admin', 'dueno', 'coordinador'].includes(role)
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = getAdmin()
    const { data: property, error: pErr } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()
    if (pErr || !property) {
      return NextResponse.json({ error: 'property not found' }, { status: 404 })
    }
    if (!property.public_slug) {
      return NextResponse.json(
        { error: 'La propiedad no tiene landing pública asignada todavía.' },
        { status: 412 },
      )
    }

    // 1. Idempotencia: si ya hay un job activo, devolverlo
    const { data: existing } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string) => {
            in: (a: string, b: string[]) => {
              order: (
                a: string,
                opts: { ascending: boolean },
              ) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: { id: string } | null }> } }
            }
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .select('id')
      .eq('property_id', id)
      .in('status', [
        'analyzing',
        'awaiting_user_input',
        'generating',
        'awaiting_confirm',
        'publishing',
      ])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing?.id) {
      return NextResponse.json({ jobId: existing.id, resumed: true })
    }

    // 2. Crear nuevo job
    const { data: jobIns, error: jErr } = await (supabase as unknown as {
      from: (t: string) => {
        insert: (rows: Record<string, unknown>) => {
          select: (s: string) => {
            single: () => Promise<{ data: { id: string } | null; error: Error | null }>
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .insert({
        property_id: id,
        initiated_by: user.id,
        status: 'analyzing',
        current_step: 'starting',
        progress_percent: 0,
      })
      .select('id')
      .single()
    if (jErr || !jobIns) {
      return NextResponse.json(
        { error: jErr?.message ?? 'No se pudo crear job' },
        { status: 500 },
      )
    }
    const jobId = jobIns.id

    // 3. Ejecutar etapas 1-4 en cadena
    try {
      // Etapa 1 implícita: los datos ya están confirmados al crear el job
      // (el frontend mostrará un step de "confirmá los datos" antes del POST start).

      // Etapa 2: descripción de portal (insumo)
      await (supabase as unknown as {
        from: (t: string) => {
          update: (f: Record<string, unknown>) => {
            eq: (a: string, b: string) => Promise<unknown>
          }
        }
      })
        .from('meta_launch_jobs')
        .update({
          current_step: 'fetching_description',
          progress_percent: 15,
        })
        .eq('id', jobId)
      const description = await getOrGenerateBridgedDescription(property as never)

      // Etapa 3: análisis Vision
      await (supabase as unknown as {
        from: (t: string) => {
          update: (f: Record<string, unknown>) => {
            eq: (a: string, b: string) => Promise<unknown>
          }
        }
      })
        .from('meta_launch_jobs')
        .update({ current_step: 'analyzing_photos', progress_percent: 35 })
        .eq('id', jobId)
      const vision = await analyzePropertyPhotos(property as never)

      // Etapa 4: 3 avatares
      await (supabase as unknown as {
        from: (t: string) => {
          update: (f: Record<string, unknown>) => {
            eq: (a: string, b: string) => Promise<unknown>
          }
        }
      })
        .from('meta_launch_jobs')
        .update({ current_step: 'generating_avatars', progress_percent: 65 })
        .eq('id', jobId)
      const avatars = await generateThreeAvatars({
        property: property as never,
        vision,
      })

      // Guard de última instancia: con el fallback determinístico de
      // generateThreeAvatars siempre debería haber 3 avatares acá. Si igual
      // viene vacío (lo que sería un bug regresivo), no marcamos failed —
      // usamos un fallback minimalista in-line para que el flow no se rompa.
      const safeAvatars = avatars && avatars.length > 0
        ? avatars
        : [
            { id: 'avatar_0', shortLabel: `Comprador para ${property.neighborhood}`, ageRange: '30-45', occupation: 'Profesional', lifeMoment: 'Buscando vivienda', motivation: `Quiere vivir en ${property.neighborhood}`, concerns: ['Precio', 'Ubicación'], communicationTone: 'cálido', visualCue: 'profesional_solo', hooks: [property.neighborhood], reasoning: 'Fallback de emergencia' },
            { id: 'avatar_1', shortLabel: 'Inversor', ageRange: '40-55', occupation: 'Inversor', lifeMoment: 'Diversificando portfolio', motivation: 'Renta', concerns: ['ROI'], communicationTone: 'práctico', visualCue: 'inversor', hooks: ['Renta firme'], reasoning: 'Fallback de emergencia' },
            { id: 'avatar_2', shortLabel: 'Familia', ageRange: '35-45', occupation: 'Profesional con hijos', lifeMoment: 'Necesita más espacio', motivation: 'Espacio familiar', concerns: ['Colegios', 'Seguridad'], communicationTone: 'familiar', visualCue: 'familia', hooks: ['Para la familia'], reasoning: 'Fallback de emergencia' },
          ]
      const avatarsToUse = safeAvatars

      // Persistir todo y pasar a awaiting_user_input
      await (supabase as unknown as {
        from: (t: string) => {
          update: (f: Record<string, unknown>) => {
            eq: (a: string, b: string) => Promise<unknown>
          }
        }
      })
        .from('meta_launch_jobs')
        .update({
          status: 'awaiting_user_input',
          current_step: 'awaiting_avatar_selection',
          progress_percent: 100,
          description_used: description.body,
          detected_strengths: {
            highlights: vision.highlights,
            ambience: vision.ambience,
            summary: vision.summary,
            source: vision.source,
          },
          detected_weaknesses: {
            // Vision actual no devuelve weaknesses explícitas; placeholder
            list: [],
          },
          generated_avatars: { avatars: avatarsToUse },
        })
        .eq('id', jobId)
    } catch (analysisErr) {
      const msg = analysisErr instanceof Error ? analysisErr.message : String(analysisErr)
      await (supabase as unknown as {
        from: (t: string) => {
          update: (f: Record<string, unknown>) => {
            eq: (a: string, b: string) => Promise<unknown>
          }
        }
      })
        .from('meta_launch_jobs')
        .update({ status: 'failed', error_message: msg })
        .eq('id', jobId)
      return NextResponse.json(
        { jobId, error: 'Análisis falló: ' + msg },
        { status: 502 },
      )
    }

    return NextResponse.json({ jobId, resumed: false })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
