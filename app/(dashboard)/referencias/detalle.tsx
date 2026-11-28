'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { VideoRefConUrls as VideoRef } from '@/lib/video-refs/repo'
import { MultBadge, compacto, fechaCorta } from './grilla'

const esHttp = (url: string) => /^https?:\/\//i.test(url)

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
  ref_: r, onClose, onChanged, permitirDescartar = true,
}: { ref_: VideoRef | null; onClose: () => void; onChanged: () => void; permitirDescartar?: boolean }) {
  const [descartando, setDescartando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function noSirve() {
    if (!r) return
    setOcupado(true)
    setErrorLocal(null)
    try {
      const res = await fetch(`/api/video-refs/${r.id}/no-sirve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo.trim() || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'No se pudo marcar como "No sirve"')
      setDescartando(false); setMotivo('')
      onClose(); onChanged()
    } catch (e) {
      setErrorLocal(e instanceof Error ? e.message : 'No se pudo marcar como "No sirve"')
    } finally {
      setOcupado(false)
    }
  }

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
      if (res.status === 409) onChanged() // la ref ya cambió de estado: recargar para mostrar el real
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
                <div className={cn('relative aspect-[9/14] w-full rounded-lg overflow-hidden bg-muted', !r.portada_url && !r.video_url && 'bg-slate-300')}>
                  {r.video_url ? (
                    <video
                      key={r.id} src={r.video_url} poster={r.portada_url ?? undefined}
                      controls playsInline preload="metadata" className="absolute inset-0 size-full object-contain bg-black"
                    />
                  ) : (
                    r.portada_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.portada_url} alt="" className="absolute inset-0 size-full object-cover" />
                    )
                  )}
                  {!r.video_url && <MultBadge m={r.multiplicador} className="absolute top-2 left-2" />}
                </div>
                {r.multiplicador !== null && r.baseline_cuenta && r.cuenta && (
                  <p className="text-xs text-muted-foreground">
                    ×{String(Number.isInteger(r.multiplicador) ? r.multiplicador : r.multiplicador.toFixed(1)).replace('.', ',')} sobre la base de {r.cuenta} ({r.baseline_cuenta})
                  </p>
                )}
                {(r.vistas !== null || r.likes !== null || r.comentarios !== null) && (
                  <p className="text-xs text-muted-foreground">
                    {[r.vistas !== null && `${compacto(r.vistas)} vistas`, r.likes !== null && `${compacto(r.likes)} likes`, r.comentarios !== null && `${compacto(r.comentarios)} comentarios`]
                      .filter(Boolean).join(' · ')}
                  </p>
                )}
                {r.url_video && esHttp(r.url_video) && (
                  <a
                    href={r.url_video} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" /> {r.video_url ? 'Ver original en Instagram' : 'Ver en Instagram'}
                  </a>
                )}
              </div>

              <div className="space-y-4 min-w-0">
                <Bloque titulo="Por qué funcionó" texto={r.por_que} />
                <Bloque titulo="El gancho" texto={r.gancho} />
                <Bloque titulo="El formato" texto={r.formato} />
                <Bloque titulo="Qué dicen los comentarios" texto={r.comentarios_analisis} />
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
                  {permitirDescartar && (
                    descartando ? (
                      <div className="space-y-2 rounded-lg border p-3">
                        <label className="text-sm font-medium" htmlFor="motivo-no-sirve">¿Por qué no sirve? (opcional)</label>
                        <textarea
                          id="motivo-no-sirve" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} rows={2}
                          placeholder="Ej: es de otro país y no aplica acá"
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        />
                        <div className="flex gap-2">
                          <Button variant="destructive" size="sm" onClick={noSirve} disabled={ocupado}>
                            {ocupado ? 'Guardando…' : 'Confirmar: no sirve'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setDescartando(false); setMotivo('') }} disabled={ocupado}>Cancelar</Button>
                        </div>
                        <p className="text-xs text-muted-foreground">La tarjeta se oculta y el radar aprende de esto.</p>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setDescartando(true)}>No sirve</Button>
                    )
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
