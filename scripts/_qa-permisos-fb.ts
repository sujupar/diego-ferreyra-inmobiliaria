/** Sonda (no se commitea): qué identificadores tiene un reel de la Página y cómo se ven sus comentarios. */
import { paginaDeLaCuenta, paginaFetch } from '@/lib/integrations/instagram/client'

async function main() {
  const { pageId } = await paginaDeLaCuenta()
  for (const campos of ['id,post_id,permalink_url,created_time', 'id,permalink_url,created_time']) {
    try {
      const r = await paginaFetch<{ data?: Record<string, unknown>[] }>(`/${pageId}/video_reels?fields=${campos}&limit=3`)
      console.log('video_reels', campos, JSON.stringify(r.data))
      const v = r.data?.[0]?.id as string | undefined
      if (v) {
        const c = await paginaFetch<{ data?: Record<string, unknown>[] }>(`/${v}/comments?fields=id,from,message,created_time&limit=2`)
        console.log('comentarios del reel', JSON.stringify(c.data))
      }
      break
    } catch (e) {
      console.log('falló', campos, e instanceof Error ? e.message.slice(0, 200) : e)
    }
  }
  const p = await paginaFetch<{ data?: Record<string, unknown>[] }>(`/${pageId}/posts?fields=id,permalink_url,status_type,attachments{type,target}&limit=5`)
  console.log('posts', JSON.stringify(p.data).slice(0, 1500))
}
main().catch((e) => console.error('FALLÓ', e instanceof Error ? e.message : e))
