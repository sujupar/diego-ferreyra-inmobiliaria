import { requireAuth } from '@/lib/auth/require-role'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Megaphone } from 'lucide-react'
import { MetaAdsWizard } from '@/components/properties/wizards/MetaAdsWizard'
import { MetaAdsWizardV2 } from '@/components/properties/wizards/MetaAdsWizardV2'
import { isCampaignComplete } from '@/lib/marketing/campaign-completeness'
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
  //  - Si la propiedad ya tiene campaña REALMENTE completa (Campaign + AdSet +
  //    Ads + status active/paused/done) → wizard V1 (panel de gestión).
  //  - Si la fila existe pero la campaña está zombi (provisioning sin Ads,
  //    típicamente por timeout del incidente 2026-06-09) → V2 con el flag de
  //    cleanup necesario, así el asesor puede archivar y empezar limpio.
  //  - Si NO hay fila → V2 fresh.
  //
  // CRÍTICO: distinguir zombi VIEJO de publish EN CURSO. Si en este mismo
  // instante hay un /confirm corriendo (job en 'publishing' con updated_at
  // reciente y fila property_meta_campaigns recién creada), NO mostrar
  // cleanup — sino el asesor archivaría una campaña legítima en construcción.
  const supabase = getAdmin()
  const { data: existingCampaign } = await supabase
    .from('property_meta_campaigns')
    .select('campaign_id, adset_id, ad_ids, status, created_at')
    .eq('property_id', id)
    .neq('status', 'archived')
    .neq('status', 'failed')
    .maybeSingle()

  // Detectar si hay un publish en curso ahora mismo.
  // meta_launch_jobs no está en types/database.types (el usuario corre las
  // migraciones manualmente), por eso el cast.
  const { data: publishingJob } = (await (supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (a: string, b: string) => {
          eq: (a: string, b: string) => {
            order: (a: string, opts: { ascending: boolean }) => {
              limit: (n: number) => {
                maybeSingle: () => Promise<{ data: { id: string; status: string; updated_at: string } | null }>
              }
            }
          }
        }
      }
    }
  })
    .from('meta_launch_jobs')
    .select('id, status, updated_at')
    .eq('property_id', id)
    .eq('status', 'publishing')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle())

  const nowMs = Date.now()
  const campaignCreatedMsAgo = existingCampaign?.created_at
    ? nowMs - new Date(existingCampaign.created_at).getTime()
    : Infinity
  const publishingJobAgeMs = publishingJob?.updated_at
    ? nowMs - new Date(publishingJob.updated_at).getTime()
    : Infinity

  // In-flight = fila joven (<2 min) + job de publishing con activity reciente (<60s)
  const isInFlightPublish =
    !!existingCampaign &&
    campaignCreatedMsAgo < 2 * 60_000 &&
    !!publishingJob &&
    publishingJobAgeMs < 60_000

  const isComplete = isCampaignComplete(existingCampaign)
  const useV2 = !isComplete
  // Sólo es zombi si NO está completa Y NO es in-flight. In-flight es legítimo.
  const hasZombieCampaign = !!existingCampaign && !isComplete && !isInFlightPublish

  // Si V2 y hay un job vivo del wizard, lo pasamos al cliente para que retome
  // (no regenera 27 piezas — recupera el jobId existente).
  let existingJobId: string | null = null
  if (useV2) {
    const { data: liveJob } = (await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string) => {
            in: (a: string, b: string[]) => {
              order: (a: string, opts: { ascending: boolean }) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{ data: { id: string; status: string } | null }>
                }
              }
            }
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .select('id, status')
      .eq('property_id', id)
      // 'failed' incluido: un job que el confirm marcó failed sigue siendo
      // recuperable (las 27 piezas quedan en property_ad_assets, el wizard
      // puede ofrecer "Reintentar publicar" sin regenerar nada).
      .in('status', ['analyzing', 'awaiting_user_input', 'generating', 'awaiting_confirm', 'publishing', 'failed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle())
    existingJobId = liveJob?.id ?? null
  }

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
          existingJobId={existingJobId}
          hasZombieCampaign={hasZombieCampaign}
        />
      ) : (
        <MetaAdsWizard propertyId={id} />
      )}
    </div>
  )
}
