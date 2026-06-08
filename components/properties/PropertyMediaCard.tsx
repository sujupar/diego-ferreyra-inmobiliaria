'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, Film, Globe, Loader2, Upload, Trash2, Check, ExternalLink } from 'lucide-react'
import { PhotoGallery } from './PhotoGallery'

interface Props {
  propertyId: string
  photos: string[]
  videoFileUrl: string | null
  tourUrl: string | null
  onChanged: () => void
}

export function PropertyMediaCard({ propertyId, photos, videoFileUrl, tourUrl, onChanged }: Props) {
  const videoInput = useRef<HTMLInputElement>(null)
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [tourValue, setTourValue] = useState(tourUrl || '')
  const [savingTour, setSavingTour] = useState(false)

  useEffect(() => { setTourValue(tourUrl || '') }, [tourUrl])

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
          <TabsList className="w-full">
            <TabsTrigger value="fotos"><ImageIcon className="h-4 w-4" />Fotos{photos.length > 0 && <span className="tabular-n text-xs">· {photos.length}</span>}</TabsTrigger>
            <TabsTrigger value="video"><Film className="h-4 w-4" />Video{videoFileUrl && <Check className="h-3.5 w-3.5 text-emerald-600" />}</TabsTrigger>
            <TabsTrigger value="recorrido"><Globe className="h-4 w-4" />Recorrido{tourUrl && <Check className="h-3.5 w-3.5 text-emerald-600" />}</TabsTrigger>
          </TabsList>

          <TabsContent value="fotos" className="pt-4">
            <PhotoGallery propertyId={propertyId} photos={photos} onChanged={onChanged} />
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
                className="flex-1 rounded-md border px-3 py-2 text-sm"
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
        </Tabs>
      </CardContent>
    </Card>
  )
}
