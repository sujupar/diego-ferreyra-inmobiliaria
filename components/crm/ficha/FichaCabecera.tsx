'use client'

import { CircleCheck, Clock, Mail, Phone, TriangleAlert } from 'lucide-react'
import type { FichaContacto } from '@/lib/crm/ficha'
import { enlaceTel, telefonoParaMostrar } from '@/lib/crm/telefono-ficha'
import { cn } from '@/lib/utils'
import { ChipEtapa } from '../ui/ChipEtapa'
import { EstadoCarga, EstadoError } from '../ui/EstadoBloque'
import { ALTO_CONTROL } from '../ui/medidas'

// Cabecera de la ficha (maqueta `.ficha-cab`): fija arriba en la vista de una columna,
// tarjeta de la persona con dos o tres columnas. Las pestañas van adentro (solo en la
// vista de una columna) y las pasa FichaContacto como `pestanas`.

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/)
  const a = p[0]?.charAt(0) ?? ''
  const b = p.length > 1 ? (p[p.length - 1]?.charAt(0) ?? '') : (p[0]?.charAt(1) ?? '')
  return (a + b).toUpperCase()
}

export function EstadoUltimoContacto({ ultimo }: { ultimo: FichaContacto['ultimoContacto'] }) {
  const Icono = ultimo.alerta ? TriangleAlert : ultimo.dias === 0 ? CircleCheck : Clock
  return (
    <span
      data-nivel={ultimo.alerta ? 'alerta' : ultimo.dias === 0 ? 'ok' : undefined}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-texto-suave',
        ultimo.alerta && 'font-semibold text-destructive-texto',
        !ultimo.alerta && ultimo.dias === 0 && 'text-brand',
      )}
    >
      <Icono aria-hidden className="size-[0.8125rem]" />
      {ultimo.texto}
    </span>
  )
}

export function FichaCabecera({
  estado,
  ficha,
  onReintentar,
  pestanas,
}: {
  estado: 'cargando' | 'ok' | 'error'
  ficha: FichaContacto | null
  onReintentar: () => void
  pestanas: React.ReactNode
}) {
  const persona = ficha?.persona
  const telefono = telefonoParaMostrar(persona?.phone)
  return (
    <header className="ficha-cab" aria-label="Persona">
      {estado === 'error' && !ficha ? (
        <EstadoError onReintentar={onReintentar} className="py-3" />
      ) : !persona ? (
        <EstadoCarga filas={1} />
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="ficha-cab__avatar inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand"
            >
              {iniciales(persona.full_name)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h1 className="ficha-cab__nombre text-[1.0625rem] font-bold leading-tight tracking-[-0.02em]">{persona.full_name}</h1>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {ficha.procesoActivo && (
                  <ChipEtapa clave={ficha.procesoActivo.etapa} etiqueta={ficha.procesoActivo.etiquetaEtapa} />
                )}
                <EstadoUltimoContacto ultimo={ficha.ultimoContacto} />
              </div>
            </div>
          </div>
          {persona.phone && telefono && (
            <a
              href={enlaceTel(persona.phone)}
              aria-label={`Llamar a ${persona.full_name} al ${telefono}`}
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-[15px] font-medium text-brand-foreground hover:bg-brand/90 raton:text-sm',
                ALTO_CONTROL,
              )}
            >
              <Phone aria-hidden className="size-4" />
              <span>
                Llamar · <strong className="font-semibold tabular-nums">{telefono}</strong>
              </span>
            </a>
          )}
          {persona.email && (
            <p data-solo="columnas" className="ficha-solo-columnas flex min-w-0 items-center gap-2 text-[13px] text-texto-suave">
              <Mail aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{persona.email}</span>
            </p>
          )}
        </>
      )}
      {pestanas}
    </header>
  )
}
