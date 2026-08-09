'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatTile } from '@/components/ui/StatTile'
import { getNavSections, navHrefs } from '@/lib/nav/sections'
import type { Role } from '@/types/auth.types'

/**
 * Pantalla de entrada (task-15). Client component como `/tasks` y
 * `/properties`: en esta plataforma las pantallas piden sus datos a las rutas
 * de API desde el cliente — un server component tendría que armar URL
 * absoluta y reenviar cookies para llamarse a sí mismo.
 *
 * Los números salen SOLO de rutas que ya existían (`/api/tasks`,
 * `/api/leads/count`, `/api/properties`, `/api/visits`) — ninguna consulta
 * nueva, ninguna RPC, ninguna de esas rutas se toca. El análisis del negocio
 * (embudo) sigue viviendo en `/metrics`; acá solo hay un link.
 */

/** `null` = no se pudo traer. Nunca se muestra como 0 (regla del tablero, ver StatTile). */
interface Numeros {
  pendientes: number | null
  sinResponder: number | null
  porRevisar: number | null
  visitasHoy: number | null
}

const SIN_NUMEROS: Numeros = { pendientes: null, sinResponder: null, porRevisar: null, visitasHoy: null }

interface Identidad { id: string; role: Role }

/**
 * Revisión final Fase 3 — M1. `getMyTasks` (`lib/supabase/tasks.ts`) cierra la
 * consulta con `.limit(50)`: con 63 pendientes, `/api/tasks` devuelve 50 y la
 * tarjeta decía "50 · cosas esperándote" como si fueran todas. El techo NO se
 * levanta (es una ruta de producción y subirlo tiene otras consecuencias): lo
 * que cambia es que el contexto lo declara cuando el número llega al tope.
 * Si algún día ese `.limit()` cambia, este número tiene que cambiar con él.
 */
const TOPE_PENDIENTES = 50

interface TarjetaDef {
  key: keyof Numeros
  label: string
  href: string
  context: (v: number | null) => string
  tone?: (v: number | null) => 'neutral' | 'alerta'
}

const TARJETAS: TarjetaDef[] = [
  {
    key: 'pendientes',
    label: 'Pendientes',
    href: '/tasks',
    context: v =>
      v === null
        ? 'No se pudo consultar'
        : v >= TOPE_PENDIENTES
          ? `las primeras ${TOPE_PENDIENTES} — puede haber más`
          : 'cosas esperándote',
    tone: v => (v !== null && v > 0 ? 'alerta' : 'neutral'),
  },
  {
    key: 'sinResponder',
    label: 'Consultas sin responder',
    href: '/inbox',
    context: v => (v === null ? 'No se pudo consultar' : 'leads nuevos en el Inbox'),
  },
  {
    key: 'porRevisar',
    label: 'Propiedades por revisar',
    href: '/properties/review',
    context: v => (v === null ? 'No se pudo consultar' : 'esperando revisión legal'),
  },
  {
    key: 'visitasHoy',
    label: 'Visitas de hoy',
    href: '/visits',
    // Revisión final Fase 3 — I1: decía "agendadas para hoy" contando TAMBIÉN
    // las canceladas y las que no se presentaron. El pedido es
    // `/api/visits?from&to` sin `status`, y `listVisits` no filtra por estado.
    //
    // Elegido: que el contexto diga la verdad, no recortar el pedido. La ruta
    // sí acepta `status`, pero `listVisits` lo aplica con un `.eq()` de UN
    // solo valor y los estados vivos son DOS (`scheduled` y
    // `pending_confirmation`): pedir uno dejaría afuera las visitas que el
    // cliente propuso y el equipo todavía no confirmó — otro número falso, por
    // la puerta de al lado. Ensanchar ese filtro es tocar `lib/supabase/`.
    //
    // Pulido pre-entrega (N2): "canceladas incluidas" SUB-declaraba — el
    // conteo también incluye `no_show` y `completed`, no solo canceladas.
    // "todos los estados" es exacto y no cuesta nada más.
    context: v => (v === null ? 'No se pudo consultar' : 'en la agenda de hoy, todos los estados'),
  },
]

/**
 * Un número que falla no puede tumbar a los demás: esta función NUNCA
 * rechaza, siempre resuelve — a un número o a `null`.
 */
async function pedirNumero(url: string, extraer: (json: unknown) => number): Promise<number | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    const n = extraer(json)
    return typeof n === 'number' && Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function rangoDeHoy(): { from: string; to: string } {
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date()
  fin.setHours(23, 59, 59, 999)
  return { from: inicio.toISOString(), to: fin.toISOString() }
}

