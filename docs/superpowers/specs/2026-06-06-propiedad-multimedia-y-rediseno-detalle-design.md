# Multimedia de propiedad captada + rediseño estilo iOS de la página de detalle

**Fecha:** 2026-06-06
**Estado:** Diseño aprobado (pendiente revisión del spec por el usuario)
**Página objetivo:** `app/(dashboard)/properties/[id]/page.tsx` (detalle de una propiedad **captada**, no confundir con `scheduled-appraisals/[id]`).

---

## 1. Contexto y objetivos

Cuando una propiedad ya pasó por el proceso y se capta, el asesor debe cargar su material: imágenes, video y, muchas veces, un recorrido virtual. Hoy:

- La subida de fotos permite **una sola imagen por vez** (`<input>` sin `multiple`, solo lee `files[0]`).
- No se puede **elegir las 3 fotos principales** (portada) ni reordenar.
- El **video** y el **recorrido virtual** solo se muestran como enlaces que abren afuera, no embebidos.
- La **documentación legal** ocupa demasiado espacio prioritario y empuja fotos/marketing muy abajo.
- La distribución general de la página no es amigable (todo siempre expandido, en tarjetas grandes apiladas).

**Objetivos:**
1. Subir **muchas imágenes a la vez** y elegir las **3 principales en orden** (portada 1·2·3).
2. Permitir cargar (de forma independiente y opcional) **video** (archivo subido) y **recorrido virtual** (enlace embebido).
3. Rediseñar la página de detalle con estética estilo **Apple/iOS**: secciones plegables, documentación legal compacta con estado clarísimo, y mejor distribución de **todas** las secciones de abajo.

**Restricción transversal:** no romper nada de lo existente (flujo legal, portales, notificaciones, RLS, miniatura `photos[0]`, deploy de Netlify).

---

## 2. Decisiones tomadas (confirmadas con el usuario)

| # | Decisión | Elección |
|---|----------|----------|
| 1 | Estilo de Documentación Legal | **Un desplegable maestro** (toda la sección colapsa en una tarjeta; encabezado con resumen de estado) |
| 2 | Galería / portada | **La posición manda**: las 3 primeras del array son la portada 1·2·3; se arrastra a la fila "Portada" para hacer principal |
| 3 | Agrupación de multimedia | **Tarjeta "Multimedia" con pestañas** Fotos / Video / Recorrido, todo embebido |
| 4 | Jerarquía de la página | **Resumen + acción arriba, historiales plegados abajo** |
| 5 | Origen del video | **Archivo subido** a Storage (reproductor nativo `<video>`), no enlace |
| 6 | Extras de galería | **Borrar fotos + lightbox** (visor ampliado) |
| 7 | Persistencia del reordenamiento | **Autoguardado al soltar** (con toast discreto "Guardado") |
| 8 | Dependencia para drag-and-drop | **@dnd-kit** (accesible, soporta touch) |
| 9 | Columna para video subido | **Nueva columna `video_file_url`** (no reusar `video_url`, que consumen los portales) |

---

## 3. Modelo de datos

Estado actual verificado en `types/database.types.ts`:

- `photos: string[]` (Postgres `TEXT[]`) — URLs públicas de Storage. **El índice del array es el orden.** `photos[0]` se usa como miniatura en toda la app (listado, leads).
- `video_url: string | null` — **existe**; lo consumen los mappers de portales esperando un enlace tipo YouTube. **No se toca.**
- `tour_3d_url: string | null` — **existe**; se reutiliza para el recorrido virtual (enlace).

### Cambios

