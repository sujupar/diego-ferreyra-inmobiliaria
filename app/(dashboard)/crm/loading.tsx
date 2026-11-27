import { CargandoCartera } from '@/components/crm/cartera/EstadosCartera'

// Mientras el servidor arma la cartera: el título y el esqueleto de la barra y de la lista,
// sin ningún número (spec "Cargando").
export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
      <CargandoCartera />
    </div>
  )
}
