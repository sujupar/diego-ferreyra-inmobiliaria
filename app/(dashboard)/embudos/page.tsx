import { requireRole } from '@/lib/auth/require-role'
import { EmbudosClient } from './EmbudosClient'

export const dynamic = 'force-dynamic'

export default async function EmbudosPage() {
  // Solo admin/dueno (redirige a / si no). Mismo gate que /metrics.
  await requireRole('admin', 'dueno')
  return <EmbudosClient />
}
