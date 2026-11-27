# Tasks

## Reglas para todos los grupos

- **Commits:** un commit y un push por tarea, con autor `Sujupar <redstyle50@gmail.com>`.
- **Tests:** en `lib/` el test se escribe primero y se lo ve fallar.
- **Comandos de verificación:**
  - pruebas: `npx vitest run -c vitest.crm.config.ts`, ampliando su `include` con
    `lib/video-bienvenida`;
  - tipos: `npx tsc --noEmit -p tsconfig.crm.json`;
  - estilo: `npx eslint <archivos tocados>`.
- **Referencias:** firmas, SQL y nombres de archivo en `design.md`; escenarios en `specs/`.
- **Dónde se trabaja:** en `~/Dev/video-bienvenida`.

**Datos de prueba:**
- Todo lleva `[TEST]` en el nombre.
- El único teléfono que recibe mensajes reales es el de Julián.
- Se borra en la misma sesión.
- La base de la vista previa es la de producción.

## 1. Preparación

- [x] 1.1 Propuesta con las cinco decisiones del dueño ("ok a las 5", 2026-11-27)
- [x] 1.2 Specs y diseño; `openspec validate tasacion-video-bienvenida --strict` pasa
- [ ] 1.3 Maqueta de la página y del mensaje (https://claude.ai/artifact/PDHCvmUmoyQvjXqPfJiTxX), aprobada por el dueño
- [x] 1.4 Auditoría de los artefactos (auditor 1): 22 hallazgos, todos incorporados (`auditoria.md`)
- [ ] 1.4b Auditor 2 revisa los artefactos corregidos y la auditoría del 1
- [ ] 1.5 Pre-flight de choques (skill `anticipating-implementation-conflicts`); anotarlo en el PR
- [ ] 1.6 Abrir el PR en borrador

## 2. Base de datos

- [ ] 2.1 Migración `20261128000001_video_bienvenida` (tabla, CHECK, UNIQUE, RLS, las tres RPC con REVOKE, RPC de la cartera y filtro `bienvenida-%` en `get_panel_video`); revisar antes la numeración de todas las ramas
- [ ] 2.2 `scripts/apply-video-bienvenida-pg.ts` con las verificaciones de D2 en una transacción con ROLLBACK
- [ ] 2.3 Aplicada en `mncsnastmcjdjxrehdep` y vuelta a correr (idempotente); 0 filas de prueba

## 3. Enlaces y envío

- [ ] 3.1 `lib/video-bienvenida/codigo.ts`: generación y validación del código (tests: alfabeto, largo, que no se repita)
- [ ] 3.2 `lib/video-bienvenida/plantillas.ts`: `PLANTILLAS_CON_VIDEO`, `parametrosDelEnvio` y `esRechazoDePlantilla`; las dos plantillas en `PLANTILLAS_QUE_SOLO_AVISAN` con test de `modoDePlantilla`
- [ ] 3.3 `lib/video-bienvenida/enlaces.ts`: `obtenerOCrearEnlace` (reusa por contacto, reintenta si el código choca, une `bv:<codigo>`)
- [ ] 3.4 `primerWhatsappDeTasacion`: envío con enlace, `marcar_enviado`, y vuelta a `tasacion_llamada_v1` si falla el enlace o Meta rechaza la plantilla (tests del handler, incluido el límite de volumen que sigue reintentando)

## 4. Página y medición

- [ ] 4.1 `FunnelClickToPlayVideo` acepta `anonId` y `onSegundosReproducidos` (sin contar saltos); sin las props, igual que hoy (test)
- [ ] 4.2 `VIDEO_KEYS` con `bienvenida-tasacion-v1` y `nombreEnLinea`; `video-keys.test.ts` en verde
- [ ] 4.3 `lib/video-bienvenida/contenido.ts`, `mostrar-bloque.ts` (puro, con tests) y `app/t/[codigo]/page.tsx` (logo centrado, sin duración, bloque a los 30 s, no indexa, `no-referrer`, sin Píxel, título sin nombre, código inexistente → no encontrado)
- [ ] 4.4 `POST /api/public/video/[codigo]` con marca por pestaña; `/t/` pública en `middleware.ts` (test)
- [ ] 4.5 `app/t/paula.vcf/route.ts`
- [ ] 4.7 `funnel_video_stats` (`/embudos`) excluye `bienvenida-%` (test)
- [ ] 4.6 Video a 720p con `faststart` y póster subidos a `funnel-media/bienvenida/`; responde 206 a un pedido por rango

## 5. CRM y panel

- [ ] 5.1 Línea de tiempo: evento de apertura y detalle `mm:ss de mm:ss` (tests en `linea-de-tiempo.test.ts`)
- [ ] 5.2 Cartera: `marcaVideo` (puro, con tests) y la RPC por lote como fuente opcional; la marca en la fila
- [ ] 5.3 Ficha: "Enlace del video" con Copiar y Crear; `POST /api/contacts/[id]/video-bienvenida` con permisos (403 al abogado)
- [ ] 5.4 `lib/metrics/panel/video-bienvenida.ts` (puro, con tests: grupos, atendió, coordinó, exclusiones, `n`) y `VideoBienvenida.tsx`

## 6. Plantillas en Meta

- [ ] 6.1 `scripts/create-whatsapp-template-tasacion-video.ts`: crea A y B, y después informa estado y categoría
- [ ] 6.2 Mandarlas a aprobación; registrar la categoría que devuelva Meta
- [ ] 6.3 Sincronizar los cuerpos aprobados (`scripts/sincronizar-cuerpos-plantillas.ts`)

## 7. QA

- [ ] 7.1 Vista previa de Netlify, a 390 y a 1280 px, con el navegador de Claude:
  - la página con un enlace `[TEST]`;
  - la ficha (copiar y crear);
  - la marca en la cartera;
  - el panel.
- [ ] 7.2 Envío por script (`scripts/probar-bienvenida-envio.ts`, llama al manejador) al número
  de Julián con un contacto `[TEST]`: llega el WhatsApp con video. Abrir el enlace, mirar
  40 s, ver aparecer el bloque de Paula y que aparezca en la ficha y en la cartera. Que la
  vista previa del enlace no sume una apertura. Borrar los datos de prueba.
- [ ] 7.3 Corte seguro por script: forzar una falla del enlace y un rechazo de plantilla, y
  verificar que llega `tasacion_llamada_v1`

## 8. Despliegue

- [ ] 8.1 Merge a `main`; verificar en producción que `/video/<código de prueba>` abre y que el envío sigue con la plantilla de hoy
- [ ] 8.2 Con la plantilla aprobada: `WHATSAPP_TEMPLATE_TASACION` en Netlify y `CAMBIO_DESDE` con la fecha; verificar el primer envío real en `whatsapp_messages`
- [ ] 8.3 CLAUDE.md: sección del video de bienvenida (plantillas, clave de video, cómo cambiar el video editado); archivar el change

## 9. Auditoría doble

- [ ] 9.1 Auditor 1 revisa el código contra los escenarios de `specs/`
- [ ] 9.2 Auditor 2 revisa el código y la auditoría del 1
- [ ] 9.3 Se repite hasta cero hallazgos de peso; todo queda en `auditoria.md`
