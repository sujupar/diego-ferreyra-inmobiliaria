'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Briefcase, CalendarCheck, CalendarPlus, ChevronRight, FileText, Home, RotateCcw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FichaContacto } from '@/lib/crm/ficha'
import { diaCorto, fechaRelativa, horaCorta } from '@/lib/crm/formato-fecha'
import { cn } from '@/lib/utils'
import { ChipEtapa } from '../ui/ChipEtapa'
import { ALTO_CONTROL } from '../ui/medidas'
import { Tarjeta } from './Tarjeta'

// Bloques "Tasaciones agendadas", "Procesos" y "Archivos" de la columna derecha (maqueta
// `.ficha-item`). Un bloque sin ítems no se dibuja. Cada ítem es un enlace a su pantalla
// de hoy; las acciones fijas de "Procesos" ("Coordinar tasación" y "Deshacer") van AL LADO
// del enlace y no adentro: un botón dentro de un enlace no es válido (D5).

const BOTON_ACCION =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand'

function Item({
  href,
  Icono,
  marca,
  titulo,
  sub,
}: {
  href: string
  Icono: LucideIcon
  marca?: boolean
  titulo: React.ReactNode
  sub: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="flex min-h-13 min-w-0 flex-1 items-center gap-3 rounded-md py-2 text-left hover:bg-accent hover:shadow-[0_0_0_0.375rem_var(--accent)]"
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary',
          marca && 'bg-brand-soft text-brand',
        )}
      >
        <Icono aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium leading-snug">{titulo}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-texto-suave">{sub}</span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-texto-suave" />
    </Link>
  )
}

function Lista({ titulo, children, ...resto }: { titulo: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tarjeta titulo={titulo} {...resto}>
      <ul className="-my-1 flex flex-col divide-y divide-border">{children}</ul>
    </Tarjeta>
  )
}

/** El "Deshacer" del perdido: visible solo hasta `hasta`; se va solo al llegar la hora. */
function useVigenteHasta(hasta: string | null): boolean {
  const [ahora, setAhora] = useState(() => Date.now())
  const limite = hasta ? Date.parse(hasta) : NaN
  useEffect(() => {
    if (Number.isNaN(limite)) return
    const falta = limite - Date.now()
    if (falta <= 0) return
    const t = setTimeout(() => setAhora(Date.now()), falta + 50)
    return () => clearTimeout(t)
  }, [limite])
  return !Number.isNaN(limite) && limite > ahora
}

function ItemProceso({
  p,
  ahora,
  onDeshacer,
}: {
  p: FichaContacto['procesos'][number]
  ahora: Date
  onDeshacer: (dealId: string) => Promise<boolean>
}) {
  const vigente = useVigenteHasta(p.deshacer_hasta)
  const [ocultoPorError, setOcultoPorError] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const mostrarDeshacer = vigente && !ocultoPorError
  return (
    // Las acciones van en su propio renglón, debajo del enlace: en la columna de 18rem no
    // entran al costado (el título quedaba de una letra por renglón).
    <li className="flex flex-col gap-1 py-1" data-proceso={p.id}>
      <Item
        href={`/pipeline/${encodeURIComponent(p.id)}`}
        Icono={Briefcase}
        titulo={p.direccion ? `Tasación · ${p.direccion}` : 'Tasación'}
        sub={
          <>
            <ChipEtapa clave={p.etapa} etiqueta={p.etiquetaEtapa} />
            <span>Abierto {fechaRelativa(p.creado, ahora)}</span>
          </>
        }
      />
      {(p.puede_convertir || mostrarDeshacer) && (
        <div className="flex flex-wrap gap-2 pb-1 pl-11">
          {p.puede_convertir && (
            <Link
              href={`/pipeline/new?deal=${encodeURIComponent(p.id)}`}
              className={cn(BOTON_ACCION, ALTO_CONTROL, 'bg-brand text-brand-foreground hover:bg-brand/90')}
            >
              <CalendarPlus aria-hidden className="size-4" />
              Coordinar tasación
            </Link>
          )}
          {mostrarDeshacer && (
            <button
              type="button"
              disabled={enviando}
              onClick={async () => {
                setEnviando(true)
                const ok = await onDeshacer(p.id)
                setEnviando(false)
                if (!ok) setOcultoPorError(true)
              }}
              className={cn(BOTON_ACCION, ALTO_CONTROL, 'border border-border bg-card hover:bg-accent disabled:opacity-60')}
            >
              <RotateCcw aria-hidden className="size-4" />
              Deshacer
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export function BloqueLista({
  ficha,
  ahora,
  onDeshacerPerdido,
}: {
  ficha: FichaContacto
  ahora: Date
  /** Devuelve `false` si el servidor ya no lo permite (409): el botón se va. */
  onDeshacerPerdido: (dealId: string) => Promise<boolean>
}) {
  const { tasacionesAgendadas, procesos, archivos } = ficha
  return (
    <>
      {tasacionesAgendadas.length > 0 && (
        <Lista titulo="Tasaciones agendadas" data-bloque="tasaciones">
          {tasacionesAgendadas.map((t) => (
            <li key={t.dealId} className="flex py-1">
              <Item
                href={`/pipeline/${encodeURIComponent(t.dealId)}`}
                Icono={CalendarCheck}
                marca
                titulo={`${diaCorto(t.fecha)}${t.hora ? `, ${horaCorta(t.hora)}` : ''}`}
                sub={
                  <>
                    {t.direccion && <span>{t.direccion}</span>}
                    {t.asesor?.nombre && <span>con {t.asesor.nombre}</span>}
                  </>
                }
              />
            </li>
          ))}
        </Lista>
      )}
      {procesos.length > 0 && (
        <Lista titulo="Procesos" data-bloque="procesos">
          {procesos.map((p) => (
            <ItemProceso key={p.id} p={p} ahora={ahora} onDeshacer={onDeshacerPerdido} />
          ))}
        </Lista>
      )}
      {archivos.tasaciones.length + archivos.propiedades.length > 0 && (
        <Lista titulo="Archivos" data-bloque="archivos">
          {archivos.tasaciones.map((t) => (
            <li key={`t-${t.id}`} className="flex py-1">
              <Item
                href={`/appraisals/${encodeURIComponent(t.id)}`}
                Icono={FileText}
                titulo={t.titulo ?? t.ubicacion ?? 'Tasación'}
                sub={<span>Tasación · {fechaRelativa(t.creado, ahora)}</span>}
              />
            </li>
          ))}
          {archivos.propiedades.map((p) => (
            <li key={`p-${p.id}`} className="flex py-1">
              <Item
                href={`/properties/${encodeURIComponent(p.id)}`}
                Icono={Home}
                titulo={p.direccion ?? 'Propiedad'}
                sub={<span>{p.barrio ? `Propiedad · ${p.barrio}` : 'Propiedad'}</span>}
              />
            </li>
          ))}
        </Lista>
      )}
    </>
  )
}
