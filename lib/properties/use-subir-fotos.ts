'use client'

/**
 * Subida de fotos de una propiedad, sacada de `PhotoGallery` para que la ficha
 * pueda ofrecerla desde ARRIBA (el bloque "Todavía no hay fotos" y el aviso de
 * próximo paso) y no solo desde adentro de la pestaña Multimedia.
 *
 * POR QUÉ vive acá y no en el componente de la galería:
 *
 * 1. `components/ui/tabs.tsx` es radix SIN `forceMount`: el contenido de una
 *    pestaña inactiva se DESMONTA. Un `ref` apuntando hacia abajo (a la galería)
 *    sería `null` para el usuario parado en la sub-pestaña "Planos" — o en
 *    cualquier pestaña que no sea Multimedia.
 * 2. El diálogo de archivos solo se abre si `.click()` corre con la activación
 *    transitoria del usuario (dentro del propio `onClick`). Montar el input y
 *    clickearlo después, en un `useEffect`, NO abre nada y el navegador no avisa:
 *    el síntoma es otra vez "toco el botón y no pasa nada".
 *
 * De ahí las dos reglas del contrato: el `<input>` se renderiza donde NUNCA se
 * desmonte, y `abrirSelector` se llama sincrónico desde el `onClick`.
 */

import { useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { toast } from 'sonner'

export interface SubidaDeFotos {
  /**
   * Para esparcir sobre un `<input>` SIEMPRE montado (fuera de las pestañas).
   * Va como objeto entero, y no como props sueltas, para que nadie se olvide el
   * `accept` o el `multiple` al copiarlo a otra pantalla.
   */
  inputProps: {
    ref: RefObject<HTMLInputElement | null>
    type: 'file'
    accept: string
    multiple: boolean
    className: string
    onChange: (e: ChangeEvent<HTMLInputElement>) => void
  }
  /**
   * Abre el selector de archivos. DEBE llamarse SINCRÓNICO desde un `onClick`:
   * diferirlo (a un `useEffect`, un `setTimeout`, un `await`) pierde la
   * activación del usuario y el navegador ignora el `.click()` en silencio.
   */
  abrirSelector: () => void
  subiendo: boolean
  /** 0-100. Solo tiene sentido mientras `subiendo` es true. */
  progreso: number
}

export function useSubirFotos(propertyId: string, onChanged: () => void): SubidaDeFotos {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFiles(fileList: FileList) {
    const list = Array.from(fileList)
    if (list.length === 0) return
    const total = list.length
    setUploading(true); setProgress(0)
    const t = toast.loading(`Subiendo ${total} foto(s)…`)
    const CHUNK = 30
    const chunks: File[][] = []
    for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK))
    let totalDone = 0
    let totalOk = 0
    try {
      for (const group of chunks) {
        const initRes = await fetch(`/api/properties/${propertyId}/media/upload-init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'photo', files: group.map(f => ({ fileName: f.name, fileSize: f.size, contentType: f.type })) }),
        })
        const initData = await initRes.json().catch(() => ({}))
        if (!initRes.ok) { toast.error(initData?.error || 'No se pudo iniciar la subida', { id: t }); return }
        const uploads = initData.uploads as Array<{ signedUrl: string; token: string; publicUrl: string }>
        // Slots por índice: preservan el orden de selección sin importar el orden de finalización.
        const slots: (string | null)[] = new Array(uploads.length).fill(null)
        await Promise.all(uploads.map((u, i) => new Promise<void>((resolve) => {
          const xhr = new XMLHttpRequest()
          xhr.open('PUT', u.signedUrl, true)
          xhr.setRequestHeader('Content-Type', group[i].type || 'application/octet-stream')
          xhr.setRequestHeader('x-upsert', 'true')
          if (u.token) xhr.setRequestHeader('Authorization', `Bearer ${u.token}`)
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) slots[i] = u.publicUrl
            totalDone++; setProgress(Math.round((totalDone / total) * 100))
            toast.loading(`Subiendo ${totalDone}/${total}…`, { id: t })
            resolve()
          }
          xhr.onerror = () => { totalDone++; resolve() }
          xhr.send(group[i])
        })))
        const okUrls = slots.filter((u): u is string => u !== null)
        if (okUrls.length > 0) {
          const commitRes = await fetch(`/api/properties/${propertyId}/media/commit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'photo', urls: okUrls }),
          })
          if (!commitRes.ok) { const d = await commitRes.json().catch(() => ({})); toast.error(d?.error || 'No se pudieron registrar las fotos', { id: t }); return }
          totalOk += okUrls.length
        }
      }
      if (totalOk === 0) { toast.error('No se pudo subir ninguna foto', { id: t }); return }
      const failed = total - totalOk
      toast.success(failed > 0 ? `${totalOk} subidas · ${failed} fallaron` : `${totalOk} foto(s) subida(s)`, { id: t })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir', { id: t })
    } finally {
      setUploading(false); setProgress(0)
      if (inputRef.current) inputRef.current.value = ''
      if (totalOk > 0) onChanged()
    }
  }

  return {
    inputProps: {
      ref: inputRef,
      type: 'file',
      accept: 'image/*',
      multiple: true,
      className: 'hidden',
      onChange: e => { if (e.target.files) uploadFiles(e.target.files) },
    },
    abrirSelector: () => inputRef.current?.click(),
    subiendo: uploading,
    progreso: progress,
  }
}
