import { requireAuth } from '@/lib/auth/require-role'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Building2 } from 'lucide-react'
import { ArgenpropWizard } from '@/components/properties/wizards/ap/ArgenpropWizard'

export const metadata = { title: 'Publicar en Argenprop' }

export default async function ArgenpropWizardPage({ params }: { params: Promise<{ id: string }> }) {
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
        <p className="eyebrow">Publicación manual</p>
        <h1 className="display text-3xl flex items-center gap-3">
          <Building2 className="h-7 w-7 text-[color:var(--brand)]" />
          Argenprop
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          Previsualizá el aviso, completá los campos que pide Argenprop y publicá cuando estés
          conforme. Mientras tanto, no se publica nada.
        </p>
      </div>
      <ArgenpropWizard propertyId={id} />
    </div>
  )
}
