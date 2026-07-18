'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FileText, Image as ImageIcon, Loader2, Upload, Trash2, ExternalLink } from 'lucide-react'
import { planLabelFromUrl } from '@/lib/properties/media'
import { uploadPlans, validatePlanFile } from '@/lib/properties/upload-plans'

interface Props {
  propertyId: string
  plans: string[]
  onChanged: () => void
}

export function PlansPanel({ propertyId, plans, onChanged }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  async function handleFiles(list: FileList | null) {
    // Igual que en captación: los archivos inválidos se saltean con aviso
    // y los válidos se suben igual.
    const files: File[] = []
    for (const f of Array.from(list || [])) {
      const err = validatePlanFile(f)
      if (err) { toast.error(err); continue }
      files.push(f)
    }
    if (files.length === 0) { if (input.current) input.current.value = ''; return }
    setUploading(true); setProgress(0)
    const t = toast.loading(files.length === 1 ? 'Subiendo plano…' : `Subiendo ${files.length} planos…`)
    try {
      await uploadPlans(propertyId, files, (p) => { setProgress(p); toast.loading(`Subiendo planos — ${p}%`, { id: t }) })
      toast.success(files.length === 1 ? 'Plano subido' : `${files.length} planos subidos`, { id: t })
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir planos', { id: t })
      // Los que sí subieron ya quedaron registrados — refrescar igual.
      onChanged()
    } finally {
      setUploading(false); setProgress(0)
      if (input.current) input.current.value = ''
    }
  }

  async function removePlan(url: string) {
    if (!confirm('¿Quitar este plano?')) return
    try {
      const res = await fetch(`/api/properties/${propertyId}/media`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deletePlan: url }),
      })
      if (!res.ok) throw new Error()
      toast.success('Plano quitado'); onChanged()
    } catch { toast.error('No se pudo quitar el plano') }
  }

  const uploadBtn = (label: string) => (
    <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={uploading}>
      {uploading
        ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />{progress > 0 ? `${progress}%` : '…'}</>
        : <><Upload className="h-4 w-4 mr-1" />{label}</>}
    </Button>
  )

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
      {plans.length > 0 ? (
        <>
          <ul className="rounded-xl border divide-y">
            {plans.map(url => {
              const label = planLabelFromUrl(url)
              const isPdf = label.toLowerCase().endsWith('.pdf')
              return (
                <li key={url} className="flex items-center gap-3 px-3 py-2">
                  {isPdf
                    ? <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    : <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />}
                  <span className="flex-1 truncate text-sm" title={label}>{label}</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    <ExternalLink className="h-3 w-3" />Ver
                  </a>
                  <Button size="sm" variant="ghost" onClick={() => removePlan(url)} className="shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              )
            })}
          </ul>
          {uploadBtn('Agregar planos')}
        </>
      ) : (
        <div className="border border-dashed rounded-xl p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Subí los planos de la propiedad — PDF o imagen, varios archivos, hasta 100 MB cada uno.
          </p>
          {uploadBtn('Subir planos')}
        </div>
      )}
    </div>
  )
}
