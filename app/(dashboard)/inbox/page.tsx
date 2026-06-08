import { requireAuth } from '@/lib/auth/require-role'
import { redirect } from 'next/navigation'
import { InboxTabs } from './InboxTabs'

export const metadata = { title: 'Inbox de leads' }

export default async function InboxPage() {
  const user = await requireAuth()
  const role = user.profile.role
  if (!['admin', 'dueno', 'coordinador', 'asesor'].includes(role)) {
    redirect('/')
  }
  return <InboxTabs userRole={role} userId={user.id} />
}
