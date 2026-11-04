/** Sonda (no se commitea): cuántas propiedades aparecerían en el selector. */
import { publicacionesDb } from '@/lib/publicaciones/db'

async function main() {
  const { data, error } = await publicacionesDb()
    .from('properties')
    .select('address, status, commercial_status')
    .eq('status', 'approved')
    .in('commercial_status', ['disponible', 'reservada'])
    .order('address')
  if (error) throw error
  console.log('en el selector:', data?.length)
  console.log((data ?? []).slice(0, 5).map((p) => p.address).join(' | '))
}
main().catch((e) => console.error('FALLÓ', e))
