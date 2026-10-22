/**
 * El PDF del informe quincenal (spec 2026-10-22), con la estructura y la estética de los informes
 * de ejemplo (Roque Pérez 3059 y Entre Ríos 2333) y sus imágenes ORIGINALES (`public/informe-quincenal`).
 * Se arma en el navegador (como el de tasación) y se sube. Las páginas que salen las decide
 * `paginasDelInforme` (lib/informes/resumen.ts): un canal sin datos no sale.
 *
 * `base` es la ruta de las imágenes: '/informe-quincenal' en el navegador, la carpeta absoluta en
 * el script que lo renderiza a archivo para mirarlo.
 */
import { Document, Image, Link, Page, Text, View } from '@react-pdf/renderer'
import { competidorasDeLaPagina, valorDelM2, type Pagina, type Resumen } from '@/lib/informes/resumen'
import type { Competidora, Informe, NombreCaptura, PropiedadDelInforme } from '@/lib/informes/tipos'
import { C, HOJA, s } from './estilos'
import { Barras, Cifra, Divisor, Encabezado, EtiquetasDeBarras, FondoCompetencia, LineaTilde, Pie, Punto, Torta, Vinetas, formato, numero } from './piezas'

export interface DatosDelPdf {
  informe: Informe
  propiedad: PropiedadDelInforme
  resumen: Resumen
  paginas: Pagina[]
  /** Imágenes ya convertidas a data URL (capturas del bucket privado y fotos de las competidoras). */
  imagenes: { capturas: Partial<Record<NombreCaptura, string>>; competidoras: Array<string | null> }
  base: string
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function textoDelPeriodo(desde: string, hasta: string): string {
  const [ad, md, dd] = desde.split('-').map(Number)
  const [ah, mh, dh] = hasta.split('-').map(Number)
  if (ad === ah && md === mh) return `del ${dd} al ${dh} de ${MESES[mh - 1]} de ${ah}`
  if (ad === ah) return `del ${dd} de ${MESES[md - 1]} al ${dh} de ${MESES[mh - 1]} de ${ah}`
  return `del ${dd} de ${MESES[md - 1]} de ${ad} al ${dh} de ${MESES[mh - 1]} de ${ah}`
}

function Portada({ d }: { d: DatosDelPdf }) {
  return (
    <Page size="LETTER" style={{ fontFamily: 'Poppins' }}>
      <Image src={`${d.base}/portada-fondo.jpg`} style={{ position: 'absolute', top: 0, left: 0, width: HOJA.ancho, height: HOJA.alto }} />
      {/* La imagen original trae "INFORME QUINCENAL" en gris claro: se tapa y se escribe como en los ejemplos. */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: HOJA.ancho, height: 120, backgroundColor: '#FFFFFF' }} />
      <Text style={{ position: 'absolute', top: 30, left: 0, right: 0, textAlign: 'center', fontSize: 22, fontWeight: 700, color: '#4D4D4D' }}>INFORME QUINCENAL</Text>
      <Text style={{ position: 'absolute', top: 64, left: 30, right: 30, textAlign: 'center', fontSize: 26, fontWeight: 700, color: C.naranja }}>{d.propiedad.direccion}</Text>
      <Text style={{ position: 'absolute', top: 100, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: C.gris }}>Período {textoDelPeriodo(d.informe.desde, d.informe.hasta)}</Text>
    </Page>
  )
}

