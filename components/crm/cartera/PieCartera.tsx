import { cn } from '@/lib/utils'

// "Cargar 25 más" (al final de cada grupo) y "Mostrando X de Y…" (debajo de los grupos)
// (maqueta `pie()`, `.cartera-total`; spec "Listas largas").

export const DE_A = 25

export function CargarMas({ alCargar }: { alCargar: () => void }) {
  return (
    <div className="flex justify-center border-t border-border px-4 py-2">
      <button
        type="button"
        onClick={alCargar}
        className="inline-flex min-h-11 items-center rounded-md border border-border bg-card px-4 text-sm font-medium shadow-xs hover:bg-accent md:raton:min-h-9"
      >
        Cargar 25 más
      </button>
    </div>
  )
}

export function PieCartera({ texto, className }: { texto: string; className?: string }) {
  return (
    <p className={cn('px-1 text-xs text-texto-suave', className)} data-pie>
      {texto}
    </p>
  )
}
