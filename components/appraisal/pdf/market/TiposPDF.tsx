import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import type { PropertyTypesCounts } from '@/lib/market-data/types'
import { fmtInt } from '@/lib/market-data/arc-geometry'
import { DonutPDF } from './gauges'
import { MKT } from './palette'

const ORDER: Array<[keyof Omit<PropertyTypesCounts, 'total'>, string]> = [
    ['departamentos', 'Departamentos'], ['oficinas', 'Oficinas'], ['locales', 'Locales com.'],
    ['ph', 'PH'], ['terrenos', 'Terrenos'], ['casas', 'Casas'],
]

export function TiposPDF({ tipos }: { tipos: PropertyTypesCounts }) {
    const total = tipos.total || ORDER.reduce((a, [k]) => a + (tipos[k] || 0), 0)
    const slices = ORDER.map(([k], i) => ({ pct: total ? ((tipos[k] || 0) / total) * 100 : 0, color: MKT.donutTipos[i] }))
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <View style={{ position: 'relative', width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
                <DonutPDF size={150} thickness={26} slices={slices} />
                <View style={{ position: 'absolute', alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: 800, color: MKT.navy }}>{fmtInt(total)}</Text>
                    <Text style={{ fontSize: 6, color: MKT.gris, textTransform: 'uppercase', letterSpacing: 0.5 }}>avisos</Text>
                </View>
            </View>
            <View style={{ flex: 1 }}>
                {ORDER.map(([k, label], i) => (
                    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: MKT.donutTipos[i] }} />
                        <Text style={{ fontSize: 9, color: '#3a4a5c', flex: 1 }}>{label}</Text>
                        <Text style={{ fontSize: 9, fontWeight: 700, color: MKT.navy }}>{fmtInt(tipos[k])}</Text>
                    </View>
                ))}
            </View>
        </View>
    )
}
