import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth/get-user'

export default async function Home() {
  const user = await getUser()

  if (!user) redirect('/login')

  // Role-based default landing page
  switch (user.profile.role) {
    case 'abogado':
      redirect('/properties/review')
    case 'coordinador':
    case 'asesor':
    case 'dueno':
    case 'admin':
    default:
      redirect('/pipeline')
  }
}
