/**
 * Estilos del PDF del informe quincenal: los de los informes de ejemplo (Poppins, azul marino,
 * naranja de títulos, azul de la marca). Hoja carta (612 × 792 pt), como los originales.
 */
import { Font, StyleSheet } from '@react-pdf/renderer'

const POPPINS = 'https://fonts.gstatic.com/s/poppins/v21'
Font.register({
  family: 'Poppins',
  fonts: [
    { src: `${POPPINS}/pxiEyp8kv8JHgFVrFJA.ttf`, fontWeight: 400 },
    { src: `${POPPINS}/pxiByp8kv8JHgFVrLGT9V1s.ttf`, fontWeight: 500 },
    { src: `${POPPINS}/pxiByp8kv8JHgFVrLEj6V1s.ttf`, fontWeight: 600 },
    { src: `${POPPINS}/pxiByp8kv8JHgFVrLCz7V1s.ttf`, fontWeight: 700 },
  ],
})
// Sin cortes de palabras con guión: en castellano react-pdf corta mal ("propie-dad").
Font.registerHyphenationCallback(palabra => [palabra])

export const C = {
  marino: '#26355E',
  naranja: '#F39237',
  azul: '#1E4C9A',
  texto: '#2B2B2B',
  gris: '#6B6B6B',
  linea: '#3C3C3C',
  suave: '#F4F5F7',
  verde: '#3BB273',
  rojo: '#E0312B',
  azulGrafico: '#3366CC',
  rojoGrafico: '#DC3912',
  turquesa: '#3FCFCF',
  violeta: '#6A3DC4',
}

export const HOJA = { ancho: 612, alto: 792 }

export const s = StyleSheet.create({
  pagina: { fontFamily: 'Poppins', fontSize: 11, color: C.texto, paddingTop: 72, paddingBottom: 90, paddingHorizontal: 46, backgroundColor: '#FFFFFF' },
  titulo: { fontSize: 30, fontWeight: 700, color: C.marino, textAlign: 'center', marginBottom: 22 },
  subtitulo: { fontSize: 15, fontWeight: 600, color: C.naranja, marginTop: 14, marginBottom: 8 },
  subtituloCentro: { fontSize: 17, fontWeight: 600, color: C.naranja, textAlign: 'center', marginBottom: 18 },
  cuerpo: { fontSize: 12, lineHeight: 1.5 },
  chico: { fontSize: 9, color: C.gris },
  fila: { flexDirection: 'row', alignItems: 'center' },
  portal: { fontSize: 16, fontWeight: 700, color: C.azul, marginTop: 14, marginBottom: 6 },
})
