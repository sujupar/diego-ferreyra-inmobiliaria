'use client'
/**
 * Lo que la pantalla del informe le pide al servidor. Cada función devuelve el dato o tira un
 * Error con el mensaje para mostrar (las rutas ya lo dan en castellano). Los archivos (capturas y
 * PDF) van DIRECTO a Storage con URL firmada; nunca pasan por el body de Next.
 */
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { competidoraDesdeAviso, esAvisoDelScraper } from '@/lib/informes/editor'
import type { VistaInforme } from '@/lib/informes/servicio'
import type { Capturas, Competidora, FuenteGuardada, Manual, NombreCaptura, NombreFuente } from '@/lib/informes/tipos'

interface Slot { signedUrl: string; token: string; path: string }

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error('No hay conexión. Probá de nuevo.')
  }
  const r = await leerRespuesta<T>(res)
  if (!r.ok) throw new Error(r.error)
  return r.data
}

const json = (method: string, cuerpo?: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
})

const base = (id: string) => `/api/informes/${encodeURIComponent(id)}`

export const leerVista = (id: string) => pedir<VistaInforme>(base(id))

export const traerFuente = (id: string, nombre: NombreFuente) =>
  pedir<FuenteGuardada<unknown>>(`${base(id)}/fuentes/${nombre}`, json('POST'))

/** El servidor reemplaza `manual` ENTERO: siempre se manda el objeto completo. */
export const guardarManual = (id: string, manual: Manual) => pedir<{ ok: true }>(base(id), json('PATCH', { manual }))

/** La plataforma escribe los textos (una llamada al modelo). Devuelve el `manual` con los textos nuevos. */
export const escribirTextos = (id: string, forzar: boolean) =>
  pedir<{ manual: Manual }>(`${base(id)}/textos`, json('POST', { forzar }))

export const guardarCompetidoras = (id: string, competidoras: Competidora[]) =>
  pedir<{ ok: true }>(base(id), json('PATCH', { competidoras }))

function subirASlot(archivo: Blob, slot: Slot, tipo: string): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', slot.signedUrl, true)
    xhr.setRequestHeader('Content-Type', tipo)
    xhr.setRequestHeader('x-upsert', 'true')
    if (slot.token) xhr.setRequestHeader('Authorization', `Bearer ${slot.token}`)
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolver() : rechazar(new Error(`La subida falló (HTTP ${xhr.status})`)))
    xhr.onerror = () => rechazar(new Error('Se cortó la conexión durante la subida'))
    xhr.send(archivo)
  })
}

export async function subirCaptura(id: string, cual: NombreCaptura, archivo: File): Promise<Capturas> {
  const url = `${base(id)}/capturas/${cual}`
  const slot = await pedir<Slot>(url, json('POST', { nombre: archivo.name, bytes: archivo.size }))
  await subirASlot(archivo, slot, archivo.type || 'image/png')
  return pedir<Capturas>(url, json('PUT', { path: slot.path }))
}

export const quitarCaptura = (id: string, cual: NombreCaptura) => pedir<Capturas>(`${base(id)}/capturas/${cual}`, json('DELETE'))

/**
 * Sube el PDF generado y cierra el informe. El servidor revisa los bytes, que no falte nada, y que
 * `version` (el updated_at del informe con el que se armó el PDF) siga siendo la vigente.
 */
export async function subirPdfYMarcarListo(id: string, pdf: Blob, version: string): Promise<void> {
  const slot = await pedir<Slot>(`${base(id)}/pdf`, json('POST'))
  await subirASlot(pdf, slot, 'application/pdf')
  await pedir<{ ok: true }>(`${base(id)}/listo`, json('POST', { pdfPath: slot.path, version }))
}

export const volverABorrador = (id: string) => pedir<{ ok: true }>(`${base(id)}/listo`, json('DELETE'))

/**
 * Completa una competidora con el scraper de portales (el mismo de las tasaciones). Esa ruta
 * responde el aviso SIN el sobre `{ data }`, por eso no pasa por `pedir`.
 */
export async function buscarCompetidora(link: string): Promise<Competidora> {
  let res: Response
  try {
    res = await fetch('/api/scrape', json('POST', { url: link }))
  } catch {
    throw new Error('No hay conexión. Probá de nuevo.')
  }
  let cuerpo: unknown = null
  try { cuerpo = await res.json() } catch { /* HTML de error del gateway */ }
  if (!res.ok || !esAvisoDelScraper(cuerpo)) {
    throw new Error(res.status === 504
      ? 'El portal tardó demasiado. Probá de nuevo o completala a mano.'
      : 'No pudimos leer ese aviso. Completala a mano.')
  }
  return competidoraDesdeAviso(link, cuerpo)
}
