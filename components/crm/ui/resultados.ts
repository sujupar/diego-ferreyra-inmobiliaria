import type { LucideIcon } from 'lucide-react'
import { CalendarCheck, PhoneForwarded, PhoneMissed, PhoneOff, ThumbsDown } from 'lucide-react'
import type { ResultadoLlamada } from '@/lib/crm/tipos'

// Textos e íconos de los cinco resultados (maqueta `base.js`, `RESULTADOS`). `texto` va
// en las opciones del formulario; `corto`, en el chip. Las claves son las de la base.
export const RESULTADOS_UI: Record<ResultadoLlamada, { texto: string; corto: string; Icono: LucideIcon }> = {
  agendo: { texto: 'Atendió y agendó', corto: 'Agendó', Icono: CalendarCheck },
  volver_a_llamar: { texto: 'Atendió · volver a llamar', corto: 'Volver a llamar', Icono: PhoneForwarded },
  no_interesa: { texto: 'Atendió · no le interesa', corto: 'No le interesa', Icono: ThumbsDown },
  no_atendio: { texto: 'No atendió', corto: 'No atendió', Icono: PhoneMissed },
  numero_equivocado: { texto: 'Número equivocado', corto: 'Número equivocado', Icono: PhoneOff },
}

// "No atendió" primero: es el resultado más común y se guarda con un toque.
export const ORDEN_RESULTADOS: ResultadoLlamada[] = [
  'no_atendio',
  'agendo',
  'volver_a_llamar',
  'no_interesa',
  'numero_equivocado',
]