- **Fotos / portada:** sin cambio de esquema. El orden del array es la verdad canónica. Las primeras 3 = portada 1·2·3. Reordenar = reescribir el array completo. Esto vale en todos lados (miniatura, landing, portales), no solo marketing.
- **Recorrido virtual:** sin cambio de esquema. Se guarda el enlace en `tour_3d_url`.
- **Video subido:** **migración nueva** que agrega `video_file_url TEXT` a `properties`.
  - Migración: `supabase/migrations/20260606000001_property_video_file_url.sql` → `ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS video_file_url text;`
  - Como Supabase CLI no conecta, el SQL se corre en el Dashboard SQL Editor (registrar en el commit que hay migración pendiente de aplicar manualmente).
  - Regenerar/editar `types/database.types.ts` para incluir `video_file_url` en Row/Insert/Update.

### Tipos en `lib/supabase/properties.ts`

Agregar al `PropertyInput` y/o a la firma de `updateProperty` los campos para que el persistido sea type-safe: `video_url?`, `tour_3d_url?`, `video_file_url?`. (Hoy `updateProperty` ya persiste cualquier campo por spread, pero conviene declararlos.)

---

## 4. Arquitectura de subida (robusta, patrón URL firmada)

Se replica el patrón que **ya funciona** para documentos legales (`legal-docs/[itemKey]/upload-init` + `upload-commit`): subida **directa a Storage con URL firmada**, evitando el límite de body de Next.js y las condiciones de carrera al subir muchos archivos. El endpoint actual `POST /api/properties/[id]/upload` (multipart, un archivo) **se mantiene** por compatibilidad, pero la galería nueva usa los endpoints nuevos.

### Endpoints nuevos

1. **`POST /api/properties/[id]/media/upload-init`**
   - `requireAuth()` + rol distinto de `abogado` (la gestión de media es del asesor/coordinación, no del abogado).
   - Body: `{ kind: 'photo' | 'video', files: [{ fileName, fileSize, contentType }] }`.
   - Valida extensión y tamaño por tipo:
     - foto: `jpg,jpeg,png,webp,heic,heif`, máx 15 MB c/u.
     - video: `mp4,mov,webm,m4v`, máx 200 MB (alineado con el límite del patrón legal).
   - Por cada archivo: `bucket.createSignedUploadUrl(path)` con `path = properties/{id}/photos/{uuid}.{ext}` o `properties/{id}/video/{uuid}.{ext}`.
   - Devuelve `[{ signedUrl, token, path, publicUrl }]`.

2. **`POST /api/properties/[id]/media/commit`**
   - `requireAuth()` + rol ≠ `abogado`.
   - Body: `{ kind: 'photo', urls: string[] }` o `{ kind: 'video', url: string }`.
   - `kind='photo'`: lee `photos` actual, hace **un único** `updateProperty(id, { photos: [...existing, ...urls] })` (sin N writes que compitan), luego `checkAndAdvanceProperty(id)` **una sola vez**.
   - `kind='video'`: `updateProperty(id, { video_file_url: url })`. (No dispara auto-advance — el auto-advance solo depende de fotos + legal.)

3. **`PATCH /api/properties/[id]/media`** — operaciones sobre media ya cargada.
   - `requireAuth()` + rol ≠ `abogado`.
   - Acepta una de estas formas (validadas):
     - `{ photos: string[] }` → setea el array reordenado (reordenar / elegir portada). **Un solo write.**
     - `{ deletePhoto: string }` → quita esa URL del array y borra el objeto de Storage (`bucket.remove([path])`, derivando el path desde la URL pública). Reescribe el array.
     - `{ video_file_url: string | null }` → setea o limpia el video.
     - `{ tour_3d_url: string | null }` → setea o limpia el recorrido.
   - **No** se usa el `PUT /api/properties/[id]` existente para esto, porque ese tiene efectos secundarios (crea tarea + dispara email cuando `status='pending_review'`).

### Cliente (subida con progreso)

- Foto: `multiple` en el input; por cada archivo seleccionado se hace `init` → `PUT` a `signedUrl` (XHR con progreso, en paralelo con `Promise.all`) → un solo `commit` con todas las `urls`. Refrescar la propiedad y toast.
- Video: idéntico pero un archivo; `commit` con `{ kind:'video', url }`.

