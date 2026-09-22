'use client'

/**
 * "Revisá los mensajes": TODO lo que el sistema le va a decir a la gente, armado
 * como una conversación de Instagram y editable ahí mismo.
 *
 * Existe porque el dueño lo pidió como obligatorio (2026-09-22): al enganchar un
 * reel se guardaba sin mostrar qué se iba a responder, y las frases públicas no
 * se veían en ningún lado. Se usa en los tres lugares (enganchar, subir y
 * configurar) para que el asesor vea siempre lo mismo.
 *
 * Los textos precargados salen de `textos-por-defecto.ts`, el MISMO módulo que
 * usa el procesador: lo que se aprueba acá es lo que se manda. Y se valida con
 * `validarMensajes`, la misma regla de la ruta.
 */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AlertTriangle, Info, Link2 } from 'lucide-react'
import {
  BOTON_POR_DEFECTO,
  FRASES_CON_PRIVADO,
  FRASES_SIN_PRIVADO,
  PRIVADO_POR_DEFECTO,
  SEGUIMIENTO_POR_DEFECTO,
} from '@/lib/social/reels/textos-por-defecto'
import { MAX_CARACTERES_BOTON, MAX_FRASES, validarMensajes } from '@/lib/social/reels/mensajes'
import { prometePrivado } from '@/lib/social/reels/respuestas'

export interface MensajesEditables {
  /** Siempre 3 casilleros (pueden quedar vacíos: se descartan al guardar). */
  respuestas_con_privado: string[]
  respuestas_sin_privado: string[]
  dm_texto: string
  dm_boton: string
  dm_seguimiento: string
}

function tresCasilleros(frases: readonly string[] | null | undefined, respaldo: readonly string[]): string[] {
  const base = frases && frases.length > 0 ? [...frases] : [...respaldo]
  return [...base, '', '', ''].slice(0, MAX_FRASES)
}

export function mensajesDeFabrica(): MensajesEditables {
  return {
    respuestas_con_privado: tresCasilleros(FRASES_CON_PRIVADO, FRASES_CON_PRIVADO),
    respuestas_sin_privado: tresCasilleros(FRASES_SIN_PRIVADO, FRASES_SIN_PRIVADO),
    dm_texto: PRIVADO_POR_DEFECTO,
    dm_boton: BOTON_POR_DEFECTO,
    dm_seguimiento: SEGUIMIENTO_POR_DEFECTO,
  }
}

/** Lo guardado de un reel, con los huecos llenos por los textos de fábrica (lo mismo que haría el procesador). */
export function mensajesDelReel(r: {
  respuestas_con_privado?: string[] | null
  respuestas_sin_privado?: string[] | null
  dm_texto?: string | null
  dm_boton?: string | null
  dm_seguimiento?: string | null
}): MensajesEditables {
  return {
    respuestas_con_privado: tresCasilleros(r.respuestas_con_privado, FRASES_CON_PRIVADO),
    respuestas_sin_privado: tresCasilleros(r.respuestas_sin_privado, FRASES_SIN_PRIVADO),
    dm_texto: r.dm_texto?.trim() || PRIVADO_POR_DEFECTO,
    dm_boton: r.dm_boton?.trim() || BOTON_POR_DEFECTO,
    dm_seguimiento: r.dm_seguimiento?.trim() || SEGUIMIENTO_POR_DEFECTO,
  }
}

/** `null` si se puede guardar; si no, el motivo, igual al que daría el servidor. */
export function problemaDeMensajes(m: MensajesEditables): string | null {
  const r = validarMensajes(m)
  return r.ok ? null : r.error
}

interface Props {
  valor: MensajesEditables
  onCambiar: (valor: MensajesEditables) => void
  /** La primera palabra del reel, para el comentario de ejemplo. */
  palabraDeEjemplo: string
  /** Slug de la landing publicada; sin él se muestra que falta. */
  slugLanding: string | null
  /** Si los privados están habilitados. Apagados → hoy se usan las frases de respaldo. */
  privadosActivos: boolean
  deshabilitado?: boolean
}

const BASE_ENLACE = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar').replace(/\/+$/, '').replace(/^https?:\/\//, '')

