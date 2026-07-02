import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import type { StockComposition, CompositionSlice } from '@/lib/market-data/types'
import { fmtInt, fmtPct } from '@/lib/market-data/arc-geometry'
import { SemiDonutPDF } from './gauges'
import { MKT } from './palette'

const S = {
    row: { flexDirection: 'row' as const, gap: 14 },
    cell: { fontSize: 8, color: '#3a4a5c', padding: 3 },
    th: { fontSize: 7, color: '#ffffff', backgroundColor: MKT.navy, padding: 4, fontWeight: 700 as const },
    legendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginBottom: 2 },
    dot: { width: 7, height: 7, borderRadius: 2 },
    legendText: { fontSize: 7, color: '#3a4a5c', flex: 1 },
    legendPct: { fontSize: 7, fontWeight: 700 as const, color: MKT.navy },
    gaugeTitle: { fontSize: 8, fontWeight: 700 as const, color: '#ffffff', backgroundColor: MKT.navy, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, marginTop: 4 },
}

function Legend({ slices, palette }: { slices: CompositionSlice[]; palette: string[] }) {
    return (
        <View style={{ marginTop: 4, width: '100%' }}>
            {slices.map((s, i) => (
                <View key={s.label} style={S.legendItem}>
                    <View style={[S.dot, { backgroundColor: palette[i % palette.length] }]} />
                    <Text style={S.legendText}>{s.label}</Text>
                    <Text style={S.legendPct}>{s.pct.toFixed(1).replace('.', ',')}%</Text>
                </View>
            ))}
        </View>
    )
}

export function StockDashboardPDF({ stock }: { stock: StockComposition }) {
    const withColors = (sl: CompositionSlice[], pal: string[]) => sl.map((s, i) => ({ pct: s.pct, color: pal[i % pal.length] }))
    return (
        <View>
            {/* hero */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 26, fontWeight: 800, color: MKT.azul }}>{fmtInt(stock.stockDeptos)}</Text>
                <Text style={{ fontSize: 9, color: MKT.gris }}>deptos en venta</Text>
                {stock.stockVm !== null && (
                    <Text style={{ fontSize: 9, fontWeight: 700, color: stock.stockVm >= 0 ? MKT.verde : MKT.rojo }}>
                        {fmtPct(stock.stockVm)} mensual
                    </Text>
                )}
                {stock.absorcion !== null && (
                    <Text style={{ fontSize: 9, color: MKT.gris }}>· absorción {stock.absorcion.toFixed(1).replace('.', ',')} meses</Text>
                )}
            </View>
            {/* tabla + gauge principal */}
            <View style={S.row}>
                <View style={{ width: 170 }}>
                    <View style={{ flexDirection: 'row' }}>
                        <Text style={[S.th, { flex: 1.6 }]}>TIPO</Text>
                        <Text style={[S.th, { flex: 1, textAlign: 'right' }]}>CANTIDAD</Text>
                        <Text style={[S.th, { flex: 0.6, textAlign: 'right' }]}>%</Text>
                    </View>
                    {stock.tipos.map((t, i) => (
                        <View key={t.label} style={{ flexDirection: 'row', backgroundColor: i % 2 ? MKT.fondoSuave : '#ffffff' }}>
                            <Text style={[S.cell, { flex: 1.6 }]}>{t.label}</Text>
                            <Text style={[S.cell, { flex: 1, textAlign: 'right' }]}>{fmtInt(t.count ?? null)}</Text>
                            <Text style={[S.cell, { flex: 0.6, textAlign: 'right' }]}>{t.pct.toFixed(1).replace('.', ',')}%</Text>
                        </View>
                    ))}
                    {stock.totalInmuebles ? (
                        <View style={{ flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: MKT.azul, backgroundColor: '#eaf1f8' }}>
                            <Text style={[S.cell, { flex: 1.6, fontWeight: 700 }]}>Inmuebles</Text>
                            <Text style={[S.cell, { flex: 1, textAlign: 'right', fontWeight: 700 }]}>{fmtInt(stock.totalInmuebles)}</Text>
                            <Text style={[S.cell, { flex: 0.6 }]} />
                        </View>
                    ) : null}
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <SemiDonutPDF width={210} thickness={34} slices={withColors(stock.tipos, MKT.tipos)} />
                    <Text style={S.gaugeTitle}>Tipo de inmueble en venta</Text>
                </View>
            </View>
            {/* 3 mini-gauges */}
            <View style={[S.row, { marginTop: 14, borderTopWidth: 1, borderTopColor: MKT.linea, paddingTop: 10 }]}>
                {([['Vendedor', stock.vendedor, MKT.vendedor],
                   ['Antigüedad', stock.antiguedad, MKT.antiguedad],
                   ['Ant. publicación', stock.antPublicacion, MKT.publicacion]] as Array<[string, CompositionSlice[], string[]]>)
                    .map(([title, slices, pal]) => (
                        <View key={title} style={{ flex: 1, alignItems: 'center', borderWidth: 1, borderColor: MKT.linea, borderRadius: 8, padding: 6 }}>
                            <SemiDonutPDF width={100} thickness={16} slices={withColors(slices, pal)} />
                            <Text style={[S.gaugeTitle, { fontSize: 7 }]}>{title}</Text>
                            <Legend slices={slices} palette={pal} />
                        </View>
                    ))}
            </View>
        </View>
    )
}
