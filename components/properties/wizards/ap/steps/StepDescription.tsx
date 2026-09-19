'use client'
import { DescripcionDelAviso } from '@/components/properties/descripcion/DescripcionDelAviso'
import { TITULO_MAX_AP } from '@/lib/portals/titulo-sugerido'
import type { ApDraft } from '../types'

interface Props {
  propertyId: string
  draft: ApDraft
  onChange: (p: Partial<ApDraft>) => void
  onValidityChange: (ok: boolean) => void
}

/**
 * La descripción se crea UNA vez, en la ficha, con el método de Diego; este paso
 * la toma y deja retocarla. Solo si no hay, ofrece generarla (ver DescripcionDelAviso).
 */
export function StepDescription({ propertyId, draft, onChange, onValidityChange }: Props) {
  return (
    <DescripcionDelAviso
      propertyId={propertyId}
      title={draft.title}
      description={draft.description}
      tituloMax={TITULO_MAX_AP}
      onChange={onChange}
      onValidityChange={onValidityChange}
    />
  )
}
