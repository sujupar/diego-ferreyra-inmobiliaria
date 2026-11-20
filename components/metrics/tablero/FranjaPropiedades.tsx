'use client'

import type { Tablero } from '@/lib/metrics/tablero/servidor'
import { ETIQUETA_ESTADO_COMERCIAL } from '@/lib/metrics/tablero/propiedades'
import { num } from '@/components/metrics/panel/formato'
import { Franja, Numero, Seccion } from './Franja'

const REGLA = 'Estado: propiedades captadas contra el período comparado. Menos de 10 % de diferencia = Igual.'

export function FranjaPropiedades({ t }: { t: Tablero }) {
  const p = t.propiedades, x = p.actual, y = p.anterior
  return (
    <Franja titulo="Propiedades" estado={p.estado} regla={REGLA} numeros={<>
      <Numero titulo="Captadas" valor={num(x.captadas)} actual={x.captadas} antes={y?.captadas} antesTexto={y ? num(y.captadas) : undefined}
        fuente="Propiedades con fecha de captación en el período (de cualquier origen), sin fichas fusionadas." />
      <Numero titulo="Reservas" valor={num(x.reservas)} actual={x.reservas} antes={y?.reservas} antesTexto={y ? num(y.reservas) : undefined}
        fuente="Ventas cargadas con fecha de reserva en el período, sin las caídas." />
      <Numero titulo="Escrituras" valor={num(x.escrituras)} actual={x.escrituras} antes={y?.escrituras} antesTexto={y ? num(y.escrituras) : undefined}
        fuente="Ventas cargadas con fecha de escritura en el período, sin las caídas." />
      <Numero titulo="Cartera disponible" valor={num(p.cartera.disponible)} sub="hoy"
        fuente="Propiedades captadas, no descartadas, en estado comercial 'Disponible'. Es el número de hoy: no depende del período." />
    </>}>
      <Seccion titulo="Cartera por estado comercial (hoy)">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-n">
          {p.cartera.porEstado.map(e => <span key={e.estado}>{ETIQUETA_ESTADO_COMERCIAL[e.estado] ?? e.estado}: <strong>{e.cantidad}</strong></span>)}
        </div>
      </Seccion>
    </Franja>
  )
}
