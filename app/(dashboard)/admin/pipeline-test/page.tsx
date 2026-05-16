import { requireRole } from '@/lib/auth/require-role'
import { PipelineTestClient } from './PipelineTestClient'

export const metadata = { title: 'Auditoría y pruebas' }

export default async function PipelineTestPage() {
  await requireRole('admin', 'dueno')
  return <PipelineTestClient />
}
