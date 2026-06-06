import { requireAuth } from '@/lib/auth/require-role'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Megaphone } from 'lucide-react'
import { MetaAdsWizard } from '@/components/properties/wizards/MetaAdsWizard'
import { MetaAdsWizardV2 } from '@/components/properties/wizards/MetaAdsWizardV2'
import type { Database } from '@/types/database.types'

export const metadata = { title: 'Lanzar campaña Meta Ads' }

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export default async function MetaAdsWizardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAuth()
  if (user.profile.role === 'abogado') redirect('/')
  const { id } = await params

  // Decidir qué wizard mostrar:
  //  - Si la propiedad YA tiene campaña no archivada → wizard v1 (que tiene
  //    pantalla de gestión: pausar/reactivar/archivar).
  //  - Si NO tiene campaña → wizard v2 (flujo de 11 etapas con generación
  //    asíncrona de 27 piezas).
  const supabase = getAdmin()
  const { data: existingCampaign } = await supabase
    .from('property_meta_campaigns')
    .select('campaign_id, status')
    .eq('property_id', id)
    .neq('status', 'archived')
    .neq('status', 'failed')
    .maybeSingle()

  const useV2 = !existingCampaign

  let propertyMinimal = null
  if (useV2) {
    const { data: prop } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()
    propertyMinimal = prop
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/properties/${id}`}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver al detalle de la propiedad
        </Link>
      </Button>

      <div>
        <p className="eyebrow">
          {useV2 ? 'Asistente inteligente (v2)' : 'Gestión de campaña'}
        </p>
        <h1 className="display text-3xl flex items-center gap-3">
          <Megaphone className="h-7 w-7 text-[color:var(--brand)]" />
          Campaña Meta Ads
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          {useV2
            ? 'El sistema analiza la propiedad, identifica 3 perfiles de comprador, genera 27 piezas gráficas con IA y arma la campaña. Vos confirmás en cada etapa.'
            : 'Tu propiedad ya tiene una campaña activa. Podés gestionarla (pausar / reactivar / archivar) desde acá.'}
        </p>
      </div>

      {useV2 && propertyMinimal ? (
        <MetaAdsWizardV2
          propertyId={id}
          property={propertyMinimal as never}
        />
      ) : (
        <MetaAdsWizard propertyId={id} />
      )}
    </div>
  )
}
