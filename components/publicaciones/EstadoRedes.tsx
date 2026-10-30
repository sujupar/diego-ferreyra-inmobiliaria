'use client'

/**
 * El estado de cada red de un video: Programado / Publicando / Publicado (con
 * enlace) / Falló (con motivo y Reintentar) / Cancelado, y la línea que explica
 * por qué no salió todavía ("Esperando: publicación automática apagada").
 */
import { ExternalLink, Loader2, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { motivoEnPantalla } from '@/lib/publicaciones/publicador/maquina'
import type { EnvioFila, VideoVista } from '@/lib/publicaciones/tipos'
import { REDES } from './IconosRedes'

const ETIQUETA: Record<string, string> = {
  programado: 'Programado',
  en_curso: 'Publicando',
  publicado: 'Publicado',
  fallido: 'Falló',
  cancelado: 'Cancelado',
}

interface Props {
  envios: EnvioFila[]
  video: Pick<VideoVista, 'programado_para'>
  automatica: boolean
  reintentando?: string | null
  onReintentar?: (envio: EnvioFila) => void
}

export function EstadoRedes({ envios, video, automatica, reintentando, onReintentar }: Props) {
  const ahora = new Date()
  const ordenados = [...envios].sort((a, b) => a.plataforma.localeCompare(b.plataforma))
  return (
    <ul className="space-y-1">
      {ordenados.map((e) => {
        const nombre = REDES[e.plataforma].nombre.replace(' (borrador)', '')
        const motivo = motivoEnPantalla(e, video, automatica, ahora)
        return (
          <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
            <Badge
              variant={e.estado === 'fallido' ? 'destructive' : e.estado === 'cancelado' ? 'outline' : 'secondary'}
              className="text-[11px]"
            >
              {e.estado === 'en_curso' && automatica && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
              {/* Con el interruptor apagado no hay nada "publicándose", aunque haya quedado a mitad. */}
              {nombre}: {e.estado === 'en_curso' && !automatica ? 'Programado' : (ETIQUETA[e.estado] ?? e.estado)}
            </Badge>
            {e.estado === 'publicado' && e.enlace && (
              <a href={e.enlace} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                Ver en {nombre} <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
            {motivo && motivo !== 'Publicando…' && <span className="text-muted-foreground">{motivo}</span>}
            {e.estado === 'fallido' && onReintentar && (
              <Button size="sm" variant="outline" className="h-7" disabled={reintentando === e.id} onClick={() => onReintentar(e)}>
                <RotateCcw className="mr-1 h-3 w-3" aria-hidden /> Reintentar
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
