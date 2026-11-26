'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { leerJson } from '@/lib/crm/leer-json'
import type { FichaContacto } from '@/lib/crm/ficha'
import type { ActividadDeFicha } from '@/lib/crm/tipos'
import type { TareaDeFicha } from '@/lib/supabase/tasks'

// Los tres pedidos de la ficha (design.md D5): persona, actividad y tareas, cada uno con
// su carga, su error y su "Reintentar". Uno caído NO tumba a los otros dos. Cada pedido
// lleva un número de versión: la respuesta de un pedido viejo (un filtro anterior, una
// recarga pisada) se descarta, así nunca pinta datos que ya no corresponden.

export type FiltroActividad = 'todo' | 'llamadas' | 'notas' | 'actividad'

export type EstadoPedido = 'cargando' | 'ok' | 'error'

export interface BloqueFicha {
  estado: EstadoPedido
  datos: FichaContacto | null
  noEncontrado: boolean
}

export interface BloqueActividad {
  estado: EstadoPedido
  items: ActividadDeFicha[]
  hayMas: boolean
  filtro: FiltroActividad
  cargandoMas: boolean
  errorMas: string | null
}

export interface BloqueTareas {
  estado: EstadoPedido
  tareas: TareaDeFicha[]
}

export function useFicha(contactoId: string) {
  const [ficha, setFicha] = useState<BloqueFicha>({ estado: 'cargando', datos: null, noEncontrado: false })
  const [actividad, setActividad] = useState<BloqueActividad>({
    estado: 'cargando',
    items: [],
    hayMas: false,
    filtro: 'todo',
    cargandoMas: false,
    errorMas: null,
  })
  const [tareas, setTareas] = useState<BloqueTareas>({ estado: 'cargando', tareas: [] })
  const version = useRef({ ficha: 0, actividad: 0, tareas: 0 })
  const filtroActual = useRef<FiltroActividad>('todo')
  const base = `/api/contacts/${encodeURIComponent(contactoId)}`

  const traerFicha = useCallback(async () => {
    const v = ++version.current.ficha
    try {
      const r = await leerJson<FichaContacto>(await fetch(`${base}/ficha`, { cache: 'no-store' }))
      if (v !== version.current.ficha) return
      if (r.ok) setFicha({ estado: 'ok', datos: r.data, noEncontrado: false })
      else setFicha((f) => ({ estado: 'error', datos: r.status === 404 ? null : f.datos, noEncontrado: r.status === 404 }))
    } catch (err) {
      console.error('[ficha] no se pudo pedir la persona', err)
      if (v === version.current.ficha) setFicha((f) => ({ ...f, estado: 'error' }))
    }
  }, [base])
  const recargarFicha = useCallback(() => {
    // Una recarga no vuelve a "cargando" si ya hay datos: siguen a la vista hasta que
    // lleguen los nuevos (si no, la cabecera parpadea). Tras un error, sí.
    setFicha((f) => (f.datos ? f : { ...f, estado: 'cargando' }))
    return traerFicha()
  }, [traerFicha])

  const pedirActividad = useCallback(
    async (filtro: FiltroActividad, antes: string | null) => {
      const v = ++version.current.actividad
      const params = new URLSearchParams({ filtro })
      if (antes) params.set('antes', antes)
      try {
        const r = await leerJson<{ actividades: ActividadDeFicha[]; hay_mas: boolean }>(
          await fetch(`${base}/activities?${params.toString()}`, { cache: 'no-store' }),
        )
        if (v !== version.current.actividad) return
        if (r.ok) {
          setActividad((a) => ({
            ...a,
            estado: 'ok',
            filtro,
            cargandoMas: false,
            errorMas: null,
            hayMas: r.data.hay_mas,
            items: antes ? [...a.items, ...r.data.actividades.filter((n) => !a.items.some((x) => x.id === n.id))] : r.data.actividades,
          }))
        } else if (antes) {
          setActividad((a) => ({ ...a, cargandoMas: false, errorMas: r.error }))
        } else {
          setActividad((a) => ({ ...a, estado: 'error', filtro }))
        }
      } catch (err) {
        console.error('[ficha] no se pudo pedir la actividad', err)
        if (v !== version.current.actividad) return
        setActividad((a) => (antes ? { ...a, cargandoMas: false, errorMas: 'No se pudo cargar. Probá de nuevo.' } : { ...a, estado: 'error' }))
      }
    },
    [base],
  )

  const recargarActividad = useCallback(
    (filtro?: FiltroActividad) => {
      const f = filtro ?? filtroActual.current
      filtroActual.current = f
      setActividad((a) => ({
        ...a,
        filtro: f,
        // Cambiar de filtro muestra la carga; recargar el mismo deja la lista a la vista.
        estado: a.filtro === f && a.estado === 'ok' ? 'ok' : 'cargando',
        items: a.filtro === f ? a.items : [],
      }))
      return pedirActividad(f, null)
    },
    [pedirActividad],
  )

  const verMas = useCallback(() => {
    const ultimo = actividad.items[actividad.items.length - 1]
    if (!ultimo || actividad.cargandoMas) return
    setActividad((a) => ({ ...a, cargandoMas: true, errorMas: null }))
    void pedirActividad(actividad.filtro, ultimo.occurred_at)
  }, [actividad, pedirActividad])

  const traerTareas = useCallback(async () => {
    const v = ++version.current.tareas
    try {
      const r = await leerJson<{ tareas: TareaDeFicha[]; total: number }>(
        await fetch(`${base}/tasks`, { cache: 'no-store' }),
      )
      if (v !== version.current.tareas) return
      if (r.ok) setTareas({ estado: 'ok', tareas: r.data.tareas })
      else setTareas((t) => ({ ...t, estado: 'error' }))
    } catch (err) {
      console.error('[ficha] no se pudieron pedir las tareas', err)
      if (v === version.current.tareas) setTareas((t) => ({ ...t, estado: 'error' }))
    }
  }, [base])
  const recargarTareas = useCallback(() => {
    setTareas((t) => (t.estado === 'ok' ? t : { ...t, estado: 'cargando' }))
    return traerTareas()
  }, [traerTareas])

  // Primera carga: el estado inicial ya es "cargando", así que no se toca nada antes de pedir.
  useEffect(() => {
    // Las tres funciones solo tocan el estado DESPUÉS del `await` del pedido (es una
    // suscripción a la red); la regla no distingue eso de un setState sincrónico.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void traerFicha()
    void pedirActividad('todo', null)
    void traerTareas()
  }, [traerFicha, pedirActividad, traerTareas])

  /** Cambios locales sin pedir nada (una nota editada, un registro anulado, una tarea completada). */
  const cambiarActividad = useCallback((f: (items: ActividadDeFicha[]) => ActividadDeFicha[]) => {
    setActividad((a) => ({ ...a, items: f(a.items) }))
  }, [])
  const cambiarTareas = useCallback((f: (t: TareaDeFicha[]) => TareaDeFicha[]) => {
    setTareas((t) => ({ ...t, tareas: f(t.tareas) }))
  }, [])

  return {
    ficha,
    actividad,
    tareas,
    recargarFicha,
    recargarActividad,
    recargarTareas,
    verMas,
    cambiarActividad,
    cambiarTareas,
  }
}
