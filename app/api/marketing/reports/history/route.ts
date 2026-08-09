import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'

/**
 * GET /api/marketing/reports/history?limit=10
 * Returns the most recent email reports sent
 */
export async function GET(request: Request): Promise<Response> {
  // Cierra el `select('*')` anónimo sobre `email_report_log` — destinatarios,
  // asuntos y mensajes de error de los reportes — leído con service-role, así
  // que la RLS `email_report_log_admin_only` no lo frenaba.
  // `settings.manage` (admin + dueño) y no `requireAuth`: esa tabla es
  // configuración, y su policy en Postgres ya usa `is_privileged_user()`
  // (= admin/dueño), el mismo conjunto exacto de roles. El guard queda alineado
  // con la base en vez de ser más laxo que ella.
  // El guard va ANTES del try a propósito: lanza NEXT_REDIRECT y un catch
  // alrededor lo convertiría en un 500 opaco en vez del 307.
  // NOTA: a hoy esta ruta no tiene ningún llamador conocido en el repo.
  // Candidata a borrarse cuando se confirme contra los logs de acceso.
  await requirePermission('settings.manage')
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('email_report_log')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Report history error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
