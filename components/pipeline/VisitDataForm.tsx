'use client'

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Home, ShoppingCart, Save, Loader2, CheckCircle2, Ruler, Building2, Hammer, Clock, Star, StickyNote, Wallet, MapPin } from 'lucide-react'
import type {
  VisitDataSnapshot, SaleVisitData, PurchaseVisitData,
  PropertyTypeVenta, Disposition, Orientation, Quality, ConservationState,
} from '@/types/visit-data.types'
import { CONSTRUCTION_FEATURES_OPTIONS } from '@/types/visit-data.types'

const EMPTY_SALE: SaleVisitData = {
  property_type: 'departamento',
  property_type_other: null,
  rooms: null, bedrooms: null, bathrooms: null, garages: null,
  covered_m2: null, semi_covered_m2: null, uncovered_m2: null, total_m2: null, terrain_m2: null,
  age_years: null, is_refurbished: false,
  orientation: null, floor: null, total_floors: null,
  disposition: null, quality: null, conservation: null,
  construction_features: [], reason_for_sale: null, sale_timeframe: null,
  strong_points: [], extra_notes: null,
}

const EMPTY_PURCHASE: PurchaseVisitData = {
  interested_in_purchase: false,
  property_type_target: null, rooms_target: null,
  budget_min: null, budget_max: null, budget_currency: 'USD',
  neighborhoods_target: [], required_features: [],
  purchase_timeframe: null, extra_notes: null,
}

interface Props {
  dealId: string
  initial: VisitDataSnapshot | null
  onCompleted: () => void
}

export function VisitDataForm({ dealId, initial, onCompleted }: Props) {
  const [sale, setSale] = useState<SaleVisitData>(initial?.sale || EMPTY_SALE)
  const [purchase, setPurchase] = useState<PurchaseVisitData>(initial?.purchase || EMPTY_PURCHASE)
  const [activeTab, setActiveTab] = useState<'sale' | 'purchase'>('sale')
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [finalizing, setFinalizing] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save debounced (500ms tras cada cambio)
  const triggerAutoSave = useCallback((next: Partial<VisitDataSnapshot>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      setSavingStatus('saving')
      try {
        const res = await fetch(`/api/deals/${dealId}/visit-data`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot: next }),
        })
        if (!res.ok) throw new Error('save failed')
        setSavingStatus('saved')
        setTimeout(() => setSavingStatus('idle'), 2000)
      } catch {
        setSavingStatus('error')
      }
    }, 500)
  }, [dealId])

  const updateSale = <K extends keyof SaleVisitData>(key: K, value: SaleVisitData[K]) => {
    const next = { ...sale, [key]: value }
    setSale(next)
    triggerAutoSave({ sale: next })
  }

  const updatePurchase = <K extends keyof PurchaseVisitData>(key: K, value: PurchaseVisitData[K]) => {
    const next = { ...purchase, [key]: value }
    setPurchase(next)
    triggerAutoSave({ purchase: next })
  }

  const toggleFeature = (f: string) => {
    const next = sale.construction_features.includes(f)
      ? sale.construction_features.filter(x => x !== f)
      : [...sale.construction_features, f]
    updateSale('construction_features', next)
  }

  const addStrongPoint = (point: string) => {
    if (!point.trim()) return
    updateSale('strong_points', [...sale.strong_points, point.trim()])
  }

  async function handleFinalize() {
    setFinalizing(true)
    // Forzar flush del save pendiente
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    try {
      await fetch(`/api/deals/${dealId}/visit-data`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: { sale, purchase }, complete: true }),
      })
      onCompleted()
    } catch {
      alert('Error al finalizar la visita. Los datos sí fueron guardados.')
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Tab pills + status indicator */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-xl border bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('sale')}
            className={`px-5 py-2 rounded-lg text-sm flex items-center gap-2 transition-all duration-200 ${
              activeTab === 'sale'
                ? 'bg-background shadow-md font-semibold text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Home className="h-4 w-4" /> Venta (Propiedad)
          </button>
          <button
            onClick={() => setActiveTab('purchase')}
            className={`px-5 py-2 rounded-lg text-sm flex items-center gap-2 transition-all duration-200 ${
              activeTab === 'purchase'
                ? 'bg-background shadow-md font-semibold text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ShoppingCart className="h-4 w-4" /> Compra (Interesado)
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-xs h-7 px-3 rounded-full bg-muted/50 min-w-[90px] justify-center">
          {savingStatus === 'idle' && <span className="text-muted-foreground">Auto-guardado</span>}
          {savingStatus === 'saving' && <><Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> <span className="text-muted-foreground">Guardando...</span></>}
          {savingStatus === 'saved' && <><CheckCircle2 className="h-3 w-3 text-green-600" /> <span className="text-green-700 font-medium">Guardado</span></>}
          {savingStatus === 'error' && <span className="text-red-600 font-medium">Error — reintenta</span>}
        </div>
      </div>

      {activeTab === 'sale' && (
        <SaleSection
          sale={sale}
          onUpdate={updateSale}
          onToggleFeature={toggleFeature}
          onAddStrongPoint={addStrongPoint}
        />
      )}
      {activeTab === 'purchase' && (
        <PurchaseSection purchase={purchase} onUpdate={updatePurchase} />
      )}

      <div className="flex gap-3 pt-4 border-t">
        <Button onClick={handleFinalize} disabled={finalizing} size="lg" className="flex-1">
          {finalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Finalizar Visita
        </Button>
      </div>
    </div>
  )
}

// Small reusable section header with icon
function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <CardTitle className="text-base font-semibold flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {children}
    </CardTitle>
  )
}

