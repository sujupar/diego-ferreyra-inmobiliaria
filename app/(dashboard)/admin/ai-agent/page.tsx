import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'
import { AgentLabClient } from './AgentLabClient'

export const metadata = { title: 'Probar el agente de IA' }

/**
 * Banco de pruebas del agente. Gate a nivel página con `requireRole` (mismo
 * patrón que `admin/ai-usage`) — admin y dueño.
 *
 * Las propiedades se cargan acá, en el servidor, para que el selector muestre
 * PRIMERO las que tienen material cargado: probar el agente contra una
 * propiedad sin fotos ni video no muestra la mitad de lo que hace.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export default async function AgentLabPage() {
  await requireRole('admin', 'dueno')

  const { data } = await admin()
    .from('properties')
    .select('id, address, neighborhood, photos, video_file_url, plans')
    .eq('status', 'approved')
    .order('address')

  const filas = (data ?? []) as Array<{
    id: string
    address: string | null
    neighborhood: string | null
    photos: string[] | null
    video_file_url: string | null
    plans: string[] | null
  }>

  const propiedades = filas
    .map(p => {
      const tiene = [
        (p.photos ?? []).length > 0 ? 'fotos' : null,
        p.video_file_url ? 'video' : null,
        (p.plans ?? []).length > 0 ? 'plano' : null,
      ].filter(Boolean)
      return {
        id: p.id,
        label: `${p.address ?? 'Sin dirección'}${p.neighborhood ? `, ${p.neighborhood}` : ''}${tiene.length ? ` · ${tiene.join(' + ')}` : ' · sin material'}`,
        peso: tiene.length,
      }
    })
    .sort((a, b) => b.peso - a.peso)
    .map(({ id, label }) => ({ id, label }))

  return <AgentLabClient propiedades={propiedades} />
}
