import React from 'react'
import { Svg, Path } from '@react-pdf/renderer'
import { donutSlicePath, slicesToArcs } from '@/lib/market-data/arc-geometry'

interface GaugeSlice { pct: number; color: string }

/** Semi-dona (barrido superior, -90°→+90°). width = diámetro; height = width/2. */
export function SemiDonutPDF({ width, thickness, slices }: { width: number; thickness: number; slices: GaugeSlice[] }) {
    const r = width / 2
    const arcs = slicesToArcs(slices, -90, 180)
    return (
        <Svg width={width} height={r + 2} viewBox={`0 0 ${width} ${r + 2}`}>
            {arcs.map(a => (
                <Path key={a.index} d={donutSlicePath(r, r, r - 1, r - thickness, a.startDeg, a.endDeg)} fill={slices[a.index].color} />
            ))}
        </Svg>
    )
}

/** Dona completa. */
export function DonutPDF({ size, thickness, slices }: { size: number; thickness: number; slices: GaugeSlice[] }) {
    const r = size / 2
    const arcs = slicesToArcs(slices, 0, 360)
    return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {arcs.map(a => (
                <Path key={a.index} d={donutSlicePath(r, r, r - 1, r - thickness, a.startDeg, a.endDeg)} fill={slices[a.index].color} />
            ))}
        </Svg>
    )
}
