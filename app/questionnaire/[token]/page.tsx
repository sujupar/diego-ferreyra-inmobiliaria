'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'

export default function PublicQuestionnairePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [info, setInfo] = useState<{ clientName: string; propertyAddress: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [liked, setLiked] = useState<boolean | null>(null)
  const [mostLiked, setMostLiked] = useState('')
  const [leastLiked, setLeastLiked] = useState('')
  const [inPrice, setInPrice] = useState<boolean | null>(null)
  const [offer, setOffer] = useState('')

  useEffect(() => {
    fetch(`/api/public/questionnaire/${token}`)
      .then(async r => {
        if (r.ok) setInfo(await r.json())
        else {
          const j = await r.json()
          setError(j.error)
        }
      })
      .catch(() => setError('network_error'))
  }, [token])

  async function submit() {
    if (liked === null || inPrice === null || !mostLiked || !leastLiked || !offer) {
      toast.error('Completá todas las preguntas')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/questionnaire/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liked,
          most_liked: mostLiked,
          least_liked: leastLiked,
          in_price: inPrice,
          hypothetical_offer: Number(offer),
        }),
      })
      if (!res.ok) throw new Error('Error al enviar')
      router.push(`/questionnaire/${token}/thanks`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSubmitting(false)
    }
  }

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader><CardTitle>Enlace no válido</CardTitle></CardHeader>
        <CardContent>
          {error === 'expired' && <p>El enlace expiró. Pedile uno nuevo al asesor.</p>}
          {error === 'already_used' && <p>Ya completaste este cuestionario. ¡Gracias!</p>}
          {error === 'invalid_token' && <p>El enlace no existe.</p>}
          {error === 'network_error' && <p>Error de red. Refrescá la página.</p>}
        </CardContent>
      </Card>
    </div>
  )

  if (!info) return <div className="p-6">Cargando…</div>

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <Card className="max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>Hola {info.clientName}</CardTitle>
          <p className="text-sm text-muted-foreground">Tu opinión sobre {info.propertyAddress}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>1. ¿Te gustó la propiedad?</Label>
            <RadioGroup value={liked === null ? '' : liked ? 'yes' : 'no'} onValueChange={(v) => setLiked(v === 'yes')}>
              <div className="flex gap-4">
                <div className="flex items-center gap-2"><RadioGroupItem value="yes" id="q1y" /><Label htmlFor="q1y">Sí</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="no" id="q1n" /><Label htmlFor="q1n">No</Label></div>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2"><Label>2. ¿Qué fue lo que más te gustó?</Label><Textarea value={mostLiked} onChange={e => setMostLiked(e.target.value)} rows={3} /></div>
          <div className="space-y-2"><Label>3. ¿Qué fue lo que menos te gustó?</Label><Textarea value={leastLiked} onChange={e => setLeastLiked(e.target.value)} rows={3} /></div>
          <div className="space-y-2">
            <Label>4. ¿Te parece que está en precio?</Label>
            <RadioGroup value={inPrice === null ? '' : inPrice ? 'yes' : 'no'} onValueChange={(v) => setInPrice(v === 'yes')}>
              <div className="flex gap-4">
                <div className="flex items-center gap-2"><RadioGroupItem value="yes" id="q4y" /><Label htmlFor="q4y">Sí</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="no" id="q4n" /><Label htmlFor="q4n">No</Label></div>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2"><Label>5. ¿Cuánto ofrecerías hipotéticamente? (USD)</Label><Input type="number" min="0" value={offer} onChange={e => setOffer(e.target.value)} /></div>
          <Button onClick={submit} disabled={submitting} className="w-full">Enviar respuestas</Button>
        </CardContent>
      </Card>
    </div>
  )
}