function Burbuja({ de, nuestra, children }: { de: string; nuestra?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 ${nuestra ? 'items-end' : 'items-start'}`}>
      <span className="text-[10px] text-muted-foreground">{de}</span>
      <div
        className={`w-full max-w-[92%] rounded-2xl px-3 py-2 text-sm ${
          nuestra ? 'rounded-tr-sm bg-primary/10' : 'rounded-tl-sm bg-muted'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

function Seccion({ numero, titulo, ayuda, children }: { numero: number; titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border p-3" aria-label={titulo}>
      <div>
        <p className="text-sm font-medium">
          <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
            {numero}
          </span>
          {titulo}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{ayuda}</p>
      </div>
      {children}
    </section>
  )
}

export function RevisionMensajes({ valor, onCambiar, palabraDeEjemplo, slugLanding, privadosActivos, deshabilitado }: Props) {
  const cambiar = (campos: Partial<MensajesEditables>) => onCambiar({ ...valor, ...campos })
  const cambiarFrase = (grupo: 'respuestas_con_privado' | 'respuestas_sin_privado', i: number, texto: string) => {
    const frases = [...valor[grupo]]
    frases[i] = texto
    cambiar({ [grupo]: frases })
  }
  const problema = problemaDeMensajes(valor)
  const respaldoPromete = valor.respuestas_sin_privado.some((f) => f.trim() && prometePrivado(f))
  const nuestra = '@inmobiliariadiegoferreyra'

  return (
    <div className="space-y-3">
      <Seccion
        numero={1}
        titulo="En el comentario"
        ayuda="A quien comente una de las palabras le respondemos debajo, a la vista de todos, con UNA de estas frases (van rotando)."
      >
        <Burbuja de="@alguien comentó">{palabraDeEjemplo || 'la palabra'}</Burbuja>

        <div className="space-y-2">
          <p className="text-xs font-medium">Cuando el privado sale</p>
          {valor.respuestas_con_privado.map((frase, i) => (
            <Burbuja key={`con-${i}`} de={`${nuestra} · frase ${i + 1}`} nuestra>
              <Input
                aria-label={`Frase ${i + 1} cuando el privado sale`}
                value={frase}
                maxLength={300}
                disabled={deshabilitado}
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                onChange={(e) => cambiarFrase('respuestas_con_privado', i, e.target.value)}
              />
            </Burbuja>
          ))}
        </div>

        <div className="space-y-2 rounded-md border border-dashed p-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            Si el privado no sale
            {!privadosActivos && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                hoy se usan estas
              </span>
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {privadosActivos
              ? 'Se usan cuando el privado no se puede mandar (por ejemplo, si la persona ya recibió uno por este reel).'
              : 'Los mensajes privados todavía no están habilitados, así que por ahora se responde con estas. No prometas un privado acá.'}
          </p>
          {valor.respuestas_sin_privado.map((frase, i) => (
            <Burbuja key={`sin-${i}`} de={`${nuestra} · frase ${i + 1}`} nuestra>
              <Input
                aria-label={`Frase ${i + 1} si el privado no sale`}
                value={frase}
                maxLength={300}
                disabled={deshabilitado}
                className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                onChange={(e) => cambiarFrase('respuestas_sin_privado', i, e.target.value)}
              />
            </Burbuja>
          ))}
          {respaldoPromete && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-500" role="status">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              Alguna de estas promete un privado, y se usan justamente cuando el privado no sale.
            </p>
          )}
        </div>
      </Seccion>

      <Seccion
        numero={2}
        titulo="Por privado"
        ayuda="Le llega a su bandeja de Instagram con un botón para que responda."
      >
        <Burbuja de={nuestra} nuestra>
          <Textarea
            aria-label="Mensaje privado"
            rows={3}
            maxLength={1000}
            value={valor.dm_texto}
            disabled={deshabilitado}
            className="min-h-0 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            onChange={(e) => cambiar({ dm_texto: e.target.value })}
          />
          <div className="mt-2 border-t pt-2">
            <Label htmlFor="rm-boton" className="text-[10px] text-muted-foreground">Botón</Label>
            <Input
              id="rm-boton"
              aria-label="Texto del botón"
              value={valor.dm_boton}
              maxLength={MAX_CARACTERES_BOTON}
              disabled={deshabilitado}
              className="mt-1 h-8 rounded-full text-center font-medium"
              onChange={(e) => cambiar({ dm_boton: e.target.value })}
            />
            <p className="mt-1 text-right text-[10px] text-muted-foreground">
              {valor.dm_boton.trim().length}/{MAX_CARACTERES_BOTON}
            </p>
          </div>
        </Burbuja>
      </Seccion>

      <Seccion
        numero={3}
        titulo="Cuando toca el botón"
        ayuda="Le contestamos con este mensaje y el enlace de la landing de la propiedad."
      >
        <Burbuja de="@alguien">{valor.dm_boton.trim() || 'el botón'}</Burbuja>
        <Burbuja de={nuestra} nuestra>
          <Textarea
            aria-label="Mensaje que acompaña al enlace"
            rows={2}
            maxLength={1000}
            value={valor.dm_seguimiento}
            disabled={deshabilitado}
            className="min-h-0 resize-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            onChange={(e) => cambiar({ dm_seguimiento: e.target.value })}
          />
          <p className="mt-1 flex items-center gap-1 break-all text-xs text-primary">
            <Link2 className="h-3 w-3 shrink-0" aria-hidden />
            {slugLanding ? `${BASE_ENLACE}/p/${slugLanding}` : 'Falta publicar la landing: sin ella no hay enlace para mandar'}
          </p>
        </Burbuja>
      </Seccion>

      {problema && (
        <p className="flex items-start gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {problema}
        </p>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        Todo esto se puede cambiar después desde «Configurar».
      </p>
    </div>
  )
}