function PaginaResumen({ d }: { d: DatosDelPdf }) {
  const r = d.resumen
  const t = d.informe.manual.textos ?? {}
  return (
    <Page size="LETTER" style={s.pagina}>
      <Encabezado texto="RESUMEN" />
      <Text style={s.titulo}>Resumen de Gestión</Text>
      {t.resumenMetricas ? (<>
        <Text style={s.subtitulo}>Resumen de Métricas</Text>
        <Text style={[s.cuerpo, { fontSize: 13 }]}>{t.resumenMetricas}</Text>
      </>) : null}
      <Text style={[s.subtitulo, { marginTop: 22 }]}>Resultados del período</Text>
      {r.vieron.valor !== null ? <LineaTilde bien={r.vieron.valor > 0}>Vieron la propiedad más de {numero(r.vieron.valor)} potenciales compradores.</LineaTilde> : null}
      {r.entraron.valor !== null ? <LineaTilde bien={r.entraron.valor > 0}>{numero(r.entraron.valor)} de ellas, entraron a ver los detalles de la propiedad en portales.</LineaTilde> : null}
      {r.consultas !== null ? <LineaTilde bien={r.consultas > 0}>{r.consultas > 0 ? `Se ${r.consultas === 1 ? 'obtuvo' : 'obtuvieron'} ${r.consultas} ${r.consultas === 1 ? 'consulta' : 'consultas'}.` : 'No se obtuvieron consultas.'}</LineaTilde> : null}
      {r.visitas !== null ? <LineaTilde bien={r.visitas > 0}>{r.visitas > 0 ? `Se ${r.visitas === 1 ? 'obtuvo' : 'obtuvieron'} ${r.visitas} ${r.visitas === 1 ? 'visita' : 'visitas'}.` : 'No se obtuvieron visitas.'}</LineaTilde> : null}
      {r.reserva !== null ? <LineaTilde bien={r.reserva}>{r.reserva ? 'Se obtuvo reserva.' : 'No se obtuvo reserva.'}</LineaTilde> : null}
      <Text style={[s.subtitulo, { marginTop: 22 }]}>Acciones Realizadas</Text>
      <Vinetas texto={t.accionesRealizadas} />
      <Text style={[s.subtitulo, { marginTop: 18 }]}>Acciones a Realizar para lograr vender</Text>
      <Vinetas texto={t.accionesARealizar} />
      <Pie base={d.base} />
    </Page>
  )
}

function Comencemos({ d }: { d: DatosDelPdf }) {
  return (
    <Page size="LETTER" style={[s.pagina, { paddingTop: 36 }]}>
      <Text style={{ fontSize: 30, fontWeight: 700, color: C.naranja, textAlign: 'center' }}>¡COMENCEMOS!</Text>
      <Text style={{ fontSize: 28, fontWeight: 700, color: C.marino, textAlign: 'center', marginBottom: 10 }}>Juntos hacia la venta exitosa</Text>
      <Image src={`${d.base}/embudo-informes.png`} style={{ width: 300, height: 317, alignSelf: 'center', marginBottom: 18 }} />
      <Text style={{ fontSize: 13, lineHeight: 1.45 }}>
        <Text style={{ color: C.naranja, fontWeight: 600 }}>Estamos un paso más cerca de encontrar al comprador ideal</Text> para tu propiedad y estos 15 días han sido claves para acercarnos más al objetivo de vender tu propiedad.
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 1.45, marginTop: 18 }}>Cada etapa que atravesamos nos da pistas sobre lo que estamos haciendo bien y qué podemos mejorar.</Text>
      <Text style={{ fontSize: 18, fontWeight: 700, color: C.marino, textAlign: 'center', marginTop: 22 }}>¡Comencemos!</Text>
      <Pie base={d.base} />
    </Page>
  )
}

function DivisorPagina({ d, titulo, texto }: { d: DatosDelPdf; titulo: string; texto: string }) {
  return (
    <Page size="LETTER" style={{ fontFamily: 'Poppins' }}>
      <Divisor base={d.base} titulo={titulo} texto={texto} />
    </Page>
  )
}

function Captura({ src, alto = 110 }: { src: string | undefined; alto?: number }) {
  return src ? <Image src={src} style={{ width: '100%', maxHeight: alto, objectFit: 'contain', marginBottom: 6 }} /> : null
}

