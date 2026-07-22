'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface SlideCopy { eyebrow?: string; title?: string; body?: string; cta_label?: string }
interface SlideView { position: number; role: string; layout: string; status: string; image_kind: string; copy: SlideCopy; url: string | null; error?: string | null }
interface Detail {
  id: string; status: string; progress: number; title: string; topic: string
  cta_type: string; caption: string; hashtags: string[]; error: string | null; slides: SlideView[]
}

export default function CarruselDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<SlideView | null>(null)
  const [regenerating, setRegenerating] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const polling = useRef(false)

  const load = useCallback(async (): Promise<Detail | null> => {
    const res = await fetch(`/api/social/carousels/${id}`)
    const d = await res.json()
    if (!res.ok) { setError(d.error || 'Error'); return null }
    setData(d)
    return d
  }, [id])

  useEffect(() => {
    let cancelled = false
    async function chain() {
      if (polling.current) return
      polling.current = true
      let d = await load()
      // Cada GET procesa el próximo slide pendiente (continuación del lado del cliente).
      while (!cancelled && d && d.status === 'generating_images') d = await load()
      polling.current = false
    }
    chain()
    return () => { cancelled = true }
  }, [load])

  async function saveCopy(position: number, copy: SlideCopy) {
    await fetch(`/api/social/carousels/${id}/slides/${position}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ copy }),
    })
    setEditing(null)
    await load()
  }

  async function regenerate(position: number) {
    setRegenerating(position)
    try {
      await fetch(`/api/social/carousels/${id}/slides/${position}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ regenerate: true }),
      })
      await load()
    } finally { setRegenerating(null) }
  }

  async function exportZip() {
    setExporting(true)
    try {
      const res = await fetch(`/api/social/carousels/${id}/export`, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${(data?.title || 'carrusel').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.zip`
      a.click(); URL.revokeObjectURL(url)
    } catch (e) { alert('Export: ' + (e as Error).message) } finally { setExporting(false) }
  }

  if (error) return <div className="max-w-4xl mx-auto p-8"><p className="text-red-600">{error}</p></div>
  if (!data) return <div className="max-w-4xl mx-auto p-8 text-muted-foreground">Cargando…</div>

  const generating = data.status === 'generating_images'
  const ready = data.status === 'ready'

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-4">
        <Link href="/redes-sociales" className="text-sm text-muted-foreground hover:underline">← Redes Sociales</Link>
      </div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{data.title || data.topic}</h1>
          <p className="text-muted-foreground text-sm mt-1">{data.slides.length} slides · CTA {data.cta_type === 'organic' ? 'orgánico' : 'campaña'}</p>
        </div>
        <Button onClick={exportZip} disabled={!ready || exporting}>{exporting ? 'Armando ZIP…' : 'Exportar ZIP'}</Button>
      </div>

      {generating && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span>Generando el carrusel… (cada imagen tarda ~40s)</span>
            <span className="tabular-nums">{data.progress}%</span>
          </div>
          <Progress value={data.progress} />
        </div>
      )}
      {data.status === 'failed' && <p className="text-red-600 mb-4">Falló: {data.error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {data.slides.map((s) => (
          <div key={s.position} className="rounded-xl border overflow-hidden">
            <div className="aspect-[4/5] bg-muted relative">
              {s.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={s.url} alt={`Slide ${s.position}`} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                    {s.status === 'failed' ? 'error' : regenerating === s.position ? 'regenerando…' : 'en cola…'}
                  </div>}
              <Badge variant="secondary" className="absolute top-2 left-2">{s.position}</Badge>
            </div>
            {ready && (
              <div className="p-2 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(s)}>Editar</Button>
                <Button size="sm" variant="outline" onClick={() => regenerate(s.position)} disabled={regenerating === s.position}>↻</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {ready && (
        <div className="mt-8 rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-sm">Caption sugerido</h3>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(`${data.caption}\n\n${data.hashtags.join(' ')}`)}>Copiar</Button>
          </div>
          <p className="text-sm whitespace-pre-wrap">{data.caption}</p>
          <p className="text-sm text-muted-foreground mt-2">{data.hashtags.join(' ')}</p>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar slide {editing?.position}</DialogTitle></DialogHeader>
          {editing && <EditForm slide={editing} onSave={(copy) => saveCopy(editing.position, copy)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EditForm({ slide, onSave }: { slide: SlideView; onSave: (c: SlideCopy) => void }) {
  const [c, setC] = useState<SlideCopy>({ ...slide.copy })
  const [saving, setSaving] = useState(false)
  const field = (k: keyof SlideCopy, label: string, area = false) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      {area
        ? <Textarea value={c[k] || ''} onChange={(e) => setC({ ...c, [k]: e.target.value })} rows={2} />
        : <Input value={c[k] || ''} onChange={(e) => setC({ ...c, [k]: e.target.value })} />}
    </div>
  )
  return (
    <>
      <div className="space-y-3">
        {field('eyebrow', 'Eyebrow')}
        {field('title', 'Título', true)}
        {field('body', 'Cuerpo', true)}
        {slide.role === 'cta' && field('cta_label', 'Botón CTA')}
      </div>
      <DialogFooter>
        <Button disabled={saving} onClick={() => { setSaving(true); onSave(c) }}>{saving ? 'Guardando…' : 'Guardar y re-renderizar'}</Button>
      </DialogFooter>
    </>
  )
}
