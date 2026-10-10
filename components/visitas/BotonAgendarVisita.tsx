'use client'
import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgendarVisitaDialog } from './agendar/AgendarVisitaDialog'

/** "Agendar visita" con la propiedad ya elegida (ficha de propiedad). */
export function BotonAgendarVisita({ propiedadId, onAgendada }: { propiedadId: string; onAgendada?: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />Agendar visita
      </Button>
      <AgendarVisitaDialog open={abierto} onOpenChange={setAbierto} propiedadId={propiedadId} onAgendada={onAgendada} />
    </>
  )
}