function Portales({ d }: { d: DatosDelPdf }) {
  const m = d.informe.manual
  const ml = d.informe.fuentes.mercadolibre
  const caps = d.imagenes.capturas
  const zpPublicado = m.zonaprop?.publicado !== false
  const apPublicado = m.argenprop?.publicado !== false
  const mlPublicado = ml?.estado === 'ok'
  return (
    <Page size="LETTER" style={s.pagina}>
      <Encabezado texto="ETAPA PUBLICIDAD" />
      <Text style={s.subtituloCentro}>Estado de las publicaciones en Portales</Text>
      {zpPublicado ? (<>
        <Text style={s.portal}>Zonaprop</Text>
        {caps.zonaprop ? <Captura src={caps.zonaprop} /> : (
          <View style={s.fila}>
            <Cifra titulo="Exposición (veces en los listados)" valor={numero(m.zonaprop?.exposicion)} />
            <Cifra titulo="Visualizaciones (entraron al aviso)" valor={numero(m.zonaprop?.visualizaciones)} />
            {typeof m.zonaprop?.interesados === 'number' ? <Cifra titulo="Interesados" valor={numero(m.zonaprop.interesados)} ancho={110} /> : null}
          </View>
        )}
      </>) : null}
      {apPublicado ? (<>
        <Text style={s.portal}>Argenprop</Text>
        {caps.argenprop ? <Captura src={caps.argenprop} alto={70} /> : <View style={s.fila}><Cifra titulo="Visualizaciones" valor={numero(m.argenprop?.visualizaciones)} /></View>}
      </>) : null}
      {mlPublicado && ml?.datos ? (<>
        <Text style={s.portal}>Mercadolibre</Text>
        {caps.mercadolibre ? <Captura src={caps.mercadolibre} /> : (
          <View style={[s.fila, { flexWrap: 'wrap' }]}>
            <Cifra titulo="Visitas" valor={numero(ml.datos.visitas)} ancho={100} />
            {typeof m.mercadolibre?.contactos === 'number' ? <Cifra titulo="Contactos" valor={numero(m.mercadolibre.contactos)} ancho={100} /> : null}
            {typeof m.mercadolibre?.llamadas === 'number' ? <Cifra titulo="Llamadas" valor={numero(m.mercadolibre.llamadas)} ancho={100} /> : null}
            {typeof m.mercadolibre?.whatsapp === 'number' ? <Cifra titulo="WhatsApp" valor={numero(m.mercadolibre.whatsapp)} ancho={100} /> : null}
            {typeof m.mercadolibre?.preguntas === 'number' ? <Cifra titulo="Preguntas" valor={numero(m.mercadolibre.preguntas)} ancho={100} /> : null}
          </View>
        )}
      </>) : null}
      {d.resumen.vieron.valor !== null && d.resumen.entraron.valor !== null ? (
        <Text style={[s.cuerpo, { fontSize: 13, marginTop: 18 }]}>
          En este periodo la propiedad apareció en más de {numero(d.resumen.vieron.valor)} búsquedas de potenciales compradores, de las cuales {numero(d.resumen.entraron.valor)} entraron al aviso para ver más datos.
        </Text>
      ) : null}
      <Pie base={d.base} />
    </Page>
  )
}