---

## 5. Feature 1 — Galería de fotos

**Componente nuevo:** `components/properties/PhotoGallery.tsx` (usado dentro de la pestaña "Fotos" de `PropertyMediaCard`).

- **Multi-selección al subir** (`<input type="file" accept="image/*" multiple>`), barra de progreso agregada.
- **Layout:** fila destacada **"Portada"** = primeras 3 (`photos.slice(0,3)`) con badges **1·2·3** y borde índigo; debajo, grilla del resto (`photos.slice(3)`), `grid-cols-2 sm:grid-cols-4`.
- **Reordenar:** drag-and-drop con `@dnd-kit/core` + `@dnd-kit/sortable`. Al soltar → `PATCH .../media { photos: nuevoOrden }` (**autoguardado**) + toast "Guardado". Arrastrar una foto a las 3 primeras posiciones la convierte en portada.
- **Borrar:** botón (✕) al hover → `PATCH .../media { deletePhoto: url }` (saca del array + borra de Storage). Confirmación liviana.
- **Lightbox:** clic en una foto abre un visor ampliado (modal) con anterior/siguiente. Implementación liviana propia o sobre el `Dialog` existente.
- **Optimismo de UI:** reordenar/borrar actualiza el estado local al instante y revierte si el PATCH falla.

**Compatibilidad:** `photos[0]` sigue siendo la portada principal en listado/leads/portales (no se rompe ningún consumidor).

---

## 6. Feature 2 — Multimedia (pestañas: Fotos / Video / Recorrido)

**Componente nuevo:** `components/properties/PropertyMediaCard.tsx` — tarjeta "Multimedia" con pestañas. Cada pestaña muestra ✓ cuando tiene contenido (`photos.length`, `video_file_url`, `tour_3d_url`).

- **Fotos:** renderiza `PhotoGallery` (Feature 1).
- **Video:**
  - Si hay `video_file_url`: reproductor nativo `<video controls preload="metadata" src={video_file_url}>` + botón "Reemplazar" y "Quitar" (`PATCH { video_file_url: null }` + borrar de Storage).
  - Si no hay: botón "Subir video" (un archivo, patrón URL firmada).
- **Recorrido virtual:**
  - Input para pegar el enlace + botón "Guardar" → `PATCH { tour_3d_url }`.
  - Si hay enlace: `<iframe>` embebido (`allowfullscreen`, `loading="lazy"`, sandbox razonable). Para enlaces conocidos (Matterport, Kuula) se usa el enlace tal cual (son embebibles). **Fallback:** si el proveedor bloquea el iframe (`X-Frame-Options`), se muestra siempre debajo un enlace "Abrir en pestaña nueva" como salida garantizada. Botón "Quitar".
- **Independencia:** los tres son opcionales; se puede cargar cualquier combinación.

**Gating por rol:** la tarjeta Multimedia (como las fotos hoy) está oculta para `abogado`.

---

## 7. Feature 3 — Documentación Legal (desplegable maestro)

**Archivo:** `components/properties/LegalDocsChecklist.tsx` (se envuelve; no se cambia su lógica de subir/aprobar/rechazar/flags/notas).

- **Primitivo nuevo:** `components/ui/collapsible.tsx` (shadcn sobre `radix-ui` Collapsible).
- **Estructura:** un `Collapsible` maestro envuelve toda la sección legal.
  - **Encabezado (plegado):** ícono ⚖️ + "Documentación Legal" + **resumen de estado claro**:
    - si todo aprobado/ok → pill verde "X/Y aprobados".
    - si hay algún **rechazado** → pill roja "N rechazado · revisar" (prioridad alta, para que no se pase).
    - si hay pendientes (sin rechazos) → pill ámbar "N pendiente(s)".
    - chevron que rota al abrir.
  - **Cuerpo (expandido):** exactamente lo de hoy — tarjeta de Situación Jurídica (flags) + categorías Obligatorios / Temporales / Opcionales con sus ítems (StatusIcon, badges, subir/reemplazar para asesor, aprobar/rechazar para abogado, notas).
