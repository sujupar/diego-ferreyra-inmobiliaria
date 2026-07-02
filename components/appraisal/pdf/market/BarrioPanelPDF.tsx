import React from 'react'
import { View, Text, Svg, Path } from '@react-pdf/renderer'
import type { NeighborhoodPrice } from '@/lib/market-data/types'
import { CABA_MAP_PATHS, CABA_MAP_VIEWBOX } from '@/lib/market-data/caba-map-paths'
import { fmtInt, fmtPct } from '@/lib/market-data/arc-geometry'
import { MKT } from './palette'

function Card({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
    return (
        <View style={{ width: wide ? '100%' : '31.5%', backgroundColor: MKT.fondoSuave, borderWidth: 1, borderColor: MKT.linea, borderRadius: 6, padding: 8 }}>
            <Text style={{ fontSize: 6.5, color: MKT.gris, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
            <Text style={{ fontSize: wide ? 18 : 12, fontWeight: 800, color: MKT.navy, marginTop: 2 }}>{value}</Text>
        </View>
    )
}

/** Panel de precios + mapa choropleth con el barrio resaltado (sin tooltip —
 *  decisión aprobada: solo relleno claro + contorno dorado). */
export function BarrioPanelPDF({ name, price, highlightSlug, isGeneral }: {
    name: string; price: NeighborhoodPrice; highlightSlug: string | null; isGeneral: boolean
}) {
    // dims del mapa manteniendo el aspecto del viewBox (≈526×603)
    const [, , vbW, vbH] = CABA_MAP_VIEWBOX.split(' ').map(Number)
    const mapW = 220
    const mapH = mapW * (vbH / vbW)
    return (
        <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ width: mapW, backgroundColor: '#eef3f8', borderWidth: 1, borderColor: MKT.linea, borderRadius: 8, padding: 8, alignItems: 'center' }}>
                <Svg width={mapW - 16} height={mapH - 16} viewBox={CABA_MAP_VIEWBOX}>
                    {CABA_MAP_PATHS.map(p => {
                        const hl = !isGeneral && p.id === highlightSlug
                        return <Path key={p.id} d={p.d}
                            fill={hl ? MKT.mapaResaltado : p.fill}
                            stroke={hl ? MKT.mapaBorde : '#ffffff'}
                            strokeWidth={hl ? 3 : 0.8} />
                    })}
                </Svg>
                <Text style={{ fontSize: 6.5, color: MKT.gris, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 }}>
                    {isGeneral ? 'Precio USD/m² por barrio · CABA' : `Ubicación de ${name} en CABA`}
                </Text>
            </View>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start' }}>
                <View style={{ width: '100%', backgroundColor: MKT.azul, borderRadius: 6, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                        <Text style={{ fontSize: 6.5, color: '#ffffff', opacity: 0.85, fontWeight: 700, textTransform: 'uppercase' }}>Precio promedio</Text>
                        <Text style={{ fontSize: 20, fontWeight: 800, color: '#ffffff' }}>USD {fmtInt(price.prom)} /m²</Text>
                    </View>
                    {price.via !== null && (
                        <Text style={{ fontSize: 8, fontWeight: 700, color: '#ffffff' }}>{fmtPct(price.via)} interanual</Text>
                    )}
                </View>
                <Card label="Usado" value={price.usado !== null ? `USD ${fmtInt(price.usado)}` : '—'} />
                <Card label="Pozo" value={price.pozo !== null ? `USD ${fmtInt(price.pozo)}` : '—'} />
                <Card label="A estrenar" value={price.estrenar !== null ? `USD ${fmtInt(price.estrenar)}` : '—'} />
                <Card label="Alquiler 2 amb" value={price.alq2amb !== null ? `$ ${fmtInt(price.alq2amb)}` : '—'} />
                <Card label="Renta bruta" value={price.renta !== null ? `${(price.renta * 100).toFixed(2).replace('.', ',')}%` : '—'} />
                <Card label="Deptos en venta" value={fmtInt(price.deptos)} />
            </View>
        </View>
    )
}
