import { CalendarDays, Clock, TriangleAlert, UserX } from 'lucide-react'
import type { FilaComun } from '@/lib/crm/cartera'
import { datoAsesor, datoProximo, datoUltimoContacto, type IconoVencimiento } from '@/lib/crm/cartera-pantalla'
import { cn } from '@/lib/utils'

// Los tres datos de la fila (maqueta `ultimoHtml`, `proximoHtml`, `asesorHtml`). No
// deciden nada: dibujan lo que arma `lib/crm/cartera-pantalla.ts`. El color nunca va solo:
// lo vencido lleva ícono y "Vencida…", lo frío ícono y "Sin movimiento".
//
// Adentro de la fila no puede haber nada interactivo (la fila entera es UN enlace): la
// fecha exacta va en `title`, no en un botón.

const PRINCIPAL = 'font-medium'
const SUB = 'text-xs text-texto-suave'
const NADA = 'text-texto-suave'
const ICONO = 'size-3.5 shrink-0'

export function NoSePudoCargar() {
  return (
    <span className={cn('flex items-center gap-1', NADA)} data-dato="error">
      <TriangleAlert aria-hidden className={ICONO} />
      No se pudo cargar
    </span>
  )
}

export function DatoUltimoContacto({ fila, ahora }: { fila: FilaComun; ahora: Date }) {
  const d = datoUltimoContacto(fila, ahora)
  if (d.tipo === 'error') return <NoSePudoCargar />
  if (d.tipo === 'nada') {
    return (
      <span className="flex min-w-0 flex-col gap-px leading-snug" data-dato={d.alerta ? 'frio' : 'nada'}>
        <span className={cn(d.alerta ? 'flex items-center gap-1 font-medium text-destructive-texto' : NADA)}>
          {d.alerta && <TriangleAlert aria-hidden className={ICONO} />}
          {d.texto}
        </span>
        {d.sub && <span className="text-xs font-medium text-destructive-texto">{d.sub}</span>}
      </span>
    )
  }
  return (
    <span className="flex min-w-0 flex-col gap-px leading-snug" data-dato={d.alerta ? 'frio' : 'ok'}>
      <span title={d.exacta} className={cn(PRINCIPAL, d.alerta && 'flex items-center gap-1 text-destructive-texto')}>
        {d.alerta && <TriangleAlert aria-hidden className={ICONO} />}
        {d.principal}
      </span>
      <span className={SUB}>
        {d.alerta ? (
          <>
            <span className="font-medium text-destructive-texto">Sin movimiento</span> · {d.que}
          </>
        ) : (
          d.sub
        )}
      </span>
    </span>
  )
}

function IconoDeVencimiento({ icono }: { icono: IconoVencimiento }) {
  if (icono === 'alerta') return <TriangleAlert aria-hidden className={cn(ICONO, 'mt-0.5')} />
  if (icono === 'reloj') return <Clock aria-hidden className={cn(ICONO, 'mt-0.5')} />
  if (icono === 'calendario') return <CalendarDays aria-hidden className={cn(ICONO, 'mt-0.5')} />
  return null
}

export function DatoProximoPaso({ fila, ahora }: { fila: FilaComun; ahora: Date }) {
  const d = datoProximo(fila, ahora)
  if (d.tipo === 'error') return <NoSePudoCargar />
  if (d.tipo === 'nada') return <span className={NADA}>{d.texto}</span>
  if (d.tipo === 'cierre') return <span className={PRINCIPAL}>{d.texto}</span>
  return (
    <span className="flex min-w-0 flex-col gap-px leading-snug" data-estado={d.estado}>
      <span className={PRINCIPAL}>{d.titulo}</span>
      <span
        className={cn(
          'flex items-start gap-1 text-xs text-texto-suave',
          d.estado === 'vencida' && 'font-medium text-destructive-texto',
          d.estado === 'hoy' && 'font-medium text-brand',
        )}
      >
        <IconoDeVencimiento icono={d.icono} />
        <span>
          {d.cuando}
          {d.quien && <span className="font-normal text-texto-suave"> · {d.quien}</span>}
        </span>
      </span>
    </span>
  )
}

export function DatoAsesor({ fila }: { fila: FilaComun }) {
  const d = datoAsesor(fila)
  if (d.tipo === 'vacio') return <span className={NADA}>—</span>
  if (d.tipo === 'sin') {
    return (
      <span className="flex items-center gap-1 font-medium text-destructive-texto">
        <UserX aria-hidden className={ICONO} />
        Sin asesor
      </span>
    )
  }
  if (d.baja) {
    return (
      <span className="flex items-center gap-1 font-medium text-destructive-texto">
        <UserX aria-hidden className={ICONO} />
        {d.texto}
      </span>
    )
  }
  return <span>{d.texto}</span>
}
