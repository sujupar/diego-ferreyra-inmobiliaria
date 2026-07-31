# Ficha de propiedad premium — rediseño de `/properties/[id]`

**Fecha:** 2026-07-31
**Estado:** diseño aprobado por el usuario (pendiente de plan de implementación)
**Alcance:** solo la vista de detalle de una propiedad. Reorganización visual y de navegación; **cero cambios de lógica de negocio**.

---

## 1. Problema

La ficha que se abre al tocar "Ver detalle completo" es una **columna angosta (`max-w-4xl`) con ~12 tarjetas apiladas** en un único scroll: volver, header, dos banners de importación, tarjeta de progreso dual, tarjeta de resultado legal, botón de acción, multimedia con 5 pestañas, checklist legal, "Datos" plegado, "Historial" plegado, bloque de marketing (4 componentes seguidos) y una tarjeta de descarte/eliminación. Son 694 líneas en un solo archivo cliente.

Consecuencias concretas:

- **No se parece a una ficha de propiedad.** Las fotos solo existen como grilla de edición (drag & drop), nunca como galería. La primera impresión es un formulario, no un inmueble.
- **La documentación legal ocupa un espacio desproporcionado:** tarjetas dentro de tarjetas dentro de tarjetas (`Collapsible > Card > Card > Card`), con `CardHeader` completo por cada grupo de documentos.
- **Datos que existen en la base nunca se muestran:** `description`, `amenities`, `expensas`, `floor`, `age`, `operation_type`, `latitude/longitude`. `getProperty` hace `select('*')`, así que ya llegan al cliente — la interfaz `PropertyData` de la página simplemente no los declara ni los pinta.
- **Para llegar a difusión hay que scrollear toda la propiedad**, y ahí conviven cuatro componentes sin jerarquía común, incluido uno innecesario (`GenerateDescriptionCard`).

## 2. Decisiones tomadas (usuario, 2026-07-31)

1. **Alcance:** solo la ficha completa. El listado y el popup de resumen previo no se tocan.
2. **Galería limpia arriba**, y debajo, ordenado y premium, tanto la información de la propiedad como las funciones de trabajo (portales, campañas, landing, documentación).
3. **La navegación es por pestañas, NO por scroll.** Este punto se corrigió explícitamente sobre la maqueta: al tocar "Multimedia" aparece **solo** Multimedia. Las demás secciones no están más abajo — no se renderizan hasta que se piden.
4. **La edición de multimedia vive en su propia pestaña**, con las 5 solapas actuales intactas.
5. **El mapa se incluye, contenido:** ancho completo y bajo, dentro de la sección Ubicación. Nunca ocupando media pantalla (rechazo explícito de la referencia de Habi).
6. **Sin tarjeta de agente** en ninguna parte (las referencias visuales la traían; no aplica).
7. **Se elimina "Generar descripción para portales"** — la descripción ya se genera dentro de cada asistente de portal.

## 3. Fuera de alcance

- Tarjetas del listado (`/properties`) y `PropertyDetailModal`.
- Los wizards de MercadoLibre, Argenprop y Meta Ads (se siguen abriendo en sus rutas actuales).
- El editor de landing (`/properties/[id]/landing/edit`).
- Cualquier migración de base de datos: **no hace falta ninguna**.
- Cambiar textos de negocio, reglas de permisos o el flujo de captación.

---

## 4. Arquitectura de la vista

La página pasa de "un archivo que lo pinta todo" a **un orquestador delgado + componentes de sección aislados**, cada uno con una responsabilidad y un contrato claro.

```
app/(dashboard)/properties/[id]/page.tsx     (orquestador: fetch + estado + composición)
│
├── components/properties/detail/
│   ├── PropertyHeroGallery.tsx      galería de lectura + visor + estado vacío
│   ├── PropertyIdentityBar.tsx      operación/tipo, dirección, barrio, precio, estado
│   ├── PropertyKeyStats.tsx         fila de datos clave (solo los que existen)
│   ├── PropertyNextStepBanner.tsx   próximo paso / alertas unificadas
│   ├── PropertyTabsNav.tsx          barra pegajosa que CAMBIA el contenido
│   ├── PropertyLocationMap.tsx      mapa Leaflet de solo lectura (dynamic, ssr:false)
│   └── tabs/
│       ├── OverviewTab.tsx          descripción + características + comerciales + ubicación
│       ├── MediaTab.tsx             envuelve PropertyMediaCard (sin cambios internos)
│       ├── DocsTab.tsx              LegalDocsChecklist compacto + revisión legal
│       ├── MarketingTab.tsx         canales + LandingSection + MarketingTabs
│       └── HistoryTab.tsx           flujo + feedback de visitas + historial legal
│
└── lib/properties/detail-view.ts    helpers PUROS y testeables:
        buildKeyStats(property)      → [{label, value}] solo con lo presente
        visibleTabs({role, status})  → qué pestañas existen
        resolveTab(param, visible)   → pestaña activa con fallback seguro
        nextStep(property, docs)     → {tone, título, texto, acción} o null
```

