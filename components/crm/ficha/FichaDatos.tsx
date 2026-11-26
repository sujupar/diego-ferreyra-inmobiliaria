'use client'

import { useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { ORIGIN_LABELS } from '@/app/(dashboard)/crm/_components/constants'
import type { FichaContacto } from '@/lib/crm/ficha'
import { leerJson } from '@/lib/crm/leer-json'
import { enlaceTel, telefonoParaMostrar } from '@/lib/crm/telefono-ficha'
import { cn } from '@/lib/utils'
import { EstadoCarga, EstadoError } from '../ui/EstadoBloque'
import { ALTO_CONTROL, LETRA_CAMPO } from '../ui/medidas'
import { Dato, Tarjeta } from './Tarjeta'

// Columna de datos de la persona (maqueta `#ficha-p-datos`): tarjeta "Contacto" (solo en
// la vista de una columna: con columnas, teléfono y email ya están en la cabecera),
// Detalles (solo renglones con valor, con el renglón Etapa) y Background editable en el
// lugar. Qué datos viajan lo decide el servidor (`armarFicha`): acá solo se dibuja.

const ORIGENES: Record<string, string> = { ...ORIGIN_LABELS, historico: 'Histórico', clase_gratuita: 'Clase gratuita' }

const BOTON_CHICO =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand'

function Background({
  contactoId,
  texto,
  onGuardado,
  avisar,
}: {
  contactoId: string
  texto: string | null
  onGuardado: (nuevo: string) => void
  avisar: (texto: string, error?: boolean) => void
}) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Lo recién guardado se ve enseguida, sin esperar a que la ficha vuelva a pedir sus datos.
  const [guardado, setGuardado] = useState<string | null>(null)
  const visible = guardado ?? texto

  const guardar = async () => {
    if (guardando) return
    setGuardando(true)
    setError(null)
    const notes = borrador.trim()
    try {
      const r = await leerJson<{ success: boolean }>(
        await fetch(`/api/contacts/${encodeURIComponent(contactoId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes }),
        }),
      )
      if (!r.ok) {
        setError(r.error)
        return
      }
      setGuardado(notes)
      onGuardado(notes)
      setEditando(false)
      avisar('Background guardado.')
    } catch (err) {
      console.error('[ficha] no se pudo guardar el background', err)
      setError('No se pudo guardar. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const botonEditar = (
    <button
      type="button"
      className={cn(BOTON_CHICO, ALTO_CONTROL, 'hover:bg-accent')}
      onClick={() => {
        setBorrador(visible ?? '')
        setError(null)
        setEditando(true)
      }}
    >
      {visible ? <Pencil aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
      {visible ? 'Editar' : 'Agregar'}
    </button>
  )

  if (editando) {
    return (
      <Tarjeta titulo="Background">
        <textarea
          autoFocus
          aria-label="Background"
          rows={4}
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          placeholder="Contexto de la persona: por qué vende, cuándo llamarla, quién decide…"
          className={cn('min-h-20 w-full resize-y rounded-md border border-input bg-card px-3 py-2.5 leading-snug', LETRA_CAMPO)}
        />
        {error && (
          <p role="alert" className="text-xs text-destructive-texto">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={cn(BOTON_CHICO, ALTO_CONTROL, 'border border-border bg-card hover:bg-accent')} onClick={() => setEditando(false)}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={guardando}
            className={cn(BOTON_CHICO, ALTO_CONTROL, 'bg-brand text-brand-foreground hover:bg-brand/90 disabled:opacity-60')}
            onClick={guardar}
          >
            Guardar
          </button>
        </div>
      </Tarjeta>
    )
  }
  return (
    <Tarjeta titulo="Background" accion={botonEditar}>
      {visible ? <p className="whitespace-pre-line text-sm">{visible}</p> : null}
    </Tarjeta>
  )
}

export function FichaDatos({
  estado,
  ficha,
  contactoId,
  onReintentar,
  onEditarContacto,
  onBackgroundGuardado,
  avisar,
}: {
  estado: 'cargando' | 'ok' | 'error'
  ficha: FichaContacto | null
  contactoId: string
  onReintentar: () => void
  onEditarContacto: () => void
  onBackgroundGuardado: (texto: string) => void
  avisar: (texto: string, error?: boolean) => void
}) {
  if (!ficha) {
    return (
      <Tarjeta titulo="Detalles">
        {estado === 'error' ? <EstadoError onReintentar={onReintentar} /> : <EstadoCarga />}
      </Tarjeta>
    )
  }
  const { persona, detalles: d } = ficha
  const telefono = telefonoParaMostrar(persona.phone)
  const asesor = d.asesor.mostrar ? (d.asesor.nombre ?? <span className="text-texto-suave">Sin asignar todavía</span>) : null
  return (
    <>
      {(persona.phone || persona.email) && (
        <Tarjeta titulo="Contacto" data-solo="pestanas" className="ficha-solo-pestanas">
          <div className="flex flex-col">
            {persona.phone && telefono && (
              <Dato etiqueta="Teléfono">
                <a href={enlaceTel(persona.phone)} className="inline-flex min-h-11 items-center font-medium text-brand underline underline-offset-[3px] tabular-nums">
                  {telefono}
                </a>
              </Dato>
            )}
            <Dato etiqueta="Email">{persona.email}</Dato>
          </div>
        </Tarjeta>
      )}
      <Tarjeta
        titulo="Detalles"
        accion={
          <button type="button" onClick={onEditarContacto} className={cn(BOTON_CHICO, ALTO_CONTROL, 'hover:bg-accent')}>
            <Pencil aria-hidden className="size-4" />
            Editar contacto
          </button>
        }
      >
        <div className="flex flex-col">
          <Dato etiqueta="Etapa">{d.etapa?.etiqueta}</Dato>
          <Dato etiqueta="Origen">{d.origen ? (ORIGENES[d.origen] ?? d.origen) : null}</Dato>
          <Dato etiqueta="Campaña">{d.campana}</Dato>
          <Dato etiqueta="Conjunto">{d.conjunto}</Dato>
          <Dato etiqueta="Anuncio">{d.anuncio}</Dato>
          <Dato etiqueta="Asesor">{asesor}</Dato>
          <Dato etiqueta="Dirección">{d.direccion}</Dato>
          <Dato etiqueta="Barrio">{d.barrio}</Dato>
          <Dato etiqueta="Tipo">{d.tipoPropiedad}</Dato>
          <Dato etiqueta="Ambientes">{d.ambientes !== null ? String(d.ambientes) : null}</Dato>
          <Dato etiqueta="Superficie">{d.superficie !== null ? `${d.superficie} m²` : null}</Dato>
        </div>
      </Tarjeta>
      {/* Con otra versión del texto (la trajo la ficha al recargar) se arranca de cero. */}
      <Background key={persona.notes ?? ''} contactoId={contactoId} texto={persona.notes} onGuardado={onBackgroundGuardado} avisar={avisar} />
    </>
  )
}
