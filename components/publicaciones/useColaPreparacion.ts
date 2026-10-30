'use client'

/**
 * Cola que prepara los videos: de a 2 a la vez, cada uno hace su cadena entera
 *   subir → miniatura + audio → (servidor) transcribir → (servidor) describir
 * y avisa cada cambio con `onVideo`. Lo que se cae en el navegador queda como
 * error LOCAL con "Reintentar" (la base no se toca: al recargar, sigue de ahí).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { extraerAudio, extraerMiniatura } from '@/lib/publicaciones/navegador/medios'
import { reintentar as etapaDeReintento } from '@/lib/publicaciones/preparacion'
import type { VideoVista } from '@/lib/publicaciones/tipos'
import { api, subirConProgreso } from './leer-json'

export const EN_PARALELO = 2

export interface EspacioSubida {
  signedUrl: string
  path: string
}

interface Opciones {
  videos: VideoVista[]
  archivos: Map<string, File>
  espacios: Map<string, EspacioSubida>
  onVideo: (v: VideoVista) => void
}

function necesitaTrabajo(v: VideoVista, archivos: Map<string, File>): boolean {
  if (v.etapa === 'subiendo') return archivos.has(v.id)
  return v.etapa === 'extrayendo' || v.etapa === 'transcribiendo' || v.etapa === 'describiendo'
}

function sinClave<T>(obj: Record<string, T>, clave: string): Record<string, T> {
  const copia = { ...obj }
  delete copia[clave]
  return copia
}

function tipoDe(archivo: File): string {
  if (archivo.type) return archivo.type
  return archivo.name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4'
}

export function useColaPreparacion({ videos, archivos, espacios, onVideo }: Opciones) {
  const [progreso, setProgreso] = useState<Record<string, number>>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const enCurso = useRef(new Set<string>())
  const onVideoRef = useRef(onVideo)
  onVideoRef.current = onVideo
  const [vuelta, setVuelta] = useState(0)

  const procesar = useCallback(
    async (inicial: VideoVista) => {
      let v = inicial
      const patch = async (campos: Record<string, unknown>) => {
        const r = await api<{ video: VideoVista }>(`/api/publicaciones/videos/${v.id}`, { method: 'PATCH', body: campos })
        v = r.video
        onVideoRef.current(v)
      }
      const subirArchivo = async (kind: 'miniatura' | 'audio', blob: Blob, tipo: string) => {
        const e = await api<{ signedUrl: string; path: string }>(`/api/publicaciones/videos/${v.id}/archivos`, {
          method: 'POST',
          body: { kind },
        })
        await subirConProgreso(e.signedUrl, blob, tipo)
        return e.path
      }

      if (v.etapa === 'subiendo') {
        const archivo = archivos.get(v.id)
        if (!archivo) return
        let espacio = espacios.get(v.id)
        if (!espacio) {
          espacio = await api<EspacioSubida>(`/api/publicaciones/videos/${v.id}/archivos`, {
            method: 'POST',
            body: { kind: 'video' },
          })
        }
        espacios.delete(v.id)
        await subirConProgreso(espacio.signedUrl, archivo, tipoDe(archivo), (p) =>
          setProgreso((prev) => ({ ...prev, [v.id]: p })),
        )
        await patch({ etapa: 'extrayendo' })
      }

      if (v.etapa === 'extrayendo') {
        const fuente: File | string | null = archivos.get(v.id) ?? v.video_url
        if (!fuente) throw new Error('No encuentro el video para sacarle el audio')
        const mini = await extraerMiniatura(fuente)
        const miniatura_path = await subirArchivo('miniatura', mini.jpeg, 'image/jpeg')
        const audio = await extraerAudio(fuente)
        const audio_path = await subirArchivo('audio', audio, 'audio/wav')
        await patch({
          miniatura_path,
          audio_path,
          duracion_seg: Math.round(mini.duracionSeg * 10) / 10,
          etapa: 'transcribiendo',
        })
      }

      // Servidor: una etapa por llamada hasta que termine.
      for (let i = 0; i < 6 && (v.etapa === 'transcribiendo' || v.etapa === 'describiendo'); i++) {
        const r = await api<{ video: VideoVista }>(`/api/publicaciones/videos/${v.id}/preparar`, { method: 'POST' })
        const avanzó = r.video.etapa !== v.etapa
        v = r.video
        onVideoRef.current(v)
        if (!avanzó && (v.etapa === 'transcribiendo' || v.etapa === 'describiendo')) {
          throw new Error('El servidor no pudo avanzar este video. Tocá Reintentar.')
        }
      }
    },
    [archivos, espacios],
  )

  useEffect(() => {
    const libres = EN_PARALELO - enCurso.current.size
    if (libres <= 0) return
    const siguientes = videos
      .filter((v) => !enCurso.current.has(v.id) && !errores[v.id] && necesitaTrabajo(v, archivos))
      .slice(0, libres)
    for (const v of siguientes) {
      enCurso.current.add(v.id)
      procesar(v)
        .catch((e: unknown) => {
          // Los mensajes de la API y de medios.ts ya vienen legibles.
          setErrores((prev) => ({ ...prev, [v.id]: e instanceof Error ? e.message : 'No se pudo preparar' }))
        })
        .finally(() => {
          enCurso.current.delete(v.id)
          setProgreso((prev) => sinClave(prev, v.id))
          setVuelta((n) => n + 1)
        })
    }
  }, [videos, archivos, errores, procesar, vuelta])

  /** "Reintentar": borra el error local y, si el servidor lo marcó en error, lo devuelve a su etapa. */
  const reintentar = useCallback(async (v: VideoVista) => {
    setErrores((prev) => sinClave(prev, v.id))
    if (v.etapa === 'error') {
      try {
        const r = await api<{ video: VideoVista }>(`/api/publicaciones/videos/${v.id}`, {
          method: 'PATCH',
          body: { etapa: etapaDeReintento(v) },
        })
        onVideoRef.current(r.video)
      } catch (e) {
        setErrores((prev) => ({ ...prev, [v.id]: e instanceof Error ? e.message : 'No se pudo reintentar' }))
      }
    }
  }, [])

  return { progreso, errores, reintentar, trabajando: enCurso.current.size > 0 }
}
