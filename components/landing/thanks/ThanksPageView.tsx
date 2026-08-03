/**
 * La página de gracias, SIN datos ni red: todo entra por props.
 *
 * Existe para que la vista previa del editor y la página real
 * (`app/v/[token]/page.tsx`) sean el MISMO componente. Si el editor tuviera su
 * propia copia del layout, tarde o temprano mostraría algo distinto de lo que
 * recibe el cliente — que es la única cosa que un editor no puede hacer.
 *
 * No es 'use client': se renderiza igual en el servidor (página real) que
 * dentro del editor, que ya es un cliente. El formulario de agendar entra por
 * `scheduleSlot` para que la página real le pase el formulario de verdad y el
 * editor una maqueta que no se puede tocar.
 */
import type { ReactNode } from 'react'
import type { ResolvedThanks } from '@/lib/landing/thanks'

export interface ThanksPageViewProps {
  texts: ResolvedThanks
  /** Línea bajo el titular: barrio, ciudad y precio ya formateados. */
  subtitle: string
  media: ReactNode
  /** El formulario de visita, o la maqueta del editor. `null` cuando la propiedad ya no está disponible. */
  scheduleSlot: ReactNode
  /** `false` = vendida/descartada: no se ofrece agendar una visita que no va a existir. */
  available: boolean
}

/** Textos del estado "ya no está disponible". No se editan: es un caso de borde y conviene que sea uniforme. */
const NO_DISPONIBLE = {
  title: 'Esta propiedad ya no está disponible',
  text: 'Podés seguir viendo el recorrido, pero por ahora no estamos coordinando visitas. Un asesor se va a contactar con vos para mostrarte otras opciones parecidas.',
}

export function ThanksPageView({ texts, subtitle, media, scheduleSlot, available }: ThanksPageViewProps) {
  return (
    <div className="landing-root min-h-screen">
      <main className="mx-auto max-w-4xl px-5 py-10 md:py-16">
        <p className="lx-eyebrow">{texts.greeting}</p>
        <h1 className="mt-2 text-3xl md:text-5xl">{texts.headline}</h1>
        <p className="mt-2 text-black/60">{subtitle}</p>
        {texts.intro && <p className="mt-4 max-w-2xl text-black/70">{texts.intro}</p>}

        <section className="mt-8">{media}</section>

        {available ? (
          <section className="mt-12">
            <h2 className="text-2xl md:text-3xl">{texts.scheduleTitle}</h2>
            <p className="mt-2 text-black/60">{texts.scheduleText}</p>
            {scheduleSlot}
          </section>
        ) : (
          <section className="mt-12">
            <h2 className="text-2xl md:text-3xl">{NO_DISPONIBLE.title}</h2>
            <p className="mt-2 text-black/60">{NO_DISPONIBLE.text}</p>
          </section>
        )}
      </main>
    </div>
  )
}
