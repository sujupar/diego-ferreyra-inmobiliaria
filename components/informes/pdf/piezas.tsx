/**
 * Piezas comunes del PDF del informe: encabezado de sección, pie con la marca, divisores de etapa,
 * tildes ✅/❌ (dibujadas: Poppins no trae esos símbolos) y gráficos simples (torta y barras)
 * hechos con primitivas de react-pdf.
 */
import { Image, Path, Svg, Text, View, Circle } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { C, HOJA, s } from './estilos'

export const formato = new Intl.NumberFormat('es-AR')
export const numero = (n: number | null | undefined) => (typeof n === 'number' ? formato.format(Math.round(n)) : '—')

export function Encabezado({ texto, sub }: { texto: string; sub?: string | null }) {
  return (
    <View fixed style={{ position: 'absolute', top: 28, left: 22, right: 22 }}>
      <Text style={{ fontSize: 13, color: C.azul, textAlign: 'right' }}>{texto}</Text>
      {sub ? <Text style={{ fontSize: 15, fontWeight: 700, color: C.azul, textAlign: 'right' }}>{sub}</Text> : null}
      {/* Con subtítulo es la página de competidoras: la línea ya viene dibujada en su imagen de fondo. */}
      {sub ? null : <View style={{ borderBottomWidth: 1, borderBottomColor: C.linea, marginTop: 4 }} />}
    </View>
  )
}

export function Pie({ base }: { base: string }) {
  return (
    <View fixed style={{ position: 'absolute', bottom: 22, left: 22, right: 22, alignItems: 'center' }}>
      <View style={{ borderTopWidth: 1, borderTopColor: C.linea, alignSelf: 'stretch', marginBottom: 8 }} />
      <Image src={`${base}/logo-diego-ferreyra.png`} style={{ width: 120, height: 26, objectFit: 'contain' }} />
    </View>
  )
}

/** Pie de las páginas de competidoras y análisis: la franja azul con el logo (imagen original). */
export function FondoCompetencia({ base }: { base: string }) {
  return <Image fixed src={`${base}/pie-competencia.png`} style={{ position: 'absolute', top: 0, left: 0, width: HOJA.ancho, height: HOJA.alto }} />
}

export function Divisor({ base, titulo, texto, barrio }: { base: string; titulo: string; texto: string; barrio?: string | null }) {
  return (
    <View style={{ width: HOJA.ancho, height: HOJA.alto, position: 'relative' }}>
      <Image src={`${base}/divisor-fondo.jpg`} style={{ position: 'absolute', top: 0, left: 0, width: HOJA.ancho, height: HOJA.alto }} />
      {barrio ? <Text style={{ position: 'absolute', top: 40, left: 0, right: 0, textAlign: 'center', color: '#FFFFFF', fontSize: 11, opacity: 0.85 }}>PROPIEDADES QUE COMPITEN EN {barrio.toUpperCase()}</Text> : null}
      <Text style={{ position: 'absolute', top: 205, left: 20, right: 20, textAlign: 'center', color: '#FFFFFF', fontSize: 34, fontWeight: 700 }}>{titulo}</Text>
      <View style={{ position: 'absolute', top: 268, left: 50, right: 50, backgroundColor: C.marino, borderWidth: 1, borderColor: '#0B1430', paddingVertical: 12, paddingHorizontal: 16 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 14, textAlign: 'center', lineHeight: 1.35 }}>{texto}</Text>
      </View>
      <Image src={`${base}/diego-recorte.png`} style={{ position: 'absolute', bottom: 0, right: 10, width: 270, height: 405, objectFit: 'contain' }} />
    </View>
  )
}

export function Tilde({ bien }: { bien: boolean }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" style={{ marginRight: 6 }}>
      {bien ? (
        <>
          <Path d="M2 0 H12 A2 2 0 0 1 14 2 V12 A2 2 0 0 1 12 14 H2 A2 2 0 0 1 0 12 V2 A2 2 0 0 1 2 0 Z" fill={C.verde} />
          <Path d="M3.2 7.2 L5.8 9.8 L10.8 4.2" stroke="#FFFFFF" strokeWidth={1.8} fill="none" />
        </>
      ) : (
        <>
          <Path d="M2.5 2.5 L11.5 11.5" stroke={C.rojo} strokeWidth={2.6} />
          <Path d="M11.5 2.5 L2.5 11.5" stroke={C.rojo} strokeWidth={2.6} />
        </>
      )}
    </Svg>
  )
}