- **Estado por defecto:** abierto si hay algo que requiere atención del rol actual (p. ej. abogado con pendientes, o asesor con rechazos); si todo está aprobado, plegado.
- **Colores de estado:** se mantiene la paleta actual (emerald/amber/red/gris), aplicada de forma consistente también en los badges del encabezado.

---

## 8. Rediseño de la página de detalle (jerarquía A)

**Archivo:** `app/(dashboard)/properties/[id]/page.tsx`. Es una reordenación + envoltura en plegables de secciones que ya existen; **no** cambia la lógica de datos/permisos.

Orden nuevo (de arriba abajo), respetando el gating por rol actual:

1. **Encabezado** — dirección, barrio/ciudad, badge de estado. *(fijo)*
2. **Resumen de captación** — el dual-track actual (Revisión Legal + Fotos) presentado más visual, con el estado general. *(fijo, mejorado)*
3. **Acción principal** — el bloque de acción que corresponde al estado/rol (Enviar a Revisión Legal / tarjeta "En Revisión" / acción de aprobar-rechazar del abogado / recordatorio de fotos). Se sube cerca del top. *(fijo)*
4. **Multimedia** — `PropertyMediaCard` (Fotos/Video/Recorrido). *(oculto a abogado)*
5. **Documentación Legal** — desplegable maestro (Feature 3). *(plegable)*
6. **Datos** — Datos de la Propiedad + Datos Comerciales (Comerciales oculto a abogado), envuelto en plegable. *(plegable)*
7. **Historial** — agrupa, plegado por defecto: `FlowHistoryCard`, Feedback de visitas, `LegalReviewHistory`. *(plegable, plegado)*
8. **Marketing** — `PostCaptureActions` + `GenerateDescriptionCard` + `MarketingTabs`. *(solo `status='approved'` y no abogado, igual que hoy)*
9. **Archivar / Eliminar** — al fondo, discreto. *(oculto a abogado)*

El banner de importación GHL (condicional) se mantiene cerca del top como hoy.

---

## 9. Componentes y archivos

### Nuevos
- `supabase/migrations/20260606000001_property_video_file_url.sql` — columna `video_file_url`.
- `components/ui/collapsible.tsx` — primitivo shadcn (Collapsible).
- `components/ui/tabs.tsx` — primitivo shadcn (Tabs) para Multimedia. *(alternativa: patrón custom `useState` como `MarketingTabs`; se prefiere el primitivo para accesibilidad.)*
- `components/properties/PropertyMediaCard.tsx` — tarjeta Multimedia con pestañas.
- `components/properties/PhotoGallery.tsx` — galería con dnd, portada 1·2·3, borrar, lightbox.
- `app/api/properties/[id]/media/upload-init/route.ts` — URLs firmadas.
- `app/api/properties/[id]/media/commit/route.ts` — commit de fotos/video.
- `app/api/properties/[id]/media/route.ts` — `PATCH` reordenar/borrar/setear video/tour.

