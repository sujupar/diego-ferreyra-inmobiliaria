import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth/require-role'
import { redirect } from 'next/navigation'
import { InboxTabs } from './InboxTabs'

export const metadata = { title: 'Inbox de leads' }

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  // Las consultas de portales dejaron de ser una pestaña del Inbox (2026-10-29):
  // los enlaces viejos `?tab=consultas` (mails, favoritos) caen en su sección.
  const { tab } = await searchParams
  if (tab === 'consultas') redirect('/consultas')
  const user = await requireAuth()
  const role = user.profile.role
  if (!['admin', 'dueno', 'coordinador', 'asesor'].includes(role)) {
    redirect('/')
  }
  // `<Suspense>` obligatorio: `InboxTabs` usa `useSearchParams()` para el deep
  // link a un lead. Sin este límite, Next falla el prerender de la página.
  return (
    <Suspense fallback={null}>
      <InboxTabs userRole={role} userId={user.id} />
    </Suspense>
  )
}
