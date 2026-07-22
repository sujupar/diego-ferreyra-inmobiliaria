'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

const ESTRUCTURAS = [
  { value: 'auto', label: 'Automática (la IA elige)' },
  { value: 'aversion', label: 'Aversión a la pérdida' },
  { value: 'errores', label: 'Los N errores' },
  { value: 'momento', label: 'Objeción + dato' },
]

export default function NuevoCarruselPage() {
  const router = useRouter()
  const [topic, setTopic] = useState('')
  const [structure, setStructure] = useState('auto')
  const [length, setLength] = useState('auto')
  const [ctaType, setCtaType] = useState<'campaign' | 'organic'>('campaign')
  const [diegoEnabled, setDiegoEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!topic.trim()) { setError('Escribí un tema.'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/social/carousels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          structure,
          targetLength: length === 'auto' ? null : Number(length),
          ctaType,
          diegoEnabled,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al generar')
      router.push(`/redes-sociales/${data.id}`)
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/redes-sociales" className="text-sm text-muted-foreground hover:underline">← Redes Sociales</Link>
        <h1 className="text-2xl font-bold mt-2">Nuevo carrusel</h1>
        <p className="text-muted-foreground text-sm mt-1">Escribí el tema y la IA arma el carrusel completo con la voz de marca.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Configuración</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="topic">Tema del carrusel</Label>
            <Textarea id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
              placeholder="Ej: por qué el precio de publicación no es lo que te queda en la mano al vender" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Estructura</Label>
              <Select value={structure} onChange={(e) => setStructure(e.target.value)} options={ESTRUCTURAS} />
            </div>
            <div className="space-y-2">
              <Label>Largo</Label>
              <Select value={length} onChange={(e) => setLength(e.target.value)}
                options={[{ value: 'auto', label: 'Automático (5–10)' }, ...[5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ value: String(n), label: `${n} slides` }))]} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Llamado a la acción</Label>
            <RadioGroup value={ctaType} onValueChange={(v) => setCtaType(v as any)} className="flex gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="campaign" id="cta-campaign" />
                <Label htmlFor="cta-campaign" className="font-normal">Campaña (Solicitá tu tasación)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="organic" id="cta-organic" />
                <Label htmlFor="cta-organic" className="font-normal">Orgánico (Comentá)</Label>
              </div>
            </RadioGroup>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={diegoEnabled} onChange={(e) => setDiegoEnabled(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm">Incluir a Diego (en el gancho o el cierre)</span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? 'Generando el guion…' : 'Generar carrusel'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
