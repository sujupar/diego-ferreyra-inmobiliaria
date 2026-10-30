'use client'

/**
 * Lo que ya salió (con el enlace a cada red) y lo que falló (con el motivo y
 * "Reintentar"), de los últimos 60 días. Filtros por red y por fecha.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { aHoraArgentina } from '@/lib/publicaciones/calendario'
import type { EnvioFila, Plataforma, VideoVista } from '@/lib/publicaciones/tipos'
import { EstadoRedes } from './EstadoRedes'
import { Miniatura } from './FilaVideo'
import { diaLargo } from './formato'
import { REDES } from './IconosRedes'
import { api } from './leer-json'

type VideoPublicado = VideoVista & { envios: EnvioFila[] }

const REDES_FASE: Plataforma[] = ['instagram', 'facebook']
const PERIODOS = [
  { dias: 7, etiqueta: 'Últimos 7 días' },
  { dias: 30, etiqueta: 'Últimos 30 días' },
  { dias: 60, etiqueta: 'Últimos 60 días' },
]

export function PestanaPublicado() {
  const [videos, setVideos] = useState<VideoPublicado[] | null>(null)
  const [red, setRed] = useState<Plataforma | 'todas'>('todas')
  const [dias, setDias] = useState(30)
  const [reintentando, setReintentando] = useState<string | null>(null)

  const cargar = useCallback(
    () =>
      api<{ videos: VideoPublicado[] }>('/api/publicaciones/publicado')
        .then((r) => setVideos(r.videos))
        .catch((e: unknown) => {
          toast.error(e instanceof Error ? e.message : 'No se pudo cargar lo publicado')
          setVideos((v) => v ?? [])
        }),
    [],
  )

  useEffect(() => {
    void cargar()
  }, [cargar])

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

  const visibles = useMemo(() => {
    const desde = Date.now() - dias * 86_400_000
    return (videos ?? [])
      .map((v) => ({
        ...v,
        envios: v.envios.filter((e) => (red === 'todas' || e.plataforma === red) && Date.parse(e.updated_at) >= desde),
      }))
      .filter((v) => v.envios.length > 0)
  }, [videos, red, dias])

  if (videos === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Red"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={red}
          onChange={(e) => setRed(e.target.value as Plataforma | 'todas')}
        >
          <option value="todas">Todas las redes</option>
          {REDES_FASE.map((p) => (
            <option key={p} value={p}>
              {REDES[p].nombre}
            </option>
          ))}
        </select>
        <select
          aria-label="Período"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={dias}
          onChange={(e) => setDias(Number(e.target.value))}
        >
          {PERIODOS.map((p) => (
            <option key={p.dias} value={p.dias}>
              {p.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <CheckCircle2 className="h-8 w-8" aria-hidden />
          <p>Todavía no se publicó nada en este período.</p>
          <p className="text-sm">Cuando un video salga, acá vas a ver en qué redes y el enlace a cada una.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visibles.map((v) => {
            const ultimo = v.envios
              .filter((e) => e.estado === 'publicado')
              .map((e) => e.updated_at)
              .sort()
              .pop()
            return (
              <li key={v.id} className="flex items-start gap-3 rounded-lg border bg-card p-3">
                <Miniatura url={v.miniatura_url} nombre={v.nombre_archivo} className="h-24 w-14" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm font-medium">
                    {ultimo ? `Salió el ${diaLargo(ultimo)} a las ${aHoraArgentina(new Date(ultimo)).hora}` : 'Sin publicar todavía'}
                  </p>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{v.descripcion || v.nombre_archivo}</p>
                  <EstadoRedes
                    envios={v.envios}
                    video={v}
                    automatica
                    reintentando={reintentando}
                    onReintentar={(e) => void reintentar(e)}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
