import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Cierra el UPDATE anónimo de `deals.appraisal_id` (service-role, RLS no
  // aplica): cualquiera podía reapuntar la tasación de un deal ajeno.
  // El guard va ANTES del try a propósito: `requireAuth` lanza NEXT_REDIRECT y
  // un catch alrededor lo convertiría en un 500 opaco en vez del 307 a /login.
  // NOTA: a hoy esta ruta no tiene ningún llamador conocido en el repo (ni en
  // las Netlify Functions ni en scripts/). Candidata a borrarse cuando se
  // confirme contra los logs de acceso que tampoco la usa nada externo.
  await requireAuth()
  try {
    const { id } = await params
    const { appraisal_id } = await request.json()

    if (!appraisal_id) return NextResponse.json({ error: 'Missing appraisal_id' }, { status: 400 })

    // Only link the appraisal to the deal — do NOT change the stage
    const { error } = await getAdmin()
      .from('deals')
      .update({
        appraisal_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
