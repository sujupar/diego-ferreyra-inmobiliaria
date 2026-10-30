'use client'

/**
 * Publicaciones: subir videos en tanda, elegir el ritmo, revisar y programar.
 * Pestañas: Nueva tanda · Programado · Publicado. Ajustes en el panel lateral.
 */
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NuevaTanda } from './NuevaTanda'

type Pestana = 'nueva' | 'programado' | 'publicado'

export function PublicacionesClient() {
  const [pestana, setPestana] = useState<Pestana>('nueva')
  const [vueltaNueva, setVueltaNueva] = useState(0)

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Publicaciones</h1>
        <p className="text-sm text-muted-foreground">
          Subí los videos, elegí cada cuánto salen y quedan programados en Instagram, Facebook, YouTube y TikTok.
        </p>
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
        <TabsContent value="programado" className="pt-4" />
        <TabsContent value="publicado" className="pt-4" />
      </Tabs>
    </div>
  )
}
