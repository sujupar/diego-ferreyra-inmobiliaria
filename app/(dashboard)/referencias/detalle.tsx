'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { VideoRef } from '@/lib/video-refs/repo'
import { MultBadge, compacto, fechaCorta } from './grilla'

function Bloque({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{titulo}</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{texto}</p>
    </div>
  )
}

export default function Detalle({
  ref_: r, onClose, onChanged,
}: { ref_: VideoRef | null; onClose: () => void; onChanged: () => void }) {
  const [enviando, setEnviando] = useState(false)
  const [errorLocal, setErrorLocal] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function guionizar() {
    if (!r) return
    setEnviando(true)
    setErrorLocal(null)
    try {
      const res = await fetch('/api/video-refs/guionizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: r.id }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'No se pudo iniciar el guion')
      onChanged() // la grilla recarga y empieza el poll cada 8s
    } catch (e) {
      setErrorLocal(e instanceof Error ? e.message : 'No se pudo iniciar el guion')
    } finally {
      setEnviando(false)
    }
  }

  async function copiar() {
    if (!r?.guion) return
    try {
      await navigator.clipboard.writeText(r.guion)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* sin permiso de portapapeles */ }
  }

  const meta = r ? [r.cuenta, r.plataforma, fechaCorta(r.fecha_video ?? r.created_at)].filter(Boolean).join(' · ') : ''
  const escribiendo = r?.estado_uso === 'guionizando'

  return (
    <Dialog open={!!r} onOpenChange={(o) => { if (!o) { onClose(); setErrorLocal(null) } }}>
      <DialogContent className="sm:max-w-3xl max-h-[90dvh] overflow-y-auto">
        {r && (
          <>
            <DialogHeader>
              <DialogTitle className="leading-snug pr-6">{r.tema}</DialogTitle>
              <DialogDescription>{meta}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-5 md:grid-cols-[240px_1fr]">
              <div className="space-y-3">
                <div className={cn('relative aspect-[9/14] w-full rounded-lg overflow-hidden bg-muted', !r.thumbnail_url && 'bg-slate-300')}>
                  {r.thumbnail_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnail_url} alt="" className="absolute inset-0 size-full object-cover" />
                  )}
                  <MultBadge m={r.multiplicador} className="absolute top-2 left-2" />
                </div>
                {(r.vistas !== null || r.likes !== null) && (
                  <p className="text-xs text-muted-foreground">
                    {[r.vistas !== null && `${compacto(r.vistas)} vistas`, r.likes !== null && `${compacto(r.likes)} likes`]
                      .filter(Boolean).join(' · ')}
                  </p>
                )}
                {r.url_video && (
                  <a
                    href={r.url_video} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" /> Ver original
                  </a>
                )}
              </div>

              <div className="space-y-4 min-w-0">
                <Bloque titulo="Por qué está acá" texto={r.por_que} />
                <Bloque titulo="El gancho" texto={r.gancho} />
                <Bloque titulo="Cómo lo haría Diego" texto={r.adaptacion_diego} />

                <div className="border-t pt-4 space-y-3">
                  {r.estado_uso === 'sin_usar' && (
                    <Button onClick={guionizar} disabled={enviando}>
                      {enviando ? 'Enviando…' : 'Guionizar en la voz de Diego'}
                    </Button>
                  )}
                  {escribiendo && (
                    <>
                      <Button disabled className="animate-pulse">escribiendo…</Button>
                      <p className="text-sm text-muted-foreground">Estamos escribiendo el guion. Se actualiza solo.</p>
                    </>
                  )}
                  {r.estado_uso === 'usada' && r.guion && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Guion</p>
                        <button type="button" onClick={copiar} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                          {copied ? <><Check className="size-3.5" /> Copiado</> : <><Copy className="size-3.5" /> Copiar</>}
                        </button>
                      </div>
                      <p className="text-base leading-relaxed whitespace-pre-wrap rounded-lg border bg-background p-4">{r.guion}</p>
                    </div>
                  )}
                  {r.estado_uso === 'error' && (
                    <>
                      <p className="text-sm text-red-700">
                        No se pudo escribir este guion{r.guion_error ? `: ${r.guion_error}` : '.'}
                      </p>
                      {/* Reintento: mejora futura (requiere volver a sin_usar en el servidor). */}
                      <Button disabled variant="outline">Volver a intentar (próximamente)</Button>
                    </>
                  )}
                  {errorLocal && <p role="alert" className="text-sm text-red-600">{errorLocal}</p>}
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
