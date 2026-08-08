import type { LucideIcon } from 'lucide-react'
import {
  CalendarPlus, CalendarCheck, CalendarX, Eye,
  Send, MessageSquare, Home, XCircle, GraduationCap, ShoppingCart,
} from 'lucide-react'

// Config de las etapas del pipeline (colores, íconos, gradientes) — solo
// presentación. Se extrajo de `crm/page.tsx` para bajar el archivo de las
// ~700 líneas (task-11-brief.md, Step 7).
export interface CRMStage {
  key: string
  label: string
  icon: LucideIcon
  gradient: string
  badgeBg: string
  badgeText: string
  ringColor: string
  dotColor: string
}

export const CRM_STAGES: CRMStage[] = [
  {
    key: 'clase_gratuita', label: 'Clase Gratuita',
    icon: GraduationCap,
    gradient: 'from-cyan-50 to-cyan-100/60 dark:from-cyan-950/40 dark:to-cyan-900/20',
    badgeBg: 'bg-cyan-100 dark:bg-cyan-900/50', badgeText: 'text-cyan-700 dark:text-cyan-300',
    ringColor: 'ring-cyan-400', dotColor: 'bg-cyan-500',
  },
  {
    key: 'solicitud', label: 'Solicitud',
    icon: CalendarPlus,
    gradient: 'from-sky-50 to-sky-100/60 dark:from-sky-950/40 dark:to-sky-900/20',
    badgeBg: 'bg-sky-100 dark:bg-sky-900/50', badgeText: 'text-sky-700 dark:text-sky-300',
    ringColor: 'ring-sky-400', dotColor: 'bg-sky-500',
  },
  {
    key: 'coordinada', label: 'Coordinada',
    icon: CalendarCheck,
    gradient: 'from-blue-50 to-blue-100/60 dark:from-blue-950/40 dark:to-blue-900/20',
    badgeBg: 'bg-blue-100 dark:bg-blue-900/50', badgeText: 'text-blue-700 dark:text-blue-300',
    ringColor: 'ring-blue-400', dotColor: 'bg-blue-500',
  },
  {
    key: 'no_realizada', label: 'No Realizada',
    icon: CalendarX,
    gradient: 'from-rose-50 to-rose-100/60 dark:from-rose-950/40 dark:to-rose-900/20',
    badgeBg: 'bg-rose-100 dark:bg-rose-900/50', badgeText: 'text-rose-700 dark:text-rose-300',
    ringColor: 'ring-rose-400', dotColor: 'bg-rose-500',
  },
  {
    key: 'realizada', label: 'Realizada',
    icon: Eye,
    gradient: 'from-amber-50 to-amber-100/60 dark:from-amber-950/40 dark:to-amber-900/20',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/50', badgeText: 'text-amber-700 dark:text-amber-300',
    ringColor: 'ring-amber-400', dotColor: 'bg-amber-500',
  },
  {
    key: 'entregada', label: 'Entregada',
    icon: Send,
    gradient: 'from-purple-50 to-purple-100/60 dark:from-purple-950/40 dark:to-purple-900/20',
    badgeBg: 'bg-purple-100 dark:bg-purple-900/50', badgeText: 'text-purple-700 dark:text-purple-300',
    ringColor: 'ring-purple-400', dotColor: 'bg-purple-500',
  },
  {
    key: 'seguimiento', label: 'Seguimiento',
    icon: MessageSquare,
    gradient: 'from-orange-50 to-orange-100/60 dark:from-orange-950/40 dark:to-orange-900/20',
    badgeBg: 'bg-orange-100 dark:bg-orange-900/50', badgeText: 'text-orange-700 dark:text-orange-300',
    ringColor: 'ring-orange-400', dotColor: 'bg-orange-500',
  },
  {
    key: 'captada', label: 'Captada',
    icon: Home,
    gradient: 'from-emerald-50 to-emerald-100/60 dark:from-emerald-950/40 dark:to-emerald-900/20',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/50', badgeText: 'text-emerald-700 dark:text-emerald-300',
    ringColor: 'ring-emerald-400', dotColor: 'bg-emerald-500',
  },
  {
    key: 'descartado', label: 'Descartado',
    icon: XCircle,
    gradient: 'from-red-50 to-red-100/60 dark:from-red-950/40 dark:to-red-900/20',
    badgeBg: 'bg-red-100 dark:bg-red-900/50', badgeText: 'text-red-700 dark:text-red-300',
    ringColor: 'ring-red-400', dotColor: 'bg-red-500',
  },
  {
    key: 'comprador', label: 'Comprador',
    icon: ShoppingCart,
    gradient: 'from-teal-50 to-teal-100/60 dark:from-teal-950/40 dark:to-teal-900/20',
    badgeBg: 'bg-teal-100 dark:bg-teal-900/50', badgeText: 'text-teal-700 dark:text-teal-300',
    ringColor: 'ring-teal-400', dotColor: 'bg-teal-500',
  },
]

export function deriveCRMStage(deal: { stage: string; scheduled_date: string | null }): string {
  switch (deal.stage) {
    case 'clase_gratuita': return 'clase_gratuita'
    case 'request': return 'solicitud'
    // Compat: deals viejos con stage='scheduled' sin scheduled_date son
    // "Solicitudes" pre-migración. La migración 20260506000001 ya los
    // backfilleó, pero mantenemos el fallback por defensa.
    case 'scheduled': return deal.scheduled_date ? 'coordinada' : 'solicitud'
    case 'not_visited': return 'no_realizada'
    case 'visited': return 'realizada'
    case 'appraisal_sent': return 'entregada'
    case 'followup': return 'seguimiento'
    case 'captured': return 'captada'
    case 'lost': return 'descartado'
    case 'comprador': return 'comprador'
    default: return 'solicitud'
  }
}

export function getCRMStageInfo(key: string): CRMStage {
  return CRM_STAGES.find(s => s.key === key) || CRM_STAGES[0]
}

// Map raw deals.stage → CRM stage key for server-side aggregated counts.
// Approximate: server doesn't distinguish solicitud vs coordinada (by scheduled_date).
// Acceptable for MVP.
export function mapStageToCRM(stage: string): string {
  switch (stage) {
    case 'clase_gratuita': return 'clase_gratuita'
    case 'request': return 'solicitud'
    case 'scheduled': return 'coordinada'
    case 'not_visited': return 'no_realizada'
    case 'visited': return 'realizada'
    case 'appraisal_sent': return 'entregada'
    case 'followup': return 'seguimiento'
    case 'captured': return 'captada'
    case 'lost': return 'descartado'
    case 'comprador': return 'comprador'
    default: return 'solicitud'
  }
}
