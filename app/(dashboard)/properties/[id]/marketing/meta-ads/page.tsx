import { requireAuth } from '@/lib/auth/require-role'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Megaphone } from 'lucide-react'
import { MetaAdsWizard } from '@/components/properties/wizards/MetaAdsWizard'

export const metadata = { title: 'Lanzar campaña Meta Ads' }

export default async function MetaAdsWizardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requireAuth()
  if (user.profile.role === 'abogado') redirect('/')
  const { id } = await params

  return (
    <div className="max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/properties/${id}`}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver al detalle de la propiedad
        </Link>
      </Button>

      <div>
        <p className="eyebrow">Asistente inteligente</p>
        <h1 className="display text-3xl flex items-center gap-3">
          <Megaphone className="h-7 w-7 text-[color:var(--brand)]" />
          Campaña Meta Ads
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          El sistema analiza la propiedad, propone el público ideal y arma la
          campaña. Vos revisás y lanzás cuando estés conforme.
        </p>
      </div>

      <MetaAdsWizard propertyId={id} />
    </div>
  )
}
