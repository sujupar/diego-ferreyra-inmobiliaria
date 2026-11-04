/** Sonda (no se commitea): subida reanudable (TUS) de Supabase desde el servidor, en partes de 6 MB. */
import { createClient } from '@supabase/supabase-js'

const MB = 1024 * 1024
async function main() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/+$/, '')
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const ruta = `qa/tus-${Date.now()}.mp4`
  const total = 13 * MB + 12345
  const datos = new Uint8Array(total).map((_, i) => i % 251)
  const b64 = (s: string) => Buffer.from(s).toString('base64')
  const crear = await fetch(`${base}/storage/v1/upload/resumable`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${clave}`,
      'tus-resumable': '1.0.0',
      'upload-length': String(total),
      'x-upsert': 'true',
      'upload-metadata': `bucketName ${b64('contenido-videos')},objectName ${b64(ruta)},contentType ${b64('video/mp4')},cacheControl ${b64('3600')}`,
    },
  })
  const destino = crear.headers.get('location')
  console.log('crear', crear.status, destino ? 'con location' : await crear.text())
  if (!destino) return
  let offset = 0
  while (offset < total) {
    const fin = Math.min(offset + 6 * MB, total)
    const r = await fetch(destino, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${clave}`,
        'tus-resumable': '1.0.0',
        'upload-offset': String(offset),
        'content-type': 'application/offset+octet-stream',
      },
      body: datos.slice(offset, fin),
    })
    console.log('parte', offset / MB, '→', r.status, 'nuevo offset', r.headers.get('upload-offset'))
    if (!r.ok) { console.log(await r.text()); break }
    offset = Number(r.headers.get('upload-offset'))
  }
  // HEAD: ¿se puede retomar preguntando el offset?
  const h = await fetch(destino, { method: 'HEAD', headers: { authorization: `Bearer ${clave}`, 'tus-resumable': '1.0.0' } })
  console.log('HEAD', h.status, h.headers.get('upload-offset'))
  const sb = createClient(base, clave)
  const pub = sb.storage.from('contenido-videos').getPublicUrl(ruta).data.publicUrl
  const g = await fetch(pub, { method: 'HEAD' })
  console.log('archivo público', g.status, 'tamaño', g.headers.get('content-length'), 'esperado', total, 'cors', g.headers.get('access-control-allow-origin'))
  await sb.storage.from('contenido-videos').remove([ruta])
  console.log('borrado')
}
main().catch((e) => console.error('FALLÓ', e))
