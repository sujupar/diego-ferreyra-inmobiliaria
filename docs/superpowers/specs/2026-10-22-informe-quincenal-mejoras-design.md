# Informe quincenal — mejoras: portales solos, textos escritos y competidoras buscadas

Fecha: 2026-10-22. Pedido del dueño después de revisar la Entrega 1 (PR #52):
"La idea es que la plataforma se encargue de hacer la mayor parte del trabajo."

**Problema:** el informe obliga a Paula a cargar números que la plataforma podría traer, a escribir textos
con datos que el sistema ya tiene y a buscar competidoras a mano.
**Resultado esperado:** al abrir un informe, los números de los portales, los textos y una lista de
competidoras candidatas ya están; Paula revisa, corrige si hace falta, elige competidoras y marca listo.

## Lo que se verificó contra los portales reales (2026-10-22, solo lectura)

| Portal | Qué da por API, por aviso y por fechas | Verificado |
|---|---|---|
| MercadoLibre | Visitas (`/items/visits`), interesados con su canal —pregunta, WhatsApp, llamada— (`/vis/users/{id}/leads/buyers`), vistas del teléfono (`/items/{id}/contacts/phone_views/time_window`), preguntas | Sí, sobre los 10 avisos publicados desde la plataforma |
| Argenprop | La ruta de estadísticas EXISTE (`/v1/estadisticas/avisos/{IdAviso}`) pero responde **"Anunciante inválido" (AUT005)** con nuestras credenciales en todas las variantes probadas. La documentación está en developers.argenprop.com, detrás de un login que no tenemos | Ruta sí; datos no |
| Zonaprop | Sin API | — |

Hallazgos laterales:
- El aviso de ML de **Doblas 248** guardado en la plataforma (MLA3968141346) está **cerrado** en MercadoLibre:
  por eso no trae nada. Si se republicó a mano, el aviso vigente es otro número.
- La cuenta de ML suma 4.448 visitas en octubre; los avisos publicados desde la plataforma, ~70. La mayoría
  de los avisos de ML se publicaron a mano y la plataforma no los conoce.
- Las páginas públicas de Argenprop y de Zonaprop muestran cuántas veces se vio el aviso ("Visto 2.210"),
  ACUMULADO desde que se publicó.

## Qué cambia

### 1. Números de los portales, solos

- **MercadoLibre:** además de las visitas, se traen solos contactos por canal (preguntas, WhatsApp,
  llamadas) y vistas del teléfono del período. Desaparecen esos campos manuales.
- **Avisos que la plataforma no conoce** (publicados a mano o republicados): la plataforma busca entre los
  avisos ACTIVOS de nuestra cuenta de ML el de esa propiedad (por dirección/título) y lo propone; Paula
  confirma con un toque. Así Doblas y el resto quedan cubiertos sin pegar códigos.
- **Argenprop:** mientras no tengamos acceso a sus estadísticas, las visualizaciones se toman de la página
  pública del aviso ("Visto N"). Se guarda el valor en cada informe y el del período es la diferencia con el
  informe anterior; el primer informe dice "desde la publicación". En cuanto Argenprop habilite las
  estadísticas, se cambia la fuente sin tocar la pantalla.
- **Zonaprop:** igual que Argenprop para las visualizaciones (página pública, por diferencia). La
  **exposición** (veces en los listados) solo está en el panel del anunciante: sigue manual o por captura.

### 2. Textos escritos por la plataforma

- Cuando terminan de llegar los datos, la plataforma escribe los cinco textos —resumen de métricas,
  acciones realizadas, acciones a realizar, resumen de consultas y análisis final— con el tono de los
  informes de ejemplo (Roque Pérez, Entre Ríos): cercano, profesional, primera persona del equipo, con los
  números del período.
- Se escriben con TODO lo que sabe el sistema: números de portales, consultas por portal y lo que dijeron,
  visitas y lo que respondieron en la encuesta (gustó / precio / ofertas / qué no gustó), campaña Meta,
  reels, competidoras elegidas, y el informe anterior (para no repetir y mostrar evolución).
- **Acciones realizadas** salen de lo que la plataforma registró en el período (publicaciones, campaña,
  reel, visitas realizadas, bajas de precio). **Acciones a realizar** son la recomendación según dónde se
  corta el embudo (mucha exposición y pocas consultas → revisar precio o presentación; consultas sin
  visitas → seguimiento; visitas que dicen "precio alto" → ajuste), igual que el análisis de los ejemplos.
- Paula los lee y corrige en la misma pantalla; un botón "Volver a escribir" los rehace con los datos del
  momento. Nada sale al propietario sin que alguien marque "listo".
- Una llamada de IA por pedido (regla de Netlify): los textos se escriben en su propio paso, con progreso.

### 3. Competidoras buscadas por la plataforma

- Al abrir el informe, la plataforma busca en **Argenprop y MercadoLibre** avisos en venta del mismo barrio
  y tipo, con ambientes parecidos (±1), y los ordena por parecido: ambientes, m², precio, antigüedad,
  disposición (frente/contrafrente) y estado. Descarta los nuestros.
- Para los mejores, abre cada aviso y lee disposición y estado (lo que el listado no muestra).
- Paula ve una lista de candidatas con foto, precio, m², valor del m², ambientes y el **porqué** del parecido
  ("mismo barrio, 3 amb, 76 m², frente, muy buen estado"), cada una con un botón **"Ver en el portal"**.
  Marca las que quiere (hasta 8) y esas son las que salen en el PDF. Sigue pudiendo pegar un link a mano.
- **Zonaprop no se puede buscar:** bloquea las páginas de resultados aun con el proxy premium (probado). Sí se
  puede abrir un aviso suelto de Zonaprop pegando su link.
- Costo: ~1 crédito de ScraperAPI por página de resultados + 1 por aviso abierto (≈ 15 por informe). Se
  guarda la búsqueda en el informe: reabrirlo no vuelve a gastar.

## Qué ve cada persona
Igual que en la Entrega 1 (Paula y operaciones todo; asesor sus propiedades; abogado nada). Cambia lo que
aparece al abrir: datos, textos y candidatas ya cargados, con un estado por paso ("Trayendo datos…",
"Escribiendo los textos…", "Buscando competidoras…").

## Qué queda afuera
- Las estadísticas de Argenprop por API (depende de que Argenprop las habilite; ver Pregunta abajo).
- La exposición de Zonaprop (solo en su panel).
- Buscar competidoras en Zonaprop.
- La Entrega 2 original (cron 1/16, tarea y email a Paula, listado) sigue pendiente aparte.

## Criterios de aceptación
1. Al abrir un informe de una propiedad con aviso de ML, aparecen solos visitas, preguntas, WhatsApp,
   llamadas y vistas del teléfono del período, iguales a los que da la API para esas fechas.
2. Si la plataforma no conoce el aviso de ML pero hay uno activo en la cuenta para esa dirección, lo
   propone y con un toque queda usado.
3. Las visualizaciones de Argenprop y Zonaprop se completan solas desde la página pública; el primer
   informe dice "desde la publicación" y los siguientes dan la diferencia del período.
4. Al terminar de llegar los datos, los cinco textos aparecen escritos, con los números reales del período y
   el tono de los ejemplos, y se pueden editar o volver a escribir.
5. Ningún texto afirma un dato que el sistema no tiene (si una fuente falló, el texto no lo menciona como 0).
6. Al abrir un informe aparece una lista de competidoras candidatas de Argenprop y MercadoLibre del mismo
   barrio y tipo, cada una con su porqué y el botón "Ver en el portal"; las elegidas salen en el PDF.
7. Reabrir un informe no repite la búsqueda ni la escritura (salvo que se pida).
8. Nada de esto cambia permisos: los mismos roles que en la Entrega 1.

## Riesgos (pre-flight)
- **Tiempo de Netlify:** búsqueda por portal, apertura de avisos y escritura van cada una en su pedido.
- **IA que inventa:** el prompt recibe SOLO los datos del informe y una regla dura de no afirmar lo que no
  está; los números del texto se verifican en código contra los datos (si no coinciden, se marca para revisar).
- **Recomendaciones de precio al propietario:** las escribe la IA pero las revisa Paula antes de "listo".
- **Scraping de portales:** puede romperse si cambian el HTML; el parser falla ruidoso y la pantalla deja
  pegar links a mano. Créditos de ScraperAPI compartidos con el resto: tope por informe.
- **Avisos de ML manuales:** emparejar por dirección puede equivocarse; por eso se PROPONE y Paula confirma.

## Pregunta abierta para el dueño
- **Argenprop:** ¿podés pedirle a Argenprop (o darme acceso a developers.argenprop.com) que habiliten las
  estadísticas de avisos para nuestra cuenta de integrador (anunciante 281022)? La ruta existe pero nos
  responde "Anunciante inválido".
