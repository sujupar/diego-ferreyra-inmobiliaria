'use client'

import { UnidentifiedBanner } from '@/components/inbox/UnidentifiedBanner'
import { Pendientes } from '@/components/tareas/Pendientes'
import { VisitasAtrasadas } from '@/components/tareas/VisitasAtrasadas'

// Pendientes (crm-tareas-y-campanita, D5): la maqueta aprobada, más los dos carteles que ya
// existían arriba (usuario sin identificar y visitas pendientes de marcar).
export default function TasksPage() {
  return (
    <div className="flex flex-col gap-5">
      <UnidentifiedBanner />
      <VisitasAtrasadas />
      <Pendientes />
    </div>
  )
}
