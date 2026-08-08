import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

/**
 * `property_leads.deleted_at` (papelera) todavía no está en
 * `types/database.types.ts` — el CLI de Supabase no conecta en este proyecto
 * (ver CLAUDE.md § Supabase). Este badge cuenta leads NUEVOS visibles; un lead
 * borrado no debe sumar acá, así que esta ruta necesita el cliente sin el
 * genérico `<Database>` (mismo patrón que `lib/integrations/whatsapp/log.ts`).
 */
function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/leads/count
 * Devuelve { new: N } — cantidad de leads en status='new' visibles para el rol.
 * Usado por el badge del Inbox en AppSidebar (antes: DashboardNav, ya borrado)
 * y por la tarjeta "Consultas sin responder" de `/inicio`.
 *
 * Ronda de arreglos 1 (task-15, autorización puntual del coordinador): un
 * fallo de la CONSULTA (RLS, timeout, lo que sea) tiene que distinguirse de
 * "no hay ninguna" — antes esta ruta atrapaba cualquier error y respondía
 * `200 {new:0}`, un cero que no era un cero de verdad. Ambos consumidores ya
 * chequean `res.ok` (AppSidebar con try/catch silencioso, `/inicio` con
 * `pedirNumero`), así que basta con dejar de mentir acá: un fallo real
 * responde con status de error, no con `{new:0}`. El único `{new:0}` que
 * queda es el de la línea de abajo — un rol sin badge, que SÍ es un cero
 * legítimo (no es que no se pudo contar, es que a ese rol no le corresponde).
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
      const { data: props, error: propsError } = await supabase
        .from('properties')
        .select('id')
        .eq('assigned_to', user.id)
      if (propsError) {
        console.error('[leads/count]', propsError)
        return NextResponse.json({ error: 'count_failed' }, { status: 500 })
      }
      const propIds = (props ?? []).map(p => p.id)

      let query = supabase
        .from('property_leads')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new')
        .is('deleted_at', null)

      if (propIds.length > 0) {
        const propsList = propIds.map(id => `property_id.eq.${id}`).join(',')
        query = query.or(`assigned_to.eq.${user.id},${propsList}`)
      } else {
        query = query.eq('assigned_to', user.id)
      }
      const { count, error } = await query
      if (error) {
        console.error('[leads/count]', error)
        return NextResponse.json({ error: 'count_failed' }, { status: 500 })
      }
      return NextResponse.json({ new: count ?? 0 })
    }

    const { count, error } = await supabase
      .from('property_leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .is('deleted_at', null)
    if (error) {
      console.error('[leads/count]', error)
      return NextResponse.json({ error: 'count_failed' }, { status: 500 })
    }
    return NextResponse.json({ new: count ?? 0 })
  } catch (err) {
    console.error('[leads/count]', err)
    return NextResponse.json({ error: 'count_failed' }, { status: 500 })
  }
}
