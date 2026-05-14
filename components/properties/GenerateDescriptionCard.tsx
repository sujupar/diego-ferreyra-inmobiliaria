'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, Save, X, RefreshCw, Copy, Check } from 'lucide-react'

interface Generated {
  title: string
  subtitle: string
  body: string
}

const BUYER_PROFILES = [
  { value: '', label: 'No especificar (automático)' },
  { value: 'Familia con hijos en edad escolar', label: 'Familia con hijos' },
  { value: 'Pareja joven sin hijos', label: 'Pareja joven' },
  { value: 'Persona soltera profesional', label: 'Soltero/a profesional' },
  { value: 'Persona adulta mayor, jubilado/a', label: 'Adulto mayor' },
  { value: 'Inversionista buscando renta', label: 'Inversionista' },
]

export function GenerateDescriptionCard({ propertyId }: { propertyId: string }) {
  const [buyerProfile, setBuyerProfile] = useState<string>('')
  const [extraNotes, setExtraNotes] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<Generated | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  async function generate(save = false) {
    if (save) setSaving(true)
    else setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/generate-description`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          buyerProfile: buyerProfile || undefined,
          extraNotes: extraNotes || undefined,
          save,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setResult(data.generated)
      if (save) {
        // recarga la página tras 1s para reflejar el nuevo title/description
        setTimeout(() => window.location.reload(), 1000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setGenerating(false)
      setSaving(false)
    }
  }

  function copy(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1500)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="display text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[color:var(--brand)]" />
          Generar descripción para portales
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Usa el sistema entrenado (GPT Portales) para producir titular,
          subtítulo y cuerpo listos para copiar a ZonaProp, Argenprop y
          MercadoLibre con el tono profesional rioplatense.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Perfil del comprador
            </label>
            <select
              value={buyerProfile}
              onChange={e => setBuyerProfile(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm bg-background"
            >
              {BUYER_PROFILES.map(p => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Notas extra (opcional)
            </label>
            <input
              type="text"
              value={extraNotes}
              onChange={e => setExtraNotes(e.target.value)}
              placeholder="Ej: piso alto con vista, recién reciclado..."
              className="w-full border rounded px-3 py-2 text-sm bg-background"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => generate(false)}
            disabled={generating || saving}
            variant={result ? 'outline' : 'default'}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : result ? (
              <RefreshCw className="h-4 w-4 mr-1" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            {result ? 'Regenerar' : 'Generar'}
          </Button>
          {result && (
            <Button onClick={() => generate(true)} disabled={generating || saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Guardar en la propiedad
            </Button>
          )}
          {result && (
            <Button
              variant="ghost"
              onClick={() => setResult(null)}
              disabled={generating || saving}
            >
              <X className="h-4 w-4 mr-1" />
              Descartar
            </Button>
          )}
        </div>

        {error && (
          <p className="text-sm text-[color:var(--destructive)]">{error}</p>
        )}

        {result && (
          <div className="space-y-4 border-t pt-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium uppercase tracking-wide">
                  Titular
                </span>
                <button
                  type="button"
                  onClick={() => copy(result.title, 'title')}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  {copiedField === 'title' ? (
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
              <p className="text-base font-medium">{result.title}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium uppercase tracking-wide">
                  Subtítulo
                </span>
                <button
                  type="button"
                  onClick={() => copy(result.subtitle, 'subtitle')}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  {copiedField === 'subtitle' ? (
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
              <p className="text-sm italic">{result.subtitle}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium uppercase tracking-wide">
                  Descripción
                </span>
                <button
                  type="button"
                  onClick={() => copy(result.body, 'body')}
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  {copiedField === 'body' ? (
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
              <div className="text-sm whitespace-pre-wrap leading-relaxed rounded-md border bg-muted/30 p-3">
                {result.body}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