// ──── SaleSection ────
function SaleSection({
  sale, onUpdate, onToggleFeature, onAddStrongPoint,
}: {
  sale: SaleVisitData
  onUpdate: <K extends keyof SaleVisitData>(k: K, v: SaleVisitData[K]) => void
  onToggleFeature: (f: string) => void
  onAddStrongPoint: (p: string) => void
}) {
  const [newPoint, setNewPoint] = useState('')
  return (
    <div className="space-y-4">
      {/* Características Básicas */}
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardHeader><SectionTitle icon={Home}>Características Básicas</SectionTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><Label>Tipo</Label>
            <select value={sale.property_type} onChange={e => onUpdate('property_type', e.target.value as PropertyTypeVenta)} className="w-full rounded-md border px-3 py-2">
              <option value="departamento">Departamento</option>
              <option value="casa">Casa</option>
              <option value="ph">PH</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          {sale.property_type === 'otro' && (
            <div><Label>Especificar</Label>
              <Input value={sale.property_type_other || ''} onChange={e => onUpdate('property_type_other', e.target.value)} />
            </div>
          )}
          <div><Label>Ambientes</Label>
            <Input type="number" min="0" value={sale.rooms ?? ''} onChange={e => onUpdate('rooms', e.target.value ? +e.target.value : null)} />
          </div>
          <div><Label>Dormitorios</Label>
            <Input type="number" min="0" value={sale.bedrooms ?? ''} onChange={e => onUpdate('bedrooms', e.target.value ? +e.target.value : null)} />
          </div>
          <div><Label>Baños</Label>
            <Input type="number" min="0" value={sale.bathrooms ?? ''} onChange={e => onUpdate('bathrooms', e.target.value ? +e.target.value : null)} />
          </div>
          <div><Label>Cocheras</Label>
            <Input type="number" min="0" value={sale.garages ?? ''} onChange={e => onUpdate('garages', e.target.value ? +e.target.value : null)} />
          </div>
        </CardContent>
      </Card>

      {/* Metrajes */}
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardHeader><SectionTitle icon={Ruler}>Metrajes (m²)</SectionTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><Label>Cubiertos</Label><Input type="number" value={sale.covered_m2 ?? ''} onChange={e => onUpdate('covered_m2', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Semi-cubiertos</Label><Input type="number" value={sale.semi_covered_m2 ?? ''} onChange={e => onUpdate('semi_covered_m2', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Descubiertos</Label><Input type="number" value={sale.uncovered_m2 ?? ''} onChange={e => onUpdate('uncovered_m2', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Totales</Label><Input type="number" value={sale.total_m2 ?? ''} onChange={e => onUpdate('total_m2', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Terreno</Label><Input type="number" value={sale.terrain_m2 ?? ''} onChange={e => onUpdate('terrain_m2', e.target.value ? +e.target.value : null)} /></div>
        </CardContent>
      </Card>

      {/* Antigüedad y Estado */}
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardHeader><SectionTitle icon={Building2}>Antigüedad, Orientación, Estado</SectionTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><Label>Antigüedad (años)</Label>
            <Input type="number" min="0" value={sale.age_years ?? ''} onChange={e => onUpdate('age_years', e.target.value ? +e.target.value : null)} />
          </div>
          <div><Label>¿Refaccionado?</Label>
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" checked={sale.is_refurbished} onChange={e => onUpdate('is_refurbished', e.target.checked)} className="h-4 w-4 rounded" />
              <span>Sí, refaccionado</span>
            </div>
          </div>
          <div><Label>Orientación</Label>
            <select value={sale.orientation ?? ''} onChange={e => onUpdate('orientation', (e.target.value || null) as Orientation | null)} className="w-full rounded-md border px-3 py-2">
              <option value="">Sin definir</option>
              {['N','S','E','O','NE','NO','SE','SO'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div><Label>Piso</Label><Input type="number" value={sale.floor ?? ''} onChange={e => onUpdate('floor', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Plantas totales</Label><Input type="number" value={sale.total_floors ?? ''} onChange={e => onUpdate('total_floors', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Disposición</Label>
            <select value={sale.disposition ?? ''} onChange={e => onUpdate('disposition', (e.target.value || null) as Disposition | null)} className="w-full rounded-md border px-3 py-2">
              <option value="">Sin definir</option>
              <option value="frente">Frente</option>
              <option value="contrafrente">Contrafrente</option>
              <option value="interno">Interno</option>
              <option value="lateral">Lateral</option>
            </select>
          </div>
          <div><Label>Calidad</Label>
            <select value={sale.quality ?? ''} onChange={e => onUpdate('quality', (e.target.value || null) as Quality | null)} className="w-full rounded-md border px-3 py-2">
              <option value="">Sin definir</option>
              {['baja','media-baja','media','media-alta','alta','premium'].map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div><Label>Estado conservación</Label>
            <select value={sale.conservation ?? ''} onChange={e => onUpdate('conservation', (e.target.value || null) as ConservationState | null)} className="w-full rounded-md border px-3 py-2">
              <option value="">Sin definir</option>
              <option value="a_refaccionar">A refaccionar</option>
              <option value="bueno">Bueno</option>
              <option value="muy_bueno">Muy bueno</option>
              <option value="excelente">Excelente</option>
              <option value="a_estrenar">A estrenar</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Características constructivas */}
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardHeader><SectionTitle icon={Hammer}>Características Constructivas</SectionTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {CONSTRUCTION_FEATURES_OPTIONS.map(f => (
            <Badge
              key={f}
              variant={sale.construction_features.includes(f) ? 'default' : 'outline'}
              className="cursor-pointer transition-all duration-200 hover:shadow-sm"
              onClick={() => onToggleFeature(f)}
            >
              {f}
            </Badge>
          ))}
        </CardContent>
      </Card>

      {/* Motivación de venta */}
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardHeader><SectionTitle icon={Clock}>Motivación y Tiempos</SectionTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <Label>¿Por qué quiere vender?</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border px-3 py-2 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              value={sale.reason_for_sale ?? ''}
              onChange={e => onUpdate('reason_for_sale', e.target.value || null)}
              placeholder="Mudanza, separación, inversión, etc."
            />
          </div>
          <div>
            <Label>¿En cuánto tiempo quiere vender?</Label>
            <select
              value={sale.sale_timeframe ?? ''}
              onChange={e => onUpdate('sale_timeframe', e.target.value || null)}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">Sin definir</option>
              <option value="urgente">Urgente (&lt;1 mes)</option>
              <option value="1-3_meses">1–3 meses</option>
              <option value="3-6_meses">3–6 meses</option>
              <option value="6+_meses">Más de 6 meses</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Puntos fuertes */}
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardHeader><SectionTitle icon={Star}>Puntos Estratégicos (Fortalezas)</SectionTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newPoint}
              onChange={e => setNewPoint(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddStrongPoint(newPoint); setNewPoint('') } }}
              placeholder="Ej: Vista abierta, ubicación estratégica, edificio nuevo..."
            />
            <Button type="button" size="sm" onClick={() => { onAddStrongPoint(newPoint); setNewPoint('') }}>Agregar</Button>
          </div>
          {sale.strong_points.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Aún no hay fortalezas registradas. Anotá lo que destaque la propiedad.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sale.strong_points.map((p, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1 transition-all duration-200">
                  {p}
                  <button
                    onClick={() => onUpdate('strong_points', sale.strong_points.filter((_, ix) => ix !== i))}
                    className="ml-1 h-4 w-4 rounded-full flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                    aria-label={`Quitar ${p}`}
                  >&times;</button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notas adicionales */}
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardHeader><SectionTitle icon={StickyNote}>Notas adicionales</SectionTitle></CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[80px] rounded-md border px-3 py-2 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            value={sale.extra_notes ?? ''}
            onChange={e => onUpdate('extra_notes', e.target.value || null)}
            placeholder="Observaciones libres..."
          />
        </CardContent>
      </Card>
    </div>
  )
}

// ──── PurchaseSection ────
function PurchaseSection({ purchase, onUpdate }: {
  purchase: PurchaseVisitData
  onUpdate: <K extends keyof PurchaseVisitData>(k: K, v: PurchaseVisitData[K]) => void
}) {
  return (
    <div className="space-y-4">
      <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={purchase.interested_in_purchase}
              onChange={e => onUpdate('interested_in_purchase', e.target.checked)}
              className="h-4 w-4 rounded"
              id="interested"
            />
            <Label htmlFor="interested" className="font-semibold cursor-pointer">¿El cliente también está buscando comprar?</Label>
          </div>
          {!purchase.interested_in_purchase && (
            <p className="text-xs text-muted-foreground italic">
              Tildá la casilla si además de vender, el cliente está interesado en comprar otra propiedad.
            </p>
          )}
        </CardContent>
      </Card>

      {purchase.interested_in_purchase && (
        <>
          <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
            <CardHeader><SectionTitle icon={ShoppingCart}>Preferencias de Compra</SectionTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div><Label>Tipo buscado</Label>
                <select value={purchase.property_type_target ?? ''} onChange={e => onUpdate('property_type_target', (e.target.value || null) as PropertyTypeVenta | null)} className="w-full rounded-md border px-3 py-2">
                  <option value="">Sin definir</option>
                  <option value="departamento">Departamento</option>
                  <option value="casa">Casa</option>
                  <option value="ph">PH</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div><Label>Ambientes</Label>
                <Input type="number" value={purchase.rooms_target ?? ''} onChange={e => onUpdate('rooms_target', e.target.value ? +e.target.value : null)} />
              </div>
              <div><Label>Plazo de compra</Label>
                <select value={purchase.purchase_timeframe ?? ''} onChange={e => onUpdate('purchase_timeframe', e.target.value || null)} className="w-full rounded-md border px-3 py-2">
                  <option value="">Sin definir</option>
                  <option value="urgente">Urgente</option>
                  <option value="1-3_meses">1–3 meses</option>
                  <option value="3-6_meses">3–6 meses</option>
                  <option value="6+_meses">Más de 6 meses</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
            <CardHeader><SectionTitle icon={Wallet}>Presupuesto</SectionTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-sm">
              <div><Label>Mínimo</Label><Input type="number" value={purchase.budget_min ?? ''} onChange={e => onUpdate('budget_min', e.target.value ? +e.target.value : null)} /></div>
              <div><Label>Máximo</Label><Input type="number" value={purchase.budget_max ?? ''} onChange={e => onUpdate('budget_max', e.target.value ? +e.target.value : null)} /></div>
              <div><Label>Moneda</Label>
                <select value={purchase.budget_currency} onChange={e => onUpdate('budget_currency', e.target.value as 'USD' | 'ARS')} className="w-full rounded-md border px-3 py-2">
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl transition-all duration-200 hover:shadow-md">
            <CardHeader><SectionTitle icon={MapPin}>Zonas y Requisitos</SectionTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Barrios de interés (separados por coma)</Label>
                <Input
                  value={purchase.neighborhoods_target.join(', ')}
                  onChange={e => onUpdate('neighborhoods_target', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="Palermo, Belgrano, Recoleta..."
                />
              </div>
              <div>
                <Label>Características requeridas (separadas por coma)</Label>
                <Input
                  value={purchase.required_features.join(', ')}
                  onChange={e => onUpdate('required_features', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="Cochera, amenities, 2 baños..."
                />
              </div>
              <div>
                <Label>Notas</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border px-3 py-2 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  value={purchase.extra_notes ?? ''}
                  onChange={e => onUpdate('extra_notes', e.target.value || null)}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
