'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'

interface Props {
  visitId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}

export function CompleteVisitDialog({ visitId, open, onOpenChange, onCompleted }: Props) {
  const [outcome, setOutcome] = useState<'completed' | 'no_show'>('completed')
  const [notes, setNotes] = useState('')
  const [liked, setLiked] = useState<boolean | null>(null)
  const [mostLiked, setMostLiked] = useState('')
  const [leastLiked, setLeastLiked] = useState('')
  const [inPrice, setInPrice] = useState<boolean | null>(null)
  const [offer, setOffer] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    try {
      const internal_answers =
        outcome === 'completed'
          ? {
              liked,
              most_liked: mostLiked || null,
              least_liked: leastLiked || null,
              in_price: inPrice,
              hypothetical_offer: offer ? Number(offer) : null,
            }
          : undefined
      const res = await fetch(`/api/visits/${visitId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, completion_notes: notes || undefined, internal_answers }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      toast.success('Visita actualizada')
      onCompleted()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogTitle>¿Cómo fue la visita?</DialogTitle>
        <div className="space-y-4">
          <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as 'completed' | 'no_show')}>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="completed" id="o1" />
              <Label htmlFor="o1">Se realizó</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no_show" id="o2" />
              <Label htmlFor="o2">No se realizó</Label>
            </div>
          </RadioGroup>

          {outcome === 'completed' && (
            <>
              <div className="space-y-2">
                <Label>¿Le gustó la propiedad?</Label>
                <RadioGroup
                  value={liked === null ? '' : liked ? 'yes' : 'no'}
                  onValueChange={(v) => setLiked(v === 'yes')}
                >
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="yes" id="l1" />
                      <Label htmlFor="l1">Sí</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="no" id="l2" />
                      <Label htmlFor="l2">No</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>¿Qué fue lo que más le gustó?</Label>
                <Textarea value={mostLiked} onChange={(e) => setMostLiked(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>¿Qué fue lo que menos le gustó?</Label>
                <Textarea value={leastLiked} onChange={(e) => setLeastLiked(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>¿La propiedad está en precio?</Label>
                <RadioGroup
                  value={inPrice === null ? '' : inPrice ? 'yes' : 'no'}
                  onValueChange={(v) => setInPrice(v === 'yes')}
                >
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="yes" id="p1" />
                      <Label htmlFor="p1">Sí</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="no" id="p2" />
                      <Label htmlFor="p2">No</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>¿Cuánto ofrecería? (USD)</Label>
                <Input type="number" value={offer} onChange={(e) => setOffer(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Notas internas (opcional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
