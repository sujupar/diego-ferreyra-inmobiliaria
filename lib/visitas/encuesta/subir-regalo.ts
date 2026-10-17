/**
 * Subida del regalo desde el navegador: init (firma) → PUT directo a Storage → confirmar.
 * Mismo patrón que lib/properties/upload-plans.ts: el archivo nunca pasa por el body de Next.
 *
 * `base` es la ruta del regalo: el de una propiedad (`/api/properties/<id>/regalo`) o el general
 * (`/api/settings/encuesta-visitas/regalo-general`). Las dos tienen el mismo `/subida`, PUT y DELETE.
 */
import { validarArchivoRegalo, validarPortada, validarTitulo, type RegaloVista } from './regalo'

interface SlotSubida { signedUrl: string; token: string; path: string }

async function leerJson(res: Response): Promise<Record<string, unknown>> {
  try { return (await res.json()) as Record<string, unknown> } catch { return {} }
}

function error(cuerpo: Record<string, unknown>, porDefecto: string): Error {
  return new Error(typeof cuerpo.error === 'string' ? cuerpo.error : porDefecto)
}

function subirASlot(archivo: File, slot: SlotSubida, alAvanzar?: (cargados: number) => void): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', slot.signedUrl, true)
    xhr.setRequestHeader('Content-Type', archivo.type || 'application/pdf')
    xhr.setRequestHeader('x-upsert', 'true')
    if (slot.token) xhr.setRequestHeader('Authorization', `Bearer ${slot.token}`)
    xhr.upload.onprogress = e => { if (e.lengthComputable) alAvanzar?.(e.loaded) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolver() : rechazar(new Error(`La subida falló (HTTP ${xhr.status})`)))
    xhr.onerror = () => rechazar(new Error('Se cortó la conexión durante la subida'))
    xhr.send(archivo)
  })
}

export const BASE_REGALO_GENERAL = '/api/settings/encuesta-visitas/regalo-general'

export function baseDelRegaloDeLaPropiedad(propertyId: string): string {
  return `/api/properties/${propertyId}/regalo`
}

async function guardar(base: string, cuerpo: Record<string, unknown>): Promise<RegaloVista> {
  const res = await fetch(base, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  })
  const j = await leerJson(res)
  if (!res.ok || !j.data) throw error(j, 'No pudimos guardar el regalo')
  return j.data as RegaloVista
}

export async function subirRegalo(
  base: string,
  d: { titulo: string; archivo: File; portada: File | null },
  alAvanzar?: (pct: number) => void,
): Promise<RegaloVista> {
  const t = validarTitulo(d.titulo)
  if (!t.ok) throw new Error(t.error)
  const e1 = validarArchivoRegalo({ nombre: d.archivo.name, bytes: d.archivo.size })
  if (e1) throw new Error(e1)
  const e2 = d.portada ? validarPortada({ nombre: d.portada.name, bytes: d.portada.size }) : null
  if (e2) throw new Error(e2)

  const init = await fetch(`${base}/subida`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      archivo: { nombre: d.archivo.name, bytes: d.archivo.size },
      portada: d.portada ? { nombre: d.portada.name, bytes: d.portada.size } : null,
    }),
  })
  const ij = await leerJson(init)
  if (!init.ok) throw error(ij, 'No pudimos preparar la subida')
  const slots = ij.data as { archivo: SlotSubida | null; portada: SlotSubida | null }
  if (!slots.archivo) throw new Error('No pudimos preparar la subida')

  const total = d.archivo.size + (d.portada?.size ?? 0)
  let cargadoPortada = 0
  await subirASlot(d.archivo, slots.archivo, n => alAvanzar?.(Math.round(((n + cargadoPortada) / total) * 100)))
  if (d.portada && slots.portada) {
    await subirASlot(d.portada, slots.portada, n => { cargadoPortada = n; alAvanzar?.(Math.round(((d.archivo.size + n) / total) * 100)) })
  }
  return guardar(base, {
    titulo: t.titulo, archivoPath: slots.archivo.path, archivoNombre: d.archivo.name,
    archivoBytes: d.archivo.size, portadaPath: slots.portada?.path ?? null,
  })
}

export async function cambiarTitulo(base: string, actual: RegaloVista, titulo: string): Promise<RegaloVista> {
  return guardar(base, {
    titulo, archivoPath: actual.archivoPath, archivoNombre: actual.archivoNombre,
    archivoBytes: actual.archivoBytes, portadaPath: actual.portadaPath,
  })
}

export async function quitarRegalo(base: string): Promise<void> {
  const res = await fetch(base, { method: 'DELETE' })
  if (!res.ok) throw error(await leerJson(res), 'No pudimos quitar el regalo')
}