function MetaAds({ d }: { d: DatosDelPdf }) {
  const m = d.informe.fuentes.meta?.datos
  if (!m) return null
  const plataformas = m.plataformas.length ? m.plataformas : [{ plataforma: 'Facebook', alcance: 0, resultados: 0 }, { plataforma: 'Instagram', alcance: 0, resultados: 0 }]
  const maxAlcance = Math.max(1, ...plataformas.map(p => p.alcance))
  const maxRes = Math.max(1, ...plataformas.map(p => p.resultados))
  return (
    <Page size="LETTER" style={s.pagina}>
      <Encabezado texto="ETAPA PUBLICIDAD" />
      <Text style={s.subtituloCentro}>Estado de las publicaciones en Redes Sociales</Text>
      <Text style={[s.portal, { fontSize: 20 }]}>Campaña Meta Ads</Text>
      <View style={[s.fila, { marginTop: 4 }]}>
        <Cifra titulo="Clientes potenciales en el sitio web" valor={numero(m.resultados)} />
        <Cifra titulo="Alcance (acumulado)" valor={numero(m.alcance)} ancho={150} />
        <Cifra titulo="Impresiones (acumuladas)" valor={numero(m.impresiones)} ancho={150} />
      </View>
      <Text style={{ fontSize: 11, fontWeight: 600, marginTop: 10 }}>Distribución por sexo y edad (resultados)</Text>
      <Barras datos={m.edadSexo.map(e => ({ etiqueta: e.rango, valores: [e.hombres, e.mujeres] }))} colores={[C.violeta, C.turquesa]} alto={110} />
      <EtiquetasDeBarras etiquetas={m.edadSexo.map(e => e.rango)} />
      <View style={[s.fila, { justifyContent: 'center', marginTop: 4 }]}>
        <View style={{ width: 9, height: 9, backgroundColor: C.violeta, marginRight: 4 }} /><Text style={{ fontSize: 9, marginRight: 14 }}>Hombres</Text>
        <View style={{ width: 9, height: 9, backgroundColor: C.turquesa, marginRight: 4 }} /><Text style={{ fontSize: 9 }}>Mujeres</Text>
      </View>
      <Text style={{ fontSize: 11, fontWeight: 600, marginTop: 16 }}>Ubicación por plataforma</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 140, borderBottomWidth: 1, borderBottomColor: '#BBBBBB', marginTop: 6 }}>
        {plataformas.map(p => (
          <View key={p.plataforma} style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <View style={{ alignItems: 'center', marginHorizontal: 2 }}>
              <Text style={{ fontSize: 8, color: C.gris }}>{numero(p.alcance)}</Text>
              <View style={{ width: 22, height: (p.alcance / maxAlcance) * 110, backgroundColor: C.violeta }} />
            </View>
            <View style={{ alignItems: 'center', marginHorizontal: 2 }}>
              <Text style={{ fontSize: 8, color: C.gris }}>{numero(p.resultados)}</Text>
              <View style={{ width: 22, height: Math.max(p.resultados ? 2 : 0, (p.resultados / maxRes) * 110), backgroundColor: C.turquesa }} />
            </View>
          </View>
        ))}
      </View>
      <EtiquetasDeBarras etiquetas={plataformas.map(p => p.plataforma)} />
      <View style={[s.fila, { justifyContent: 'center', marginTop: 4 }]}>
        <View style={{ width: 9, height: 9, backgroundColor: C.violeta, marginRight: 4 }} /><Text style={{ fontSize: 9, marginRight: 14 }}>Alcance</Text>
        <View style={{ width: 9, height: 9, backgroundColor: C.turquesa, marginRight: 4 }} /><Text style={{ fontSize: 9 }}>Resultados</Text>
      </View>
      <Pie base={d.base} />
    </Page>
  )
}

