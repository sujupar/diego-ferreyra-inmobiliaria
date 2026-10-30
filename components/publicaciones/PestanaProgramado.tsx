'use client'

/**
 * Lo que está programado, agrupado por día. Se puede seguir editando mientras
 * ninguna red haya empezado a publicarlo.
 */
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, Loader2, Pause, Play, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { EnvioFila, VideoProgramado } from '@/lib/publicaciones/tipos'
import { FilaRevision, type CambiosVideo } from './FilaRevision'
import { diaLargo } from './formato'
import { api } from './leer-json'
import { useAutoguardado } from './useAutoguardado'

const ARRANCADOS = new Set(['en_curso', 'publicado'])

export function PestanaProgramado() {
  const [videos, setVideos] = useState<VideoProgramado[] | null>(null)
  const [automatica, setAutomatica] = useState(true)
  const [reintentando, setReintentando] = useState<string | null>(null)
  const autoguardado = useAutoguardado()

  const cargar = useCallback(
    () =>
      api<{ videos: VideoProgramado[]; publicacion_automatica: boolean }>('/api/publicaciones/programado')
        .then((r) => {
          setVideos(r.videos)
          setAutomatica(r.publicacion_automatica)
        })
        .catch((e: unknown) => {
          toast.error(e instanceof Error ? e.message : 'No se pudo cargar lo programado')
          setVideos((v) => v ?? [])
        }),
    [],
  )

  useEffect(() => {
    void cargar()
  }, [cargar])

  const cambiar = async (v: VideoProgramado, campos: CambiosVideo) => {
    const marca = {
      ...(campos.descripcion !== undefined ? { descripcion_editada: true } : {}),
      ...(campos.titulo_youtube !== undefined ? { titulo_editado: true } : {}),
    }
    setVideos((prev) => (prev ?? []).map((x) => (x.id === v.id ? { ...x, ...campos, ...marca } : x)))
    autoguardado.guardar(v.id, campos)
    // Cambiar redes o pausar crea/cancela envíos: se recarga para mostrar el estado real.
    if (campos.redes || campos.pausado !== undefined || campos.programado_para) {
      try {
        await autoguardado.vaciar()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
      }
      await cargar()
    }
  }

  const reintentar = async (e: EnvioFila) => {
    setReintentando(e.id)
    try {
      await api(`/api/publicaciones/envios/${e.id}/reintentar`, { method: 'POST' })
      toast.success('Se vuelve a intentar en la próxima vuelta (2 minutos)')
      await cargar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo reintentar')
    } finally {
      setReintentando(null)
    }
  }

  const sacar = async (v: VideoProgramado) => {
    if (!window.confirm(`¿Sacar "${v.nombre_archivo}" del calendario? Se borra el video de la plataforma.`)) return
    try {
      await api(`/api/publicaciones/videos/${v.id}`, { method: 'DELETE' })
      setVideos((prev) => (prev ?? []).filter((x) => x.id !== v.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo sacar')
    }
  }

  if (videos === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    )
  }

  const porDia = new Map<string, VideoProgramado[]>()
  for (const v of videos) {
    const dia = v.programado_para ? diaLargo(v.programado_para) : 'Sin fecha'
    porDia.set(dia, [...(porDia.get(dia) ?? []), v])
  }

  return (
    <div className="space-y-5">
      {!automatica && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          La publicación automática está apagada: nada se va a publicar hasta que la prendas en Ajustes.
        </div>
      )}

      {videos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <CalendarClock className="h-8 w-8" aria-hidden />
          <p>No hay nada programado.</p>
        </div>
      ) : (
        [...porDia.entries()].map(([dia, lista]) => (
          <section key={dia} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">{dia}</h3>
            <ul className="space-y-2">
              {lista.map((v) => {
                const editable = !v.envios.some((e) => ARRANCADOS.has(e.estado))
                return (
                  <FilaRevision
                    key={v.id}
                    video={v}
                    envios={v.envios}
                    editable={editable}
                    onCambio={(c) => void cambiar(v, c)}
                    estadoRedes={{ automatica, reintentando, onReintentar: (e) => void reintentar(e) }}
                    acciones={
                      editable && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => void cambiar(v, { pausado: !v.pausado })}>
                            {v.pausado ? (
                              <>
                                <Play className="mr-1 h-3.5 w-3.5" aria-hidden /> Reanudar
                              </>
                            ) : (
                              <>
                                <Pause className="mr-1 h-3.5 w-3.5" aria-hidden /> Pausar
                              </>
                            )}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void sacar(v)}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Sacar del calendario
                          </Button>
                        </>
                      )
                    }
                  />
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