export function LineaTilde({ bien, children }: { bien: boolean; children: ReactNode }) {
  return (
    <View style={[s.fila, { marginBottom: 7 }]}>
      <Tilde bien={bien} />
      <Text style={{ fontSize: 13, flex: 1 }}>{children}</Text>
    </View>
  )
}

/** Viñeta dibujada: Poppins no trae "●" y react-pdf la reemplaza por otro glifo ("Ï"). */
export function Punto({ color = '#444444', alto = 13 }: { color?: string; alto?: number }) {
  return (
    <View style={{ width: 22, height: alto * 1.4, justifyContent: 'center' }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }} />
    </View>
  )
}

export function Vinetas({ texto }: { texto: string | undefined }) {
  const lineas = (texto ?? '').split('\n').map(l => l.replace(/^[-•●*]\s*/, '').trim()).filter(Boolean)
  return (
    <View style={{ marginLeft: 18 }}>
      {lineas.map((l, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
          <Punto />
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>{l}</Text>
        </View>
      ))}
    </View>
  )
}

// ─── Gráficos ────────────────────────────────────────────────────────────────

export interface Porcion { etiqueta: string; valor: number; color: string }

function arco(cx: number, cy: number, r: number, desde: number, hasta: number): string {
  const p = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
  const [x1, y1] = p(desde)
  const [x2, y2] = p(hasta)
  const grande = hasta - desde > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${grande} 1 ${x2} ${y2} Z`
}

/** Torta como las de los formularios del ejemplo: porciones con su %, leyenda a la derecha. */
export function Torta({ porciones, tam = 150 }: { porciones: Porcion[]; tam?: number }) {
  const total = porciones.reduce((a, p) => a + p.valor, 0)
  const r = tam / 2
  let angulo = 0
  const visibles = porciones.filter(p => p.valor > 0)
  return (
    <View style={[s.fila, { justifyContent: 'center', marginVertical: 8 }]}>
      <Svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`}>
        {total === 0 ? <Circle cx={r} cy={r} r={r} fill="#E5E7EB" /> : null}
        {visibles.length === 1 ? <Circle cx={r} cy={r} r={r} fill={visibles[0].color} /> : null}
        {visibles.length > 1 ? visibles.map(p => {
          const desde = angulo
          angulo += (p.valor / total) * Math.PI * 2
          return <Path key={p.etiqueta} d={arco(r, r, r, desde, angulo)} fill={p.color} />
        }) : null}
      </Svg>
      <View style={{ marginLeft: 26 }}>
        {porciones.map(p => (
          <View key={p.etiqueta} style={[s.fila, { marginBottom: 6 }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color, marginRight: 6 }} />
            <Text style={{ fontSize: 10 }}>{p.etiqueta}{total ? `  ${Math.round((p.valor / total) * 1000) / 10}%` : ''}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/** Barras verticales con su valor arriba (ofertas, resultados por edad). */
export function Barras({ datos, alto = 130, colores }: { datos: Array<{ etiqueta: string; valores: number[] }>; alto?: number; colores: string[] }) {
  const max = Math.max(1, ...datos.flatMap(d => d.valores))
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: alto + 30, borderBottomWidth: 1, borderBottomColor: '#BBBBBB', marginVertical: 8 }}>
      {datos.map(d => (
        <View key={d.etiqueta} style={{ alignItems: 'center', flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            {d.valores.map((v, i) => (
              <View key={i} style={{ alignItems: 'center', marginHorizontal: 2 }}>
                <Text style={{ fontSize: 8, color: C.gris }}>{v ? numero(v) : ''}</Text>
                <View style={{ width: d.valores.length > 1 ? 14 : 34, height: Math.max(v ? 2 : 0, (v / max) * alto), backgroundColor: colores[i % colores.length] }} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

export function EtiquetasDeBarras({ etiquetas }: { etiquetas: string[] }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 2 }}>
      {etiquetas.map(e => <Text key={e} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: C.gris }}>{e}</Text>)}
    </View>
  )
}

export function Cifra({ titulo, valor, ancho = 160 }: { titulo: string; valor: string; ancho?: number }) {
  return (
    // Alto mínimo parejo: un título de dos renglones no tiene que dejar las tarjetas de una fila desparejas.
    <View style={{ width: ancho, minHeight: 80, borderWidth: 1, borderColor: '#D9DCE1', borderRadius: 6, padding: 10, marginRight: 10, marginBottom: 10, justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 9, color: C.gris }}>{titulo}</Text>
      {/* Un valor largo (p. ej. "0h:23m:04s" de TikTok) se partía en dos renglones a 22 pt. */}
      <Text style={{ fontSize: valor.length > 8 ? 15 : 22, fontWeight: 600 }}>{valor}</Text>
    </View>
  )
}
