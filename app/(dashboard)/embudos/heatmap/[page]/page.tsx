import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/require-role'
import { HeatmapViewerClient } from './HeatmapViewerClient'

export const dynamic = 'force-dynamic'

const FUNNELS: Record<string, { label: string; slug: string }> = {
  tasacion: { label: 'Tasación Directa', slug: 'tasacion-directa' },
  clase: { label: 'Clase Gratuita', slug: 'vsl-clase-propietarios' },
}

export default async function HeatmapViewerPage({ params }: { params: Promise<{ page: string }> }) {
  await requireRole('admin', 'dueno') // mismo gate que /embudos
  const { page } = await params
  const funnel = FUNNELS[page]
  if (!funnel) notFound()
  return <HeatmapViewerClient page={page} label={funnel.label} slug={funnel.slug} />
}
