'use client'

import { Plus } from 'lucide-react'

// El "+" de la vista de una columna (maqueta `.fab`). NO es `fixed`: va último en la
// ficha, con `mt-auto sticky bottom-4` (clase `ficha-mas`, globals.css), así queda abajo
// aunque haya pocos registros y nunca tapa el último. Con columnas se oculta por CSS.
export function BotonMas({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Agregar nota o registrar llamada"
      onClick={onClick}
      data-solo="pestanas"
      className="ficha-mas ficha-solo-pestanas inline-flex size-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_10px_30px_-8px_rgb(0_0_0/0.22),0_2px_6px_rgb(0_0_0/0.06)]"
    >
      <Plus aria-hidden className="size-6" />
    </button>
  )
}
