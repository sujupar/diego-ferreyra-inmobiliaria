'use client'

/**
 * Publicaciones: subir videos en tanda, elegir el ritmo, revisar y programar.
 * Pestañas: Nueva tanda · Programado · Publicado. Ajustes en el panel lateral.
 */
import { useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NuevaTanda } from './NuevaTanda'
import { PanelAjustes } from './PanelAjustes'
import { PestanaProgramado } from './PestanaProgramado'
import { PestanaPublicado } from './PestanaPublicado'

type Pestana = 'nueva' | 'programado' | 'publicado'

export function PublicacionesClient() {
  const [pestana, setPestana] = useState<Pestana>('nueva')
  const [vueltaNueva, setVueltaNueva] = useState(0)
  const [ajustes, setAjustes] = useState(false)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Publicaciones</h1>
          <p className="text-sm text-muted-foreground">
            Subí los videos, elegí cada cuánto salen y quedan programados en Instagram, Facebook, YouTube y TikTok.
          </p>
        </div>
        <Button variant="outline" size="icon" aria-label="Ajustes" onClick={() => setAjustes(true)}>
          <Settings className="h-4 w-4" aria-hidden />
        </Button>
      </header>

      <Tabs value={pestana} onValueChange={(v) => setPestana(v as Pestana)}>
        <TabsList>
          <TabsTrigger value="nueva">Nueva tanda</TabsTrigger>
          <TabsTrigger value="programado">Programado</TabsTrigger>
          <TabsTrigger value="publicado">Publicado</TabsTrigger>
        </TabsList>
        <TabsContent value="nueva" className="pt-4">
          <NuevaTanda
            key={vueltaNueva}
            onProgramada={() => {
              setVueltaNueva((n) => n + 1)
              setPestana('programado')
            }}
          />
        </TabsContent>
        <TabsContent value="programado" className="pt-4">
          {pestana === 'programado' && <PestanaProgramado />}
        </TabsContent>
        <TabsContent value="publicado" className="pt-4">
          <PestanaPublicado />
        </TabsContent>
      </Tabs>

      <PanelAjustes abierto={ajustes} onCerrar={() => setAjustes(false)} />
    </div>
  )
}
