# Publicaciones — carga desde un enlace de Google Drive

**Goal:** pegar el enlace de una carpeta o de un archivo de Drive en "Cargar", elegir los videos y que la
plataforma los traiga sola al almacenamiento y los prepare igual que los subidos desde la computadora.

**Spec:** `docs/superpowers/specs/2026-10-29-publicacion-masiva-contenido-design.md` §3.2, §4.1, criterio 3.
Adelantado a pedido del dueño (2026-11-04), antes de comentarios y de YouTube.

**Arquitectura:** el servidor copia Drive → Storage por partes de 6 MB con la subida reanudable (TUS) de
Supabase, varias partes por pedido con techo de tiempo; el navegador loopea `POST /videos/[id]/traer`
mostrando el porcentaje. Al terminar, el video entra a `extrayendo` y sigue el camino de siempre (el
navegador saca miniatura y audio desde la URL pública).

## Decisiones (rulings)

- **Solo carpetas/archivos compartidos "Cualquier persona con el enlace"**, leídos con `GOOGLE_API_KEY`.
  Lo privado necesitaría el permiso de Drive restringido de Google (revisión de seguridad paga). El mensaje
  dice exactamente qué compartir.
- **Solo la carpeta pegada, sin subcarpetas.** Se avisa.
- **Formatos:** `video/mp4` y `video/quicktime`, hasta 200 MB (los mismos de la subida). Lo demás aparece en
  la lista deshabilitado con el motivo.
- **El servidor relee la metadata de Drive al dar de alta** (nunca confía en el tamaño que manda el navegador).
- Verificado el 2026-11-04: TUS de Supabase desde el servidor (3 partes de 6 MB, `HEAD` devuelve el offset
  para retomar, el archivo queda público con CORS `*`).

## Tareas

1. **`lib/publicaciones/drive/enlace.ts` (puro).** `leerEnlaceDrive(texto) → {id, tipo:'carpeta'|'archivo'|'desconocido', resourceKey?} | null`.
   Host EXACTO `drive.google.com` (https). Formas: `/drive/folders/ID`, `/drive/u/N/folders/ID`,
   `/drive/mobile/folders/ID`, `/file/d/ID/...`, `/open?id=ID`, `/uc?id=ID`; `?resourcekey=`.
   Tests: cada forma, host parecido (`drive.google.com.evil.com`, `evil.com/drive.google.com`), http, id con
   caracteres raros, vacío.
2. **`lib/publicaciones/drive/archivos.ts` (puro).** `clasificarArchivo({id,name,size,mimeType}) → ArchivoDrive`
   con `apto` y `motivo` (formato, tamaño, vacío, sin tamaño). Tests.
3. **`lib/publicaciones/drive/cliente.ts` (red, con `fetch` inyectable).** `listarCarpeta(id)` (paginado,
   `supportsAllDrives`, filtra carpetas), `leerArchivo(id)`, `descargarParte(id, desde, hasta)` (Range, exige
   206/200 y largo exacto). Errores → `ErrorHttp` legible (404/403 → "No puedo ver esa carpeta. Compartila
   como 'Cualquier persona con el enlace'"). Techo 8 s por llamada. Tests con fetch falso.
4. **`lib/publicaciones/drive/copia.ts` (orquestación con dependencias inyectadas).**
   `avanzarCopia(estado, deps, presupuestoMs) → {copiado, terminado, subidaUrl}`: crea la subida TUS si no hay,
   pregunta el offset con HEAD (si la subida venció, empieza de nuevo), copia partes de 6 MB mientras quede
   tiempo. Tests: copia completa en varias vueltas, retoma desde el offset del HEAD, subida vencida, Drive que
   devuelve menos bytes → error, tamaño distinto al dado de alta → error.
5. **Migración `20261104000001_publicaciones_drive.sql`:** `publicacion_videos.drive_subida_url text NULL`,
   `drive_copiado_bytes bigint NOT NULL DEFAULT 0`. Aplicar con `scripts/apply-publicaciones-drive-pg.ts` y
   verificar con select ANTES del código.
6. **Servidor + rutas:** `listarDrive(enlace)` → `POST /api/publicaciones/drive/listar`;
   `altaVideosDrive(tandaId, ids)` → `POST /api/publicaciones/tandas/[id]/videos/drive` (origen `drive`,
   `drive_file_id`, mismo UNIQUE de duplicados); `traerDeDrive(videoId)` → `POST /api/publicaciones/videos/[id]/traer`
   (solo `origen='drive'` y `etapa='subiendo'`; al terminar pasa a `extrayendo`). Todas con `contenidoAuth`.
7. **UI:** `ElegirDeDrive.tsx` debajo de la zona de arrastre (campo + "Buscar", lista con casillas, "Traer N
   videos"); `useColaPreparacion` loopea `/traer` para los de Drive con progreso; `faltaArchivo` falso para Drive;
   la fila dice "Trayendo de Drive 42 %".
8. **QA en la vista previa** con una carpeta de Drive de prueba (2 videos) compartida por el dueño: criterio 3
   (mismo tamaño en Storage que en Drive), cerrar la pestaña a mitad y retomar, enlace privado → mensaje.

**Pruebas:** `npx vitest run --config vitest.publicaciones.config.ts`; tipos con `tsconfig.publicaciones.json`.
