'use client'

/**
 * "＋ Nuevo" de la barra superior (spec §3.1). Recibe el ROL como texto —nunca
 * íconos ni funciones desde el servidor: cruzar esa frontera tira la pantalla
 * entera (CLAUDE.md § "Un ícono de lucide NO cruza la frontera").
 * "Nueva tasación" se muestra solo si el rol ya la tiene en el menú lateral:
 * la fuente de verdad es getNavSections, no una lista repetida acá.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, CalendarPlus, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { getNavSections, isCollapsible } from '@/lib/nav/sections'
import { puedeGestionarVisitas } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'
import { AgendarVisitaDialog } from './agendar/AgendarVisitaDialog'

function tieneNuevaTasacion(role: Role): boolean {
  return getNavSections(role).some(g => g.entries.some(e =>
    isCollapsible(e) ? e.items.some(i => i.href === '/appraisal/new') : e.href === '/appraisal/new'))
}

export function BotonNuevo({ role }: { role: Role }) {
  const [agendar, setAgendar] = useState(false)
  const conTasacion = useMemo(() => tieneNuevaTasacion(role), [role])
  if (!puedeGestionarVisitas(role)) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="h-9 gap-1.5 bg-foreground px-3 text-background hover:bg-foreground/90" aria-label="Nuevo">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Nuevo</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setAgendar(true)} className="min-h-11 gap-2">
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />Agendar visita
          </DropdownMenuItem>
          {conTasacion && (
            <DropdownMenuItem asChild className="min-h-11 gap-2">
              <Link href="/appraisal/new"><ClipboardList className="h-4 w-4" aria-hidden="true" />Nueva tasación</Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AgendarVisitaDialog open={agendar} onOpenChange={setAgendar} />
    </>
  )
}
