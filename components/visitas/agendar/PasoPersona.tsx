'use client'
import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { filtrarInteresados, type Interesado } from '@/lib/visitas/interesados'
import { formatearFechaHora } from '@/lib/visitas/horario'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { leerRespuesta } from './leer-respuesta'
import { cn } from '@/lib/utils'

function haceCuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  const semanas = Math.floor(dias / 7)
  return semanas === 1 ? 'hace 1 semana' : `hace ${semanas} semanas`
}

export function PasoPersona({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const conLista = estado.origen === 'portal' || estado.origen === 'publicidad_meta' || estado.origen === 'publicidad_paga'
  const [manual, setManual] = useState(!conLista || estado.persona?.tipo === 'nueva')
  const [lista, setLista] = useState<Interesado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    if (!conLista || !estado.propiedad || !estado.origen) return
    let vigente = true
    // La llamada en sí (`fetch(...)`) se dispara ACÁ, en el mismo tick
    // síncrono del efecto — así TypeScript sigue viendo acotados
    // `estado.propiedad`/`estado.origen` sin hacer falta un `!`. Lo que
    // corre más tarde son los `.then()`/`.catch()` (`setError`/`setLista`
    // directo en el cuerpo del efecto dispara cascading renders —
    // react-hooks/set-state-in-effect — así que el reset de un error viejo
    // de un origen anterior va DENTRO del `.then()`, no antes del fetch).
    fetch(`/api/properties/${estado.propiedad.id}/interesados?origen=${estado.origen}`)
      .then(r => leerRespuesta<Interesado[]>(r))
      .then(r => { if (!vigente) return; if (r.ok) { setLista(r.data); setError(null) } else setError(r.error) })
      .catch(() => { if (vigente) setError('No pudimos cargar la lista. Probá de nuevo.') })
    return () => { vigente = false }
  }, [conLista, estado.propiedad, estado.origen])

  const visibles = useMemo(() => filtrarInteresados(lista ?? [], texto), [lista, texto])
  const nueva = estado.persona?.tipo === 'nueva' ? estado.persona : { tipo: 'nueva' as const, nombre: '', telefono: '', email: '' }
  const cambiarNueva = (campo: 'nombre' | 'telefono' | 'email', valor: string) =>
    despachar({ tipo: 'elegirPersona', persona: { ...nueva, [campo]: valor } })
  const elegida = estado.persona && estado.persona.tipo !== 'nueva' ? estado.persona : null

  const cargarAMano = () => { setManual(true); despachar({ tipo: 'elegirPersona', persona: null }) }

  const titulo = estado.origen === 'portal' ? '¿Quién consultó?' : conLista ? '¿Quién se registró?' : '¿Quién viene?'
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 tabIndex={-1} className="text-xl font-semibold outline-none">{titulo}</h2>
        {conLista && lista && lista.length > 0 && !manual && (
          <p className="text-sm text-muted-foreground">
            {estado.origen === 'portal'
              ? `${lista.length} ${lista.length === 1 ? 'persona consultó' : 'personas consultaron'} por ${estado.propiedad?.address}. Las más recientes primero.`
              : `${lista.length} ${lista.length === 1 ? 'persona se registró' : 'personas se registraron'} en la landing.`}
          </p>
        )}
      </div>

      {conLista && !manual && (
        <>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {lista === null && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}

          {/* Ítem 7: 0 interesados no es "nadie coincide con la búsqueda" —
              es que todavía no llegó nadie. Mensaje propio + ir directo a
              cargar a mano (la búsqueda/lista de abajo no tendría sentido). */}
          {lista !== null && lista.length === 0 && !error && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {estado.origen === 'portal' ? 'Nadie consultó todavía por esta propiedad.' : 'Nadie se registró todavía en la landing.'}
              </p>
              <button type="button" onClick={cargarAMano} className="h-11 rounded-lg border border-dashed px-3 text-sm">
                Cargar a mano
              </button>
            </div>
          )}

          {lista !== null && lista.length > 0 && (
            <>
              <label className="flex h-11 items-center gap-2 rounded-lg border bg-card px-3">
                <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">Buscar por nombre o teléfono</span>
                <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por nombre o teléfono"
                  className="flex-1 bg-transparent text-base outline-none" />
              </label>
              {visibles.length === 0 && <p className="text-sm text-muted-foreground">Nadie con ese nombre o teléfono.</p>}
              <ul className="space-y-2">
                {visibles.map(i => {
                  const activa = elegida?.id === i.id
                  const nota = i.visitaActiva ? `Ya tiene visita ${formatearFechaHora(i.visitaActiva.scheduled_at)}`
                    : !i.tieneTelefono ? 'Falta el teléfono' : i.consultas > 1 ? `Consultó ${i.consultas} veces` : null
                  return (
                    <li key={i.clave}>
                      <button type="button" aria-pressed={activa}
                        onClick={() => despachar({ tipo: 'elegirPersona', persona: { tipo: i.tipo, id: i.id, nombre: i.nombre, telefono: i.telefono, detalle: i.detalle } })}
                        className={cn('flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left',
                          activa ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-semibold">{i.nombre}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {i.detalle} · {haceCuanto(i.fecha)}{i.telefono ? ` · ${i.telefono}` : ''}
                          </span>
                        </span>
                        {nota && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">{nota}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {elegida && !ultimos10Digitos(elegida.telefono) && (
                <label className="block space-y-1 text-sm">
                  <span>Teléfono de {elegida.nombre} (falta o está incompleto)</span>
                  <input type="tel" inputMode="tel" value={estado.telefonoFaltante}
                    onChange={e => despachar({ tipo: 'telefonoFaltante', texto: e.target.value })}
                    placeholder="11 5555-5555" className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
                </label>
              )}
              <button type="button" onClick={cargarAMano} className="h-11 rounded-lg border border-dashed px-3 text-sm">
                No está en la lista — cargar a mano
              </button>
            </>
          )}
        </>
      )}

      {manual && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Nombre y apellido</span>
            <input value={nueva.nombre} onChange={e => cambiarNueva('nombre', e.target.value)} autoComplete="off"
              className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
          </label>
          <label className="space-y-1 text-sm">
            <span>Teléfono (WhatsApp)</span>
            <input type="tel" inputMode="tel" value={nueva.telefono} onChange={e => cambiarNueva('telefono', e.target.value)}
              placeholder="11 5555-5555" className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span>Email (opcional)</span>
            <input type="email" inputMode="email" value={nueva.email} onChange={e => cambiarNueva('email', e.target.value)}
              className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
          </label>
          {conLista && (
            <button type="button" onClick={() => { setManual(false); despachar({ tipo: 'elegirPersona', persona: null }) }}
              className="flex min-h-11 items-center text-left text-sm text-brand sm:col-span-2">Volver a la lista</button>
          )}
        </div>
      )}
    </div>
  )
}
