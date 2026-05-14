import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/leads/count
 * Devuelve { new: N } — cantidad de leads en status='new' visibles para el rol.
 * Usado por el badge del DashboardNav.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    const role = user.profile.role
    if (!['admin', 'dueno', 'coordinador', 'asesor'].includes(role)) {
      return NextResponse.json({ new: 0 })
    }

    const supabase = getAdmin()

    if (role === 'asesor') {
      const { data: props } = await supabase
        .from('properties')
        .select('id')
        .eq('assigned_to', user.id)
      const propIds = (props ?? []).map(p => p.id)

      let query = supabase
        .from('property_leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new')

      if (propIds.length > 0) {
        const propsList = propIds.map(id => `property_id.eq.${id}`).join(',')
        query = query.or(`assigned_to.eq.${user.id},${propsList}`)
      } else {
        query = query.eq('assigned_to', user.id)
      }
      const { count } = await query
      return NextResponse.json({ new: count ?? 0 })
    }

    const { count } = await supabase
      .from('property_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
    return NextResponse.json({ new: count ?? 0 })
  } catch (err) {
    console.error('[leads/count]', err)
    return NextResponse.json({ new: 0 })
  }
}
