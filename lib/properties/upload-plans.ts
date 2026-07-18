// Subida de planos desde el cliente por URL firmada directa a Storage
// (init → PUT → commit), mismo patrón que fotos/video: los archivos nunca
// pasan por el body de Next.js, así que los PDFs grandes suben sin comprimir.
// Reusado por la ficha (PlansPanel) y por el formulario de captación.

import { PLAN_EXTS, MAX_PLAN_BYTES } from '@/lib/properties/media'

/** Valida extensión y tamaño en el cliente. Devuelve mensaje de error o null. */
export function validatePlanFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (!(PLAN_EXTS as readonly string[]).includes(ext)) {
    return `"${file.name}": formato no permitido (.${ext || '?'}). Permitidos: ${PLAN_EXTS.join(', ')}`
  }
  if (file.size <= 0) return `"${file.name}" está vacío`
  if (file.size > MAX_PLAN_BYTES) {
    return `"${file.name}" supera el máximo de ${(MAX_PLAN_BYTES / 1024 / 1024).toFixed(0)} MB`
  }
  return null
}

interface UploadSlot { signedUrl: string; token: string; publicUrl: string }

function putFile(file: File, slot: UploadSlot, onBytes: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', slot.signedUrl, true)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('x-upsert', 'true')
    if (slot.token) xhr.setRequestHeader('Authorization', `Bearer ${slot.token}`)
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onBytes(e.loaded) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Error de red'))
    xhr.send(file)
  })
}

const BATCH_SIZE = 30 // cap de la route upload-init

/**
 * Sube planos a una propiedad existente. Los que suben OK quedan committeados
 * aunque otros fallen; si alguno falla, tira Error con los nombres.
 */
export async function uploadPlans(
  propertyId: string,
  files: File[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0) || 1
  const loadedByIndex = new Array<number>(files.length).fill(0)
  // Los eventos de progreso XHR llegan por paquete; con varios archivos en
  // paralelo eso son cientos de callbacks por segundo. Notificar solo cuando
  // cambia el % entero evita re-renders/toasts redundantes.
  let lastPct = -1
  const reportProgress = () => {
    const loaded = loadedByIndex.reduce((a, b) => a + b, 0)
    const pct = Math.min(100, Math.round((loaded / totalBytes) * 100))
    if (pct !== lastPct) { lastPct = pct; onProgress?.(pct) }
  }

  const failed: string[] = []

  for (let start = 0; start < files.length; start += BATCH_SIZE) {
    const batch = files.slice(start, start + BATCH_SIZE)

    const initRes = await fetch(`/api/properties/${propertyId}/media/upload-init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'plan',
        files: batch.map(f => ({ fileName: f.name, fileSize: f.size, contentType: f.type })),
      }),
    })
    const initData = await initRes.json().catch(() => ({}))
    if (!initRes.ok) throw new Error(initData?.error || 'No se pudo iniciar la subida de planos')
    const slots = initData.uploads as UploadSlot[]

    const results = await Promise.allSettled(batch.map((file, i) =>
      putFile(file, slots[i], (loaded) => {
        loadedByIndex[start + i] = loaded
        reportProgress()
      }).then(() => {
        loadedByIndex[start + i] = file.size
        reportProgress()
      })
    ))

    const okUrls: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') okUrls.push(slots[i].publicUrl)
      else failed.push(batch[i].name)
    })

    if (okUrls.length > 0) {
      const commitRes = await fetch(`/api/properties/${propertyId}/media/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'plan', urls: okUrls }),
      })
      if (!commitRes.ok) {
        const d = await commitRes.json().catch(() => ({}))
        console.warn('[uploadPlans] planos subidos pero commit falló (quedan huérfanos en Storage):', okUrls)
        throw new Error(d?.error || 'No se pudieron registrar los planos')
      }
    }
  }

  if (failed.length > 0) {
    throw new Error(`No se pudieron subir: ${failed.join(', ')}`)
  }
}
