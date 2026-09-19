'use client'

/**
 * Paso "Descripción" de los asistentes de MercadoLibre y Argenprop (era el
 * mismo código copiado en los dos).
 *
 * CONDICIONAL (pedido del dueño, 2026-09-19): la descripción se crea UNA vez,
 * en la ficha, y los portales la toman.
 *  - Con descripción: viene cargada y se puede retocar; no hay botón de generar.
 *  - Sin descripción: el mismo botón y panel de la ficha. Al guardar queda en la
 *    ficha (para el otro portal y la landing) y en el borrador del aviso.
 */
import { useEffect } from 'react'
import type { TextoGenerado } from '@/lib/descripcion/tipos'
import { BotonGenerarDescripcion } from './BotonGenerarDescripcion'

export function DescripcionDelAviso({
  propertyId,
  title,
  description,
  tituloMax,
  onChange,
  onValidityChange,
}: {
  propertyId: string
  title: string
  description: string
  tituloMax: number
  onChange: (p: { title?: string; description?: string }) => void
  onValidityChange: (ok: boolean) => void
}) {
  useEffect(() => {
    onValidityChange(description.trim().length >= 100)
  }, [description, onValidityChange])

  const tieneTexto = description.trim().length > 0

  function alGuardar(t: TextoGenerado) {
    onChange({ title: t.title.slice(0, tituloMax), description: `${t.subtitle}\n\n${t.body}` })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Descripción del aviso</h3>
        {tieneTexto ? (
          <p className="text-sm text-muted-foreground">
            Tomada de la ficha de la propiedad. Podés retocarla acá; para regenerarla con el método de Diego, usá el botón de la ficha.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Esta propiedad todavía no tiene descripción. Generala con el método de Diego: queda guardada en la ficha y la usan todos los portales.
          </p>
        )}
      </div>

      {!tieneTexto && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <BotonGenerarDescripcion propertyId={propertyId} tieneDescripcion={false} onGuardado={alGuardar} />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="aviso-titulo" className="text-sm font-medium">Título (máx {tituloMax})</label>
        <input
          id="aviso-titulo"
          value={title}
          onChange={e => onChange({ title: e.target.value.slice(0, tituloMax) })}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">{title.length}/{tituloMax}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="aviso-descripcion" className="text-sm font-medium">Descripción (mín 100)</label>
        <textarea
          id="aviso-descripcion"
          value={description}
          onChange={e => onChange({ description: e.target.value })}
          rows={12}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
        <p className={`text-xs ${description.length >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>
          {description.length} caracteres (mín 100)
        </p>
      </div>
    </div>
  )
}
