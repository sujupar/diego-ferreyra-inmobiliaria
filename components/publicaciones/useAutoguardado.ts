'use client'

/**
 * Autoguardado de los videos: cada cambio espera 800 ms de quietud y se manda
 * junto con los otros cambios pendientes de ESE video. Las reglas de orden,
 * reintento y "no seguir si algo no se guardó" viven en `ColaDeGuardado`
 * (lib/publicaciones/cola-guardado.ts, con pruebas).
 */
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ColaDeGuardado, type Campos } from '@/lib/publicaciones/cola-guardado'
import { api } from './leer-json'

export const ESPERA_AUTOGUARDADO_MS = 800
/** Tras un fallo se reintenta solo: la persona no tiene que hacer nada. */
const REINTENTO_MS = 5_000

export type EstadoGuardado = 'guardado' | 'guardando' | 'error'

function patch(videoId: string, campos: Campos, keepalive = false) {
  return api(`/api/publicaciones/videos/${videoId}`, { method: 'PATCH', body: campos, keepalive }).then(() => {})
}

export function useAutoguardado() {
  const [estado, setEstado] = useState<EstadoGuardado>('guardado')
  // Inicialización perezosa: una sola cola y un solo mapa de esperas por pantalla.
  const [cola] = useState(() => new ColaDeGuardado((id, campos) => patch(id, campos)))
  const [timers] = useState(() => new Map<string, ReturnType<typeof setTimeout>>())

  const enviar = useCallback(
    (primero: string) => {
      const mandar = (videoId: string) => {
        timers.delete(videoId)
        setEstado('guardando')
        cola
          .enviar(videoId)
          .then(() => {
            if (!cola.hayPendientes()) setEstado('guardado')
          })
          .catch((e: unknown) => {
            setEstado('error')
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
            // Los cambios quedaron pendientes en la cola: se vuelven a mandar solos.
            if (!timers.has(videoId)) timers.set(videoId, setTimeout(() => mandar(videoId), REINTENTO_MS))
          })
      }
      mandar(primero)
    },
    [cola, timers],
  )

  const guardar = useCallback(
    (videoId: string, campos: Campos) => {
      cola.agregar(videoId, campos)
      setEstado('guardando')
      const t = timers.get(videoId)
      if (t) clearTimeout(t)
      timers.set(
        videoId,
        setTimeout(() => enviar(videoId), ESPERA_AUTOGUARDADO_MS),
      )
    },
    [cola, timers, enviar],
  )

  /** Manda YA lo pendiente y espera. Tira si algo no se guardó: el que llama no sigue. */
  const vaciar = useCallback(async () => {
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
    setEstado('guardando')
    try {
      await cola.vaciar()
      setEstado('guardado')
    } catch (e) {
      setEstado('error')
      throw e
    }
  }, [cola, timers])

  useEffect(() => {
    const alSalir = () => {
      // Al cerrar la pestaña no hay tiempo de esperar a la cola: lo pendiente se
      // manda con keepalive para que sobreviva al cierre.
      for (const id of cola.idsPendientes()) {
        const campos = cola.tomarPendiente(id)
        if (campos) void patch(id, campos, true).catch(() => {})
      }
    }
    const avisarAntesDeCerrar = (e: BeforeUnloadEvent) => {
      if (cola.hayPendientes()) e.preventDefault()
    }
    window.addEventListener('pagehide', alSalir)
    window.addEventListener('beforeunload', avisarAntesDeCerrar)
    return () => {
      window.removeEventListener('pagehide', alSalir)
      window.removeEventListener('beforeunload', avisarAntesDeCerrar)
      for (const t of timers.values()) clearTimeout(t)
      alSalir()
    }
  }, [cola, timers])

  return { guardar, vaciar, estado }
}
