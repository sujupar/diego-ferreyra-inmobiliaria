'use client'
/**
 * Panel de la PÁGINA DE GRACIAS (`/v/<token>`) — la que ve la persona después
 * de registrarse, con el recorrido y el formulario para proponer la visita.
 *
 * Solo textos: la estructura (dónde va el video, dónde el formulario) queda
 * fija, igual que en la landing. Los campos vacíos vuelven al texto por
 * defecto, así que borrar uno nunca deja la página coja — el placeholder
 * muestra cuál es ese default.
 */
import { Field } from './Field'
import { defaultThanks, type ThanksSubject } from '@/lib/landing/thanks'
import type { ThanksContent } from '@/lib/landing/schema'

export function ThanksPanel({ value, subject, onChange }: {
  value: ThanksContent
  subject: ThanksSubject
  onChange: (next: ThanksContent) => void
}) {
  const def = defaultThanks(subject)
  const set = (k: keyof ThanksContent) => (v: string) => onChange({ ...value, [k]: v })

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Página de gracias</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Podés usar <code className="rounded bg-muted px-1">{'{nombre}'}</code> y{' '}
          <code className="rounded bg-muted px-1">{'{direccion}'}</code>: se reemplazan por los datos de cada persona.
          Si dejás un campo vacío, vuelve al texto de siempre.
        </p>
      </div>

      <Field label={`Saludo — por defecto: "${def.greeting}"`}
        value={value.greeting ?? ''} maxKey="thanks.greeting" onChange={set('greeting')} />
      <Field label={`Titular — por defecto: "${def.headline}"`}
        value={value.headline ?? ''} maxKey="thanks.headline" onChange={set('headline')} />
      <Field label="Párrafo bajo el precio (opcional, vacío por defecto)" multiline
        value={value.intro ?? ''} maxKey="thanks.intro" onChange={set('intro')} />

      <div className="border-t pt-4">
        <p className="mb-3 text-xs font-medium text-muted-foreground">Sección para agendar la visita</p>
        <div className="space-y-4">
          <Field label={`Titular — por defecto: "${def.scheduleTitle}"`}
            value={value.scheduleTitle ?? ''} maxKey="thanks.scheduleTitle" onChange={set('scheduleTitle')} />
          <Field label="Bajada" multiline
            value={value.scheduleText ?? ''} maxKey="thanks.scheduleText" onChange={set('scheduleText')} />
        </div>
      </div>
    </div>
  )
}
