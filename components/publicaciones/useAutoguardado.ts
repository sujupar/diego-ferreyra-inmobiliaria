'use client'

/**
 * Autoguardado de los videos: cada cambio espera 800 ms de quietud y se manda
 * junto con los otros cambios pendientes de ESE video (un PATCH, no uno por tecla).
 * Al cerrar la pestaña se manda lo pendiente con `keepalive`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api } from './leer-json'

export const ESPERA_AUTOGUARDADO_MS = 800

export type EstadoGuardado = 'guardado' | 'guardando' | 'error'
type Campos = Record<string, unknown>

export function useAutoguardado(onError?: (videoId: string) => void) {
  const pendientes = useRef(new Map<string, Campos>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const enVuelo = useRef(0)
  const [estado, setEstado] = useState<EstadoGuardado>('guardado')

  const enviar = useCallback(
    async (videoId: string, keepalive = false) => {
      const campos = pendientes.current.get(videoId)
      timers.current.delete(videoId)
      if (!campos) return
      pendientes.current.delete(videoId)
      enVuelo.current++
      setEstado('guardando')
      try {
        await api(`/api/publicaciones/videos/${videoId}`, { method: 'PATCH', body: campos, keepalive })
        enVuelo.current--
        if (enVuelo.current === 0 && pendientes.current.size === 0) setEstado('guardado')
      } catch (e) {
        enVuelo.current--
        setEstado('error')
        toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
        onError?.(videoId)
      }
    },
    [onError],
  )

  const guardar = useCallback(
    (videoId: string, campos: Campos) => {
      pendientes.current.set(videoId, { ...(pendientes.current.get(videoId) ?? {}), ...campos })
      setEstado('guardando')
      const t = timers.current.get(videoId)
      if (t) clearTimeout(t)
      timers.current.set(
        videoId,
        setTimeout(() => void enviar(videoId), ESPERA_AUTOGUARDADO_MS),
      )
    },
    [enviar],
  )

  /** Manda YA lo pendiente (antes de cambiar de paso o confirmar). */
  const vaciar = useCallback(async () => {
    const ids = [...pendientes.current.keys()]
    for (const id of ids) {
      const t = timers.current.get(id)
      if (t) clearTimeout(t)
    }
    await Promise.all(ids.map((id) => enviar(id)))
  }, [enviar])

  useEffect(() => {
    const alSalir = () => {
      for (const id of [...pendientes.current.keys()]) void enviar(id, true)
    }
    window.addEventListener('pagehide', alSalir)
    return () => {
      window.removeEventListener('pagehide', alSalir)
      alSalir()
    }
  }, [enviar])

  return { guardar, vaciar, estado }
}
