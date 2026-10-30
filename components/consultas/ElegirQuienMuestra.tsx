'use client'

/**
 * "¿Quién la muestra?" al conectar un aviso o una consulta con su propiedad.
 *
 * Quien la muestra NO es quien la captó (dueño, 2026-10-30): son comisiones
 * distintas. Por eso NUNCA se completa con el asesor de la propiedad. Se propone
 * a quien ya muestra otro aviso de la misma propiedad
 * (`GET /api/consultas/avisos/quien-muestra`); si no hay, queda vacío y hay que
 * elegir. A esa persona le llegan las consultas del aviso.
 *
 * El padre lo monta con `key={propiedad.id}` y vacía la elección al cambiar de
 * propiedad: así cada propiedad arranca de cero y pide su propia propuesta.
 */
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface AsesorParaMostrar { id: string; full_name: string }

function muestraDe(cuerpo: unknown): string | null {
  if (!cuerpo || typeof cuerpo !== 'object' || !('muestraId' in cuerpo)) return null
  return typeof cuerpo.muestraId === 'string' ? cuerpo.muestraId : null
}

export function ElegirQuienMuestra({ asesores, propiedadId, valor, onCambiar }: {
  asesores: readonly AsesorParaMostrar[]
  propiedadId: string
  valor: string | null
  onCambiar: (id: string | null) => void
}) {
  const [buscando, setBuscando] = useState(true)
  // La propuesta llega después de cargar: si la persona ya eligió a alguien, no se le pisa.
  const tocado = useRef(false)
  // Por ref: si el padre pasa una lista o una función nuevas en cada render, el
  // pedido no tiene que repetirse.
  const alCambiar = useRef(onCambiar)
  const lista = useRef(asesores)
  useEffect(() => { alCambiar.current = onCambiar; lista.current = asesores })

  // Aparece DEBAJO de la lista de propiedades (36 hoy): en el celular quedaba
  // fuera de la pantalla y el botón "Conectar" gris sin explicación (visto en el
  // QA). Al aparecer, la hoja baja hasta acá.
  const caja = useRef<HTMLLabelElement>(null)
  useEffect(() => { caja.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }) }, [])

  useEffect(() => {
    let vigente = true
    fetch(`/api/consultas/avisos/quien-muestra?propiedad=${encodeURIComponent(propiedadId)}`)
      .then(async (res) => (res.ok ? muestraDe(await res.json()) : null))
      .then((id) => {
        // Solo si está en la lista de hoy: alguien dado de baja no se propone.
        if (vigente && !tocado.current && id && lista.current.some((a) => a.id === id)) alCambiar.current(id)
      })
      .catch(() => { /* sin propuesta: se elige a mano */ })
      .finally(() => { if (vigente) setBuscando(false) })
    return () => { vigente = false }
  }, [propiedadId])

  return (
    <label ref={caja} className="flex flex-col gap-1.5 text-sm font-semibold">
      ¿Quién la muestra?
      <select
        value={valor ?? ''}
        onChange={(e) => { tocado.current = true; onCambiar(e.target.value || null) }}
        className={cn('h-12 w-full min-w-0 rounded-lg border bg-card px-3 text-base font-normal',
          !valor && 'text-muted-foreground')}
      >
        <option value="">{buscando ? 'Buscando…' : 'Elegí quién la muestra'}</option>
        {asesores.map((a) => <option key={a.id} value={a.id}>{a.full_name || 'Sin nombre'}</option>)}
      </select>
      <span className="text-xs font-normal text-muted-foreground">
        A esta persona le llegan las consultas del aviso. No cambia quién captó la propiedad.
      </span>
    </label>
  )
}
