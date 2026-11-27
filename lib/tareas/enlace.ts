// A dónde lleva una tarea al tocarla (movida de `app/(dashboard)/tasks/page.tsx` sin cambiar
// su regla, para usarla también en la campanita: crm-tareas-y-campanita, D2).
import { enlaceTareaCadencia } from '@/lib/crm/tareas-ficha'

export interface TareaConEnlace {
  type: string
  source_activity_id?: string | null
  contact_id: string | null
  deal_id: string | null
  appraisal_id: string | null
  property_id: string | null
}

export function enlaceDeTarea(task: TareaConEnlace): string {
  // Una tarea de la cadencia de llamadas abre la ficha del contacto, donde se registra la llamada.
  const ficha = enlaceTareaCadencia(task)
  if (ficha) return ficha
  // "Actualizar contacto": el editor en la superficie más útil (proceso > tasación > contacto).
  if (task.type === 'update_contact') {
    if (task.deal_id) return `/pipeline/${task.deal_id}?editContact=1`
    if (task.appraisal_id) return `/appraisals/${task.appraisal_id}?editContact=1`
    if (task.contact_id) return `/contacts/${task.contact_id}?edit=1`
    return '#'
  }
  // El informe del ciclo lleva a la pestaña Informes de la propiedad.
  if (task.type === 'informe_quincenal' && task.property_id) return `/properties/${task.property_id}?tab=informes`
  if (task.deal_id) return `/pipeline/${task.deal_id}`
  if (task.property_id) return `/properties/${task.property_id}`
  if (task.appraisal_id) return `/appraisals/${task.appraisal_id}`
  if (task.contact_id) return `/contacts/${task.contact_id}`
  return '#'
}
