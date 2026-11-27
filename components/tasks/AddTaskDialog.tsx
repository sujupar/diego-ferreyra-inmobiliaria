'use client'

import { cloneElement, isValidElement, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NuevaTarea } from '@/components/tareas/NuevaTarea'

// Envoltorio con la firma de siempre (crm-tareas-y-campanita, D5): sus consumidores
// (`/tasks`, la ficha, proceso, propiedad y tasación) no cambian, y todos abren el mismo
// formulario "Nueva tarea" de la maqueta. `defaultAssignee` ya no se usa: el formulario
// arranca en "Yo", como la maqueta.

interface AddTaskDialogProps {
  entity?: { kind: 'deal' | 'property' | 'appraisal' | 'contact'; id: string; label?: string }
  trigger?: React.ReactNode
  defaultAssignee?: string
  onCreated?: (taskId: string) => void
}

export function AddTaskDialog({ entity, trigger, onCreated }: AddTaskDialogProps) {
  const [abierta, setAbierta] = useState(false)
  const abrir = () => setAbierta(true)
  const disparador = isValidElement<{ onClick?: (e: React.MouseEvent) => void }>(trigger) ? (
    cloneElement(trigger, {
      onClick: (e: React.MouseEvent) => {
        trigger.props.onClick?.(e)
        abrir()
      },
    })
  ) : (
    <Button size="sm" variant="outline" onClick={abrir}>
      <Plus className="mr-1 h-4 w-4" /> Agregar tarea
    </Button>
  )
  return (
    <>
      {disparador}
      <NuevaTarea abierta={abierta} onAbierta={setAbierta} entidad={entity} onCreada={(id) => id && onCreated?.(id)} />
    </>
  )
}
