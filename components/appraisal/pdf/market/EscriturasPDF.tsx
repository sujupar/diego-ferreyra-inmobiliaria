import React from 'react'
import { View, Text, Image, Link } from '@react-pdf/renderer'
import type { EscriturasData } from '@/lib/market-data/types'
import { MKT } from './palette'

export function EscriturasPDF({ escrituras }: { escrituras: EscriturasData }) {
    return (
        <View>
            {escrituras.imageUrl ? (
                <Image src={escrituras.imageUrl} style={{ width: '100%', borderRadius: 6, marginBottom: 10 }} />
            ) : null}
            <View style={{ backgroundColor: MKT.fondoSuave, borderLeftWidth: 3, borderLeftColor: MKT.azul, padding: 10, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, lineHeight: 1.5, color: '#3a4a5c' }}>{escrituras.summary}</Text>
            </View>
            <Text style={{ fontSize: 7, color: MKT.gris, marginTop: 8, fontStyle: 'italic' }}>
                Fuente: Colegio de Escribanos de la Ciudad de Buenos Aires{escrituras.mesLabel ? ` — ${escrituras.mesLabel}` : ''}.
                {'  '}<Link src={escrituras.articleUrl} style={{ color: MKT.gris }}>Ver informe original</Link>
            </Text>
        </View>
    )
}