function Organico({ d }: { d: DatosDelPdf }) {
  const tk = d.informe.manual.tiktok
  const reels = d.informe.fuentes.instagram?.estado === 'ok' ? d.informe.fuentes.instagram.datos?.reels ?? [] : []
  const tot = reels.reduce((a, r) => ({
    reproducciones: a.reproducciones + r.reproducciones, alcance: a.alcance + r.alcance, meGusta: a.meGusta + r.meGusta,
    comentarios: a.comentarios + r.comentarios, guardados: a.guardados + r.guardados, compartidos: a.compartidos + r.compartidos,
  }), { reproducciones: 0, alcance: 0, meGusta: 0, comentarios: 0, guardados: 0, compartidos: 0 })
  const interacciones = tot.meGusta + tot.comentarios + tot.guardados + tot.compartidos
  return (
    <Page size="LETTER" style={s.pagina}>
      <Encabezado texto="ETAPA PUBLICIDAD" />
      <Text style={s.subtituloCentro}>Estado de las publicaciones en Redes Sociales</Text>
      {typeof tk?.visualizaciones === 'number' || d.imagenes.capturas.tiktok ? (<>
        <Text style={[s.portal, { fontSize: 20 }]}>Contenido Orgánico Tik Tok</Text>
        {d.imagenes.capturas.tiktok ? <Captura src={d.imagenes.capturas.tiktok} alto={200} /> : (
          <View style={[s.fila, { flexWrap: 'wrap' }]}>
            <Cifra titulo="Visualizaciones del video" valor={numero(tk?.visualizaciones)} ancho={150} />
            {tk?.tiempoTotal ? <Cifra titulo="Tiempo total de visualización" valor={tk.tiempoTotal} ancho={150} /> : null}
            {tk?.tiempoPromedio ? <Cifra titulo="Tiempo promedio" valor={tk.tiempoPromedio} ancho={110} /> : null}
            {typeof tk?.vieronCompleto === 'number' ? <Cifra titulo="Vieron el video completo" valor={`${tk.vieronCompleto}%`} ancho={130} /> : null}
            {typeof tk?.nuevosSeguidores === 'number' ? <Cifra titulo="Nuevos seguidores" valor={numero(tk.nuevosSeguidores)} ancho={110} /> : null}
          </View>
        )}
      </>) : null}
      {reels.length ? (<>
        <Text style={[s.portal, { fontSize: 20, marginTop: 24 }]}>Contenido Orgánico Instagram</Text>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, paddingRight: 18 }}>
            <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 10 }]}><Text style={{ fontSize: 13, fontWeight: 600 }}>Visualizaciones</Text><Text style={{ fontSize: 13 }}>{numero(tot.reproducciones)}</Text></View>
            <View style={[s.fila, { justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E2E4E8', paddingTop: 10 }]}><Text style={{ fontSize: 12 }}>Cuentas de Meta alcanzadas</Text><Text style={{ fontSize: 12 }}>{numero(tot.alcance)}</Text></View>
          </View>
          <View style={{ flex: 1, paddingLeft: 18 }}>
            <View style={[s.fila, { justifyContent: 'space-between', marginBottom: 8 }]}><Text style={{ fontSize: 13, fontWeight: 600 }}>Interacciones con reels</Text><Text style={{ fontSize: 13 }}>{numero(interacciones)}</Text></View>
            {([['Me gusta', tot.meGusta], ['Comentarios', tot.comentarios], ['Veces que se guardó', tot.guardados], ['Veces que se compartió', tot.compartidos]] as const).map(([k, v]) => (
              <View key={k} style={[s.fila, { justifyContent: 'space-between', marginBottom: 5 }]}><Text style={{ fontSize: 11 }}>{k}</Text><Text style={{ fontSize: 11 }}>{numero(v)}</Text></View>
            ))}
          </View>
        </View>
        <Text style={[s.chico, { marginTop: 12 }]}>Instagram informa estas cifras acumuladas desde la publicación del reel, no por período.</Text>
      </>) : null}
      <Pie base={d.base} />
    </Page>
  )
}

function Consultas({ d }: { d: DatosDelPdf }) {
  const c = d.informe.fuentes.consultas?.estado === 'ok' ? d.informe.fuentes.consultas.datos : null
  const filas: Array<[string, number]> = c ? [
    ['Zonaprop', c.porPortal.zonaprop], ['Redes Sociales', c.porPortal.redes], ['Mercadolibre', c.porPortal.mercadolibre],
    ['Argenprop', c.porPortal.argenprop], ['Otros sitios', c.porPortal.otros],
  ] : []
  const resumen = d.informe.manual.textos?.resumenConsultas
  return (
    <Page size="LETTER" style={[s.pagina, { paddingTop: 120 }]}>
      <Encabezado texto="CONSULTAS" />
      <Text style={[s.subtitulo, { fontSize: 17 }]}>Hemos tenido las siguientes consultas por los portales.</Text>
      {filas.map(([k, v]) => <LineaTilde key={k} bien={v > 0}>{k}: {v}</LineaTilde>)}
      <Text style={[s.subtitulo, { marginTop: 18 }]}>Resumen</Text>
      <Text style={[s.cuerpo, { fontSize: 13 }]}>{resumen || `En este último periodo se ${c?.total === 1 ? 'obtuvo 1 consulta' : `obtuvieron ${c?.total ?? 0} consultas`}.`}</Text>
      <Pie base={d.base} />
    </Page>
  )
}

