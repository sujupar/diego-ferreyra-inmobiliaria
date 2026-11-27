import { CargandoCartera } from '@/components/crm/cartera/EstadosCartera'

// Mientras el servidor arma la lista de personas: el título y el mismo esqueleto que el CRM,
// sin ningún número.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Contactos</h1>
      <CargandoCartera />
    </div>
  )
}
