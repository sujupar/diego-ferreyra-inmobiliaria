'use client'

/**
 * Hoja "¿Qué propiedad quiere ver?" (lienzo, pantalla 2b): la consulta llegó por
 * un aviso que todavía no está conectado con ninguna propiedad. Se elige la
 * propiedad y QUIÉN LA MUESTRA, y se la conecta con
 * `POST /api/consultas/[id]/propiedad` ANTES de agendar: `POST /api/visits`
 * rechaza una consulta sin su propiedad.
 *
 * Una conexión vale para el AVISO entero (spec Entrega 2 §3.2): si la consulta
 * trae el código del aviso, todas sus consultas quedan con la propiedad. La hoja
 * lo dice ANTES de conectar, para que nadie se sorprenda.
 *
 * Quien la muestra no es quien la captó (dueño, 2026-10-30): se elige aparte.
 *
 * Solo operaciones conecta avisos (decide a quién le llegan las consultas
 * futuras). Un asesor ve lo que sabemos del aviso y a quién pedírselo.
 */
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { enlaceSeguro, etiquetaPortal, nombreVisible } from '@/lib/consultas/pantalla'
import { leerConexion } from '@/lib/consultas/agendar-desde-consulta'
import { codigoAgrupable } from '@/lib/consultas/avisos'
import type { ConsultaEnBandeja } from '@/lib/consultas/tipos'
import { HojaArmazon } from './HojaArmazon'
import { BuscadorDePropiedades, type PropiedadParaAgendar } from './BuscadorDePropiedades'
import { ElegirQuienMuestra, type AsesorParaMostrar } from './ElegirQuienMuestra'
import { PegarLinkDelAviso } from './PegarLinkDelAviso'

export type { PropiedadParaAgendar } from './BuscadorDePropiedades'

interface Props {
  consulta: ConsultaEnBandeja
  puedeIdentificar: boolean
  /** Quiénes pueden mostrar una propiedad (asesores y dueños activos). */
  asesores: readonly AsesorParaMostrar[]
  /** Si después viene la hoja del teléfono, el botón lo dice. */
  siguienteEsTelefono: boolean
  onConectada: (propiedad: PropiedadParaAgendar) => void
  onCerrar: () => void
}

export function HojaElegirPropiedad({ consulta: c, puedeIdentificar, asesores, siguienteEsTelefono, onConectada, onCerrar }: Props) {
  const [elegida, setElegida] = useState<PropiedadParaAgendar | null>(null)
  const [muestraId, setMuestraId] = useState<string | null>(null)
  // Otra propiedad, otra persona que la muestra: se vuelve a elegir (o a proponer).
  function elegirPropiedad(p: PropiedadParaAgendar) {
    if (p.id !== elegida?.id) setMuestraId(null)
    setElegida(p)
  }
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const codigo = c.aviso_codigo?.trim()
  const titulo = c.aviso_titulo?.trim()
  const direccion = c.aviso_direccion?.trim()
  const agrupable = codigoAgrupable(c.portal, c.aviso_codigo)
  const textosDelAviso = useMemo(() => [c.aviso_direccion, c.aviso_titulo], [c.aviso_direccion, c.aviso_titulo])
  const quien = asesores.find((a) => a.id === muestraId)?.full_name

  async function seguir() {
    if (!elegida || !muestraId || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const r = await leerConexion(await fetch(`/api/consultas/${c.id}/propiedad`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ propertyId: elegida.id, muestraId }),
      }))
      if (!r.ok) { setError(r.error); return }
      if (r.actualizadas > 1) toast.success(`Se conectaron las ${r.actualizadas} consultas de este aviso con ${elegida.address}`)
      onConectada(elegida)
    } catch {
      setError('No hay conexión. Probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const enlaceAviso = enlaceSeguro(c.aviso_url, c.portal)

  const pie = puedeIdentificar ? (
    <Button type="button" onClick={seguir} disabled={!elegida || !muestraId || enviando}
      className="min-h-12 w-full bg-brand text-base text-brand-foreground hover:bg-brand/90">
      {enviando ? 'Conectando…' : siguienteEsTelefono ? 'Seguir: revisar el teléfono' : 'Seguir: elegir día y hora'}
    </Button>
  ) : (
    <Button type="button" variant="outline" className="min-h-12 w-full text-base" onClick={onCerrar}>Cerrar</Button>
  )

  return (
    <HojaArmazon
      titulo="¿Qué propiedad quiere ver?"
      descripcion={`${nombreVisible(c)} consultó por un aviso que todavía no conectamos con ninguna propiedad.`}
      pie={pie}
      onCerrar={onCerrar}
    >
      <div className="flex flex-col gap-1 rounded-xl border border-amber-300/70 bg-amber-50/60 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        <span className="font-semibold">Lo que sabemos del aviso</span>
        <span>{etiquetaPortal(c.portal)}{codigo ? ` · código ${codigo}` : ''}</span>
        {titulo && <span className="break-words">«{titulo}»</span>}
        {direccion && <span className="break-words">{direccion}</span>}
        {enlaceAviso && (
          <a href={enlaceAviso} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center font-semibold underline">
            Ver aviso en {etiquetaPortal(c.portal)}
          </a>
        )}
      </div>

      {!puedeIdentificar ? (
        <p className="rounded-xl border p-3 text-sm">
          Pedile a un coordinador que identifique este aviso. Cuando la consulta tenga su propiedad, vas a poder agendar desde acá.
        </p>
      ) : (
        <>
          <BuscadorDePropiedades textosDelAviso={textosDelAviso} elegida={elegida} onElegir={elegirPropiedad} />
          <PegarLinkDelAviso onEncontrada={elegirPropiedad} />
          {elegida && (
            <ElegirQuienMuestra key={elegida.id} asesores={asesores} propiedadId={elegida.id} valor={muestraId} onCambiar={setMuestraId} />
          )}
          <p className="rounded-xl border bg-muted/40 p-3 text-sm">
            {agrupable
              ? <>Se conectan <strong>todas las consultas sin propiedad de este aviso</strong>{elegida ? <> con <strong>{elegida.address}</strong></> : ''}
                {quien ? <>; las recibe <strong>{quien}</strong>, y las que lleguen después entran solas.</> : '.'}</>
              : <>Esta consulta no trae el código del aviso: se conecta solo esta{quien ? <> y la recibe <strong>{quien}</strong></> : ''}.</>}
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </>
      )}
    </HojaArmazon>
  )
}