function FichaDeVisitas({ d }: { d: DatosDelPdf }) {
  const v = d.informe.fuentes.visitas?.estado === 'ok' ? d.informe.fuentes.visitas.datos : null
  const f = v?.ficha
  if (!f || f.respuestas === 0) {
    return (
      <Page size="LETTER" style={s.pagina}>
        <Encabezado texto="FICHA DE VISITAS" />
        <Text style={{ fontSize: 17, fontWeight: 600, color: C.naranja, textAlign: 'center', marginTop: 230 }}>Aún no han completado la ficha de visitas</Text>
        <Pie base={d.base} />
      </Page>
    )
  }
  const respuestas = `${f.respuestas} ${f.respuestas === 1 ? 'respuesta' : 'respuestas'}`
  const ofertas = new Map<number, number>()
  for (const o of f.ofertas) ofertas.set(o, (ofertas.get(o) ?? 0) + 1)
  const noGusto = [...f.comentariosMenosGusto, ...f.menosGusto.map(t => `${t.etiqueta}${t.cantidad > 1 ? ` (${t.cantidad})` : ''}`)]
  return (<>
    <Page size="LETTER" style={s.pagina}>
      <Encabezado texto="FICHA DE VISITAS" />
      <Text style={[s.subtituloCentro, { fontSize: 22 }]}>Ficha de Visitas</Text>
      <Text style={{ fontSize: 13 }}>¿Le gustó/interesó la Propiedad?</Text>
      <Text style={s.chico}>{respuestas}</Text>
      <Torta porciones={[{ etiqueta: 'Si', valor: f.leGusto.si, color: C.azulGrafico }, { etiqueta: 'No', valor: f.leGusto.no, color: C.rojoGrafico }]} />
      <Text style={{ fontSize: 13, marginTop: 14 }}>¿Qué fue lo que no le gustó de la propiedad?</Text>
      <Text style={[s.chico, { marginBottom: 8 }]}>{noGusto.length} {noGusto.length === 1 ? 'respuesta' : 'respuestas'}</Text>
      {noGusto.slice(0, 10).map((t, i) => (
        <View key={i} style={{ backgroundColor: C.suave, borderRadius: 4, padding: 8, marginBottom: 4 }}><Text style={{ fontSize: 10 }}>{t}</Text></View>
      ))}
      <Pie base={d.base} />
    </Page>
    <Page size="LETTER" style={s.pagina}>
      <Encabezado texto="FICHA DE VISITAS" />
      <Text style={[s.subtituloCentro, { fontSize: 22 }]}>Ficha de Visitas</Text>
      <Text style={{ fontSize: 13 }}>¿Qué le parece el precio publicado?</Text>
      <Text style={s.chico}>{respuestas}</Text>
      <Torta porciones={[
        { etiqueta: 'En valor de mercado', valor: f.precio.correcto, color: C.azulGrafico },
        { etiqueta: 'Por encima del valor de mercado', valor: f.precio.alto, color: C.rojoGrafico },
        { etiqueta: 'Por debajo del valor de mercado', valor: f.precio.bajo, color: '#FF9900' },
      ]} />
      {ofertas.size ? (<>
        <Text style={{ fontSize: 13, marginTop: 18 }}>Cuánto ofertaría por la Propiedad{f.moneda ? ` (${f.moneda})` : ''}</Text>
        <Text style={s.chico}>{f.ofertas.length} {f.ofertas.length === 1 ? 'respuesta' : 'respuestas'}</Text>
        <Barras datos={[...ofertas.entries()].map(([monto, cant]) => ({ etiqueta: String(monto), valores: [cant] }))} colores={['#3349B3']} />
        <EtiquetasDeBarras etiquetas={[...ofertas.keys()].map(m => formato.format(m))} />
      </>) : null}
      <Pie base={d.base} />
    </Page>
  </>)
}

