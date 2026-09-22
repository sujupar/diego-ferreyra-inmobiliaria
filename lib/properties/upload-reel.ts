// Subida del video de un reel: URL firmada directa a Storage (init → PUT),
// mismo patrón que fotos, video y planos. El archivo NUNCA pasa por el body de
// Next.js, que tiene tope — un video de 150 MB por ahí no llega.
//
// A diferencia de los otros, acá NO hay paso de "commit" contra la ficha: el
// reel no es multimedia de la propiedad, es material de Instagram. Su registro
// lo crea `POST /api/properties/[id]/reels` con la URL que devuelve esto.

import { MAX_VIDEO_BYTES, REEL_EXTS } from '@/lib/properties/media'

/** Valida extensión y tamaño en el navegador. Devuelve el mensaje o null. */
export function validarArchivoReel(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (!(REEL_EXTS as readonly string[]).includes(ext)) {
    // El servidor lo vuelve a validar. Acá es para avisarle al asesor ANTES de
    // que espere una subida de 150 MB que va a terminar rechazada.
    return `Instagram solo acepta ${REEL_EXTS.join(' y ')}. "${file.name}" es .${ext || '?'}`
  }
  if (file.size <= 0) return `"${file.name}" está vacío`
  if (file.size > MAX_VIDEO_BYTES) {
    return `"${file.name}" supera el máximo de ${(MAX_VIDEO_BYTES / 1024 / 1024).toFixed(0)} MB`
  }
  return null
}

interface Espacio {
  signedUrl: string
  token: string
  publicUrl: string
}

function subirArchivo(
  file: File,
  espacio: Espacio,
  onProgreso: (porcentaje: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', espacio.signedUrl, true)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('x-upsert', 'true')
    if (espacio.token) xhr.setRequestHeader('Authorization', `Bearer ${espacio.token}`)
    // Un video tarda: sin barra de progreso el asesor cree que se colgó y recarga.
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Error de red al subir el video'))
    xhr.send(file)
  })
}

/** Sube el video y devuelve su URL pública, que es lo que Instagram descarga. */
export async function subirReel(
  propertyId: string,
  file: File,
  onProgreso: (porcentaje: number) => void = () => {},
): Promise<string> {
  const problema = validarArchivoReel(file)
  if (problema) throw new Error(problema)

  const res = await fetch(`/api/properties/${propertyId}/media/upload-init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind: 'reel',
      files: [{ fileName: file.name, fileSize: file.size, contentType: file.type }],
    }),
  })

  // Helper tolerante: si el servidor tardó y el gateway devolvió HTML, `json()`
  // explotaría con "Unexpected token '<'", que no dice nada del problema real.
  const texto = await res.text()
  let cuerpo: { uploads?: Espacio[]; error?: string }
  try {
    cuerpo = JSON.parse(texto) as { uploads?: Espacio[]; error?: string }
  } catch {
    throw new Error('El servidor tardó demasiado en responder. Probá de nuevo.')
  }
  if (!res.ok) throw new Error(cuerpo.error || 'No se pudo preparar la subida')

  const espacio = cuerpo.uploads?.[0]
  if (!espacio) throw new Error('No se pudo preparar la subida')

  await subirArchivo(file, espacio, onProgreso)
  return espacio.publicUrl
}
