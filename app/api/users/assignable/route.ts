import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

/**
 * GET /api/users/assignable — usuarios a los que se les puede asignar una tarea.
 * Staff activo, excluye 'abogado' (no participa del pipeline comercial). Se usa
 * para poblar el selector "Asignar a" del AddTaskDialog.
 */
export async function GET() {
  await requireAuth()
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .in('role', ['admin', 'dueno', 'coordinador', 'asesor'])
      .order('full_name')
    if (error) throw error
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
