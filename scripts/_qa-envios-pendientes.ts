/** Sonda (no se commitea): envíos pendientes por red y estado de la tanda. */
import { publicacionesDb } from '@/lib/publicaciones/db'

async function main() {
  const { data, error } = await publicacionesDb()
    .from('publicacion_envios')
    .select('plataforma, estado, publicacion_videos!inner(nombre_archivo, programado_para, publicacion_tandas!inner(estado))')
  if (error) throw error
  const cuenta = new Map<string, number>()
  for (const f of data ?? []) {
    const v = f.publicacion_videos as unknown as { publicacion_tandas: { estado: string } }
    const k = `${f.plataforma} · ${f.estado} · tanda ${v.publicacion_tandas.estado}`
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  console.log([...cuenta.entries()].map(([k, n]) => `${k}: ${n}`).join('\n') || 'sin envíos')
  const { data: aj } = await publicacionesDb().from('publicacion_ajustes').select('publicacion_automatica').eq('id', true).single()
  console.log('publicación automática:', aj?.publicacion_automatica)
}
main().catch((e) => console.error('FALLÓ', e))
