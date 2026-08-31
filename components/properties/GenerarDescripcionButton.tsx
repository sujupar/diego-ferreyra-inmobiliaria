'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles, Check, X } from 'lucide-react'

/**
 * "Generar descripción" en la ficha de la propiedad.
 *
 * POR QUÉ EXISTE: el asesor carga la propiedad y, si no toca el botón del
 * formulario de alta, la ficha queda SIN descripción para siempre — y sin
 * descripción no se publica bien en ningún portal ni se arma una landing
 * decente. Hasta ahora, desde la ficha ya cargada, no había forma de generarla.
 *
 * NO ES UN PROCESO NUEVO: pega contra
 * `POST /api/properties/[id]/generate-description`, el mismo que ya existía,
 * que usa el system prompt de portales (`lib/marketing/portal-descriptions/`).
 * Ese prompt ya incluye lo que importa del entorno — transportes, comercios,
 * plazas y colegios del barrio, adaptado al perfil del comprador. Duplicar la
 * generación acá habría creado un segundo texto que se desincroniza del
 * primero.
 *
 * ## Por qué muestra una vista previa en vez de guardar de una
 *
 * Guardar escribe DOS columnas: `description` y también `title`. Una propiedad
 * sin descripción puede tener un título que alguien escribió a mano, y pisarlo
 * de un clic sin que se vea sería destruir trabajo ajeno en silencio. Con la
 * vista previa, lo que se guarda es lo que la persona leyó y aceptó.
 */

interface Generado {
  title: string
  subtitle: string
  body: string
}

export function GenerarDescripcionButton({
  propertyId,
  onSaved,
}: {
  propertyId: string
  /** Se llama después de guardar, para que la ficha muestre el texto nuevo. */
  onSaved: () => void
}) {
  const [generando, setGenerando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [previa, setPrevia] = useState<Generado | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pedir(guardar: boolean) {
    if (guardar) setGuardando(true)
    else setGenerando(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/generate-description`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ save: guardar }),
      })
      // El servidor puede devolver una página de error (timeout del gateway) en
      // vez de JSON. Sin esto, el mensaje que ve el asesor es
      // `Unexpected token '<'`, que no dice nada. Ver CLAUDE.md § readJson.
      const texto = await res.text()
      let data: { error?: string; generated?: Generado } = {}
      try {
        data = JSON.parse(texto) as typeof data
      } catch {
        throw new Error(
          res.ok ? 'El servidor respondió algo inesperado.' : 'El servidor tardó demasiado. Probá de nuevo.',
        )
      }
      if (!res.ok) throw new Error(data.error ?? 'No se pudo generar la descripción.')
      if (!data.generated) throw new Error('La respuesta vino vacía.')

      if (guardar) {
        setPrevia(null)
        onSaved()
      } else {
        setPrevia(data.generated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la descripción.')
    } finally {
      setGenerando(false)
      setGuardando(false)
    }
  }

  if (previa) {
    return (
      <div className="mt-3 rounded-lg border bg-card p-3">
        <p className="eyebrow mb-2">Propuesta — todavía no se guardó</p>
        <p className="text-sm font-medium">{previa.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{previa.subtitle}</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
          {previa.body}
        </p>
        {error && <p className="mt-2 text-xs text-[color:var(--destructive)]">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => pedir(true)} disabled={guardando}>
            {guardando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
            Guardar
          </Button>
          <Button size="sm" variant="outline" onClick={() => pedir(false)} disabled={generando || guardando}>
            {generando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            Generar otra
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setPrevia(null); setError(null) }} disabled={guardando}>
            <X className="mr-1 h-4 w-4" />
            Descartar
          </Button>
        </div>
        {/* Se avisa ANTES de guardar, no después: guardar también cambia el título. */}
        <p className="mt-2 text-xs text-muted-foreground">
          Al guardar se reemplaza también el título de la propiedad.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3">
      <Button size="sm" variant="outline" onClick={() => pedir(false)} disabled={generando}>
        {generando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
        {generando ? 'Generando…' : 'Generar descripción'}
      </Button>
      {error && <p className="mt-2 text-xs text-[color:var(--destructive)]">{error}</p>}
    </div>
  )
}
