'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Rocket, CheckCircle2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MlDraft } from '../types'

interface Props {
  propertyId: string
  draft: MlDraft
  currency: string
  canPublish: boolean
  onBack: () => void
}

export function StepConfirm({ propertyId, draft, currency, canPublish, onBack }: Props) {
  const router = useRouter()
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<{ externalId: string; externalUrl: string } | null>(null)

  async function publish() {
    setPublishing(true)
    try {
      const r = await fetch(`/api/properties/${propertyId}/ml-publish`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? 'Error al publicar')
      setResult({ externalId: j.externalId, externalUrl: j.externalUrl })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setPublishing(false)
    }
  }

  if (result) {
    return (
      <div className="text-center space-y-3 py-8">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
        <h3 className="font-semibold text-lg">¡Aviso publicado!</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          ML está validando el aviso. Queda visible al público cuando termine (30s a varios minutos).
        </p>
        <p className="text-xs text-muted-foreground">ID: <code>{result.externalId}</code></p>
        <div className="space-y-2 max-w-sm mx-auto">
          <Button asChild className="w-full">
            <a href={result.externalUrl} target="_blank" rel="noopener noreferrer">
              Abrir en MercadoLibre <ExternalLink className="h-4 w-4 ml-1" />
            </a>
          </Button>
          <Button variant="outline" className="w-full" onClick={() => router.push(`/properties/${propertyId}`)}>
            Volver al detalle
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium flex items-center gap-2"><Rocket className="h-4 w-4 text-emerald-700" />Confirmar y publicar</h3>
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm space-y-1">
        <p className="font-medium">Vas a publicar este aviso en MercadoLibre:</p>
        <p><strong>Título:</strong> {draft.title}</p>
        <p><strong>Precio:</strong> {new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(draft.askingPrice)}</p>
        <p><strong>Fotos:</strong> {draft.photos.length}</p>
        <p><strong>Tipo:</strong> {draft.listingType}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        ML valida el aviso (30s a varios minutos). Después podés pausarlo o cerrarlo desde el panel de gestión.
      </p>
      <div className="flex gap-2">
        <button onClick={onBack} className="rounded-md border px-4 py-2 text-sm">Editar</button>
        <Button onClick={publish} disabled={publishing || !canPublish} className="flex-1 bg-emerald-700 hover:bg-emerald-800">
          {publishing ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-1" />Publicando…</>
          ) : (
            <><Rocket className="h-4 w-4 mr-1" />Confirma y publica</>
          )}
        </Button>
      </div>
    </div>
  )
}
