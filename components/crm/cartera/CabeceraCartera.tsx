import { Eye } from 'lucide-react'
import { etiquetaMiVista } from '@/lib/crm/cartera-vista'
import { cn } from '@/lib/utils'
import { CampoSelect } from '../ui/CampoSelect'
import { ALTO_CONTROL_LISTA } from '../ui/medidas'

// Cabecera del CRM (maqueta `.cartera-cab`): título, subtítulo y, para admin y dueño, el
// selector "Ver como". Y el aviso mientras se mira la vista de otra persona (spec
// crm-sistema-diseno "Selector de vista": borde, sin fondo fuerte, ícono de ojo, en su
// lugar y no fijo en la pantalla).

export function SelectorVerComo({
  rol,
  opciones,
  valor,
  alElegir,
}: {
  rol: string
  opciones: { id: string; etiqueta: string }[]
  valor: string
  alElegir: (id: string) => void
}) {
  return (
    <CampoSelect
      etiqueta="Ver como"
      valor={valor}
      alCambiar={alElegir}
      opciones={[{ valor: '', etiqueta: etiquetaMiVista(rol) }, ...opciones.map((o) => ({ valor: o.id, etiqueta: o.etiqueta }))]}
      className="w-full md:w-72"
    />
  )
}

export function AvisoVerComo({ nombre, rol, alVolver }: { nombre: string; rol: string; alVolver: () => void }) {
  const quien = rol === 'coordinador' ? 'coordinación' : 'asesor'
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-brand/30 bg-card px-3.5 py-2.5 text-[13px]" data-aviso-ver-como>
      <Eye aria-hidden className="size-4 shrink-0 text-brand" />
      <p className="min-w-[12rem] flex-1">
        Estás viendo el CRM como lo ve <strong>{`${nombre} (${quien})`}</strong>. Es solo para revisar: no cambia nada de lo que esa persona ve.
      </p>
      <button
        type="button"
        onClick={alVolver}
        className={cn('inline-flex items-center rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-accent', ALTO_CONTROL_LISTA)}
      >
        Volver a mi vista
      </button>
    </div>
  )
}

export function CabeceraCartera({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string
  subtitulo: string
  /** "Ver como" (CRM del dueño) o "Nuevo contacto" (Contactos). */
  children?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        <p className="text-[13px] text-texto-suave">{subtitulo}</p>
      </div>
      {children}
    </header>
  )
}