**Por qué así:** la lógica que hoy está enredada en JSX (qué badge mostrar, qué banner, qué campos existen) se vuelve funciones puras que se pueden probar sin navegador — algo que importa acá porque **Turbopack no arranca en esta carpeta** (bug del acento en "Gestión") y no hay forma de ver la página con `next dev` normal.

### Estado de la pestaña activa

- Vive en la URL como `?tab=propiedad|multimedia|documentacion|difusion|historial`, con `router.replace` (sin recargar).
- Beneficio real: recargar no te devuelve al principio, y se puede mandar un link directo a la documentación de una propiedad.
- `resolveTab` cae a `propiedad` si el parámetro es desconocido o si esa pestaña no es visible para el rol/estado actual.

---

## 5. Diseño por sección

### 5.1 Zona fija (siempre visible, arriba de las pestañas)

**Galería.** Mosaico tipo portal: foto de portada grande a la izquierda + 4 miniaturas a la derecha (2×2), proporciones fijas, esquinas redondeadas. Sobre la portada, chips con el material disponible: `22 fotos · 2 planos · Video · Recorrido 360°`. Clic en cualquier foto abre el visor a pantalla completa (mismo patrón del visor actual de `PhotoGallery`). Es **solo de lectura**: acá no se sube ni se reordena nada.

- Con menos de 5 fotos, el mosaico se adapta (1 foto → una sola imagen ancha; 2-4 → grilla proporcional). Nunca quedan huecos grises.
- **Sin fotos:** panel navy de marca a todo el ancho, con ícono, "Todavía no hay fotos de esta propiedad", la razón ("sin fotos no se puede publicar ni lanzar campañas") y un botón que lleva a la pestaña Multimedia. Estéticamente resuelto, no un hueco roto.

**Barra de identidad.** Ojo de aguja: `eyebrow` con operación + tipo capitalizado ("Departamento en venta"), dirección en la serif editorial de las landings, barrio y ciudad debajo. A la derecha, precio grande y el badge de estado (la misma lógica derivada de hoy, incluido el caso `pending_review + legal aprobado → "Pendiente Fotos"`).

**Datos clave.** Fila de tarjetitas con lo que exista: ambientes, dormitorios, baños, cocheras, m² cubiertos, m² totales, piso, antigüedad, expensas. Los campos ausentes no dejan lugar vacío (`buildKeyStats` los filtra).

**Próximo paso.** Un solo bloque que reemplaza los banners sueltos de hoy (importada de GHL, importada por CSV, fotos pendientes, en revisión legal, documentación rechazada). `nextStep()` decide cuál corresponde por prioridad y devuelve tono, texto y **la acción principal**; si no hay nada pendiente, no se muestra nada.

- La acción principal es el botón que hoy está suelto en el medio de la página: **"Enviar a Revisión Legal"** cuando corresponde (mismo `PUT` a `status: 'pending_review'`), o un salto a la pestaña que resuelve el pendiente ("Ir a Documentación", "Subir fotos").
- El banner dice **el estado en una línea**; el detalle completo de la revisión legal (observaciones del abogado, botones de aprobar/rechazar) vive en la pestaña Documentación, no acá.
- Los detalles largos (campos importados de GHL) quedan en un desplegable dentro del mismo bloque.

**Ancho:** la página pasa de `max-w-4xl` a `max-w-6xl`. La galería y la grilla de datos necesitan aire; con el ancho actual el mosaico se ve apretado.

### 5.2 Barra de pestañas

Pegajosa debajo del encabezado del dashboard, con la pestaña activa resaltada. **Cambia el contenido; no hace scroll.**

Pestañas y cuándo existen:

| Pestaña | Visible cuando |
|---|---|
| Propiedad | siempre (por defecto) |
| Multimedia | rol ≠ abogado |
| Documentación | siempre |
| Difusión | rol ≠ abogado **y** `status === 'approved'` (igual que hoy) |
| Historial | siempre |

Las reglas de visibilidad son exactamente las de hoy, solo que ahora viven en `visibleTabs()` en vez de estar repartidas en condicionales del JSX.

### 5.3 Pestaña **Propiedad**

Dos columnas en escritorio, una en móvil:

