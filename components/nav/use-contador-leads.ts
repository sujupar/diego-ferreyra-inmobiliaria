'use client'

import { useEffect, useState } from 'react'

/**
 * Los leads nuevos sin mirar. Es el ÚNICO contador que muestra la navegación, y
 * ahora lo pintan dos lugares distintos: el menú lateral y la barra inferior del
 * celular. Vive acá para que la forma de pedirlo (cada 60 segundos, sin romper
 * nada si falla) sea una sola y no dos copias que se separan con el tiempo.
 *
 * `activo` es el interruptor: quien no va a mostrar el número no pide el número.
 * Sin eso, la barra inferior —que en escritorio está oculta por CSS pero igual
 * montada— sumaría una consulta por minuto que nadie ve.
 *
 * Ante cualquier error devuelve 0 y no avisa: si el contador se cae, la
 * navegación tiene que seguir funcionando igual.
 */
export function useContadorDeLeads(activo: boolean): number {
  const [cantidad, setCantidad] = useState(0)

  useEffect(() => {
    if (!activo) return
    let vivo = true
    async function cargar() {
      try {
        const res = await fetch('/api/leads/count')
        if (!res.ok) return
        const { new: nuevos } = await res.json()
        if (vivo) setCantidad(nuevos ?? 0)
      } catch {
        // best-effort
      }
    }
    cargar()
    const handle = setInterval(cargar, 60_000)
    return () => {
      vivo = false
      clearInterval(handle)
    }
  }, [activo])

  return cantidad
}