function FichaCompetidora({ c, foto, base }: { c: Competidora; foto: string | null; base: string }) {
  const m2 = c.valorM2 ?? valorDelM2(c.precio, c.m2)
  const icono = (archivo: string, texto: string | null) => texto ? (
    <View style={[s.fila, { width: 120, marginBottom: 10 }]}>
      <Image src={`${base}/${archivo}`} style={{ width: 16, height: 16, objectFit: 'contain', marginRight: 6 }} />
      <Text style={{ fontSize: 13, color: '#444444' }}>{texto}</Text>
    </View>
  ) : null
  return (
    <View style={{ marginBottom: 26 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 270, height: 165, backgroundColor: C.suave }}>
          {foto ? <Image src={foto} style={{ width: 270, height: 165, objectFit: 'cover' }} /> : null}
        </View>
        <View style={{ flex: 1, paddingLeft: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: 700, color: C.naranja, textAlign: 'center', marginBottom: 10 }}>{c.direccion}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {icono('icono-m2.jpg', c.m2 ? `${formato.format(c.m2)} m²` : null)}
            {icono('icono-banos.jpg', c.banos !== null ? `${c.banos} ${c.banos === 1 ? 'baño' : 'baños'}` : null)}
            {icono('icono-ambientes.jpg', c.ambientes !== null ? `${c.ambientes} Amb.` : null)}
            {icono('icono-dormitorios.jpg', c.dormitorios !== null ? `${c.dormitorios} Dormitorios` : null)}
            {icono('icono-antiguedad.png', c.antiguedad !== null ? `${c.antiguedad} años` : null)}
            {icono('icono-cocheras.jpg', c.cocheras ? `${c.cocheras} ${c.cocheras === 1 ? 'cochera' : 'cocheras'}` : null)}
          </View>
        </View>
      </View>
      <View style={{ marginTop: 10, marginLeft: 16 }}>
        {c.precio ? <View style={s.fila}><Punto alto={14} color={c.bajoDePrecio ? C.rojo : '#444444'} /><Text style={{ fontSize: 14, fontWeight: 700, color: c.bajoDePrecio ? C.rojo : '#444444' }}>{c.moneda ?? 'USD'} {formato.format(c.precio)}{c.bajoDePrecio ? ' Bajo de precio' : ''}</Text></View> : null}
        {m2 ? <View style={s.fila}><Punto alto={14} /><Text style={{ fontSize: 14, fontWeight: 700, color: '#444444' }}>Valor del m2  {formato.format(m2)}  {c.moneda ?? 'USD'}</Text></View> : null}
      </View>
      <View style={[s.fila, { justifyContent: 'space-between', marginTop: 8 }]}>
        <Link src={c.url} style={{ fontSize: 12, color: '#1A8FA3' }}>LINK DE LA PROPIEDAD</Link>
        <Text style={{ fontSize: 10, color: C.gris }}>{[c.publicadoHace, c.visualizaciones !== null ? `${formato.format(c.visualizaciones)} visualizaciones` : null].filter(Boolean).join('  |  ')}</Text>
      </View>
    </View>
  )
}

function Competidoras({ d, n }: { d: DatosDelPdf; n: number }) {
  const lista = competidorasDeLaPagina(d.informe.competidoras, n)
  const fotos = competidorasDeLaPagina(d.imagenes.competidoras, n)
  return (
    <Page size="LETTER" style={[s.pagina, { paddingTop: 92 }]}>
      <FondoCompetencia base={d.base} />
      <Encabezado texto="PROPIEDADES EN VENTA" sub={d.propiedad.barrio} />
      {lista.map((c, i) => <FichaCompetidora key={c.url + i} c={c} foto={fotos[i] ?? null} base={d.base} />)}
    </Page>
  )
}