- **Descripción** (`property.description`, respetando saltos de línea). Si no hay, una línea sobria: "Esta propiedad todavía no tiene descripción cargada." Sin botones de IA.
- **Características**: tarjetitas con tipo, operación, piso, antigüedad, expensas y amenities. Debajo, **Datos comerciales** (precio, comisión, fechas de contrato, origen) — **ocultos al abogado**, igual que hoy.
- **Ubicación**, a todo el ancho por debajo: mapa Leaflet de solo lectura, ~260 px de alto, con pin en `latitude/longitude` y zoom/arrastre habilitados pero sin edición. Si la propiedad no tiene coordenadas, **no se renderiza el mapa**: solo barrio y ciudad con una nota discreta ("Esta propiedad todavía no tiene ubicación precisa cargada"). El mapa se importa dinámicamente con `ssr: false`, siguiendo el patrón ya probado de `wizards/ml/GeoPinMap.tsx`.

### 5.4 Pestaña **Multimedia**

`PropertyMediaCard` tal cual está hoy, con sus 5 solapas (Fotos, Planos, Video, Recorrido, Video recorrido) y todo su comportamiento: subida por URL firmada, lotes de 30, drag & drop de portada, borrado, guardado de enlaces. **No se toca su código interno.** Solo cambia el encabezado de sección que lo envuelve.

### 5.5 Pestaña **Documentación** (el arreglo principal)

Rediseño de `LegalDocsChecklist` para que ocupe un bloque y no pantallas:

- **Encabezado**: anillo de progreso con "6/7 aprobados" + píldora de estado (usa `summarizeLegalDocs`, que ya existe).
- **Situación jurídica**: los 4 interruptores (sucesión, divorcio, poderes, compra a crédito) pasan de una tarjeta con `CardHeader` a **una fila compacta de toggles**.
- **Documentos**: **una línea por documento** — punto de estado, nombre, badge, y a la derecha el botón que corresponda (Subir / Reemplazar / Ver, o Aprobar / Rechazar si es el abogado). Los grupos (Obligatorios / Temporales / Opcionales) pasan de ser `Card` anidadas a **separadores de una línea**.
- **Revisión legal**: el panel de aprobar/rechazar del abogado y el resultado de la revisión (hoy tarjetas sueltas en el medio de la página) se mudan acá, que es donde el abogado trabaja.
- Arranca **plegada** si está todo aprobado; **abierta** si falta algo.

Todos los handlers (`handleUpload`, `handleReviewItem`, `handleFlagChange`, diálogo de rechazo) se conservan idénticos: cambia el envoltorio visual, no la mecánica.

### 5.6 Pestaña **Difusión y resultados**

Tres bloques, en este orden:

1. **Canales** — cuatro tarjetas parejas: MercadoLibre, Argenprop, Meta Ads y **Landing**. Mismo formato para las cuatro: nombre, badge de estado, una línea de contexto, botón. Hoy la landing está suelta con otro formato; acá entra en la misma fila. (Extiende `PostCaptureActions`, que ya resuelve los estados de los tres primeros.)
2. **Landing** — `LandingSection` tal cual, sin cambios internos (es el asistente de co-creación).
3. **Resultados** — `MarketingTabs` tal cual (Resumen / Portales / Meta Ads / Leads / Consultas).

**Se elimina `GenerateDescriptionCard` de la página.** Se usa solo acá (verificado por búsqueda en todo el repo), así que quitarla no afecta a los asistentes de portales, que generan la descripción por su cuenta. El endpoint `/api/properties/[id]/generate-description` queda intacto.

### 5.7 Pestaña **Historial**

`FlowHistoryCard`, feedback de visitas y `LegalReviewHistory`, tal como están hoy, uno debajo del otro.

### 5.8 Pie

Las acciones de **descartar / restaurar / eliminar** dejan de ser una tarjeta punteada grande y pasan a una franja discreta al pie de la página, fuera de las pestañas (siempre accesible, nunca protagonista). Se conservan las mismas confirmaciones: `confirm()` para descartar y escribir "ELIMINAR" para el borrado definitivo.

---

### 5.9 Mapa de paridad — dónde queda cada bloque de hoy

Ningún bloque actual desaparece sin destino explícito:

