'use client'
/**
 * Vista previa de la PÁGINA DE GRACIAS dentro del editor.
 *
 * Usa el MISMO `ThanksPageView` que la página real, con los mismos textos
 * resueltos por `renderThanks`. Lo único distinto son los datos de la persona
 * —que en la página real vienen del token y acá son de ejemplo— y el
 * formulario de visita, que acá es una maqueta que no se puede tocar: mostrar
 * el formulario real invitaría a agendar una visita desde el editor.
 */
import { ThanksPageView } from '@/components/landing/thanks/ThanksPageView'
import { ThanksMedia } from '@/components/landing/thanks/ThanksMedia'
import { renderThanks } from '@/lib/landing/thanks'
import { resolveDeliverMedia } from '@/lib/properties/deliver-media'
import { toEmbedUrl } from '@/lib/landing/video-embed'
import type { LandingProperty } from '@/lib/landing/registry'
import type { ThanksContent } from '@/lib/landing/schema'

/** Nombre de ejemplo — para que se vea cómo queda el `{nombre}` con algo real. */
const NOMBRE_EJEMPLO = 'Julián'

function formatPrice(v: number | null, c: string | null): string {
  if (!v) return ''
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: c === 'ARS' ? 'ARS' : 'USD',
    minimumFractionDigits: 0,
  }).format(v)
}

export function ThanksPreview({ property, thanks }: { property: LandingProperty; thanks: ThanksContent }) {
  const media = resolveDeliverMedia(property)
  const embed = media.url ? toEmbedUrl(media.url) : null
  const texts = renderThanks(
    { address: property.address, mediaKind: media.kind },
    thanks,
    { nombre: NOMBRE_EJEMPLO, direccion: property.address },
  )

  return (
    <div className="lx-editor-preview">
      <ThanksPageView
        texts={texts}
        subtitle={`${property.neighborhood}${property.city ? `, ${property.city}` : ''} · ${formatPrice(property.asking_price, property.currency)}`}
        media={<ThanksMedia kind={media.kind} url={media.url} embed={embed} photos={(property.photos ?? []) as string[]} />}
        // En la vista previa SIEMPRE se muestra la sección de agendar, aunque la
        // propiedad esté vendida: si no, el asesor no podría editar esos textos.
        available
        scheduleSlot={
          <div className="mt-6 rounded-lg border border-dashed p-4 text-sm text-black/50">
            Acá va el formulario para elegir día y hora. No se puede editar: lo completa la persona.
          </div>
        }
      />
    </div>
  )
}
