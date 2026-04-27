'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/valuation/utils'
import type {
    PurchaseScenarioId,
    PurchaseScenarioInput,
    PurchaseScenarioResult,
} from '@/lib/valuation/calculator'

interface Props {
    scenarios: PurchaseScenarioInput[]
    results: PurchaseScenarioResult[]
    selectedIds: PurchaseScenarioId[]
    currency: string
    moneyFromSale: number
    onScenariosChange: (next: PurchaseScenarioInput[]) => void
    onSelectedIdsChange: (next: PurchaseScenarioId[]) => void
}

export function PurchaseScenariosEditor({
    scenarios,
    results,
    selectedIds,
    currency,
    onScenariosChange,
    onSelectedIdsChange,
}: Props) {
    function updateScenario(idx: number, patch: Partial<PurchaseScenarioInput>) {
        const next = [...scenarios]
        next[idx] = { ...next[idx], ...patch }
        onScenariosChange(next)
    }
    function updateRates(idx: number, patch: Partial<PurchaseScenarioInput['rates']>) {
        updateScenario(idx, { rates: { ...scenarios[idx].rates, ...patch } })
    }
    function toggleSelected(id: PurchaseScenarioId) {
        if (selectedIds.includes(id)) {
            onSelectedIdsChange(selectedIds.filter(s => s !== id))
        } else {
            onSelectedIdsChange([...selectedIds, id])
        }
    }

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Escenarios de Compra</h3>
                <p className="text-xs text-muted-foreground">
                    Marcá los que querés incluir en el informe
                </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {scenarios.map((s, idx) => {
                    const r = results[idx]
                    if (!r) return null
                    return (
                        <div
                            key={s.id}
                            className={`rounded-lg border bg-card p-4 space-y-3 ${
                                selectedIds.includes(s.id) ? 'ring-2 ring-primary' : ''
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold">{s.label}</h4>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                                        checked={selectedIds.includes(s.id)}
                                        onChange={() => toggleSelected(s.id)}
                                    />
                                    Incluir
                                </label>
                            </div>
                            <div className="space-y-2">
                                <FieldNum
                                    label="Valor publicación"
                                    value={s.publicationPrice}
                                    onChange={v => updateScenario(idx, { publicationPrice: v })}
                                />
                                <FieldNum
                                    label="% Descuento de compra"
                                    value={s.purchaseDiscountPercent}
                                    step="0.1"
                                    onChange={v => updateScenario(idx, { purchaseDiscountPercent: v })}
                                />
                                <FieldNum
                                    label="% Descuento escritura"
                                    value={s.deedDiscountPercent}
                                    step="0.1"
                                    onChange={v => updateScenario(idx, { deedDiscountPercent: v })}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <FieldNum label="Sellos %" value={s.rates.stampsPercent} step="0.01" onChange={v => updateRates(idx, { stampsPercent: v })} />
                                    <FieldNum label="Honor. escribano %" value={s.rates.notaryFeesPercent} step="0.01" onChange={v => updateRates(idx, { notaryFeesPercent: v })} />
                                    <FieldNum label="Gastos escritura %" value={s.rates.deedExpensesPercent} step="0.01" onChange={v => updateRates(idx, { deedExpensesPercent: v })} />
                                    <FieldNum label="Honor. inmob. %" value={s.rates.buyerCommissionPercent} step="0.01" onChange={v => updateRates(idx, { buyerCommissionPercent: v })} />
                                </div>
                            </div>
                            <div className="border-t pt-3 space-y-1 text-sm">
                                <RowKV k="Valor de compra" v={formatCurrency(r.purchasePrice, currency)} />
                                <RowKV k="Total gastos compra" v={formatCurrency(r.totalPurchaseCosts, currency)} />
                                <RowKV k="Costo total" v={formatCurrency(r.totalCostWithPurchase, currency)} bold />
                                <RowKV k="En mano luego compra" v={formatCurrency(r.remainingMoney, currency)} color={r.remainingMoney >= 0 ? 'green' : 'red'} bold />
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

function FieldNum({ label, value, onChange, step = '1' }: {
    label: string; value: number; onChange: (v: number) => void; step?: string
}) {
    return (
        <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <Input
                type="number" step={step} min={0}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="h-9 text-sm"
            />
        </div>
    )
}

function RowKV({ k, v, bold, color }: { k: string; v: string; bold?: boolean; color?: 'green' | 'red' }) {
    const colorClass =
        color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-foreground'
    return (
        <div className={`flex justify-between ${bold ? 'font-semibold' : ''} ${colorClass}`}>
            <span className="text-muted-foreground">{k}</span>
            <span>{v}</span>
        </div>
    )
}
