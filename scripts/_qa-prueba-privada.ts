/**
 * Prueba REAL contra Meta que no deja nada público (no se commitea).
 *
 *   Instagram: crea el contenedor y espera a que termine de procesar. NO llama a
 *              media_publish → nada aparece; el contenedor vence solo en 24 h.
 *   Facebook:  inicia el reel, Facebook baja el archivo, se termina como BORRADOR
 *              (video_state=DRAFT) → solo lo ven los administradores; al final se borra.
 *
 * Uso: node --env-file=<.env.local> --import tsx scripts/_qa-prueba-privada.ts <ruta.mp4>
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { crearContenedorReel, estadoContenedor } from '@/lib/integrations/instagram/publicar'
import { estadoReel, iniciarReel, subirPorUrl } from '@/lib/integrations/facebook/reels'
import { paginaDeLaCuenta, paginaFetch } from '@/lib/integrations/instagram/client'

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const seg = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`

async function main() {
  const archivo = process.argv[2]
  if (!archivo) throw new Error('Falta la ruta del video')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const ruta = `qa/prueba-privada-${Date.now()}.mp4`
  const subida = await sb.storage.from('contenido-videos').upload(ruta, readFileSync(archivo), { contentType: 'video/mp4' })
  if (subida.error) throw subida.error
  const url = sb.storage.from('contenido-videos').getPublicUrl(ruta).data.publicUrl
  console.log(`[${seg()}] video subido al almacenamiento`)

  let fbVideo: string | null = null
  try {
    // ---- Instagram ----
    const creationId = await crearContenedorReel({ videoUrl: url, descripcion: '[TEST] prueba privada — no se publica' })
    console.log(`[${seg()}] Instagram: contenedor creado`)
    let ig = 'EN_PROCESO'
    for (let i = 0; i < 40 && ig === 'EN_PROCESO'; i++) {
      await espera(5000)
      ig = await estadoContenedor(creationId)
    }
    console.log(`[${seg()}] Instagram: estado del contenedor = ${ig} (LISTO = se podría publicar; NO se publica)`)

    // ---- Facebook ----
    fbVideo = await iniciarReel()
    console.log(`[${seg()}] Facebook: reel iniciado`)
    await subirPorUrl(fbVideo, url)
    console.log(`[${seg()}] Facebook: archivo entregado`)
    let listo = false
    for (let i = 0; i < 24 && !listo; i++) {
      const e = await estadoReel(fbVideo)
      listo = e.listoParaPublicar
      if (!listo) await espera(5000)
    }
    console.log(`[${seg()}] Facebook: subida completa = ${listo}`)
    const { pageId } = await paginaDeLaCuenta()
    const fin = await paginaFetch<{ success?: boolean }>(`/${pageId}/video_reels`, {
      method: 'POST',
      body: JSON.stringify({ upload_phase: 'finish', video_id: fbVideo, video_state: 'DRAFT', description: '[TEST] prueba privada' }),
    })
    console.log(`[${seg()}] Facebook: terminado como BORRADOR, respuesta success=${fin.success}`)
    for (let i = 0; i < 24; i++) {
      await espera(5000)
      const r = await paginaFetch<{ status?: { video_status?: string; processing_phase?: { status?: string }; publishing_phase?: { status?: string } }; published?: boolean }>(
        `/${fbVideo}?fields=status,published`,
      )
      const proc = r.status?.processing_phase?.status
      if (proc === 'complete' || proc === 'error' || i === 23) {
        console.log(`[${seg()}] Facebook: procesamiento=${proc}, publicado=${r.published}, video_status=${r.status?.video_status}`)
        break
      }
    }
  } finally {
    if (fbVideo) {
      const borrado = await paginaFetch<{ success?: boolean }>(`/${fbVideo}`, { method: 'DELETE' }).catch((e) => ({ error: String(e) }))
      console.log(`[${seg()}] Facebook: borrador borrado →`, JSON.stringify(borrado))
    }
    await sb.storage.from('contenido-videos').remove([ruta])
    console.log(`[${seg()}] archivo de prueba borrado del almacenamiento`)
  }
}

main().catch((e) => {
  console.error('FALLÓ:', e instanceof Error ? e.message : e)
  process.exit(1)
})
