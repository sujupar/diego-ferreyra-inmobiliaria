'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function ImpersonationBanner({ name, role }: { name: string; role: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleStop() {
    setLoading(true)
    await fetch('/api/admin/impersonate', { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="bg-amber-400 text-amber-950 px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-3">
      <span>Viendo como: <strong>{name}</strong> ({role})</span>
      <button
        onClick={handleStop}
        disabled={loading}
        className="bg-amber-950 text-amber-100 px-3 py-1 rounded text-xs font-bold hover:bg-amber-900 transition-colors"
      >
        {loading ? 'Volviendo...' : 'Volver a mi cuenta'}
      </button>
    </div>
  )
}
