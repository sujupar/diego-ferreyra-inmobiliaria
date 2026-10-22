# Informe quincenal automático — spec

Fecha: 2026-10-22 · Tamaño: GRANDE (integraciones externas, módulo nuevo, PDF al propietario) ·
Rama `feat/informe-quincenal` · Ejemplos de referencia: "Roque Perez 3059 - Informe de Gestion.pdf"
(sin ficha de visitas) y "Entre Rios 2333 - Informe de Gestion.pdf" (con ficha de visitas).

## Qué se pide y para qué

Que la plataforma arme sola, cada 15 días, el informe de gestión de cada propiedad captada (el
mismo que hoy el equipo arma a mano), y que Paula solo complete lo que la plataforma no puede
conseguir. Para el negocio: no sacrificar calidad cuando crece el volumen. Hoy, con muchas
propiedades, los informes no se hacen; y el informe es la herramienta para negociar el precio con
el propietario usando lo que dice el mercado (portales, consultas, visitas, competencia), no la
opinión del asesor.

## La estructura del informe (igual a los ejemplos)

| # | Página | De dónde sale |
|---|---|---|
| 1 | Portada "INFORME QUINCENAL" + dirección | Automático |
| 2 | Resumen de gestión: métricas con ✅/❌, acciones realizadas, acciones a realizar | Números automáticos; textos los escribe Paula/asesor |
| 3 | "¡Comencemos!" con el embudo INFORMES → VENTAS | Fijo, **la imagen tal cual** (decisión del dueño) |
| 4 | Divisor "Etapa publicidad" | Fijo |
| 5 | Portales: Zonaprop, Argenprop, MercadoLibre + frase de totales | Ver tabla de fuentes |
| 6 | Campaña Meta Ads (si hubo) | Automático |
| 7 | Orgánico Instagram (si hubo reel) y TikTok (si hubo) | Instagram automático; TikTok manual |
| 8 | Divisor "Etapa consultas" | Fijo |
| 9 | Consultas por portal + resumen | Conteos automáticos; resumen escrito |
| 10 | Divisor "Etapa visitas" | Fijo |
| 11 | Ficha de visitas: le gustó (torta), qué no le gustó, precio (torta), cuánto ofertaría (barras) — o "Aún no han completado la ficha de visitas" | Automático (encuesta post-visita) |
| 12 | Divisor "Propiedades que compiten" | Fijo |
| 13 | Propiedades en venta en el barrio (2 por página: foto, precio, m², ambientes, baños, dormitorios, antigüedad, cocheras, valor del m², link, publicado hace / visualizaciones) | Paula pega los links; la plataforma completa los datos |
| 14 | Análisis final | Lo escribe el asesor (con borrador sugerido, ver decisiones) |
| 15 | ¡Gracias por tu tiempo! + contacto | Fijo |

Las páginas de un canal sin datos en el período (sin campaña Meta, sin reel, sin TikTok) no salen,
igual que hoy en el ejemplo de Entre Ríos.

## Fuentes de datos (verificadas contra las APIs reales el 2026-10-22)

| Dato | Fuente | Estado |
|---|---|---|
| MercadoLibre: visitas del aviso en el rango | API `items/visits?date_from&date_to` (token ya integrado) | ✅ responde |
| MercadoLibre: contactos / llamadas / WhatsApp | No están en la API pública | Manual o captura (opcional) |
| Zonaprop: exposición, visualizaciones, interesados | Sin API (nunca respondieron) | Manual: Paula carga los 3 números + captura |
| Argenprop: visualizaciones | Su API no da estadísticas | Manual: 1 número + captura |
| Meta Ads de la propiedad: alcance, impresiones, resultados, gasto, por edad/sexo y por plataforma | API de insights por campaña y rango (`property_meta_campaigns`) | ✅ responde, con desgloses |
| Instagram (reel de la propiedad): reproducciones, alcance, me gusta, comentarios, guardados, compartidos | API de insights del reel (`property_reels.ig_media_id`) | ✅ responde. **Es acumulado desde la publicación**, Instagram no lo da por rango: el informe lo dice |
| TikTok | Sin integración | Manual: números + captura |
| Consultas por portal | `portal_inquiries.property_id` (+ leads de la landing/redes como "Redes sociales") | ✅ |
| Visitas y ficha de visitas | `property_visits` + `visit_surveys` (`opinionesPorPropiedad`) | ✅ |
| Reserva | `commercial_status` / historial `property_status_events` | ✅ |
| Competidoras | Scraper existente (`/api/scrape`: Zonaprop, Argenprop, ML) a partir de los links que pega Paula | ✅ |

Los totales del resumen se calculan como en los ejemplos: "vieron la propiedad" = exposición de
Zonaprop + visualizaciones de Argenprop + visitas de ML (930 + 125 + 84 = 1.139 en Roque Pérez);
"entraron a ver los detalles" = visualizaciones de Zonaprop + Argenprop + visitas de ML (62 + 125 + 84 = 271).

## Qué ve cada persona

- **Paula (coordinadora)**: cuando se cumple el ciclo de una propiedad, recibe un email y una tarea
  en Pendientes: "Informe quincenal de <dirección> listo para completar". Abre la pantalla del
  informe, que muestra todo lo que la plataforma ya juntó y marca en naranja lo que falta: los
  números y capturas de Zonaprop/Argenprop/TikTok, los links de las competidoras y los textos.
  Ve la vista previa del PDF en vivo y toca "Marcar como listo".
