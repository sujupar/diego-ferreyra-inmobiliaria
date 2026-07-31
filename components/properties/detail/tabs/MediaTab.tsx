'use client'

import { PropertyMediaCard } from '@/components/properties/PropertyMediaCard'

interface Props {
  propertyId: string
  photos: string[]
  plans: string[]
  videoFileUrl: string | null
  tourUrl: string | null
  videoRecorridoUrl: string | null
  onChanged: () => void
}

/**
 * Envoltorio de la pestaña Multimedia. `PropertyMediaCard` queda intacto:
 * misma subida por URL firmada, mismo drag & drop de portada, mismos límites.
 */
export function MediaTab(props: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Material</p>
        <h2 className="display text-xl mt-1">Multimedia</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Las 3 primeras fotos son la portada del aviso. Arrastrá para reordenarlas.
        </p>
      </div>
      <PropertyMediaCard {...props} />
    </div>
  )
}
