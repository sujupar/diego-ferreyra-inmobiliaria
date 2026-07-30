'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, RefreshCw } from 'lucide-react'

/**
 * Selector de plantillas aprobadas (task 9, prioridad 5) — el camino para
 * reabrir una conversación fuera de la ventana de 24hs, cuando el texto libre
 * está bloqueado. Lista `GET /api/whatsapp/templates` (cacheado 10 min
 * server-side), y arma el formulario de variables según la cantidad de
 * `{{n}}` que tenga el body de la plantilla elegida.
 */

export interface WhatsappTemplateSummary {
  name: string
  language: string
  category: string
  bodyText: string
  variableCount: number
  hasDynamicUrlButton: boolean
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    return { error: `El servidor respondió algo inesperado (${res.status}).` } as never
  }
}

/** Reemplaza {{1}}, {{2}}... por los valores tipeados, para la vista previa. Exportada para el probe. */
export function previewTemplateBody(bodyText: string, values: string[]): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
    const idx = Number(n) - 1
    const v = values[idx]
    return v && v.trim() ? v : `{{${n}}}`
  })
}

export function TemplatePicker({
  open,
  onOpenChange,
  phone,
  leadId,
  propertyId,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  phone: string
  leadId: string | null
  propertyId: string | null
  onSent: () => void
}) {
  const [templates, setTemplates] = useState<WhatsappTemplateSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [values, setValues] = useState<string[]>([])
  const [urlParam, setUrlParam] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  function load(force?: boolean) {
    setLoading(true)
    setLoadError(null)
    fetch(`/api/whatsapp/templates${force ? '?refresh=1' : ''}`)
      .then(res => readJson<{ data?: WhatsappTemplateSummary[] }>(res).then(body => ({ res, body })))
      .then(({ res, body }) => {
        if (!res.ok) throw new Error(body.error ?? 'No se pudieron cargar las plantillas.')
        setTemplates(body.data ?? [])
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setSendError(null)
    load()
  }, [open])

  const template = templates?.find(t => t.name === selected) ?? null

  function selectTemplate(name: string) {
    setSelected(name)
    const t = templates?.find(x => x.name === name)
    setValues(new Array(t?.variableCount ?? 0).fill(''))
    setUrlParam('')
  }

  async function handleSend() {
    if (!template || sending) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'template',
          phone,
          leadId,
          propertyId,
          templateName: template.name,
          languageCode: template.language,
          bodyParams: values,
          ...(template.hasDynamicUrlButton ? { urlButtonParam: urlParam } : {}),
        }),
      })
      const body = await readJson<{ ok?: boolean; error?: string }>(res)
      if (!res.ok || body.ok === false) {
        setSendError(body.error ?? 'No se pudo enviar la plantilla.')
        return
      }
      onSent()
      onOpenChange(false)
    } catch {
      setSendError('No se pudo conectar con el servidor. Volvé a intentar.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !sending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mandar una plantilla</DialogTitle>
          <DialogDescription>
            Sirve para reabrir la conversación cuando pasaron más de 24hs desde el último mensaje del cliente.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-[color:var(--destructive)]">{loadError}</p>
        ) : !templates || templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay plantillas aprobadas todavía. Se crean y aprueban desde WhatsApp Manager.
          </p>
        ) : !template ? (
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {templates.map(t => (
              <button
                key={t.name}
                type="button"
                onClick={() => selectTemplate(t.name)}
                className="w-full rounded-md border p-2 text-left text-sm hover:bg-muted/60"
              >
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{t.bodyText}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <button type="button" onClick={() => setSelected(null)} className="text-xs text-muted-foreground hover:underline">
              ← Elegir otra plantilla
            </button>
            {template.variableCount > 0 && (
              <div className="space-y-2">
                {values.map((v, i) => (
                  <Input
                    key={i}
                    placeholder={`Variable {{${i + 1}}}`}
                    value={v}
                    onChange={e => setValues(vs => vs.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                ))}
              </div>
            )}
            {template.hasDynamicUrlButton && (
              <Input placeholder="Parámetro del botón (enlace dinámico)" value={urlParam} onChange={e => setUrlParam(e.target.value)} />
            )}
            <div className="rounded-md bg-muted/40 p-2 text-xs whitespace-pre-wrap">{previewTemplateBody(template.bodyText, values)}</div>
            {sendError && <p className="text-xs font-medium text-[color:var(--destructive)]">{sendError}</p>}
          </div>
        )}

        <DialogFooter>
          {templates && templates.length > 0 && !template && (
            <Button variant="outline" size="sm" onClick={() => load(true)} className="mr-auto">
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          {template && (
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
