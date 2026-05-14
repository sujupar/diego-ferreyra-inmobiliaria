'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Megaphone, Building2, BarChart3, Mail, Film } from 'lucide-react'
import { PortalListingsCard } from './PortalListingsCard'
import { PortalMetricsChart } from './PortalMetricsChart'
import { MetaCampaignCard } from './MetaCampaignCard'
import { PropertyLeadsCard } from './PropertyLeadsCard'
import { RenderVideoCard } from './RenderVideoCard'

interface TabProps {
  propertyId: string
  canManage: boolean
}

const TABS = [
  { key: 'overview', label: 'Resumen', icon: Megaphone },
  { key: 'portales', label: 'Portales', icon: Building2 },
  { key: 'meta', label: 'Meta Ads', icon: BarChart3 },
  { key: 'leads', label: 'Leads', icon: Mail },
  { key: 'video', label: 'Video', icon: Film },
] as const

type TabKey = (typeof TABS)[number]['key']

export function MarketingTabs({ propertyId, canManage }: TabProps) {
  const [active, setActive] = useState<TabKey>('overview')

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-3">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon
              const isActive = active === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActive(t.key)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ${
                    isActive
                      ? 'bg-[color:var(--brand)] text-white'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {active === 'overview' && (
        <div className="space-y-4">
          <PortalListingsCard propertyId={propertyId} />
          <MetaCampaignCard propertyId={propertyId} canManage={canManage} />
          <PropertyLeadsCard propertyId={propertyId} compact />
        </div>
      )}

      {active === 'portales' && (
        <div className="space-y-4">
          <PortalListingsCard propertyId={propertyId} />
          <PortalMetricsChart propertyId={propertyId} />
        </div>
      )}

      {active === 'meta' && (
        <MetaCampaignCard propertyId={propertyId} canManage={canManage} />
      )}

      {active === 'leads' && <PropertyLeadsCard propertyId={propertyId} />}

      {active === 'video' && <RenderVideoCard propertyId={propertyId} />}
    </div>
  )
}
