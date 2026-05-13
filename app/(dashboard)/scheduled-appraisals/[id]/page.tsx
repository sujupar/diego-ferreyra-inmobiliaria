// app/(dashboard)/scheduled-appraisals/[id]/page.tsx
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getScheduledAppraisal } from '@/lib/supabase/scheduled-appraisals'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default async function ScheduledAppraisalDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const item = await getScheduledAppraisal(id)
  if (!item) notFound()

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: deal } = await supabase
    .from('deals')
    .select('id, visit_data, visit_completed_at, property_type, neighborhood, rooms, covered_area')
    .eq('scheduled_appraisal_id', id)
    .maybeSingle()

  const buyer = (item.buyer_interest as Record<string, unknown> | null) ?? null

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{item.property_address}</h1>
          <p className="text-muted-foreground text-sm">
            Agendada: {new Date(`${item.scheduled_date}T${item.scheduled_time ?? '00:00'}`).toLocaleString('es-AR')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge>{item.status}</Badge>
          <Button asChild>
            <Link
              href={
                item.appraisal
                  ? `/properties/new?appraisalId=${item.appraisal.id}`
                  : `/properties/new?scheduledAppraisalId=${item.id}`
              }
            >
              Captar como propiedad
            </Link>
          </Button>
        </div>
      </header>

      <section className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Contacto</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><strong>Nombre:</strong> {item.contact?.full_name ?? '-'}</p>
            <p><strong>Tel:</strong> {item.contact?.phone ?? '-'}</p>
            <p><strong>Email:</strong> {item.contact?.email ?? '-'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notas al agendar</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {item.scheduling_notes || <span className="text-muted-foreground">Sin notas</span>}
          </CardContent>
        </Card>

        {buyer && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle>Interés de compra del cliente</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><strong>Zona buscada:</strong> {String(buyer.zona ?? '-')}</p>
              <p><strong>Presupuesto:</strong> USD {String(buyer.presupuesto_min ?? '?')} - {String(buyer.presupuesto_max ?? '?')}</p>
              <p><strong>Ambientes mínimos:</strong> {String(buyer.ambientes_min ?? '-')}</p>
              <p><strong>Notas:</strong> {String(buyer.notas ?? '-')}</p>
            </CardContent>
          </Card>
        )}

        {deal?.visit_data && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Datos relevados en la visita</CardTitle>
              <p className="text-xs text-muted-foreground">
                Visita completada {deal.visit_completed_at ? new Date(deal.visit_completed_at).toLocaleString('es-AR') : ''}
              </p>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
                {JSON.stringify(deal.visit_data, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {item.appraisal && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle>Tasación realizada</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm">{item.appraisal.property_title}</p>
              <Button asChild>
                <Link href={`/appraisals/${item.appraisal.id}`}>Ver tasación</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
