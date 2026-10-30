'use client'

/**
 * "Nueva tanda": Cargar → Ritmo → Revisar. Todo se guarda solo en la base, así
 * que cerrar la pestaña a mitad de 20 videos no pierde nada: al volver aparece
 * "Seguir con la tanda del DD/MM".
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { TandaFila, VideoVista } from '@/lib/publicaciones/tipos'
import { TAMANO_MAXIMO } from '@/lib/publicaciones/validacion'
import { fechaCorta } from './formato'
import { api } from './leer-json'
import { PasoCargar } from './PasoCargar'
import { useColaPreparacion, type EspacioSubida } from './useColaPreparacion'

interface Borrador {
  id: string
  created_at: string
  updated_at: string
  videos: number
}

type Paso = 1 | 2 | 3

const PASOS: { n: Paso; titulo: string }[] = [
  { n: 1, titulo: 'Cargar' },
  { n: 2, titulo: 'Ritmo' },
  { n: 3, titulo: 'Revisar' },
]

const clave = (nombre: string, tamano: number) => `${nombre.normalize('NFC')}\u0000${tamano}`

function problemaDeArchivo(f: File): string | null {
  const ext = f.name.toLowerCase().split('.').pop()
  if (ext !== 'mp4' && ext !== 'mov') return `"${f.name}" no es MP4 ni MOV`
  if (f.size <= 0) return `"${f.name}" está vacío`
  if (f.size > TAMANO_MAXIMO) return `"${f.name}" pesa más de 200 MB`
  return null
}

export function NuevaTanda({ onProgramada }: { onProgramada: () => void }) {
  const [borradores, setBorradores] = useState<Borrador[] | null>(null)
  const [tanda, setTanda] = useState<TandaFila | null>(null)
  const [videos, setVideos] = useState<VideoVista[]>([])
  const [paso, setPaso] = useState<Paso>(1)
  const [eligiendo, setEligiendo] = useState(false) // ya pasó la pantalla de "seguir o empezar"
  const [agregando, setAgregando] = useState(false)
  const archivos = useRef(new Map<string, File>())
  const espacios = useRef(new Map<string, EspacioSubida>())

  useEffect(() => {
    api<{ borradores: Borrador[] }>('/api/publicaciones/tandas')
      .then((r) => setBorradores(r.borradores))
      .catch((e: Error) => {
        toast.error(e.message)
        setBorradores([])
      })
  }, [])

  const onVideo = useCallback((v: VideoVista) => {
    setVideos((prev) => prev.map((x) => (x.id === v.id ? v : x)))
  }, [])

  const cola = useColaPreparacion({ videos, archivos: archivos.current, espacios: espacios.current, onVideo })

  const abrir = async (id: string) => {
    try {
      const r = await api<{ tanda: TandaFila; videos: VideoVista[] }>(`/api/publicaciones/tandas/${id}`)
      setTanda(r.tanda)
      setVideos(r.videos)
      setPaso(1)
      setEligiendo(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo abrir la tanda')
    }
  }

  const descartar = async (b: Borrador) => {
    if (!window.confirm(`¿Descartar la tanda del ${fechaCorta(b.created_at)} con ${b.videos} video(s)?`)) return
    try {
      await api(`/api/publicaciones/tandas/${b.id}`, { method: 'DELETE' })
      setBorradores((prev) => (prev ?? []).filter((x) => x.id !== b.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo descartar')
    }
  }

  const elegir = async (lista: File[]) => {
    const validos: File[] = []
    for (const f of lista) {
      const problema = problemaDeArchivo(f)
      if (problema) toast.error(problema)
      else validos.push(f)
    }
    if (validos.length === 0) return
    setAgregando(true)
    try {
      let actual = tanda
      if (!actual) {
        actual = (await api<{ tanda: TandaFila }>('/api/publicaciones/tandas', { method: 'POST' })).tanda
        setTanda(actual)
      }
      // Un archivo que ya estaba a medio subir (se cerró la pestaña) se reengancha, no se duplica.
      const pendientes = new Map(
        videos.filter((v) => v.etapa === 'subiendo' && !archivos.current.has(v.id)).map((v) => [clave(v.nombre_archivo, v.tamano_bytes), v.id]),
      )
      const nuevos: File[] = []
      for (const f of validos) {
        const id = pendientes.get(clave(f.name, f.size))
        if (id) archivos.current.set(id, f)
        else nuevos.push(f)
      }
      if (nuevos.length > 0) {
        const r = await api<{
          videos: { id: string; nombre: string; tamano: number; signedUrl: string; path: string }[]
          repetidos: string[]
        }>(
          `/api/publicaciones/tandas/${actual.id}/videos`,
          {
            method: 'POST',
            body: {
              archivos: nuevos.map((f) => ({
                nombre: f.name,
                tamano: f.size,
                tipo: f.name.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4',
              })),
            },
          },
        )
        const porClave = new Map(nuevos.map((f) => [clave(f.name, f.size), f]))
        for (const v of r.videos) {
          const f = porClave.get(clave(v.nombre, v.tamano))
          if (f) archivos.current.set(v.id, f)
          espacios.current.set(v.id, { signedUrl: v.signedUrl, path: v.path })
        }
        if (r.repetidos.length > 0) toast.info(`Ya está en la tanda: ${r.repetidos.join(', ')}`)
      }
      const det = await api<{ tanda: TandaFila; videos: VideoVista[] }>(`/api/publicaciones/tandas/${actual.id}`)
      setVideos(det.videos)
      setEligiendo(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron agregar los videos')
    } finally {
      setAgregando(false)
    }
  }

  const quitar = async (v: VideoVista) => {
    try {
      await api(`/api/publicaciones/videos/${v.id}`, { method: 'DELETE' })
      archivos.current.delete(v.id)
      setVideos((prev) => prev.filter((x) => x.id !== v.id))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo quitar')
    }
  }

  if (borradores === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando" />
      </div>
    )
  }

  if (!eligiendo && !tanda && borradores.length > 0) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h2 className="text-lg font-semibold">Tenés tandas sin terminar</h2>
        {borradores.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex items-center gap-3 p-4">
              <button className="min-w-0 flex-1 text-left" onClick={() => void abrir(b.id)}>
                <p className="font-medium">Seguir con la tanda del {fechaCorta(b.created_at)}</p>
                <p className="text-sm text-muted-foreground">
                  {b.videos} {b.videos === 1 ? 'video' : 'videos'}
                </p>
              </button>
              <Button onClick={() => void abrir(b.id)}>Seguir</Button>
              <Button size="icon" variant="ghost" aria-label="Descartar tanda" onClick={() => void descartar(b)}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </CardContent>
          </Card>
        ))}
        <Button variant="outline" className="w-full" onClick={() => setEligiendo(true)}>
          Empezar una nueva
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2 text-sm" aria-label="Pasos">
        {PASOS.map((p, i) => {
          const activo = p.n === paso
          const hecho = p.n < paso
          return (
            <li key={p.n} className="flex items-center gap-2">
              {i > 0 && <span className="h-px w-6 bg-border" aria-hidden />}
              <button
                type="button"
                disabled={!hecho}
                onClick={() => setPaso(p.n)}
                aria-current={activo ? 'step' : undefined}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${
                  activo ? 'bg-primary text-primary-foreground' : hecho ? 'bg-muted hover:bg-muted/70' : 'text-muted-foreground'
                }`}
              >
                <span className="font-semibold">{p.n}</span> {p.titulo}
              </button>
            </li>
          )
        })}
      </ol>

      {paso === 1 && (
        <PasoCargar
          videos={videos}
          progreso={cola.progreso}
          errores={cola.errores}
          faltaArchivo={(v) => v.etapa === 'subiendo' && !archivos.current.has(v.id)}
          agregando={agregando}
          onElegir={(l) => void elegir(l)}
          onReintentar={(v) => void cola.reintentar(v)}
          onQuitar={(v) => void quitar(v)}
          onSiguiente={() => setPaso(2)}
        />
      )}
      {paso !== 1 && tanda && (
        <p className="text-sm text-muted-foreground">
          {videos.length} videos en la tanda. ({tanda.id.slice(0, 8)}) — onProgramada: {String(!!onProgramada)}
        </p>
      )}
    </div>
  )
}
