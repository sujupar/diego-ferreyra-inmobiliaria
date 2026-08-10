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
      {/*
        SIN `max-h-[85vh] overflow-y-auto` propio.

        `cn()` es tailwind-merge: una clase `max-h-*` del consumidor PISA a la
        del primitivo, así que este diálogo se quedaba afuera del techo nuevo
        (`max-h-[calc(var(--app-vh)-2rem)]`) justo cuando más lo necesita — es el
        formulario más largo del sistema (dos grupos de radios, tres textareas y
        un número) y el que se completa parado en la vereda. Encima, en iOS
        `85vh` se mide contra el viewport GRANDE, el de la barra de direcciones
        escondida: son ~717px de 844 cuando lo visible son ~640, o sea que el
        botón Guardar caía debajo del borde y, con el teclado abierto, era
        directamente inalcanzable.
      */}
      <DialogContent className="max-w-lg">
        <DialogTitle>¿Cómo fue la visita?</DialogTitle>
        <div className="space-y-4">
          {/*
            Los `RadioGroupItem` de Radix son `<button>` de 16px, no
            `<input type="radio">`: NO les alcanza el halo táctil de 44px que
            `app/globals.css` reparte en `@media (pointer: coarse)`. El alto se
            lo pone la fila, y la etiqueta ocupa el resto del renglón (ya está
            asociada por `htmlFor`, así que tocar el texto también marca).
          */}
          <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as 'completed' | 'no_show')}>
            <div className="flex items-center gap-3 max-md:min-h-11">
              <RadioGroupItem value="completed" id="o1" />
              <Label htmlFor="o1" className="flex-1 max-md:py-2">Se realizó</Label>
            </div>
            <div className="flex items-center gap-3 max-md:min-h-11">
              <RadioGroupItem value="no_show" id="o2" />
              <Label htmlFor="o2" className="flex-1 max-md:py-2">No se realizó</Label>
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
                    <div className="flex items-center gap-3 max-md:min-h-11">
                      <RadioGroupItem value="yes" id="l1" />
                      <Label htmlFor="l1" className="max-md:py-2 max-md:pr-4">Sí</Label>
                    </div>
                    <div className="flex items-center gap-3 max-md:min-h-11">
                      <RadioGroupItem value="no" id="l2" />
                      <Label htmlFor="l2" className="max-md:py-2 max-md:pr-4">No</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>
              {/* Las etiquetas van ASOCIADAS (`htmlFor` ↔ `id`). Sin eso el
                  campo no tiene nombre para un lector de pantalla y, sobre
                  todo en un teléfono, tocar el texto de la pregunta no enfoca
                  el campo — el blanco se reduce a la caja. */}
              <div className="space-y-2">
                <Label htmlFor="mas-gusto">¿Qué fue lo que más le gustó?</Label>
                <Textarea id="mas-gusto" value={mostLiked} onChange={(e) => setMostLiked(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="menos-gusto">¿Qué fue lo que menos le gustó?</Label>
                <Textarea id="menos-gusto" value={leastLiked} onChange={(e) => setLeastLiked(e.target.value)} rows={2} />
              </div>
              <div className="space-y-2">
                <Label>¿La propiedad está en precio?</Label>
                <RadioGroup
                  value={inPrice === null ? '' : inPrice ? 'yes' : 'no'}
                  onValueChange={(v) => setInPrice(v === 'yes')}
                >
                  <div className="flex gap-4">
                    <div className="flex items-center gap-3 max-md:min-h-11">
                      <RadioGroupItem value="yes" id="p1" />
                      <Label htmlFor="p1" className="max-md:py-2 max-md:pr-4">Sí</Label>
                    </div>
                    <div className="flex items-center gap-3 max-md:min-h-11">
                      <RadioGroupItem value="no" id="p2" />
                      <Label htmlFor="p2" className="max-md:py-2 max-md:pr-4">No</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label htmlFor="oferta">¿Cuánto ofrecería? (USD)</Label>
                {/* `inputMode="decimal"` abre el teclado NUMÉRICO del teléfono.
                    Sin él, `type="number"` en iOS levanta igual el teclado
                    completo con letras y hay que buscar los dígitos. */}
                <Input id="oferta" type="number" inputMode="decimal" value={offer} onChange={(e) => setOffer(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="notas-internas">Notas internas (opcional)</Label>
            <Textarea id="notas-internas" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
