import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Los filtros puestos como fichas que se sacan de a una, más "Limpiar filtros" (maqueta
// `chipsActivos()`; spec crm-sistema-diseno "Filtros con nombre"). Cada ficha es un botón
// con la cruz; el lector de pantalla oye "Sacar el filtro …".

export function FichasFiltros<C extends string>({
  fichas,
  alSacar,
  alLimpiar,
}: {
  fichas: { clave: C; texto: string }[]
  alSacar: (clave: C) => void
  alLimpiar: () => void
}) {
  if (fichas.length === 0) return null
  return (
    <div aria-label="Filtros puestos" role="group" className="flex flex-wrap items-center gap-1.5">
      {fichas.map((f) => (
        <button
          key={f.clave}
          type="button"
          onClick={() => alSacar(f.clave)}
          aria-label={`Sacar el filtro ${f.texto}`}
          className={cn(
            'inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-card py-1 pl-2.5 pr-1.5 text-left text-xs font-medium md:raton:min-h-8',
            'outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-brand',
          )}
        >
          {f.texto}
          <X aria-hidden className="size-3.5 text-texto-suave" />
        </button>
      ))}
      <button
        type="button"
        onClick={alLimpiar}
        className="inline-flex min-h-11 items-center rounded-md px-2.5 text-xs font-medium text-texto-suave hover:bg-accent hover:text-foreground md:raton:min-h-8"
      >
        Limpiar filtros
      </button>
    </div>
  )
}