| Bloque de hoy | Destino |
|---|---|
| Barra "Volver" + Agregar tarea | Barra superior, igual |
| Header (dirección, barrio, badge de estado) | Barra de identidad (zona fija) |
| Banner "Importada de GHL" | Próximo paso (con desplegable de campos importados) |
| Banner "Importada pre-captada (CSV)" | Próximo paso |
| Tarjeta "Progreso dual" (Revisión Legal / Fotos) | **Se disuelve**: el estado legal pasa al anillo de la pestaña Documentación; el de fotos, al contador de la galería y a los datos clave; el estado global, al badge de la barra de identidad |
| Tarjeta "Resultado de revisión legal" | Pestaña Documentación |
| Botón "Enviar a Revisión Legal" | Acción del bloque Próximo paso |
| Tarjeta del abogado (aprobar/rechazar) | Pestaña Documentación |
| Recordatorio "Fotos pendientes" | Próximo paso |
| `PropertyMediaCard` | Pestaña Multimedia (sin cambios internos) |
| `LegalDocsChecklist` | Pestaña Documentación (rediseñada, misma mecánica) |
| Plegable "Datos de la propiedad" + "Datos Comerciales" | Pestaña Propiedad |
| Plegable "Historial" (flujo, feedback, revisiones) | Pestaña Historial |
| `PostCaptureActions` | Pestaña Difusión → fila de canales (ahora con Landing) |
| `LandingSection` | Pestaña Difusión (sin cambios internos) |
| `GenerateDescriptionCard` | **Eliminada** (decisión del usuario) |
| `MarketingTabs` | Pestaña Difusión → bloque de resultados |
| Tarjeta "Acciones de archivo" | Franja discreta al pie |

## 6. Lenguaje visual

Se apoya en lo que el proyecto ya tiene, sin inventar un sistema nuevo:

- Tipografía serif editorial para dirección y títulos de sección (la misma familia de las landings de lujo y de los anuncios de Meta), utilidades `.display`, `.eyebrow`, `.tabular-n` de `globals.css`.
- Color de marca `--brand` (navy) para la barra de pestañas activa, chips y acentos; fondos cálidos neutros para las tarjetas.
- Modo oscuro respetado en todo (el dashboard ya lo soporta).
- Componentes de `shadcn/ui` existentes; nada de dependencias nuevas. Leaflet ya está en el proyecto.

---

## 7. Qué NO cambia (invariantes)

Esto es reorganización visual. Deben seguir funcionando **exactamente igual**:

- Todos los endpoints y llamadas: `GET/PUT/DELETE /api/properties/[id]`, `/review`, `/legal-docs/*`, `/media/*`, `/listings`, `/meta-campaign`, `/feedback`, `/flow-history`.
- Permisos por rol: el abogado no ve multimedia, ni datos comerciales, ni difusión, ni archivar/eliminar. Solo admin y dueño pueden eliminar definitivamente.
- Flujos: enviar a revisión legal, aprobar/rechazar (global y por documento), subida de fotos/planos/video, guardado de recorrido, publicación en portales, lanzamiento de campañas, creación y publicación de landing.
- Efectos secundarios: `checkAndAdvanceProperty` en el commit de media, tareas automáticas al pasar a revisión, notificaciones por email.
- La ruta y el link "Ver detalle completo" del popup siguen igual.

---

## 8. Riesgos y cómo se manejan

| Riesgo | Mitigación |
|---|---|
| Perder una función al mover código entre archivos | Los componentes pesados (`PropertyMediaCard`, `LandingSection`, `MarketingTabs`, `FlowHistoryCard`) se **envuelven, no se reescriben**. Solo `LegalDocsChecklist` y `PostCaptureActions` cambian por dentro, y ahí se conservan los handlers uno por uno. |
| Contenido que ya no se ve porque quedó en otra pestaña | `visibleTabs()` + `nextStep()` cubiertos con pruebas unitarias; checklist de paridad: cada bloque de la página vieja mapeado a su destino. |
| Leaflet rompiendo el render en servidor | Import dinámico con `ssr:false`, igual que `GeoPinMap`, que ya funciona en producción. |
| No poder ver el resultado localmente (Turbopack roto por el acento del path) | Verificación por `npx tsc --noEmit` + prueba con `renderToStaticMarkup` de cada pestaña; `next dev --webpack` para mirarlo en el navegador; confirmación visual final del usuario. |
| Propiedades viejas sin `description`, sin coordenadas o sin fotos | Cada sección tiene estado vacío explícito y diseñado. Ninguna asume que el campo existe. |

## 9. Verificación antes de dar por terminado

1. `npx tsc --noEmit` limpio.
2. Pruebas unitarias de `lib/properties/detail-view.ts` (stats, pestañas visibles por rol/estado, resolución de pestaña, próximo paso).
3. Probe de render de las 5 pestañas con `renderToStaticMarkup`, para los casos: captada completa, pendiente de documentos, sin fotos, y vista de abogado.
4. Revisión manual en navegador (`next dev --webpack`): que las pestañas cambien contenido, que la galería abra el visor, que subir una foto siga funcionando y que la documentación se pueda subir y aprobar.
5. Confirmación visual del usuario.
