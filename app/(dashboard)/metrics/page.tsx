'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PanelNegocio } from '@/components/metrics/panel/PanelNegocio'
import DetalleOperativo from './DetalleOperativo'

/**
 * Métricas. El panel de negocio va primero (es lo que se mira en la reunión de
 * los viernes); el detalle operativo de siempre queda en su pestaña, intacto.
 * La pestaña de detalle se monta recién al abrirla: tiene sus propias cargas.
 */
export default function MetricsPage() {
  const [tab, setTab] = useState('panel')
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Métricas</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="panel">Panel de negocio</TabsTrigger>
          <TabsTrigger value="detalle">Detalle operativo</TabsTrigger>
        </TabsList>
        <TabsContent value="panel" className="pt-2"><PanelNegocio /></TabsContent>
        <TabsContent value="detalle" className="pt-2">{tab === 'detalle' && <DetalleOperativo />}</TabsContent>
      </Tabs>
    </div>
  )
}