export default function InicioPage() {
  const [identidad, setIdentidad] = useState<Identidad | null>(null)
  const [cargandoIdentidad, setCargandoIdentidad] = useState(true)
  const [errorIdentidad, setErrorIdentidad] = useState(false)
  const [numeros, setNumeros] = useState<Numeros>(SIN_NUMEROS)
  const [cargandoNumeros, setCargandoNumeros] = useState(false)
  const [reintentos, setReintentos] = useState(0)

  // Identidad primero. Fail-closed: `/api/auth/me` responde JSON también en
  // 401/404/500, así que sin chequear `r.ok` (y sin exigir un `id` real en el
  // 200) un perfil de error queda "truthy" y los números saldrían sin saber
  // de quién son — nos mordió en cuatro pantallas de la Fase 2.
  useEffect(() => {
    let cancelado = false
    setCargandoIdentidad(true)
    setErrorIdentidad(false)
    fetch('/api/auth/me')
      .then(r => {
        if (!r.ok) throw new Error(`GET /api/auth/me respondió ${r.status}`)
        return r.json()
      })
      .then((perfil: { id?: unknown; role?: unknown } | null) => {
        if (!perfil || typeof perfil.id !== 'string' || !perfil.id || typeof perfil.role !== 'string' || !perfil.role) {
          throw new Error('GET /api/auth/me no devolvió una identidad completa')
        }
        if (cancelado) return
        setIdentidad({ id: perfil.id, role: perfil.role as Role })
      })
      .catch(err => {
        console.error(err)
        if (!cancelado) setErrorIdentidad(true)
      })
      .finally(() => { if (!cancelado) setCargandoIdentidad(false) })
    return () => { cancelado = true }
  }, [reintentos])

  // Recién con identidad resuelta se piden los números — cada uno por su
  // cuenta, así que una ruta caída no le saca el número a las demás.
  useEffect(() => {
    if (!identidad) return
    let cancelado = false
    const permitidas = new Set(navHrefs(getNavSections(identidad.role)))
    const { from, to } = rangoDeHoy()

    setNumeros(SIN_NUMEROS)
    setCargandoNumeros(true)

    const trabajos: Promise<void>[] = []

    if (permitidas.has('/tasks')) {
      trabajos.push(
        pedirNumero(`/api/tasks?user_id=${identidad.id}`, j => {
          const arr = (j as { data?: unknown })?.data
          return Array.isArray(arr) ? arr.length : NaN
        }).then(n => { if (!cancelado) setNumeros(prev => ({ ...prev, pendientes: n })) })
      )
    }

    if (permitidas.has('/inbox')) {
      trabajos.push(
        pedirNumero('/api/leads/count', j => (j as { new?: unknown })?.new as number)
          .then(n => { if (!cancelado) setNumeros(prev => ({ ...prev, sinResponder: n })) })
      )
    }

    if (permitidas.has('/properties/review')) {
      trabajos.push(
        // El carril legal salió de `status` (2026-08-09): la bandeja del
        // abogado se cuenta por `legal_status='pending'` + enviada.
        pedirNumero('/api/properties/revision-legal', j => (j as { total?: unknown })?.total as number)
          .then(n => { if (!cancelado) setNumeros(prev => ({ ...prev, porRevisar: n })) })
      )
    }

    if (permitidas.has('/visits')) {
      // El asesor solo ve lo suyo (pipeline.view_own); el resto de los roles
      // que llegan acá tienen pipeline.view_all.
      const scope = identidad.role === 'asesor' ? `&advisor_id=${identidad.id}` : ''
      trabajos.push(
        pedirNumero(`/api/visits?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${scope}`, j => {
          const arr = (j as { data?: unknown })?.data
          return Array.isArray(arr) ? arr.length : NaN
        }).then(n => { if (!cancelado) setNumeros(prev => ({ ...prev, visitasHoy: n })) })
      )
    }

    Promise.all(trabajos).then(() => { if (!cancelado) setCargandoNumeros(false) })
    return () => { cancelado = true }
  }, [identidad])

  function reintentar() {
    setReintentos(n => n + 1)
  }

  if (cargandoIdentidad) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Si no se pudo confirmar quién sos, no se pide ningún número que dependa
  // de tu usuario — y hay una salida visible, no un spinner colgado.
  if (errorIdentidad || !identidad) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="text-sm font-medium">No pudimos confirmar quién sos.</p>
        <p className="text-sm text-muted-foreground">Los números de esta pantalla dependen de tu usuario.</p>
        <Button size="sm" onClick={reintentar}>Reintentar</Button>
      </div>
    )
  }

  // La misma fuente de verdad que usa el menú: una tarjeta nunca ofrece un
  // link que este rol no puede abrir.
  const permitidas = new Set(navHrefs(getNavSections(identidad.role)))
  const tarjetasVisibles = TARJETAS.filter(t => permitidas.has(t.href))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inicio</h1>
        <p className="text-muted-foreground">{cargandoNumeros ? 'Cargando…' : 'Lo que te espera hoy'}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cargandoNumeros
          ? tarjetasVisibles.map(t => (
              <div key={t.key} className="h-[92px] animate-pulse rounded-xl border bg-card" />
            ))
          : tarjetasVisibles.map(t => (
              <StatTile
                key={t.key}
                label={t.label}
                value={numeros[t.key]}
                context={t.context(numeros[t.key])}
                href={t.href}
                tone={t.tone?.(numeros[t.key])}
              />
            ))}
      </div>

      {permitidas.has('/metrics') && (
        <Link href="/metrics" className="inline-block text-sm text-[color:var(--brand)] underline">
          Ver el estado del embudo
        </Link>
      )}
    </div>
  )
}
