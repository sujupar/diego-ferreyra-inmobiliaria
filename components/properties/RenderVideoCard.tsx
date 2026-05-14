'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Film, Download, ExternalLink, Copy, Check } from 'lucide-react'

interface RenderResponse {
  ok: boolean
  mode: 'external-server' | 'manual'
  url?: string
  compositionId?: string
  inputProps?: unknown
  cliCommand?: string
  note?: string
  error?: string
}

export function RenderVideoCard({ propertyId }: { propertyId: string }) {
  const [composition, setComposition] = useState<'PropertyTour' | 'PropertyTourVertical'>(
    'PropertyTour',
  )
  const [rendering, setRendering] = useState(false)
  const [result, setResult] = useState<RenderResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function render(save = false) {
    setRendering(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/render-video`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ compositionId: composition, save }),
      })
      const data: RenderResponse = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setRendering(false)
    }
  }

  function copyCli() {
    if (!result?.cliCommand) return
    navigator.clipboard.writeText(result.cliCommand).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="display text-base flex items-center gap-2">
          <Film className="h-4 w-4 text-[color:var(--brand)]" />
          Video tour (Remotion)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Genera un video corto tipo slideshow con las fotos de la propiedad,
          highlights y CTA. Listo para usar en redes y campañas.
        </p>

        <div className="flex items-center gap-3 text-sm">
          <label className="font-medium">Formato:</label>
          <select
            value={composition}
            onChange={e =>
              setComposition(e.target.value as 'PropertyTour' | 'PropertyTourVertical')
            }
            className="border rounded px-3 py-1.5 bg-background"
          >
            <option value="PropertyTour">1:1 (Feed) — 1080×1080</option>
            <option value="PropertyTourVertical">9:16 (Stories/Reels) — 1080×1920</option>
          </select>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => render(false)} disabled={rendering}>
            {rendering ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Film className="h-4 w-4 mr-1" />
            )}
            Generar video
          </Button>
          {result?.url && (
            <a
              href={result.url}
              download={`property-${propertyId}.mp4`}
              className="inline-flex"
            >
              <Button variant="outline">
                <Download className="h-4 w-4 mr-1" />
                Descargar
              </Button>
            </a>
          )}
        </div>

        {error && (
          <p className="text-sm text-[color:var(--destructive)]">{error}</p>
        )}

        {result?.mode === 'external-server' && result.url && (
          <div className="space-y-2">
            <p className="text-sm text-emerald-700">
              ✓ Video generado.
            </p>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm underline text-[color:var(--brand)]"
            >
              Abrir video <ExternalLink className="h-3 w-3" />
            </a>
            <Button
              size="sm"
              variant="outline"
              onClick={() => render(true)}
              disabled={rendering}
            >
              Guardar como video oficial de la propiedad
            </Button>
          </div>
        )}

        {result?.mode === 'manual' && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4">
            <p className="text-sm font-medium">
              Render server no configurado — render manual desde tu terminal:
            </p>
            <p className="text-xs text-muted-foreground">
              {result.note}
            </p>
            <div className="relative">
              <pre className="text-xs bg-card border rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
                {result.cliCommand}
              </pre>
              <button
                type="button"
                onClick={copyCli}
                className="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-background border inline-flex items-center gap-1 hover:bg-muted"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" /> Copiar
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              El render local requiere{' '}
              <a
                href="https://www.remotion.dev/docs/render"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Chrome Headless
              </a>{' '}
              y ffmpeg. Tarda ~10-30s según la cantidad de fotos.
            </p>
          </div>
        )}

        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Para preview en vivo del template: <code>npx remotion preview remotion/index.ts</code>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
