'use client'

/**
 * En Publicado: si el video responde comentarios y dónde se administra. Una vez
 * que salió, la configuración vive en la tarjeta de Reels de la propiedad (ahí
 * se cambia el modo y se ven los comentarios respondidos).
 */
import { useState } from 'react'
import { AlertTriangle, MessageCircle, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { VideoVista } from '@/lib/publicaciones/tipos'
import { api } from './leer-json'

export function EstadoComentarios({ video, onConectado }: { video: VideoVista; onConectado: () => void }) {
  const [conectando, setConectando] = useState(false)
  if (!video.property_id) return null

  const conectar = async () => {
    setConectando(true)
    try {
      const r = await api<{ ok: boolean; error: string | null }>(`/api/publicaciones/videos/${video.id}/conectar`, { method: 'POST' })
      if (r.error) toast.warning(r.error)
      else toast.success('Comentarios conectados')
      onConectado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo conectar')
    } finally {
      setConectando(false)
    }
  }

  return (
    <div className="space-y-1 text-xs">
      {video.reel_id ? (
        <a href={`/properties/${video.property_id}?tab=difusion`} className="inline-flex items-center gap-1 text-primary hover:underline">
          <MessageCircle className="h-3.5 w-3.5" aria-hidden /> Responde comentarios · administralo en la ficha de la propiedad
        </a>
      ) : (
        !video.automatizacion_error && (
          <p className="text-muted-foreground">Los comentarios se conectan apenas sale en Instagram o Facebook.</p>
        )
      )}
      {video.automatizacion_error && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-start gap-1 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {video.automatizacion_error}
          </span>
          <Button size="sm" variant="outline" className="h-7" disabled={conectando} onClick={() => void conectar()}>
            <RotateCcw className="mr-1 h-3 w-3" aria-hidden /> Conectar de nuevo
          </Button>
        </div>
      )}
    </div>
  )
}
