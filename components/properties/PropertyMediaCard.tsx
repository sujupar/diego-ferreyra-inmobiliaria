'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, Film, Globe, Layers, Loader2, Upload, Trash2, Check, ExternalLink, Video } from 'lucide-react'
import { PhotoGallery } from './PhotoGallery'
import { PlansPanel } from './PlansPanel'

interface Props {
  propertyId: string
  photos: string[]
  plans: string[]
  videoFileUrl: string | null
  tourUrl: string | null
  videoRecorridoUrl?: string | null
  onChanged: () => void
}

export function PropertyMediaCard({ propertyId, photos, plans, videoFileUrl, tourUrl, videoRecorridoUrl, onChanged }: Props) {
  const videoInput = useRef<HTMLInputElement>(null)
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [tourValue, setTourValue] = useState(tourUrl || '')
  const [savingTour, setSavingTour] = useState(false)
  const [recorridoValue, setRecorridoValue] = useState(videoRecorridoUrl || '')
  const [savingRecorrido, setSavingRecorrido] = useState(false)

  useEffect(() => { setTourValue(tourUrl || '') }, [tourUrl])
  useEffect(() => { setRecorridoValue(videoRecorridoUrl || '') }, [videoRecorridoUrl])

  async function uploadVideo(file: File) {
    setVideoUploading(true); setVideoProgress(0)
    const t = toast.loading(`Subiendo video (${(file.size / 1024 / 1024).toFixed(1)} MB)…`)
    try {
      const initRes = await fetch(`/api/properties/${propertyId}/media/upload-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'video', files: [{ fileName: file.name, fileSize: file.size, contentType: file.type }] }),
      })
      const initData = await initRes.json().catch(() => ({}))
      if (!initRes.ok) { toast.error(initData?.error || 'No se pudo iniciar la subida', { id: t }); return }
      const u = initData.uploads[0] as { signedUrl: string; token: string; publicUrl: string }
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', u.signedUrl, true)
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
        xhr.setRequestHeader('x-upsert', 'true')
        if (u.token) xhr.setRequestHeader('Authorization', `Bearer ${u.token}`)
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) { const p = Math.round((e.loaded / e.total) * 100); setVideoProgress(p); toast.loading(`Subiendo video — ${p}%`, { id: t }) }
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Error de red'))
        xhr.send(file)
      })
      const commitRes = await fetch(`/api/properties/${propertyId}/media/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'video', url: u.publicUrl }),
      })
      if (!commitRes.ok) { const d = await commitRes.json().catch(() => ({})); console.warn('[PropertyMediaCard] video subido pero commit falló (queda huérfano en Storage):', u.publicUrl); toast.error(d?.error || 'No se pudo registrar el video', { id: t }); return }
      toast.success('Video subido', { id: t })
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir video', { id: t })
    } finally {
      setVideoUploading(false); setVideoProgress(0)
      if (videoInput.current) videoInput.current.value = ''
    }
  }

  async function removeVideo() {
    if (!confirm('¿Quitar el video?')) return
    try {
      const res = await fetch(`/api/properties/${propertyId}/media`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video_file_url: null }),
      })
      if (!res.ok) throw new Error()
      toast.success('Video quitado'); onChanged()
    } catch { toast.error('No se pudo quitar el video') }
  }

  async function saveTour() {
    setSavingTour(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/media`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tour_3d_url: tourValue.trim() || null }),
      })
      if (!res.ok) throw new Error()
      toast.success(tourValue.trim() ? 'Recorrido guardado' : 'Recorrido quitado'); onChanged()
    } catch { toast.error('No se pudo guardar el recorrido') } finally { setSavingTour(false) }
  }

  async function saveRecorrido() {
    setSavingRecorrido(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/media`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video_recorrido_url: recorridoValue.trim() || null }),
      })
      if (!res.ok) throw new Error()
      toast.success(recorridoValue.trim() ? 'Video recorrido guardado' : 'Video recorrido quitado'); onChanged()
    } catch { toast.error('No se pudo guardar el video recorrido') } finally { setSavingRecorrido(false) }
  }

  const videoBtn = (label: string) => (
    <Button size="sm" variant="outline" onClick={() => videoInput.current?.click()} disabled={videoUploading}>
      {videoUploading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{videoProgress > 0 ? `${videoProgress}%` : '…'}</> : <><Upload className="h-4 w-4 mr-1" />{label}</>}
    </Button>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="display text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          Multimedia
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="fotos">
          {/*
            Las cinco pestañas suman ~487px de ancho mínimo (los rótulos llevan
            `whitespace-nowrap` desde el primitivo) contra los ~334px que hay
            adentro de la tarjeta en un teléfono: "Video recorrido" quedaba FUERA
            del borde y, sin `overflow`, no había forma de llegar a ella.
            Ahora la barra se desliza y la pestaña de más queda cortada a la
            mitad, que es lo que avisa que hay más.

            NO se usa `scroll-x-fade` acá, a diferencia de la barra de secciones
            de la ficha: esa utilidad escribe `background` en forma corta y le
            borraría el `bg-muted` al carril, que es lo único que distingue la
            pestaña activa dentro de la tarjeta blanca. La señal se paga con el
            corte visible en vez de con la sombra.
          */}
          <TabsList data-testid="pestanas-multimedia" className="w-full max-md:h-auto max-md:justify-start max-md:overflow-x-auto">
            <TabsTrigger className="max-md:min-h-11 max-md:shrink-0" value="fotos"><ImageIcon className="h-4 w-4" />Fotos{photos.length > 0 && <span className="tabular-n text-xs">· {photos.length}</span>}</TabsTrigger>
            <TabsTrigger className="max-md:min-h-11 max-md:shrink-0" value="planos"><Layers className="h-4 w-4" />Planos{plans.length > 0 && <span className="tabular-n text-xs">· {plans.length}</span>}</TabsTrigger>
            <TabsTrigger className="max-md:min-h-11 max-md:shrink-0" value="video"><Film className="h-4 w-4" />Video{videoFileUrl && <Check className="h-3.5 w-3.5 text-emerald-600" />}</TabsTrigger>
            <TabsTrigger className="max-md:min-h-11 max-md:shrink-0" value="recorrido"><Globe className="h-4 w-4" />Recorrido{tourUrl && <Check className="h-3.5 w-3.5 text-emerald-600" />}</TabsTrigger>
            <TabsTrigger className="max-md:min-h-11 max-md:shrink-0" value="video-recorrido"><Video className="h-4 w-4" />Video recorrido{videoRecorridoUrl && <Check className="h-3.5 w-3.5 text-emerald-600" />}</TabsTrigger>
          </TabsList>

          <TabsContent value="fotos" className="pt-4">
            <PhotoGallery propertyId={propertyId} photos={photos} onChanged={onChanged} />
          </TabsContent>

          <TabsContent value="planos" className="pt-4">
            <PlansPanel propertyId={propertyId} plans={plans} onChanged={onChanged} />
          </TabsContent>

          <TabsContent value="video" className="pt-4 space-y-3">
            <input ref={videoInput} type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && uploadVideo(e.target.files[0])} />
            {videoFileUrl ? (
              <>
                <video controls preload="metadata" src={videoFileUrl} className="w-full rounded-xl bg-black aspect-video" />
                <div className="flex gap-2">
                  {videoBtn('Reemplazar')}
                  <Button size="sm" variant="outline" onClick={removeVideo}><Trash2 className="h-4 w-4 mr-1" />Quitar</Button>
                </div>
              </>
            ) : (
              <div className="border border-dashed rounded-xl p-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">Subí un video de la propiedad (máx 200 MB).</p>
                {videoBtn('Subir video')}
              </div>
            )}
          </TabsContent>

          <TabsContent value="recorrido" className="pt-4 space-y-3">
            <div className="flex gap-2">
              <input
                value={tourValue}
                onChange={e => setTourValue(e.target.value)}
                placeholder="Pegá el enlace (Matterport, Kuula, 360°…)"
                inputMode="url"
                className="flex-1 min-w-0 rounded-md border px-3 py-2 text-sm max-md:min-h-11"
              />
              <Button size="sm" onClick={saveTour} disabled={savingTour}>
                {savingTour ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
            {tourUrl && (
              <div className="space-y-2">
                <div className="rounded-xl overflow-hidden border aspect-video bg-muted">
                  <iframe src={tourUrl} className="w-full h-full" allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                </div>
                <a href={tourUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />Abrir en pestaña nueva
                </a>
              </div>
            )}
          </TabsContent>

          <TabsContent value="video-recorrido" className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">Video que recorre la propiedad por dentro. NO se muestra en la landing: se le envía a quien se registra.</p>
            <div className="flex gap-2">
              <input
                value={recorridoValue}
                onChange={e => setRecorridoValue(e.target.value)}
                placeholder="https://youtu.be/..."
                inputMode="url"
                className="flex-1 min-w-0 rounded-md border px-3 py-2 text-sm max-md:min-h-11"
              />
              <Button size="sm" onClick={saveRecorrido} disabled={savingRecorrido}>
                {savingRecorrido ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
            {videoRecorridoUrl && (
              <a href={videoRecorridoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />Abrir en pestaña nueva
              </a>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
