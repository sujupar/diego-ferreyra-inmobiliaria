'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tablero } from '@/components/metrics/tablero/Tablero'
import { PanelNegocio } from '@/components/metrics/panel/PanelNegocio'
import DetalleOperativo from './DetalleOperativo'

/**
 * Métricas. El Tablero (una página, cinco franjas) va primero; el panel de
 * negocio completo y el detalle operativo de siempre quedan en sus pestañas,
 * intactos. Cada pestaña se monta recién al abrirla: tiene sus propias cargas.
 */
export default function MetricsPage() {
  const [tab, setTab] = useState('tablero')
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Métricas</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tablero">Tablero</TabsTrigger>
          <TabsTrigger value="panel">Detalle completo</TabsTrigger>
          <TabsTrigger value="detalle">Detalle operativo</TabsTrigger>
        </TabsList>
        <TabsContent value="tablero" className="pt-2">{tab === 'tablero' && <Tablero />}</TabsContent>
        <TabsContent value="panel" className="pt-2">{tab === 'panel' && <PanelNegocio />}</TabsContent>
        <TabsContent value="detalle" className="pt-2">{tab === 'detalle' && <DetalleOperativo />}</TabsContent>
      </Tabs>
    </div>
  )
}