- **Asesor de la propiedad**: puede escribir/editar los textos (acciones, análisis final) y descargar el PDF.
- **Admin/dueño**: en la ficha de la propiedad, pestaña "Informes", la lista de informes (fecha,
  período, estado) y el botón "Nuevo informe" con **selector de fechas** para armar uno a medida.
- **Abogado**: no ve informes.

## Qué pasa por detrás

1. **Ciclo:** un proceso diario (pg_cron, como los demás) busca propiedades captadas
   (`status='approved'`, `commercial_status` disponible o reservada) cuyo último informe cerró
   hace 15 días o más (el primero cuenta desde `captured_at`) y crea el borrador del período.
2. **Borrador:** tabla nueva `property_reports` (período, estado `borrador → listo`, datos
   automáticos congelados al crearlo, campos manuales, links de competidoras, path del PDF).
   Los datos automáticos se juntan **una fuente por pedido** (regla dura de Netlify: nunca
   encadenar llamados lentos en un request) y se pueden refrescar desde la pantalla.
3. **Capturas:** se suben al bucket privado con URL firmada (patrón del regalo de la encuesta), validadas por bytes.
4. **PDF:** @react-pdf, con la marca del informe de tasación (colores, logo, foto de Diego, fondo
   de divisores). Se genera al marcar "listo" y queda guardado; se puede regenerar.
5. **Tarea + email a Paula:** tipo de tarea nuevo `informe_quincenal` (migración del CHECK) + email
   por Resend. Ojo con la regla actual de "una tarea pendiente por tipo y propiedad": si un informe
   quedó sin completar, el siguiente ciclo NO duplica la tarea — la misma tarea pasa a mostrar los
   dos informes pendientes.

## Qué queda afuera de esta entrega

- Mandarle el informe al propietario por email/WhatsApp (se descarga el PDF y se manda como hoy).
- Buscar las competidoras automáticamente (v1: Paula pega los links).
- Integración con Zonaprop (retomar el contacto comercial es aparte) y con TikTok (requiere su app aprobada).
- Sesión de navegador abierta que lea el panel de Zonaprop: frágil (cambian la página, piden
  captcha, la sesión vence) y contra sus términos. Se puede evaluar después; v1 es carga manual.

## Decisiones que necesito del dueño

1. **La imagen del embudo** de la página 3: no está en el repo. Necesito el archivo original (PNG)
   para ponerla tal cual.
2. **Textos (resumen, acciones, análisis final):** ¿los escribe siempre una persona, o la
   plataforma propone un borrador con IA a partir de los datos y el asesor lo corrige? Recomiendo
   el borrador: el análisis final de Roque Pérez son dos páginas que salen casi enteras de los números.
3. **Ciclo:** ¿cada 15 días desde la captación de cada propiedad (cada una en su fecha), o en
   fechas fijas para todas (1 y 16 de cada mes, Paula las hace en tanda)? Recomiendo fechas fijas:
   es más fácil de organizar para una sola persona.
4. **Paula:** ¿es la única con rol coordinador? (la tarea y el email van al rol coordinador).

## Criterios de aceptación

1. El día del ciclo, cada propiedad captada disponible/reservada tiene un borrador de informe del
   período, y Paula recibe un email y una tarea por cada una (sin duplicados si el anterior sigue abierto).
2. El borrador ya trae: visitas de ML en el rango, campaña Meta (con edad/sexo y plataforma) si
   hubo, reel de Instagram si hubo, consultas por portal, visitas y ficha de visitas, y estado de reserva.
3. La pantalla marca qué falta; con los números de Zonaprop/Argenprop cargados, los totales del
   resumen se calculan solos y coinciden con la regla de los ejemplos.
4. Pegar el link de una competidora completa foto, precio, m², ambientes, baños, dormitorios,
   antigüedad, cocheras y valor del m²; lo que el portal no muestre queda editable.
5. Con encuestas completas en el período, la página de ficha de visitas muestra los gráficos; sin
   encuestas, dice "Aún no han completado la ficha de visitas".
6. Las páginas de canales sin datos no salen.
7. "Nuevo informe" con selector de fechas arma un informe de cualquier período.
8. "Marcar como listo" genera el PDF con la misma estructura y estética de los ejemplos, y queda
   descargable en la pestaña Informes.
9. Asesor ve y edita los informes de sus propiedades; coordinador, admin y dueño todos; abogado ninguno.
10. Si una fuente falla (Meta caído, token de ML vencido), el borrador se crea igual con esa
    sección marcada "no se pudo traer — reintentar", nunca con un 0 inventado.

## Riesgos (pre-flight)

- **Tiempo de Netlify:** juntar 5 fuentes en un request se pasa del techo → una fuente por pedido y
  el cron crea borradores de a pocos por corrida.
- **Números en 0 que no son 0:** una fuente caída no puede verse como "0 visitas" frente al
  propietario (criterio 10).
- **Instagram acumulado:** si se presenta como "del período" es falso; se rotula.
- **Token de ML:** vence cada 6 h y se refresca solo (ya integrado); si falla, criterio 10.
- **Dedupe de tareas:** índice único parcial existente (ver punto 5 de "por detrás").
- **PDF en el servidor:** las rutas `/pdf-assets/...` del informe de tasación fallan en Node; hay
  que pasar rutas absolutas o URLs.
- **Migración antes del deploy**, cron después (patrón de siempre).