function Analisis({ d }: { d: DatosDelPdf }) {
  const parrafos = (d.informe.manual.textos?.analisisFinal ?? '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
  return (
    <Page size="LETTER" style={[s.pagina, { paddingTop: 92 }]}>
      <FondoCompetencia base={d.base} />
      <Encabezado texto="PROPIEDADES EN VENTA" sub={d.propiedad.barrio} />
      <Text style={[s.subtituloCentro, { fontSize: 18 }]}>Análisis Final</Text>
      {parrafos.map((p, i) => <Text key={i} style={[s.cuerpo, { fontSize: 12.5, marginBottom: 12 }]}>{p}</Text>)}
    </Page>
  )
}

function Gracias({ d }: { d: DatosDelPdf }) {
  return (
    <Page size="LETTER" style={s.pagina}>
      <Encabezado texto="RESUMEN" />
      <Text style={{ fontSize: 38, fontWeight: 700, color: C.azul, textAlign: 'center', marginTop: 210 }}>¡GRACIAS POR TU TIEMPO!</Text>
      <Image src={`${d.base}/diego-recorte.png`} style={{ position: 'absolute', bottom: 70, right: 10, width: 260, height: 390, objectFit: 'contain' }} />
      <Pie base={d.base} />
    </Page>
  )
}

function Contacto({ d }: { d: DatosDelPdf }) {
  return (
    <Page size="LETTER">
      <Image src={`${d.base}/cierre-contacto.jpg`} style={{ width: HOJA.ancho, height: HOJA.alto }} />
    </Page>
  )
}

const DIVISORES = {
  publicidad: ['ETAPA PUBLICIDAD', 'Cuando tu propiedad aparece constantemente ante los ojos de los compradores adecuados y el precio es el indicado, las consultas y las visitas se convierten en oportunidades reales.'],
  consultas: ['ETAPA CONSULTAS', 'Las consultas son señales de que vamos por buen camino. Mantenerlas constantes nos lleva a recibir visitas, y nuestro trabajo es asegurarnos de que los compradores interesados sean los más calificados.'],
  visitas: ['ETAPA VISITAS', 'Recibir visitas de compradores calificados nos pone a las puertas de la venta. Cada visita es un avance hacia la reserva que hará realidad tu sueño inmobiliario.'],
  competencia: ['PROPIEDADES QUE COMPITEN', 'Sabemos lo valiosa que es tu propiedad y para asegurarnos de que consigas una venta rápida y al mejor precio posible, veremos las propiedades con las que competís directamente.'],
} as const

function PaginaDe({ p, d }: { p: Pagina; d: DatosDelPdf }) {
  if (p.startsWith('competidoras-')) return <Competidoras d={d} n={Number(p.split('-')[1])} />
  switch (p) {
    case 'portada': return <Portada d={d} />
    case 'resumen': return <PaginaResumen d={d} />
    case 'comencemos': return <Comencemos d={d} />
    case 'divisor-publicidad': return <DivisorPagina d={d} titulo={DIVISORES.publicidad[0]} texto={DIVISORES.publicidad[1]} />
    case 'portales': return <Portales d={d} />
    case 'meta': return <MetaAds d={d} />
    case 'organico': return <Organico d={d} />
    case 'divisor-consultas': return <DivisorPagina d={d} titulo={DIVISORES.consultas[0]} texto={DIVISORES.consultas[1]} />
    case 'consultas': return <Consultas d={d} />
    case 'divisor-visitas': return <DivisorPagina d={d} titulo={DIVISORES.visitas[0]} texto={DIVISORES.visitas[1]} />
    case 'ficha-visitas': return <FichaDeVisitas d={d} />
    case 'divisor-competencia': return <DivisorPagina d={d} titulo={DIVISORES.competencia[0]} texto={DIVISORES.competencia[1]} />
    case 'analisis': return <Analisis d={d} />
    case 'gracias': return <Gracias d={d} />
    case 'contacto': return <Contacto d={d} />
    default: return null
  }
}

export function InformePDF({ d }: { d: DatosDelPdf }) {
  return (
    <Document title={`Informe quincenal - ${d.propiedad.direccion}`} author="Diego Ferreyra Inmobiliaria" language="es">
      {d.paginas.map(p => <PaginaDe key={p} p={p} d={d} />)}
    </Document>
  )
}
