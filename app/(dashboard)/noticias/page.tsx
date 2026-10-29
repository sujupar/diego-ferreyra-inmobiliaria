import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import BuscarAhora from './buscar-ahora'
import Historial from './historial'

export default function NoticiasPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Noticias</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Buscá las noticias inmobiliarias de la semana, elegí las que te sirven y convertilas en guiones para grabar.
        </p>
      </div>

      <Tabs defaultValue="buscar" className="gap-6">
        <TabsList className="h-10 w-full sm:w-fit">
          <TabsTrigger value="buscar" className="sm:px-5">Buscar ahora</TabsTrigger>
          <TabsTrigger value="historial" className="sm:px-5">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="buscar"><BuscarAhora /></TabsContent>
        <TabsContent value="historial">
          <p className="text-muted-foreground text-sm mb-6">
            Barridos diarios del Reportero: noticias inmobiliarias frescas, verificadas y rankeadas por impacto para el propietario.
          </p>
          <Historial />
        </TabsContent>
      </Tabs>
    </div>
  )
}
