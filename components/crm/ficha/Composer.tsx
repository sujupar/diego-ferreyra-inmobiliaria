'use client'

import { Phone, StickyNote } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { ALTO_CONTROL } from '../ui/medidas'
import { FormLlamada, type TipoGuardado } from './FormLlamada'
import { FormNota } from './FormNota'
import type { RespuestaGuardado } from './guardar-actividad'

// Cuadro "Nota | Registrar llamada" de las vistas con columnas (maqueta `#ficha-composer`).
// En la vista de una columna no se ve (`ficha-solo-columnas`): ahí se carga desde la hoja
// del "+". Después de guardar vuelve a "Nota" (lo decide FichaContacto).

export type PestanaComposer = 'nota' | 'llamada'

const PESTANA = cn(
  'flex-1 gap-1.5 rounded-[calc(var(--radius)-3px)] text-sm font-medium text-texto-suave data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-xs',
  ALTO_CONTROL,
)

export function Composer({
  contactoId,
  pestana,
  onPestana,
  onNotaGuardada,
  onLlamadaGuardada,
  refNota,
  refNoAtendio,
  reloj,
}: {
  contactoId: string
  pestana: PestanaComposer
  onPestana: (p: PestanaComposer) => void
  onNotaGuardada: (r: RespuestaGuardado) => void
  onLlamadaGuardada: (r: RespuestaGuardado, tipo: TipoGuardado) => void
  refNota?: React.Ref<HTMLTextAreaElement>
  refNoAtendio?: React.Ref<HTMLButtonElement>
  reloj?: () => Date
}) {
  return (
    <section
      id="ficha-composer"
      data-solo="columnas"
      className="ficha-solo-columnas min-w-0 rounded-[calc(var(--radius)+4px)] border border-border bg-card p-4 shadow-xs"
      aria-label="Nota o llamada"
    >
      <Tabs value={pestana} onValueChange={(v) => onPestana(v === 'llamada' ? 'llamada' : 'nota')} className="gap-3">
        <TabsList aria-label="Qué querés anotar" className="h-auto w-full gap-0.5 rounded-lg bg-muted p-[0.1875rem]">
          <TabsTrigger value="nota" className={PESTANA}>
            <StickyNote aria-hidden className="size-4" />
            Nota
          </TabsTrigger>
          <TabsTrigger value="llamada" className={PESTANA}>
            <Phone aria-hidden className="size-4" />
            Registrar llamada
          </TabsTrigger>
        </TabsList>
        <TabsContent value="nota">
          <FormNota contactoId={contactoId} onGuardada={onNotaGuardada} refCampo={refNota} />
        </TabsContent>
        <TabsContent value="llamada">
          <FormLlamada contactoId={contactoId} onGuardado={onLlamadaGuardada} refNoAtendio={refNoAtendio} reloj={reloj} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
