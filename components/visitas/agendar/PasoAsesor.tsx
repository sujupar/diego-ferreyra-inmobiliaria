'use client'
import { useEffect, useState } from 'react'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { leerRespuesta } from './leer-respuesta'
import { cn } from '@/lib/utils'

export function PasoAsesor({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const [asesores, setAsesores] = useState<Array<{ id: string; full_name: string }>>([])
  useEffect(() => {
    fetch('/api/users/advisors').then(r => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then(r => { if (r.ok) setAsesores(r.data ?? []) })
  }, [])
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">¿Quién la muestra?</h2>
      <div role="radiogroup" aria-label="Asesor" className="grid gap-2 sm:grid-cols-2">
        {asesores.map(a => (
          <button key={a.id} type="button" role="radio" aria-checked={estado.asesorId === a.id}
            onClick={() => despachar({ tipo: 'elegirAsesor', asesorId: a.id })}
            className={cn('flex min-h-14 items-center gap-3 rounded-xl px-4 text-left',
              estado.asesorId === a.id ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
            <span className="font-semibold">{a.full_name}</span>
            {estado.propiedad?.asesorId === a.id && <span className="text-xs text-muted-foreground">asesor de la propiedad</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
