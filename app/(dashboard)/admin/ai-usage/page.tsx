import { requireRole } from '@/lib/auth/require-role'
import { AiUsageClient } from './AiUsageClient'

export const metadata = { title: 'Costo del agente de IA' }

/**
 * Panel de costo del agente de IA (task 5). Gate a nivel página con
 * `requireRole` (mismo patrón que `admin/pipeline-test/page.tsx`) — admin y
 * dueño, igual que el resto de "Admin" en el nav.
 */
export default async function AiUsagePage() {
  await requireRole('admin', 'dueno')
  return <AiUsageClient />
}
