/**
 * Renderiza el PDF del informe quincenal a un archivo para MIRARLO (CLAUDE.md: los overlays y PDFs
 * se verifican viéndolos, no solo con tipos). Usa las fuentes REALES de una propiedad (solo
 * lectura) y completa lo manual con los números del informe de ejemplo de Roque Pérez.
 *
 *   node --env-file=../../../.env.local --require ./scripts/_qa-precarga.cjs --import tsx \
 *     scripts/render-informe-test.tsx <propertyId> <desde> <hasta> <salida.pdf> [fotoCompetidora1] [fotoCompetidora2]
 */
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { renderToFile } from '@react-pdf/renderer'
import { traerFuente } from '../lib/informes/fuentes'
import { leerPropiedad } from '../lib/informes/datos'
import { faltantes, paginasDelInforme, resumenDeMetricas } from '../lib/informes/resumen'
import { FUENTES, type Fuentes, type Informe } from '../lib/informes/tipos'
import { InformePDF } from '../components/informes/pdf/InformePDF'

// tsx compila el JSX en modo clásico: los componentes del PDF esperan React a mano.
;(globalThis as { React?: typeof React }).React = React

async function main() {
  const [propertyId, desde, hasta, salida, foto1, foto2] = process.argv.slice(2)
  const ahora = new Date()
  const fuentes: Fuentes = {}
  for (const f of FUENTES) (fuentes as Record<string, unknown>)[f] = await traerFuente(f, { propertyId, desde, hasta, ahora })
  // Ficha de visitas como la de Entre Ríos (si la propiedad no tiene encuestas reales), para ver esas páginas.
  if (fuentes.visitas?.estado === 'ok' && fuentes.visitas.datos && fuentes.visitas.datos.ficha.respuestas === 0) {
    fuentes.visitas.datos = { realizadas: 6, ficha: {
      respuestas: 6, leGusto: { si: 5, no: 1 }, precio: { correcto: 0, alto: 6, bajo: 0 },
      ofertas: [165000, 167000, 168000, 170000, 170000, 170000], moneda: 'USD', masGusto: [],
      menosGusto: [{ etiqueta: 'Estado general', cantidad: 2 }],
      comentariosMenosGusto: ['la distribucion y hay que hacer mejoras', 'solo se puede salir al jardin por las habitaciones y hay que hacerle bastantes arreglos', 'probables humedades de los techos', 'mucho para hacer'],
    } }
  }
  const propiedad = await leerPropiedad(propertyId)
  if (!propiedad) throw new Error('no existe la propiedad')
  const informe: Informe = {
    id: 'prueba', propertyId, desde, hasta, origen: 'manual', estado: 'borrador', fuentes,
    manual: {
      zonaprop: { exposicion: 930, visualizaciones: 62, interesados: 1 },
      argenprop: { visualizaciones: 125 },
      tiktok: { visualizaciones: 264, tiempoTotal: '0h:23m:04s', tiempoPromedio: '4.98s', vieronCompleto: 0, nuevosSeguidores: 0 },
      textos: {
        resumenMetricas: 'La están viendo mucha cantidad de compradores, y varios entraron al aviso a ver más detalles.',
        accionesRealizadas: 'Se publicó la propiedad en todos los portales\nEn este último periodo se obtuvieron 3 consultas, 2 fueron de colegas y la otra quería ofertar u$s 650.000.',
        accionesARealizar: 'Seguir con la máxima difusión.',
        resumenConsultas: 'En este último periodo se obtuvieron 3 consultas, 2 fueron de la misma persona que ofrecía 650.000 U$D y la otra persona fue el colega que me había consultado si tenía plano la propiedad anteriormente.',
        analisisFinal: 'Durante el período analizado, sólo en los portales inmobiliarios, la propiedad tuvo 1.139 apariciones y 271 ingresos al aviso, pero generó apenas 3 consultas y ninguna visita.\n\nEsto significa que aproximadamente el 23,8% de las personas que encontraron la propiedad en los resultados decidieron ingresar al aviso para conocerla en detalle.\n\nDebido a esto veo que el principal inconveniente no está en la exposición de la propiedad, sino en la conversión de esa exposición en demanda real.',
      },
    },
    competidoras: [
      { url: 'https://www.zonaprop.com.ar/x-1.html', direccion: 'Quesada 3250', barrio: 'Coghlan', precio: 695000, moneda: 'USD', m2: 436, valorM2: 1678, ambientes: 6, banos: 4, dormitorios: 5, antiguedad: 50, cocheras: 3, foto: null, publicadoHace: 'Publicado hace 84 días', visualizaciones: 346, bajoDePrecio: true },
      { url: 'https://www.zonaprop.com.ar/x-2.html', direccion: 'Zapiola 3000', barrio: 'Coghlan', precio: 798000, moneda: 'USD', m2: 600, valorM2: 1761, ambientes: 6, banos: 3, dormitorios: 4, antiguedad: 29, cocheras: 3, foto: null, publicadoHace: 'Publicado hace 23 días', visualizaciones: 385, bajoDePrecio: false },
    ],
    candidatas: { detalles: {} }, capturas: {}, pdfPath: null, listoAt: null, createdAt: '', updatedAt: '',
  }
  // react-pdf en Node trata la ruta de las imágenes como URL y codifica los espacios de la carpeta
  // del proyecto ("01.%20Anti%20Gravity"): se copian junto a la salida, en una ruta sin espacios.
  const assets = path.join(path.dirname(salida), 'informe-assets')
  fs.cpSync(path.resolve('public/informe-quincenal'), assets, { recursive: true })
  console.log('faltantes:', faltantes(informe))
  console.log('páginas:', paginasDelInforme(informe).join(', '))
  await renderToFile(
    <InformePDF d={{
      informe, propiedad: { ...propiedad, barrio: propiedad.barrio ?? 'Coghlan' }, resumen: resumenDeMetricas(fuentes, informe.manual),
      paginas: paginasDelInforme(informe), imagenes: { capturas: {}, competidoras: [foto1 ?? null, foto2 ?? null] },
      base: assets,
    }} />,
    salida,
  )
  console.log('PDF:', salida)
}
main().catch(e => { console.error(e); process.exit(1) })