### Modificados
- `app/(dashboard)/properties/[id]/page.tsx` — nueva jerarquía + envoltura en plegables + montaje de `PropertyMediaCard` (reemplaza la tarjeta de Fotos actual, líneas ~475-502 y el `handleUpload` de foto único).
- `components/properties/LegalDocsChecklist.tsx` — envoltura en Collapsible maestro + resumen de estado en encabezado.
- `lib/supabase/properties.ts` — tipos `video_url`/`tour_3d_url`/`video_file_url` en `PropertyInput`/`updateProperty`.
- `types/database.types.ts` — agregar `video_file_url`.
- `package.json` — `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

---

## 10. Manejo de errores y casos borde

- **Subida parcial multi-foto:** si fallan algunos archivos, se commitean solo los que subieron OK y se avisa cuáles fallaron (no se pierde lo bueno).
- **Auto-avance único:** `checkAndAdvanceProperty` se llama **una vez** después del commit del lote, nunca por archivo (evita disparos múltiples de la notificación de captación; el `UNIQUE INDEX` ya es defensa extra).
- **Borrar de Storage:** derivar el path desde la URL pública; si el borrado de Storage falla, igual se actualiza el array (la foto desaparece de la UI) y se loguea el huérfano.
- **Reordenar concurrente:** cada PATCH manda el array completo → last-write-wins limpio, sin merge parcial.
- **iframe del recorrido bloqueado:** siempre se ofrece "Abrir en pestaña nueva" como fallback.
- **Video grande:** límite 200 MB; si se supera, error claro (413) antes de empezar.
- **Rol abogado:** los endpoints de media rechazan al abogado; la UI no le muestra Multimedia.

---

## 11. No-regresión (qué NO se rompe)

- `photos[0]` sigue siendo la miniatura/portada en listado, leads y portales.
- `video_url` (enlaces para portales) **no se toca**; el video subido vive en `video_file_url`.
- Los mappers de portales (`lib/portals/...`) y `lib/portals/validation.ts` siguen leyendo `video_url`/`tour_3d_url` igual.
- El flujo de documentos legales (subir/init/commit/review/eventos/notificaciones) queda **intacto**; solo se envuelve visualmente.
- RLS por rol sin cambios. Endpoints nuevos con `requireAuth` + gating de rol.
- Las Netlify Functions no se tocan (y de tocarse, no pueden importar alias `@/`).
- Bucket `property-files` y convención de paths reutilizados.

---

## 12. Verificación

- **Migración:** correr el `ALTER TABLE` en el Dashboard SQL Editor; confirmar `video_file_url` con un `SELECT`.
- **Subida multi-foto real:** subir 5+ fotos a la vez en el flujo de la app (no solo SQL); confirmar que aparecen todas, en orden, y que el estado avanza una sola vez.
- **Portada:** reordenar, verificar que `photos[0..2]` reflejan la portada y que la miniatura del listado cambia.
- **Borrar:** confirmar que sale del array y del bucket.
- **Video:** subir un MP4, reproducir embebido, reemplazar y quitar.
- **Recorrido:** pegar un enlace Matterport/Kuula y un 360, ver embebido + fallback.
- **Legal colapsable:** verificar resumen del encabezado en los 3 escenarios (todo ok / pendiente / rechazado) y que subir/aprobar/rechazar siguen funcionando.
- **Roles:** repetir como `abogado` (sin Multimedia ni archivar) y como `asesor`.
- `npm run build` / typecheck verde.
- Al finalizar: ejecutar `/review` (pedido explícito del usuario) y actualizar `CLAUDE.md`.

---

## 13. Fuera de alcance (YAGNI)

- Migrar `photos` a JSONB con metadata por imagen (captions, flags) — no se necesita; el orden del array alcanza.
- Múltiples videos o múltiples recorridos por propiedad — uno de cada uno.
- Transcodificación/optimización de video, generación de thumbnails del video.
- Reescritura del sistema de portales o del flujo legal.
- Editor de imágenes (crop/rotación).

---

## 14. Riesgos / notas operativas

- **Commit author** debe ser `Sujupar <redstyle50@gmail.com>` o el deploy de Netlify falla.
- **Dependencia nueva** `@dnd-kit/*`: chequear que buildee en Netlify (es liviana y SSR-safe; el componente de galería es client).
- **Video en portales:** un MP4 en Storage no es equivalente a un enlace de YouTube para los portales; por eso queda en columna aparte y no se inyecta en `video_url`. Si en el futuro se quiere publicar video a portales, se decidirá ahí.
- **Tamaño de body Next.js:** resuelto usando URLs firmadas (subida directa a Storage), no multipart al server.
