# Sistema de visitas — Entrega 3 (encuesta post-visita estilo Typeform, regalo por propiedad y envío por WhatsApp) — Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development
> (recomendado; es el método que eligió el dueño para las Entregas 1 y 2: "agentes de auditoría
> que auditan lo que hacen los otros") o superpowers:executing-plans. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

**Objetivo:** que cada visita marcada "Se realizó" tenga su encuesta de un minuto (link opaco por
visita, celular primero, una pregunta por pantalla, guardado pregunta a pregunta), que la persona
reciba el regalo (PDF) de ESA propiedad al terminarla —por descarga, email y, cuando Meta apruebe la
plantilla, por WhatsApp—, que el envío por WhatsApp quede gobernado por interruptores y una lista de
prueba editables desde `/settings/encuesta`, y que las respuestas lleguen al equipo por email y se
vean en la ficha de la visita, en la pestaña de la propiedad y en las estadísticas de `/visits`.

**Arquitectura:** todas las reglas en módulos puros de `lib/visitas/encuesta/` (catálogos, link,
pasos, opciones por propiedad, validación por paso, decisión de envío, plantillas, estado visible,
regalo, armado de la página pública, avisos y el reductor del reproductor), testeados en entorno
node. La base se toca solo desde `lib/visitas/encuesta/datos.ts` (clave de servicio). Tres servicios
de servidor componen: `servicio.ts` (crear link y mandar), `avisos-servicio.ts` (email al equipo y
regalo por WhatsApp/email) y `publica-servidor.ts` (lo que ve la persona). Las rutas son finas:
sesión o token → permisos → Zod → módulo → persistencia → JSON. La encuesta pública es un componente
de cliente propio (`components/encuesta/`) que el servidor pinta ya armado; sin dependencias nuevas
ni framer-motion.

**Stack:** Next.js 16.0.10, React 19.2, TypeScript estricto, Supabase (Postgres + RLS + Storage
privado), zod 4, WhatsApp Cloud API (`sendWhatsappTemplate`), Resend (`sendEmail` + react-email),
shadcn/ui (`radix-ui`), lucide-react, `next/image`, vitest 4 (+ happy-dom + Testing Library +
`@testing-library/user-event`).

**Spec:** `docs/superpowers/specs/2026-10-10-sistema-de-visitas-design.md` — **§11 (adenda del
2026-10-15) MANDA** sobre §3.6, §3.7, §4.1 (bloque Entrega 3), §4.9 punto 9, §4.10, §4.11, §5, §6 y
§7. Leer también §0, §3.3, §3.4, §3.5, §4.5, §4.8, §4.9 y §8. Diseño visual: lienzo
<https://claude.ai/artifact/4rfWaJomtQgBCDadkLUAUe>, pantalla `A-Encuesta`. Planes anteriores
(estilo y piezas que se reutilizan): `docs/superpowers/plans/2026-10-10-sistema-de-visitas-entrega-1.md`
y `docs/superpowers/plans/2026-10-15-sistema-de-visitas-entrega-2.md`. Referencia de PATRONES
(no de código ni de framer-motion): `/Users/apple/referencias/openform/components/form-player/form-player.tsx`.

**Rama:** `feat/visitas-encuesta` en el worktree
`/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria/.claude/worktrees/sistema-visitas`
(desde `origin/main`, con las Entregas 1 y 2 ya en producción). Las variables de entorno se leen con
`--env-file=../../../.env.local` desde el worktree.

## Global Constraints

- Todo el texto que ve una persona, en castellano rioplatense, sin jerga. La encuesta dice "menos de
  un minuto" y **nunca** cuántas preguntas son (ni "Paso N de M" visible).
- Nombres de funciones, variables y tests en castellano; columnas nuevas de la base en inglés, como
  `property_visits` (las de `visit_survey_settings` en castellano, como dice el spec).
- Zona horaria única `America/Argentina/Buenos_Aires` (`-03:00`): para mostrar, `formatearFechaHora`,
  `formatearFechaLarga`, `fechaEnArgentina` y `horaEnArgentina` de `lib/visitas/horario.ts`; nunca
  `toLocale*` sin `timeZone`.
- Estados de visita EXACTOS y sin cambios: `pending_confirmation`, `scheduled`, `completed`,
  `no_show`, `cancelled`. La encuesta solo existe para `completed`.
- Catálogos con CHECK en la base, EXACTOS y tocados JUNTO con su test: `ESTADOS_ENVIO`
  (`sin_enviar`, `enviada`, `fallida`, `omitida`), `MOTIVOS_OMISION` (`envio_apagado`, `sin_regalo`,
  `telefono_invalido`, `plantilla_sin_configurar`, `plantilla_desconocida`, `ajustes_ilegibles`,
  `modo_prueba_whatsapp`, `ya_respondio`, `vencida`, `ya_enviada`), `ESTADOS_AVISO` (`pendiente`,
  `enviando`, `enviado`, `fallido`, `no_corresponde`), `OPINIONES_PRECIO` (`correcto`, `alto`,
  `bajo`), `MONEDAS` (`USD`, `ARS`), `PASOS_GUARDABLES` (`gusto`, `mas_gusto`, `menos_gusto`,
  `precio`, `oferta`); `whatsapp_messages.origen` suma `encuesta_visita`.
- **Mensajes a clientes:** fail-closed en todo. El envío de la encuesta y el del regalo por WhatsApp
  arrancan APAGADOS; sin plantilla configurada (`WHATSAPP_TEMPLATE_ENCUESTA_VISITA`,
  `WHATSAPP_TEMPLATE_REGALO_VISITA`) o con una que no esté en el catálogo, no sale nada. Todo envío
  respeta `WHATSAPP_TEST_MODE`. En el QA solo teléfonos de la lista de prueba; **nunca** un cliente
  real.
- **Plantilla y botón/encabezado se deciden juntos** (`lib/visitas/encuesta/plantillas.ts`): Meta
  rechaza el mensaje ENTERO si falta o sobra un dato (incidente 2026-09-17). El cuerpo de cada
  plantilla vive en UN solo lugar y lo usan el envío y el script de creación.
- **Email:** `sendEmail` NUNCA lanza: siempre mirar `{ ok, sent, failed, errors }`; `ok:false` con
  `failed:0` es "falta `RESEND_API_KEY`" y también es fallo. Un vencimiento (`PREFIJO_ERROR_TIEMPO`)
  no se reintenta (se prefiere perder a duplicar).
- **Netlify:** ninguna ruta encadena llamadas largas: como mucho UNA llamada a Meta por pedido en las
  rutas de la ficha; los avisos (varios envíos) van fuera del pedido final de la encuesta, con
  límites de inicio por canal (`LIMITE_INICIO_MS`). Nada de IA en esta entrega.
- **Seguridad de la página pública:** token de 16 bytes en base64url (22 caracteres), validado por
  forma ANTES de tocar la base; la página muestra SOLO nombre de pila, dirección/barrio, una foto,
  precio y el teléfono enmascarado; `noindex`; texto libre guardado y mostrado como texto (React
  escapa; nunca `dangerouslySetInnerHTML`); límite de 200 escrituras por link; honeypot `empresa`.
- **Storage:** el regalo vive en el bucket PRIVADO `visit-survey-gifts`; subida por URL firmada
  directa (init → PUT del navegador → confirmar); el servidor valida el path con regex exacta atada al
  `property_id` y que el objeto exista; la descarga es siempre una URL firmada de vida corta.
- **Escritura solo desde el servidor:** las tablas nuevas no tienen políticas de escritura (se revoca
  INSERT/UPDATE/DELETE a `anon` y `authenticated`); las rutas escriben con clave de servicio después
  de chequear permisos. Lectura por RLS: operaciones, o el asesor de la visita / de la propiedad.
- **Celular primero (criterio 25):** 360/390/430 px, botones y opciones ≥ 44 px (`min-h-11`), inputs
  de 16 px (`text-base`), `dvh`, `env(safe-area-inset-bottom)`, nada superpuesto ni cortado
  (`break-words`, `min-w-0`), botón de cada paso EN EL FLUJO debajo de la pregunta (adenda §11.3),
  sin foco automático al cargar, `inputMode="numeric"` + `enterKeyHint` en el monto.
- **Página pública sin `opacity:0` esperando al JavaScript:** la primera pantalla sale del servidor
  sin animación; la transición (CSS, dentro de `prefers-reduced-motion: no-preference`) solo al
  cambiar de paso.
- **Frontera servidor→cliente:** ningún componente, ícono ni función viaja como prop de un Server
  Component a uno de cliente; la página pública le pasa al cliente SOLO datos planos
  (`EncuestaPublica`).
- **NUNCA declarar un componente dentro de otro** (CLAUDE.md § A/B): las pantallas de la encuesta son
  componentes de MÓDULO.
- Sin dependencias nuevas en `package.json`.
- zod 4; UUID de los tests válidos RFC (ej. `11111111-1111-4111-8111-111111111111`).
- Nada de `any`, ni `as` para callar errores, ni `!` sin comentario del porqué. (Excepción vigente:
  el mapeo de filas del cliente Supabase sin tipar, campo por campo con guardas, como en
  `lib/visitas/datos.ts`.)
- Commits: autor `Sujupar <redstyle50@gmail.com>`, mensaje en castellano que dice el cambio y el
  porqué, trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. En este
  worktree el guardián rechaza comandos compuestos: `git add <archivos>` y `git commit` en llamadas
  SEPARADAS; el mensaje va con `git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit -F - <<'EOF' … EOF`.
  Prohibido `git stash`.
- Pruebas: `npx vitest run --config vitest.visitas.config.ts` (acotada; la raíz tarda minutos por
  iCloud). Tipos: `npx tsc --noEmit -p tsconfig.visitas.json`. Lint: `npx eslint <archivos>`.
  Componentes con `// @vitest-environment happy-dom`, `userEvent` SIN temporizadores simulados (solo
  se puede simular `Date`: `vi.useFakeTimers({ toFake: ['Date'] })`). La primera corrida de happy-dom
  en frío puede tardar >60 s o fallar el worker: reintentar una vez, no cambiar código por eso. Si
  iCloud cuelga algo, CLAUDE.md § iCloud (copiar a disco local) — no cambiar código por eso.

## Review Focus

1. **El previsualizador de links de WhatsApp (un robot que pide la página sin ejecutar JS)** no tiene
   que marcar la encuesta como "Abierta" ni gastar escrituras: "Abierta" la marca el navegador al
   montar el componente, una sola vez. → test en Tarea 16 (`PATCH abierta` una vez al montar, ninguna
   si ya está completa) y Tarea 17 (la página del servidor no llama a `registrarUso`).
2. **Texto con tildes en forma NFD, emojis, saltos de línea y `</script>`** en "Otra cosa", en el
   nombre de la persona y en el título del regalo: se guarda en NFC, sin caracteres de control y con
   tope; se muestra como texto en la página, la ficha y los emails; los parámetros de WhatsApp no
   llevan saltos (Meta los rechaza). → tests en Tarea 3 (`limpiarTextoLibre`), Tarea 4
   (`paramSeguro`), Tarea 5 (`validarTitulo`, `nombreDeDescarga`) y Tarea 9 (el email escapa
   `<script>`).
3. **Teléfono ausente, oculto o mal escrito** (MercadoLibre oculta el número; visitas viejas con
   "15"): la encuesta pide escribirlo, la decisión de envío dice "el teléfono no es un WhatsApp
   válido" en vez de intentar, y la lista de prueba compara por últimos 10 dígitos. → tests en
   Tarea 3 (`contactoFinal`, `enmascararTelefono`), Tarea 4 (`decidirEnvioEncuesta`,
   `esTelefonoDePrueba`) y Tarea 15 (`puedeAvanzar` en contacto sin teléfono precargado).
4. **Visita reabierta después de "Se realizó"** (se marcó por error): el link deja de servir (página
   amable), y al volver a marcarla realizada se reusa el MISMO link y no se reenvía si ya había
   salido. → tests en Tarea 5 (`armarEncuestaPublica` con estado `scheduled`) y Tarea 8
   (`prepararYEnviarEncuesta` no pisa un envío "enviada" con un "omitida").
5. **Oferta en otra moneda, propiedad sin precio o precio cambiado después de la visita:** los atajos
   no aparecen sin precio, la oferta se guarda en la moneda publicada, y "oferta mediana / diferencia
   contra el publicado" solo usa ofertas en la MISMA moneda del precio actual. → tests en Tarea 3
   (`atajosDeOferta`) y Tarea 19 (`opinionesPorPropiedad`).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `vitest.visitas.config.ts`, `tsconfig.visitas.json` | Config acotada (se amplía). |
| `test/visitas/visita-de-prueba.ts` | Constructor de `VisitaListado` (suma `precio_publicado`, `moneda_publicada`, `encuesta`). |
| `test/visitas/encuesta-de-prueba.ts` | Constructores de `EncuestaFila` y `EncuestaConVisita` para las pruebas. |
| `supabase/migrations/20261015000002_encuesta_de_visita.sql` | Tablas nuevas, bucket, función de límite, RLS, CHECK de origen, borrado de las viejas. |
| `scripts/apply-encuesta-visita-pg.ts` | Aplica y verifica la migración en UNA transacción. |
| `lib/visitas/encuesta/tipos.ts` (+test) | Catálogos (comparados con los CHECK) y tipos compartidos. |
| `lib/visitas/encuesta/link.ts` (+test) | Token, vencimiento y URL de la encuesta. |
| `lib/visitas/encuesta/pasos.ts` (+test) | Orden de pasos, retomar y avance. |
| `lib/visitas/encuesta/opciones.ts` (+test) | Opciones de "más/menos gustó" según la propiedad. |
| `lib/visitas/encuesta/respuestas.ts` (+test) | Zod por paso y final, limpieza de texto, contacto. |
| `lib/visitas/encuesta/oferta.ts` (+test) | Atajos de oferta y texto de montos. |
| `lib/visitas/encuesta/contacto.ts` (+test) | Teléfono enmascarado. |
| `lib/visitas/encuesta/plantillas.ts` (+test) | Las dos plantillas (cuerpo, datos, botón/encabezado) y su armado. |
| `lib/visitas/encuesta/envio.ts` (+test, +`envio.test-datos.ts`) | Decisión de envío de la encuesta y del regalo por WhatsApp. |
| `lib/visitas/encuesta/estado-envio.ts` (+test) | Estado visible y motivos de Meta en castellano. |
| `lib/visitas/encuesta/regalo.ts` (+test) | Reglas del archivo, la portada, los paths y la descarga. |
| `lib/visitas/encuesta/publica.ts` (+test) | Foto permitida y armado de `EncuestaPublica` (sin datos de más). |
| `lib/visitas/encuesta/datos.ts` (+test) | Lecturas/escrituras con clave de servicio (encuesta, ajustes, regalo, Storage). |
| `lib/integrations/whatsapp/log.ts`, `core.ts` | Tipo `OrigenWhatsapp` con `encuesta_visita`. |
| `lib/visitas/encuesta/whatsapp.ts` (+test) | Manda una plantilla de la encuesta con el origen y el encabezado correctos. |
| `scripts/create-whatsapp-templates-encuesta-visita.ts` | Estado / `--create encuesta` / `--create regalo`. |
| `lib/visitas/encuesta/ficha.ts` (+test) | Lo que ve el equipo en la ficha: estado, respuestas, eventos. |
| `lib/visitas/encuesta/servicio.ts` (+test) | Crear link, decidir y mandar; armar la encuesta de la ficha. |
| `app/api/visits/[id]/estado/route.ts`, `app/api/visits/[id]/route.ts` (+tests) | Crean/devuelven la encuesta. |
| `app/api/visits/[id]/encuesta/route.ts` (+test) | Estado, crear link y reenviar. |
| `emails/VisitSurveyAnsweredEmail.tsx`, `lib/email/notifications/visit-survey-answered.ts` (+test) | Email al equipo. |
| `emails/VisitSurveyGiftEmail.tsx`, `lib/email/notifications/visit-survey-gift.ts` (+test) | Email del regalo a la persona. |
| `lib/visitas/encuesta/avisos.ts` (+test) | Canales, límites de tiempo y cierre de cada aviso (puro). |
| `lib/visitas/encuesta/avisos-servicio.ts` (+test) | Procesa los avisos de una encuesta y el barrido. |
| `app/api/public/encuesta/[token]/avisos/route.ts` (+test) | Dispara los avisos desde la pantalla de gracias. |
| `app/api/cron/visit-reminders/route.ts` (+test) | Suma el barrido de avisos pendientes. |
| `app/api/public/encuesta/[token]/route.ts` (+test) | `PATCH` por paso y `POST` final. |
| `app/api/public/encuesta/[token]/regalo/route.ts` (+test) | Descarga del regalo (302 a URL firmada). |
| `middleware.ts` (+`middleware.encuesta.test.ts`), `lib/supabase/middleware.ts` (+test) | `/encuesta/` pública; `/questionnaire` deja de serlo. |
| `lib/visitas/encuesta/acceso-regalo.ts` (+test) | Quién puede cargar/ver/quitar el regalo (misma regla que el material). |
| `app/api/properties/[id]/regalo/route.ts`, `…/regalo/subida/route.ts` (+tests) | Regalo de la propiedad. |
| `lib/visitas/encuesta/subir-regalo.ts` | Subida desde el navegador (init → PUT → confirmar). |
| `components/visitas/encuesta/RegaloDeLaEncuesta.tsx` (+test) | Tarjeta del regalo en la pestaña Visitas. |
| `lib/visitas/encuesta/ajustes.ts` (+test) | Saneo de ajustes y estado de plantillas. |
| `app/api/settings/encuesta-visitas/route.ts` (+test) | Ajustes (admin/dueño). |
| `app/(dashboard)/settings/encuesta/page.tsx` (+test), `lib/nav/sections.ts` (+test) | Pantalla de configuración y su entrada en el menú. |
| `lib/visitas/encuesta/reproductor.ts` (+test) | Reductor puro del reproductor. |
| `components/encuesta/EncuestaVisita.tsx`, `components/encuesta/PantallasEncuesta.tsx` (+test) | El componente estilo Typeform. |
| `app/globals.css` | Animación de entrada de paso (CSS, respeta "reducir movimiento"). |
| `lib/visitas/encuesta/publica-servidor.ts`, `components/encuesta/EncuestaNoDisponible.tsx`, `app/encuesta/[token]/page.tsx` (+test) | La página pública. |
| `components/visitas/ficha/EncuestaDeLaVisita.tsx` (+test), `LineaDeTiempo.tsx`, `AccionVisitaDialog.tsx`, `app/(dashboard)/visits/[id]/page.tsx` | La encuesta en la ficha de la visita. |
| `lib/visitas/tipos.ts`, `lib/visitas/datos.ts` (+test) | `VisitaListado` con la encuesta y el precio publicado. |
| `lib/visitas/opiniones.ts` (+test), `lib/visitas/metricas.ts` (+tests), `lib/visitas/resumen.ts` (+test), `app/api/visits/resumen/route.ts` (+test), `lib/visitas/presentacion.ts` | Métricas de la encuesta conectadas. |
| `components/visitas/seccion/QueOpinan.tsx` (+test), `TarjetasVisitas.tsx`, `ComoVienen.tsx`, `RequierenAccion.tsx`, `components/properties/detail/tabs/VisitasTab.tsx` (+tests) | La UI de las métricas. |

Se borran (Tarea 21, con grep de consumidores): `app/questionnaire/**`,
`app/api/public/questionnaire/**`, `app/api/visits/[id]/questionnaire/route.ts`,
`app/api/visits/[id]/send-questionnaire/route.ts`,
`lib/email/notifications/questionnaire-invite-client.ts`, `emails/QuestionnaireInviteClientEmail.tsx`
y el bloque `visit_questionnaires` de `types/database.types.ts`.

---

### Tarea 0: Configuración acotada de pruebas y tipos

**Files:**
- Modify: `vitest.visitas.config.ts`
- Modify: `tsconfig.visitas.json`
- Modify: `test/visitas/visita-de-prueba.ts` (en la Tarea 19, cuando existe el tipo)
- Create: `test/visitas/encuesta-de-prueba.ts` (en la Tarea 2, cuando existen los tipos)

**Interfaces:**
- Produces: la suite y el `tsc` acotados ya incluyen todo lo de esta entrega. Los archivos que
  todavía no existen no rompen nada: `include` de vitest y de tsconfig son patrones.

- [ ] **Paso 1: Ampliar `vitest.visitas.config.ts`** — en el arreglo `include`, debajo de la
  última línea de la Entrega 2 (`'app/*/tasks/page.test.tsx',`), agregar:

```ts
      // Entrega 3 (encuesta)
      'components/encuesta/**/*.test.tsx',
      'app/encuesta/**/*.test.tsx',
      'app/api/public/encuesta/**/*.test.ts',
      'app/api/properties/*/regalo/**/*.test.ts',
      'app/api/settings/encuesta-visitas/*.test.ts',
      'app/*/settings/encuesta/*.test.tsx',
      'lib/email/notifications/visit-survey-*.test.ts',
      'lib/supabase/middleware.test.ts',
      'middleware.encuesta.test.ts',
      'lib/nav/sections.test.ts',
      'app/*/layout.movil.test.ts',
      'lib/integrations/whatsapp/core.test.ts',
      'lib/integrations/whatsapp/log.test.ts',
```

  (`components/visitas/**`, `lib/visitas/**`, `app/api/visits/**` y `app/api/cron/visit-reminders/*`
  ya están incluidos desde las Entregas 1 y 2.)

- [ ] **Paso 2: Ampliar `tsconfig.visitas.json`** — en el arreglo `include`, después de
  `"app/(dashboard)/tasks/page.tsx"`, agregar (con la coma que falta en la línea anterior):

```json
    "components/encuesta/**/*.tsx",
    "app/encuesta/**/*.tsx",
    "app/api/public/encuesta/**/*.ts",
    "app/api/properties/[id]/regalo/**/*.ts",
    "app/api/settings/encuesta-visitas/route.ts",
    "app/(dashboard)/settings/encuesta/page.tsx",
    "lib/email/notifications/visit-survey-*.ts",
    "emails/VisitSurvey*.tsx",
    "lib/integrations/whatsapp/core.ts",
    "lib/integrations/whatsapp/log.ts",
    "lib/supabase/middleware.ts",
    "middleware.ts",
    "lib/nav/sections.ts",
    "scripts/apply-encuesta-visita-pg.ts",
    "scripts/create-whatsapp-templates-encuesta-visita.ts"
```

- [ ] **Paso 3: Correr la suite y los tipos tal como están** — `npx vitest run --config vitest.visitas.config.ts`
  y `npx tsc --noEmit -p tsconfig.visitas.json`. Esperado: verde (es la base de la Entrega 2 más los
  tests de middleware, menú y layout móvil que ahora entran). Si algo de esos tres está rojo en `main`,
  anotarlo en el reporte y NO arreglarlo acá (se toca en su tarea: 11, 14 y 21).

- [ ] **Paso 4: Commit** — `git add vitest.visitas.config.ts tsconfig.visitas.json`; mensaje
  `chore(visitas): config acotada de pruebas y tipos para la encuesta (Entrega 3)`.

---

### Tarea 1: Migración de la base (encuesta, ajustes, regalo, bucket, límite, RLS)

**Files:**
- Create: `supabase/migrations/20261015000002_encuesta_de_visita.sql`
- Create: `scripts/apply-encuesta-visita-pg.ts`

**Interfaces:**
- Produces: tablas `visit_surveys`, `visit_survey_settings` (1 fila), `property_survey_gifts`;
  bucket privado `visit-survey-gifts`; función `visit_survey_registrar(p_token text, p_tipo text,
  p_max int) returns boolean`; CHECK `whatsapp_messages_origen_check` con `encuesta_visita`; sin
  `visit_questionnaires` ni `visit_questionnaire_tokens`. Columnas exactas en el SQL de abajo (las
  usan las Tareas 2, 6, 19).

- [ ] **Paso 1: Escribir la migración** — cada CHECK de catálogo va en UNA línea (el test de la
  Tarea 2 la lee por línea).

```sql
-- Sistema de visitas — Entrega 3: encuesta post-visita + regalo por propiedad.
-- Spec: docs/superpowers/specs/2026-10-10-sistema-de-visitas-design.md §11.5 (manda sobre §4.1).
-- Se aplica con scripts/apply-encuesta-visita-pg.ts ANTES del merge: el código nuevo escribe estas
-- tablas (sin ellas, "Se realizó" no crea la encuesta y la página pública da 500). Para el código
-- que hoy está en producción todo es aditivo: las dos tablas que se borran solo las usan rutas sin
-- consumidores (0 links emitidos).
-- Los catálogos con CHECK se comparan con lib/visitas/encuesta/tipos.ts en tipos.test.ts: cada
-- lista va en UNA línea y se tocan JUNTOS.

-- ───────────────────────────────────────────────────────────────────────────
-- 0) El cuestionario de mayo: 0 filas medidas el 2026-10-10. Si alguien cargó algo, ABORTA.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.visit_questionnaires') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.visit_questionnaires) THEN
    RAISE EXCEPTION 'visit_questionnaires tiene filas: no se borra sin revisarlas';
  END IF;
  IF to_regclass('public.visit_questionnaire_tokens') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.visit_questionnaire_tokens) THEN
    RAISE EXCEPTION 'visit_questionnaire_tokens tiene filas: no se borra sin revisarlas';
  END IF;
END $$;
DROP TABLE IF EXISTS public.visit_questionnaire_tokens;
DROP TABLE IF EXISTS public.visit_questionnaires;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) La encuesta: UNA fila por visita (link + envío + respuestas + avisos).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL UNIQUE REFERENCES public.property_visits(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{22}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_status TEXT NOT NULL DEFAULT 'sin_enviar' CHECK (send_status IN ('sin_enviar', 'enviada', 'fallida', 'omitida')),
  send_skip_reason TEXT CHECK (send_skip_reason IS NULL OR send_skip_reason IN ('envio_apagado', 'sin_regalo', 'telefono_invalido', 'plantilla_sin_configurar', 'plantilla_desconocida', 'ajustes_ilegibles', 'modo_prueba_whatsapp', 'ya_respondio', 'vencida', 'ya_enviada')),
  send_error TEXT CHECK (send_error IS NULL OR length(send_error) <= 500),
  sent_at TIMESTAMPTZ,
  sent_to TEXT,
  wa_message_id TEXT,
  opened_at TIMESTAMPTZ,
  open_count INT NOT NULL DEFAULT 0 CHECK (open_count >= 0),
  write_count INT NOT NULL DEFAULT 0 CHECK (write_count >= 0),
  last_step TEXT CHECK (last_step IS NULL OR last_step IN ('gusto', 'mas_gusto', 'menos_gusto', 'precio', 'oferta')),
  completed_at TIMESTAMPTZ,
  liked BOOLEAN,
  most_liked_tags TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(most_liked_tags) <= 8),
  most_liked_other TEXT CHECK (most_liked_other IS NULL OR length(most_liked_other) <= 280),
  least_liked_tags TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(least_liked_tags) <= 8),
  least_liked_other TEXT CHECK (least_liked_other IS NULL OR length(least_liked_other) <= 280),
  price_opinion TEXT CHECK (price_opinion IS NULL OR price_opinion IN ('correcto', 'alto', 'bajo')),
  offer_amount NUMERIC CHECK (offer_amount IS NULL OR offer_amount > 0),
  offer_currency TEXT CHECK (offer_currency IS NULL OR offer_currency IN ('USD', 'ARS')),
  offer_declined BOOLEAN,
  contact_phone TEXT CHECK (contact_phone IS NULL OR length(contact_phone) <= 20),
  contact_email TEXT CHECK (contact_email IS NULL OR length(contact_email) <= 254),
  wants_similar BOOLEAN,
  team_notice_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (team_notice_status IN ('pendiente', 'enviando', 'enviado', 'fallido', 'no_corresponde')),
  team_notice_at TIMESTAMPTZ,
  gift_whatsapp_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (gift_whatsapp_status IN ('pendiente', 'enviando', 'enviado', 'fallido', 'no_corresponde')),
  gift_whatsapp_at TIMESTAMPTZ,
  gift_wa_message_id TEXT,
  gift_email_status TEXT NOT NULL DEFAULT 'pendiente' CHECK (gift_email_status IN ('pendiente', 'enviando', 'enviado', 'fallido', 'no_corresponde')),
  gift_email_at TIMESTAMPTZ,
  notice_attempts INT NOT NULL DEFAULT 0 CHECK (notice_attempts >= 0),
  notice_error TEXT CHECK (notice_error IS NULL OR length(notice_error) <= 500),
  gift_downloaded_at TIMESTAMPTZ
);

-- El barrido de avisos busca encuestas completas recientes; el estado de la ficha busca por mensaje.
CREATE INDEX IF NOT EXISTS idx_visit_surveys_completed_at
  ON public.visit_surveys (completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visit_surveys_wa_message_id
  ON public.visit_surveys (wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visit_surveys_created_by
  ON public.visit_surveys (created_by) WHERE created_by IS NOT NULL;

-- updated_at: el BEFORE solo toca NEW (regla de CLAUDE.md: nada de escribir otra tabla acá).
CREATE OR REPLACE FUNCTION public.visit_surveys_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_visit_surveys_touch ON public.visit_surveys;
CREATE TRIGGER trg_visit_surveys_touch BEFORE UPDATE ON public.visit_surveys
  FOR EACH ROW EXECUTE FUNCTION public.visit_surveys_touch();

COMMENT ON TABLE public.visit_surveys IS
  'Encuesta post-visita (spec §11). Una por visita. La escribe SOLO el servidor (clave de servicio).';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Ajustes: una sola fila. Todo APAGADO de fábrica salvo "solo con regalo".
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_survey_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  envio_automatico BOOLEAN NOT NULL DEFAULT false,
  solo_con_regalo BOOLEAN NOT NULL DEFAULT true,
  regalo_por_whatsapp BOOLEAN NOT NULL DEFAULT false,
  telefonos_prueba TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(telefonos_prueba) <= 10),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.visit_survey_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Regalo de la encuesta: UNO por propiedad. Paths atados a la propiedad por CHECK.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.property_survey_gifts (
  property_id UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 160),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 20971520),
  cover_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT property_survey_gifts_file_path_check
    CHECK (file_path ~ ('^properties/' || property_id::text || '/regalo-[0-9a-f-]{36}\.pdf$')),
  CONSTRAINT property_survey_gifts_cover_path_check
    CHECK (cover_path IS NULL OR cover_path ~ ('^properties/' || property_id::text || '/portada-[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
CREATE INDEX IF NOT EXISTS idx_property_survey_gifts_updated_by
  ON public.property_survey_gifts (updated_by) WHERE updated_by IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Bucket PRIVADO del regalo. Sin políticas en storage.objects: solo el servidor sube
--    (URL firmada de subida) y solo el servidor firma descargas.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('visit-survey-gifts', 'visit-survey-gifts', false, 20971520,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Límite por link + "abierta", ATÓMICO (un read-modify-write desde JS no lo sería).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.visit_survey_registrar(p_token TEXT, p_tipo TEXT, p_max INT)
RETURNS BOOLEAN LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  WITH u AS (
    UPDATE public.visit_surveys
       SET write_count = write_count + 1,
           opened_at = CASE WHEN p_tipo = 'abierta' THEN coalesce(opened_at, now()) ELSE opened_at END,
           open_count = open_count + CASE WHEN p_tipo = 'abierta' THEN 1 ELSE 0 END
     WHERE token = p_token AND write_count < p_max
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM u)
$$;
REVOKE ALL ON FUNCTION public.visit_survey_registrar(TEXT, TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visit_survey_registrar(TEXT, TEXT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visit_survey_registrar(TEXT, TEXT, INT) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 6) RLS: lectura por rol; escritura NINGUNA (todo escribe el servidor con service role).
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.visit_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_survey_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_survey_gifts ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.visit_surveys FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.visit_survey_settings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.property_survey_gifts FROM anon, authenticated;

DROP POLICY IF EXISTS visit_surveys_select_scoped ON public.visit_surveys;
CREATE POLICY visit_surveys_select_scoped ON public.visit_surveys
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_operations_user())
    OR EXISTS (
      SELECT 1 FROM public.property_visits v
       WHERE v.id = visit_surveys.visit_id
         AND (v.advisor_id = (SELECT auth.uid()) OR v.created_by = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS visit_survey_settings_select_ops ON public.visit_survey_settings;
CREATE POLICY visit_survey_settings_select_ops ON public.visit_survey_settings
  FOR SELECT TO authenticated
  USING ((SELECT public.is_operations_user()));

DROP POLICY IF EXISTS property_survey_gifts_select_scoped ON public.property_survey_gifts;
CREATE POLICY property_survey_gifts_select_scoped ON public.property_survey_gifts
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_operations_user())
    OR EXISTS (
      SELECT 1 FROM public.properties p
       WHERE p.id = property_survey_gifts.property_id
         AND (p.assigned_to = (SELECT auth.uid()) OR p.created_by = (SELECT auth.uid()))
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 7) whatsapp_messages.origen suma 'encuesta_visita'. NOT VALID + VALIDATE: el lock pesado
--    dura solo lo que tarda el DROP/ADD, no el recorrido de la tabla.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.whatsapp_messages'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%origen%'
  LOOP
    EXECUTE format('ALTER TABLE public.whatsapp_messages DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_origen_check
  CHECK (origen IS NULL OR origen IN ('consulta_portal', 'landing', 'manual', 'encuesta_visita')) NOT VALID;
ALTER TABLE public.whatsapp_messages VALIDATE CONSTRAINT whatsapp_messages_origen_check;

COMMENT ON COLUMN public.whatsapp_messages.origen IS
  'De dónde nació la conversación: consulta_portal · landing · manual · encuesta_visita (encuesta post-visita y su regalo). NULL = anterior a 20260806000001.';
```

- [ ] **Paso 2: Escribir el script de aplicación** (patrón `scripts/apply-visitas-origen-pg.ts`:
  todo en UNA transacción; si una verificación falla, ROLLBACK y código 1):

```ts
/**
 * Aplica `20261015000002_encuesta_de_visita.sql` y VERIFICA lo que importa, TODO dentro de UNA
 * transacción: si cualquier verificación falla se hace ROLLBACK de la migración entera y el
 * proceso sale con código 1. Las pruebas que escriben filas corren en SAVEPOINT que se deshacen
 * antes del COMMIT: no dejan nada.
 *
 *   node --env-file=../../../.env.local --import tsx scripts/apply-encuesta-visita-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

async function rechaza(c: Client, nombre: string, sql: string, params: unknown[]): Promise<boolean> {
  await c.query(`SAVEPOINT ${nombre}`)
  try {
    await c.query(sql, params)
    await c.query(`RELEASE SAVEPOINT ${nombre}`)
    return false
  } catch {
    await c.query(`ROLLBACK TO SAVEPOINT ${nombre}`)
    return true
  }
}

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  try {
    await c.query("SET lock_timeout = '5s'")
    await c.query('BEGIN')
    await c.query(readFileSync('supabase/migrations/20261015000002_encuesta_de_visita.sql', 'utf8'))
    console.log('migración aplicada (sin commitear todavía); verificando…')

    const tablas = (await c.query(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relnamespace='public'::regnamespace AND relname = ANY($1)`,
      [['visit_surveys', 'visit_survey_settings', 'property_survey_gifts', 'visit_questionnaires', 'visit_questionnaire_tokens']])).rows
    const porNombre = new Map(tablas.map(t => [t.relname as string, t.relrowsecurity as boolean]))
    for (const t of ['visit_surveys', 'visit_survey_settings', 'property_survey_gifts']) {
      ok(porNombre.get(t) === true, `${t} existe y tiene RLS`)
    }
    ok(!porNombre.has('visit_questionnaires') && !porNombre.has('visit_questionnaire_tokens'), 'las tablas viejas del cuestionario ya no existen')

    const permisos = (await c.query(
      `SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
        WHERE table_schema='public' AND table_name = ANY($1) AND grantee IN ('anon','authenticated')
          AND privilege_type IN ('INSERT','UPDATE','DELETE')`,
      [['visit_surveys', 'visit_survey_settings', 'property_survey_gifts']])).rows
    ok(permisos.length === 0, 'anon y authenticated NO pueden escribir las tablas nuevas')

    const ajustes = (await c.query(`SELECT * FROM visit_survey_settings`)).rows
    ok(ajustes.length === 1 && ajustes[0].envio_automatico === false && ajustes[0].solo_con_regalo === true
      && ajustes[0].regalo_por_whatsapp === false && ajustes[0].telefonos_prueba.length === 0,
      'una fila de ajustes con todo apagado y "solo con regalo" prendido')

    const bucket = (await c.query(`SELECT public, file_size_limit FROM storage.buckets WHERE id='visit-survey-gifts'`)).rows[0]
    ok(bucket && bucket.public === false && Number(bucket.file_size_limit) === 20971520, 'bucket visit-survey-gifts privado de 20 MB')

    const origen = (await c.query(
      `SELECT pg_get_constraintdef(oid) d, convalidated FROM pg_constraint WHERE conname='whatsapp_messages_origen_check'`)).rows[0]
    ok(origen && String(origen.d).includes('encuesta_visita') && origen.convalidated === true, 'CHECK de origen con encuesta_visita, validado')

    const grantFn = (await c.query(
      `SELECT has_function_privilege('authenticated', 'public.visit_survey_registrar(text,text,integer)', 'EXECUTE') a,
              has_function_privilege('service_role', 'public.visit_survey_registrar(text,text,integer)', 'EXECUTE') s`)).rows[0]
    ok(grantFn.a === false && grantFn.s === true, 'visit_survey_registrar: solo service_role')

    // ─── Lógica (como postgres) en un SAVEPOINT que se deshace ───
    await c.query('SAVEPOINT logica')
    try {
      const { rows: prop } = await c.query(`SELECT id FROM properties WHERE status='approved' LIMIT 1`)
      const { rows: v } = await c.query(
        `INSERT INTO property_visits (property_id, client_name, client_phone, scheduled_at, status, origin)
         VALUES ($1, '[TEST] encuesta', '+5491100000000', now() - interval '1 day', 'completed', 'cartel') RETURNING id`, [prop[0].id])
      const token = 'Ab3xK9pQ2rTz8LmN4vWq1Y'
      await c.query(`INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, $2, now() + interval '30 days')`, [v[0].id, token])

      ok(await rechaza(c, 's_dup', `INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, 'Zz3xK9pQ2rTz8LmN4vWq1Y', now())`, [v[0].id]),
        'una segunda encuesta para la misma visita se rechaza (UNIQUE visit_id)')
      ok(await rechaza(c, 's_tok', `UPDATE visit_surveys SET token='corto' WHERE visit_id=$1`, [v[0].id]), 'un token que no tiene 22 caracteres base64url se rechaza')
      ok(await rechaza(c, 's_est', `UPDATE visit_surveys SET send_status='mandada' WHERE visit_id=$1`, [v[0].id]), 'un estado de envío fuera del catálogo se rechaza')

      const r1 = (await c.query(`SELECT visit_survey_registrar($1,'abierta',2) r`, [token])).rows[0].r
      const r2 = (await c.query(`SELECT visit_survey_registrar($1,'escritura',2) r`, [token])).rows[0].r
      const r3 = (await c.query(`SELECT visit_survey_registrar($1,'escritura',2) r`, [token])).rows[0].r
      ok(r1 === true && r2 === true && r3 === false, 'el límite por link corta en el tope')
      const abierta = (await c.query(`SELECT opened_at, open_count, write_count FROM visit_surveys WHERE token=$1`, [token])).rows[0]
      ok(abierta.opened_at !== null && abierta.open_count === 1 && abierta.write_count === 2, '"abierta" marca opened_at y open_count una vez')

      ok(await rechaza(c, 's_path',
        `INSERT INTO property_survey_gifts (property_id, title, file_path, file_name, file_size)
         VALUES ($1, 'Guía', 'properties/11111111-1111-4111-8111-111111111111/regalo-11111111-1111-4111-8111-111111111111.pdf', 'g.pdf', 10)`,
        [prop[0].id]), 'un path de regalo de OTRA propiedad se rechaza')
      // $1 se castea en los dos usos: sin eso Postgres deduce tipos distintos (uuid y text) y falla.
      ok(!(await rechaza(c, 's_path_ok',
        `INSERT INTO property_survey_gifts (property_id, title, file_path, file_name, file_size)
         VALUES ($1::uuid, 'Guía', 'properties/' || $1::text || '/regalo-11111111-1111-4111-8111-111111111111.pdf', 'g.pdf', 10)`,
        [prop[0].id])), 'el path de regalo de ESTA propiedad se acepta')

      await c.query(`DELETE FROM property_visits WHERE id=$1`, [v[0].id])
      const quedan = (await c.query(`SELECT count(*)::int n FROM visit_surveys WHERE token=$1`, [token])).rows[0].n
      ok(quedan === 0, 'borrar la visita borra su encuesta (CASCADE)')
    } finally {
      await c.query('ROLLBACK TO SAVEPOINT logica')
    }

    // ─── RLS con sesión simulada: el abogado no ve nada; nadie autenticado escribe ───
    await c.query('SAVEPOINT rls')
    try {
      const { rows: prop } = await c.query(`SELECT id FROM properties WHERE status='approved' LIMIT 1`)
      const { rows: v } = await c.query(
        `INSERT INTO property_visits (property_id, client_name, client_phone, scheduled_at, status, origin)
         VALUES ($1, '[TEST] encuesta rls', '+5491100000000', now() - interval '1 day', 'completed', 'cartel') RETURNING id`, [prop[0].id])
      await c.query(`INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, 'Qq3xK9pQ2rTz8LmN4vWq1Y', now() + interval '30 days')`, [v[0].id])
      const { rows: abogados } = await c.query(`SELECT id FROM profiles WHERE role='abogado' LIMIT 1`)
      if (abogados[0]) {
        await c.query('SET LOCAL ROLE authenticated')
        await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: abogados[0].id, role: 'authenticated' })])
        ok((await c.query(`SELECT 1 FROM visit_surveys`)).rowCount === 0, 'el abogado no ve encuestas')
        ok((await c.query(`SELECT 1 FROM visit_survey_settings`)).rowCount === 0, 'el abogado no ve los ajustes')
        ok(await rechaza(c, 's_ins', `INSERT INTO visit_surveys (visit_id, token, expires_at) VALUES ($1, 'Ww3xK9pQ2rTz8LmN4vWq1Y', now())`, [v[0].id]),
          'un usuario autenticado no puede insertar encuestas')
        await c.query('RESET ROLE')
      } else {
        console.log('⚠ no hay ningún perfil role=abogado: no se pudo probar la lectura del abogado')
      }
    } finally {
      await c.query('RESET ROLE')
      await c.query('ROLLBACK TO SAVEPOINT rls')
    }

    const resto = (await c.query(`SELECT count(*)::int n FROM property_visits WHERE client_name LIKE '[TEST] encuesta%'`)).rows[0].n
    ok(resto === 0, 'ninguna fila de prueba quedó')

    await c.query('COMMIT')
    console.log('\n✅ aplicada y verificada (COMMIT)')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await c.end()
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
```

- [ ] **Paso 3: Auditoría de la migración ANTES de aplicarla.** Despachar un subagente revisor
  (`feature-dev:code-reviewer`) con la skill `supabase:supabase-postgres-best-practices` cargada,
  pidiéndole revisar SOLO este SQL y el script contra: reglas de CLAUDE.md (FK a `profiles` con
  `ON DELETE SET NULL`, trigger BEFORE que solo toca `NEW`, RLS en toda tabla nueva, upsert con
  `onConflict` ⇒ UNIQUE: `visit_id` y `property_id` lo tienen), índices para las FKs y para las
  consultas del barrido (`completed_at`), la función `SECURITY INVOKER` con `search_path` fijo y
  permisos solo a `service_role`, el CHECK de `whatsapp_messages.origen` (que no quede otro CHECK
  de origen colgado, NOT VALID + VALIDATE), idempotencia (se puede re-ejecutar: `IF NOT EXISTS`,
  `DROP POLICY IF EXISTS`, `ON CONFLICT`), y el borrado de las tablas viejas (guardia de filas).
  Verificar cada hallazgo antes de aplicarlo; lo aplicado se re-revisa.

- [ ] **Paso 4: Aplicar y verificar (lo corre el controlador)** —
  `node --env-file=../../../.env.local --import tsx scripts/apply-encuesta-visita-pg.ts`.
  Esperado: todas las líneas `✓` y `✅ aplicada y verificada (COMMIT)`. Si aparece `¡ALERTA!`, NO
  seguir. Después, en el proyecto correcto (`mncsnastmcjdjxrehdep`):
  `SELECT count(*) FROM visit_surveys;` → 0 y
  `SELECT envio_automatico, solo_con_regalo, regalo_por_whatsapp FROM visit_survey_settings;` →
  `false, true, false`. Pegar ambas salidas en el reporte.

- [ ] **Paso 5: Commit** — `git add supabase/migrations/20261015000002_encuesta_de_visita.sql scripts/apply-encuesta-visita-pg.ts`;
  mensaje `feat(visitas): tablas de la encuesta, el regalo por propiedad y sus ajustes (todo apagado)`.

---

### Tarea 2: Catálogos, link y pasos de la encuesta

**Files:**
- Create: `lib/visitas/encuesta/tipos.ts`, `lib/visitas/encuesta/tipos.test.ts`
- Create: `lib/visitas/encuesta/link.ts`, `lib/visitas/encuesta/link.test.ts`
- Create: `lib/visitas/encuesta/pasos.ts`, `lib/visitas/encuesta/pasos.test.ts`
- Create: `test/visitas/encuesta-de-prueba.ts`

**Interfaces:**
- Consumes: `EstadoVisita` de `lib/visitas/transiciones.ts`.
- Produces (todo en `lib/visitas/encuesta/tipos.ts`): `PASOS_ENCUESTA`, `PasoEncuesta`,
  `PASOS_GUARDABLES`, `PasoGuardable`, `OPINIONES_PRECIO`, `OpinionPrecio`, `MONEDAS`, `Moneda`,
  `ESTADOS_ENVIO`, `EstadoEnvio`, `MOTIVOS_OMISION`, `MotivoOmision`, `ESTADOS_AVISO`, `EstadoAviso`,
  `CANALES_AVISO`, `CanalAviso`, `COLUMNAS_DE_CANAL`, `RespuestasEncuesta`, `RESPUESTAS_VACIAS`,
  `AjustesEncuesta`, `RegaloDeLaPropiedad`, `EncuestaFila`, `PropiedadDeEncuesta`,
  `VisitaDeEncuesta`, `EncuestaConVisita`, `EstadoWa`, `monedaDe(currency)`.
  `link.ts`: `LARGO_TOKEN`, `VIGENCIA_DIAS`, `tokenDesdeBytes(bytes: Uint8Array): string`,
  `esTokenEncuesta(v: unknown): v is string`, `vencimientoDesde(ahora: Date): string`,
  `estaVencida(expiresAt: string, ahora: Date): boolean`, `urlDeLaEncuesta(token, base?)`.
  `pasos.ts`: `esPasoGuardable`, `pasoSiguiente`, `pasoAnterior`, `pasoRespondido`,
  `primerPasoSinResponder`, `pasoParaRetomar`, `avance`.
  `test/visitas/encuesta-de-prueba.ts`: `encuestaDePrueba(cambios?)`, `encuestaConVisitaDePrueba(cambios?)`.

- [ ] **Paso 1: Test de los catálogos contra los CHECK de la migración** — `lib/visitas/encuesta/tipos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ESTADOS_ENVIO, MOTIVOS_OMISION, ESTADOS_AVISO, OPINIONES_PRECIO, MONEDAS, PASOS_GUARDABLES,
  COLUMNAS_DE_CANAL, CANALES_AVISO, monedaDe,
} from './tipos'

const SQL = readFileSync('supabase/migrations/20261015000002_encuesta_de_visita.sql', 'utf8')

/** Valores entre comillas del `IN (...)` de la línea que define `columna`. */
function valoresDelCheck(columna: string): string[] {
  const linea = SQL.split('\n').find(l => l.trimStart().startsWith(`${columna} TEXT`))
  if (!linea) throw new Error(`no encontré la columna ${columna} en la migración`)
  const dentro = linea.match(/IN \(([^)]*)\)/)?.[1] ?? ''
  return [...dentro.matchAll(/'([^']+)'/g)].map(m => m[1])
}

describe('catálogos = CHECK de la base (se tocan JUNTOS)', () => {
  it.each([
    ['send_status', ESTADOS_ENVIO],
    ['send_skip_reason', MOTIVOS_OMISION],
    ['team_notice_status', ESTADOS_AVISO],
    ['gift_whatsapp_status', ESTADOS_AVISO],
    ['gift_email_status', ESTADOS_AVISO],
    ['price_opinion', OPINIONES_PRECIO],
    ['offer_currency', MONEDAS],
    ['last_step', PASOS_GUARDABLES],
  ] as const)('%s', (columna, catalogo) => {
    expect(valoresDelCheck(columna)).toEqual([...catalogo])
  })
  it('cada canal de aviso apunta a columnas que existen en la tabla', () => {
    for (const canal of CANALES_AVISO) {
      const { estado, momento } = COLUMNAS_DE_CANAL[canal]
      expect(SQL).toContain(`  ${estado} TEXT`)
      expect(SQL).toContain(`  ${momento} TIMESTAMPTZ`)
    }
  })
})

describe('monedaDe', () => {
  it('ARS es ARS; cualquier otra cosa (USD, null, basura) es USD, la moneda de los avisos', () => {
    expect(monedaDe('ARS')).toBe('ARS')
    expect(monedaDe('USD')).toBe('USD')
    expect(monedaDe(null)).toBe('USD')
    expect(monedaDe('pesos')).toBe('USD')
  })
})
```

- [ ] **Paso 2: Correr y verlo fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/tipos.test.ts`.
  Esperado: FAIL (`Cannot find module './tipos'`).

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/tipos.ts`**

```ts
/**
 * Catálogos y tipos de la encuesta post-visita (spec §11). Puro y seguro para el navegador.
 * Cada catálogo con CHECK en la base (migración 20261015000002) se compara con ese CHECK en
 * tipos.test.ts: se tocan JUNTOS o la base rechaza la escritura con 23514.
 */
import type { EstadoVisita } from '../transiciones'

export const PASOS_ENCUESTA = ['bienvenida', 'gusto', 'mas_gusto', 'menos_gusto', 'precio', 'oferta', 'contacto', 'gracias'] as const
export type PasoEncuesta = (typeof PASOS_ENCUESTA)[number]

/** Los pasos que se guardan uno por uno (PATCH). `contacto` va en el POST final. */
export const PASOS_GUARDABLES = ['gusto', 'mas_gusto', 'menos_gusto', 'precio', 'oferta'] as const
export type PasoGuardable = (typeof PASOS_GUARDABLES)[number]

export const OPINIONES_PRECIO = ['correcto', 'alto', 'bajo'] as const
export type OpinionPrecio = (typeof OPINIONES_PRECIO)[number]

export const MONEDAS = ['USD', 'ARS'] as const
export type Moneda = (typeof MONEDAS)[number]

/** Moneda de la propiedad para la oferta: lo que no es ARS se publica en dólares. */
export function monedaDe(currency: string | null | undefined): Moneda {
  return currency === 'ARS' ? 'ARS' : 'USD'
}

export const ESTADOS_ENVIO = ['sin_enviar', 'enviada', 'fallida', 'omitida'] as const
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number]

export const MOTIVOS_OMISION = [
  'envio_apagado', 'sin_regalo', 'telefono_invalido', 'plantilla_sin_configurar', 'plantilla_desconocida',
  'ajustes_ilegibles', 'modo_prueba_whatsapp', 'ya_respondio', 'vencida', 'ya_enviada',
] as const
export type MotivoOmision = (typeof MOTIVOS_OMISION)[number]

export const ESTADOS_AVISO = ['pendiente', 'enviando', 'enviado', 'fallido', 'no_corresponde'] as const
export type EstadoAviso = (typeof ESTADOS_AVISO)[number]

/** Los avisos que salen al completar, en el orden en que se intentan (lo más importante primero). */
export const CANALES_AVISO = ['equipo', 'regalo_whatsapp', 'regalo_email'] as const
export type CanalAviso = (typeof CANALES_AVISO)[number]

export const COLUMNAS_DE_CANAL: Readonly<Record<CanalAviso, {
  estado: 'team_notice_status' | 'gift_whatsapp_status' | 'gift_email_status'
  momento: 'team_notice_at' | 'gift_whatsapp_at' | 'gift_email_at'
}>> = {
  equipo: { estado: 'team_notice_status', momento: 'team_notice_at' },
  regalo_whatsapp: { estado: 'gift_whatsapp_status', momento: 'gift_whatsapp_at' },
  regalo_email: { estado: 'gift_email_status', momento: 'gift_email_at' },
}

export interface RespuestasEncuesta {
  liked: boolean | null
  most_liked_tags: string[]
  most_liked_other: string | null
  least_liked_tags: string[]
  least_liked_other: string | null
  price_opinion: OpinionPrecio | null
  offer_amount: number | null
  offer_currency: Moneda | null
  offer_declined: boolean | null
}

export const RESPUESTAS_VACIAS: RespuestasEncuesta = {
  liked: null, most_liked_tags: [], most_liked_other: null, least_liked_tags: [], least_liked_other: null,
  price_opinion: null, offer_amount: null, offer_currency: null, offer_declined: null,
}

export interface AjustesEncuesta {
  envio_automatico: boolean
  solo_con_regalo: boolean
  regalo_por_whatsapp: boolean
  telefonos_prueba: string[]
}

export interface RegaloDeLaPropiedad {
  propertyId: string
  titulo: string
  archivoPath: string
  archivoNombre: string
  archivoBytes: number
  portadaPath: string | null
  actualizadoEl: string
}

export interface EncuestaFila extends RespuestasEncuesta {
  id: string
  visit_id: string
  token: string
  expires_at: string
  created_at: string
  updated_at: string
  send_status: EstadoEnvio
  send_skip_reason: MotivoOmision | null
  send_error: string | null
  sent_at: string | null
  sent_to: string | null
  wa_message_id: string | null
  opened_at: string | null
  open_count: number
  last_step: PasoGuardable | null
  completed_at: string | null
  contact_phone: string | null
  contact_email: string | null
  wants_similar: boolean | null
  team_notice_status: EstadoAviso
  gift_whatsapp_status: EstadoAviso
  gift_email_status: EstadoAviso
  gift_wa_message_id: string | null
  notice_attempts: number
  notice_error: string | null
  gift_downloaded_at: string | null
}

export interface PropiedadDeEncuesta {
  id: string
  address: string
  neighborhood: string | null
  photos: unknown
  asking_price: number | null
  currency: string | null
  property_type: string | null
  amenities: unknown
  garages: number | null
  floor: number | null
  expensas: number | null
}

export interface VisitaDeEncuesta {
  id: string
  property_id: string
  client_name: string
  client_phone: string | null
  scheduled_at: string
  status: EstadoVisita
  advisor_id: string | null
  lead_id: string | null
  propiedad: PropiedadDeEncuesta | null
}

export interface EncuestaConVisita {
  encuesta: EncuestaFila
  visita: VisitaDeEncuesta
}

/** Estado del mensaje de WhatsApp tal como lo mantiene el webhook en `whatsapp_messages`. */
export interface EstadoWa {
  status: string
  error_code: string | null
  error_message: string | null
}
```

- [ ] **Paso 4: Correr y verlo pasar** — mismo comando. Esperado: PASS (10 pruebas).

- [ ] **Paso 5: Tests de link y pasos** — `lib/visitas/encuesta/link.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { tokenDesdeBytes, esTokenEncuesta, vencimientoDesde, estaVencida, urlDeLaEncuesta, LARGO_TOKEN } from './link'

describe('token de la encuesta', () => {
  it('16 bytes al azar dan 22 caracteres base64url, sin relleno', () => {
    for (let i = 0; i < 50; i++) {
      const t = tokenDesdeBytes(randomBytes(16))
      expect(t).toHaveLength(LARGO_TOKEN)
      expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/)
      expect(esTokenEncuesta(t)).toBe(true)
    }
  })
  it('con otra cantidad de bytes falla ruidoso (nunca un token más débil)', () => {
    expect(() => tokenDesdeBytes(new Uint8Array(8))).toThrow('16 bytes')
  })
  it.each([
    ['vacío', ''], ['corto', 'abc'], ['23 caracteres', 'Ab3xK9pQ2rTz8LmN4vWq1YZ'], ['con barra', 'Ab3xK9pQ2rTz8LmN4vW/1Y'],
    ['con espacio', 'Ab3xK9pQ2rTz8LmN4vW 1Y'], ['inyección', "x' OR '1'='1"], ['no texto', 42],
  ])('rechaza un token %s', (_n, valor) => {
    expect(esTokenEncuesta(valor)).toBe(false)
  })
})

describe('vencimiento', () => {
  const ahora = new Date('2026-10-15T15:00:00Z')
  it('vence a los 30 días', () => {
    expect(vencimientoDesde(ahora)).toBe('2026-11-14T15:00:00.000Z')
  })
  it('vencida = ya pasó o la fecha es inválida (fail-closed)', () => {
    expect(estaVencida('2026-10-15T15:00:01Z', ahora)).toBe(false)
    expect(estaVencida('2026-10-15T15:00:00Z', ahora)).toBe(true)
    expect(estaVencida('basura', ahora)).toBe(true)
  })
})

describe('urlDeLaEncuesta', () => {
  it('usa la base dada sin barra final, o inmodf.com.ar', () => {
    expect(urlDeLaEncuesta('Ab3xK9pQ2rTz8LmN4vWq1Y', 'https://preview.netlify.app/')).toBe('https://preview.netlify.app/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y')
    expect(urlDeLaEncuesta('Ab3xK9pQ2rTz8LmN4vWq1Y', '')).toBe('https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y')
    expect(urlDeLaEncuesta('Ab3xK9pQ2rTz8LmN4vWq1Y')).toBe('https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y')
  })
})
```

  `lib/visitas/encuesta/pasos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pasoSiguiente, pasoAnterior, pasoParaRetomar, primerPasoSinResponder, avance, pasoRespondido } from './pasos'
import { RESPUESTAS_VACIAS, type RespuestasEncuesta } from './tipos'

const r = (c: Partial<RespuestasEncuesta> = {}): RespuestasEncuesta => ({ ...RESPUESTAS_VACIAS, ...c })

describe('orden de los pasos', () => {
  it('avanza en orden y se queda en "gracias"', () => {
    expect(pasoSiguiente('bienvenida')).toBe('gusto')
    expect(pasoSiguiente('oferta')).toBe('contacto')
    expect(pasoSiguiente('contacto')).toBe('gracias')
    expect(pasoSiguiente('gracias')).toBe('gracias')
  })
  it('atrás existe salvo en la bienvenida y en gracias', () => {
    expect(pasoAnterior('bienvenida')).toBeNull()
    expect(pasoAnterior('gusto')).toBe('bienvenida')
    expect(pasoAnterior('contacto')).toBe('oferta')
    expect(pasoAnterior('gracias')).toBeNull()
  })
  it('avance va de 0 a 1 sin decir cuántos pasos hay', () => {
    expect(avance('bienvenida')).toBe(0)
    expect(avance('gracias')).toBe(1)
    expect(avance('precio')).toBeGreaterThan(avance('gusto'))
  })
})

describe('qué cuenta como respondido', () => {
  it('"más gustó" con solo "Otra cosa" escrita cuenta; vacío no', () => {
    expect(pasoRespondido('mas_gusto', r({ most_liked_tags: ['otra'], most_liked_other: 'El barrio' }))).toBe(true)
    expect(pasoRespondido('mas_gusto', r())).toBe(false)
  })
  it('la oferta cuenta con monto o con "Prefiero no decirlo"', () => {
    expect(pasoRespondido('oferta', r({ offer_amount: 120000 }))).toBe(true)
    expect(pasoRespondido('oferta', r({ offer_declined: true }))).toBe(true)
    expect(pasoRespondido('oferta', r({ offer_declined: false }))).toBe(false)
  })
  it('"no me gustó" (false) es una respuesta, no un vacío', () => {
    expect(pasoRespondido('gusto', r({ liked: false }))).toBe(true)
  })
})

describe('retomar (criterio 21)', () => {
  it('sin nada respondido arranca en la bienvenida', () => {
    expect(pasoParaRetomar(r(), false)).toBe('bienvenida')
  })
  it('con 1 y 2 respondidas retoma en la 3', () => {
    expect(pasoParaRetomar(r({ liked: true, most_liked_tags: ['luz'] }), false)).toBe('menos_gusto')
  })
  it('si falta una del medio, vuelve a esa', () => {
    expect(primerPasoSinResponder(r({ liked: true, least_liked_tags: ['ruido'], price_opinion: 'alto' }))).toBe('mas_gusto')
  })
  it('todo respondido pero sin terminar → contacto; terminada → gracias', () => {
    const todo = r({ liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto', offer_declined: true })
    expect(pasoParaRetomar(todo, false)).toBe('contacto')
    expect(pasoParaRetomar(r(), true)).toBe('gracias')
  })
})
```

- [ ] **Paso 6: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/link.test.ts lib/visitas/encuesta/pasos.test.ts`.
  Esperado: FAIL (módulos inexistentes).

- [ ] **Paso 7: Implementar `lib/visitas/encuesta/link.ts`**

```ts
/**
 * El link de la encuesta (spec §4.10 + §11): un código opaco por visita, sin datos personales en
 * la URL (como los hidden fields de Typeform, pero resueltos por el servidor — patrón de /v/<token>).
 * Puro: el azar entra por parámetro (crypto.randomBytes en el servidor), así se testea sin red.
 */
export const LARGO_TOKEN = 22
export const VIGENCIA_DIAS = 30
const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/

/** 16 bytes (128 bits) → 22 caracteres base64url. Otra cantidad sería un token más débil: falla. */
export function tokenDesdeBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('El token de la encuesta se arma con 16 bytes')
  return Buffer.from(bytes).toString('base64url')
}

/** Validar la FORMA antes de tocar la base: un token inventado no gasta una consulta. */
export function esTokenEncuesta(v: unknown): v is string {
  return typeof v === 'string' && TOKEN_RE.test(v)
}

export function vencimientoDesde(ahora: Date): string {
  return new Date(ahora.getTime() + VIGENCIA_DIAS * 86_400_000).toISOString()
}

/** Fail-closed: una fecha ilegible cuenta como vencida. */
export function estaVencida(expiresAt: string, ahora: Date): boolean {
  const t = Date.parse(expiresAt)
  return !Number.isFinite(t) || t <= ahora.getTime()
}

export function urlDeLaEncuesta(token: string, base?: string | null): string {
  const b = (base?.trim() || 'https://inmodf.com.ar').replace(/\/+$/, '')
  return `${b}/encuesta/${token}`
}
```

- [ ] **Paso 8: Implementar `lib/visitas/encuesta/pasos.ts`**

```ts
/**
 * Orden de la encuesta y de dónde se retoma (spec §3.6: "si abandona en la 3, las dos primeras
 * quedan; si vuelve a abrir el link, retoma donde quedó"). Puro y seguro para el navegador.
 */
import { PASOS_ENCUESTA, PASOS_GUARDABLES, type PasoEncuesta, type PasoGuardable, type RespuestasEncuesta } from './tipos'

export function esPasoGuardable(p: PasoEncuesta): p is PasoGuardable {
  return (PASOS_GUARDABLES as readonly string[]).includes(p)
}

export function pasoSiguiente(p: PasoEncuesta): PasoEncuesta {
  const i = PASOS_ENCUESTA.indexOf(p)
  return PASOS_ENCUESTA[Math.min(i + 1, PASOS_ENCUESTA.length - 1)]
}

/** Sin "atrás" en la bienvenida (no hay nada antes) ni en gracias (ya está enviada). */
export function pasoAnterior(p: PasoEncuesta): PasoEncuesta | null {
  if (p === 'bienvenida' || p === 'gracias') return null
  return PASOS_ENCUESTA[PASOS_ENCUESTA.indexOf(p) - 1]
}

export function pasoRespondido(p: PasoGuardable, r: RespuestasEncuesta): boolean {
  switch (p) {
    case 'gusto': return r.liked !== null
    case 'mas_gusto': return r.most_liked_tags.length > 0 || !!r.most_liked_other
    case 'menos_gusto': return r.least_liked_tags.length > 0 || !!r.least_liked_other
    case 'precio': return r.price_opinion !== null
    case 'oferta': return r.offer_amount !== null || r.offer_declined === true
  }
}

export function primerPasoSinResponder(r: RespuestasEncuesta): PasoGuardable | null {
  return PASOS_GUARDABLES.find(p => !pasoRespondido(p, r)) ?? null
}

export function pasoParaRetomar(r: RespuestasEncuesta, completa: boolean): PasoEncuesta {
  if (completa) return 'gracias'
  if (!PASOS_GUARDABLES.some(p => pasoRespondido(p, r))) return 'bienvenida'
  return primerPasoSinResponder(r) ?? 'contacto'
}

/** Fracción 0..1 para la barra fina. A propósito NO hay "paso N de M" (decisión del dueño). */
export function avance(p: PasoEncuesta): number {
  return PASOS_ENCUESTA.indexOf(p) / (PASOS_ENCUESTA.length - 1)
}
```

- [ ] **Paso 9: Crear `test/visitas/encuesta-de-prueba.ts`**

```ts
/**
 * Constructores de filas de la encuesta para las pruebas. Por defecto: una encuesta creada al marcar
 * la visita realizada, sin enviar y sin responder, de Doblas 248 (USD 150.000, con cochera).
 */
import { RESPUESTAS_VACIAS, type EncuestaFila, type EncuestaConVisita, type VisitaDeEncuesta } from '@/lib/visitas/encuesta/tipos'

export const TOKEN_DE_PRUEBA = 'Ab3xK9pQ2rTz8LmN4vWq1Y'
export const VISITA_DE_PRUEBA = '44444444-4444-4444-8444-444444444444'
export const ENCUESTA_DE_PRUEBA = '55555555-5555-4555-8555-555555555555'
export const PROPIEDAD_DE_PRUEBA = '33333333-3333-4333-8333-333333333333'

export function encuestaDePrueba(cambios: Partial<EncuestaFila> = {}): EncuestaFila {
  return {
    ...RESPUESTAS_VACIAS,
    id: ENCUESTA_DE_PRUEBA,
    visit_id: VISITA_DE_PRUEBA,
    token: TOKEN_DE_PRUEBA,
    expires_at: '2026-11-14T15:00:00.000Z',
    created_at: '2026-10-15T15:00:00.000Z',
    updated_at: '2026-10-15T15:00:00.000000+00:00',
    send_status: 'sin_enviar',
    send_skip_reason: null,
    send_error: null,
    sent_at: null,
    sent_to: null,
    wa_message_id: null,
    opened_at: null,
    open_count: 0,
    last_step: null,
    completed_at: null,
    contact_phone: null,
    contact_email: null,
    wants_similar: null,
    team_notice_status: 'pendiente',
    gift_whatsapp_status: 'pendiente',
    gift_email_status: 'pendiente',
    gift_wa_message_id: null,
    notice_attempts: 0,
    notice_error: null,
    gift_downloaded_at: null,
    ...cambios,
  }
}

export function encuestaConVisitaDePrueba(
  encuesta: Partial<EncuestaFila> = {},
  visita: Partial<VisitaDeEncuesta> = {},
): EncuestaConVisita {
  return {
    encuesta: encuestaDePrueba(encuesta),
    visita: {
      id: VISITA_DE_PRUEBA,
      property_id: PROPIEDAD_DE_PRUEBA,
      client_name: 'Mariana Gómez',
      client_phone: '+5491158234521',
      scheduled_at: '2026-10-14T13:30:00.000Z',
      status: 'completed',
      advisor_id: '22222222-2222-4222-8222-222222222222',
      lead_id: '66666666-6666-4666-8666-666666666666',
      propiedad: {
        id: PROPIEDAD_DE_PRUEBA,
        address: 'Doblas 248',
        neighborhood: 'Caballito',
        photos: ['https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/property-files/properties/x/photos/1.jpg'],
        asking_price: 150000,
        currency: 'USD',
        property_type: 'departamento',
        amenities: [],
        garages: 1,
        floor: 3,
        expensas: 85000,
      },
      ...visita,
    },
  }
}
```

- [ ] **Paso 10: Correr y verlos pasar** — los tres tests de esta tarea. Esperado: PASS. Además
  `npx tsc --noEmit -p tsconfig.visitas.json` limpio y `npx eslint lib/visitas/encuesta test/visitas/encuesta-de-prueba.ts`.

- [ ] **Paso 11: Commit** — `git add lib/visitas/encuesta/tipos.ts lib/visitas/encuesta/tipos.test.ts lib/visitas/encuesta/link.ts lib/visitas/encuesta/link.test.ts lib/visitas/encuesta/pasos.ts lib/visitas/encuesta/pasos.test.ts test/visitas/encuesta-de-prueba.ts`;
  mensaje `feat(visitas): catálogos, link opaco y orden de pasos de la encuesta`.

---

### Tarea 3: Opciones por propiedad, validación de respuestas, oferta y contacto

**Files:**
- Create: `lib/visitas/encuesta/opciones.ts` (+`opciones.test.ts`)
- Create: `lib/visitas/encuesta/respuestas.ts` (+`respuestas.test.ts`)
- Create: `lib/visitas/encuesta/oferta.ts` (+`oferta.test.ts`)
- Create: `lib/visitas/encuesta/contacto.ts` (+`contacto.test.ts`)

**Interfaces:**
- Consumes: tipos de la Tarea 2; `formatearMiles` de `lib/properties/money-input.ts`.
- Produces:
  - `opciones.ts`: `OpcionEncuesta { clave: string; etiqueta: string }`, `OpcionesDeLaEncuesta { masGusto: OpcionEncuesta[]; menosGusto: OpcionEncuesta[] }`,
    `PropiedadParaOpciones`, `OTRA = 'otra'`, `NADA = 'nada'`, `MAX_OPCIONES = 8`,
    `ETIQUETA_DE_OPCION`, `etiquetaDeOpcion(clave): string`, `opcionesDeLaEncuesta(p): OpcionesDeLaEncuesta`.
  - `respuestas.ts`: `MAX_TEXTO_LIBRE = 280`, `limpiarTextoLibre(v)`, `TECHO_OFERTA`, `cuerpoPatch`
    (Zod), `CuerpoPatch`, `CuerpoRespuesta`, `PatchPaso`, `patchDelPaso(c, ctx)`, `cuerpoFinal` (Zod),
    `CuerpoFinal`, `ContactoFinal`, `contactoFinal(c, telefonoDeLaVisita, normalizar)`,
    `esHoneypot(c)`, `faltaParaTerminar(r)`.
  - `oferta.ts`: `AtajoOferta`, `atajosDeOferta(precio, moneda)`, `textoMonto(monto, moneda)`.
  - `contacto.ts`: `enmascararTelefono(t): string | null`.

- [ ] **Paso 1: Tests** — `lib/visitas/encuesta/opciones.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { opcionesDeLaEncuesta, etiquetaDeOpcion, MAX_OPCIONES, type PropiedadParaOpciones } from './opciones'

const base: PropiedadParaOpciones = { property_type: 'departamento', amenities: [], garages: 0, floor: 2, expensas: 0 }
const claves = (o: { clave: string }[]) => o.map(x => x.clave)

describe('opcionesDeLaEncuesta (spec §4.8)', () => {
  it('un depto sin nada especial: las 5 de siempre + "Otra cosa"', () => {
    const o = opcionesDeLaEncuesta(base)
    expect(claves(o.masGusto)).toEqual(['ubicacion', 'luz', 'distribucion', 'estado', 'tamano', 'otra'])
    expect(claves(o.menosGusto)).toEqual(['precio', 'tamano', 'estado', 'ruido', 'nada', 'otra'])
  })
  it('suma lo que tiene ESA propiedad, con tildes en forma NFD también', () => {
    const o = opcionesDeLaEncuesta({ ...base, amenities: ['Balcón', 'Pileta'], garages: 1, floor: 9, expensas: 120000 })
    expect(claves(o.masGusto)).toContain('balcon_terraza')
    expect(claves(o.masGusto)).toContain('cochera')
    expect(o.masGusto.length).toBeLessThanOrEqual(MAX_OPCIONES)
    expect(o.masGusto.at(-1)?.clave).toBe('otra')
    expect(claves(o.menosGusto)).toContain('expensas')
  })
  it('una casa ofrece patio o jardín aunque no lo diga en amenities', () => {
    expect(claves(opcionesDeLaEncuesta({ ...base, property_type: 'casa' }).masGusto)).toContain('patio_jardin')
  })
  it('nunca pasa de 8, ni con todo cargado', () => {
    const o = opcionesDeLaEncuesta({ ...base, property_type: 'casa', amenities: ['Terraza', 'Gimnasio', 'Cochera'], garages: 2, floor: 12, expensas: 1 })
    expect(o.masGusto).toHaveLength(MAX_OPCIONES)
  })
  it('amenities que no son una lista (dato viejo) no rompen', () => {
    expect(() => opcionesDeLaEncuesta({ ...base, amenities: 'pileta' })).not.toThrow()
    expect(() => opcionesDeLaEncuesta({ ...base, amenities: null })).not.toThrow()
  })
  it('las etiquetas son para personas', () => {
    expect(etiquetaDeOpcion('tamano')).toBe('El tamaño')
    expect(etiquetaDeOpcion('desconocida')).toBe('desconocida')
  })
})
```

  `lib/visitas/encuesta/respuestas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { limpiarTextoLibre, cuerpoPatch, patchDelPaso, cuerpoFinal, contactoFinal, esHoneypot, faltaParaTerminar, MAX_TEXTO_LIBRE } from './respuestas'
import { opcionesDeLaEncuesta } from './opciones'
import { RESPUESTAS_VACIAS } from './tipos'

const opciones = opcionesDeLaEncuesta({ property_type: 'departamento', amenities: [], garages: 1, floor: 2, expensas: 0 })
const ctx = { opciones, moneda: 'USD' as const }
const normalizar = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length >= 10 ? `549${d.slice(-10)}` : null
}
function patch(cuerpo: unknown) {
  const c = cuerpoPatch.safeParse(cuerpo)
  if (!c.success || c.data.paso === 'abierta') throw new Error('cuerpo inválido')
  return patchDelPaso(c.data, ctx)
}

describe('limpiarTextoLibre', () => {
  it('NFC, sin caracteres de control, espacios colapsados, con tope', () => {
    expect(limpiarTextoLibre('  El balcón\u0007 \n\n  enorme ')).toBe('El balcón enorme')
    expect(limpiarTextoLibre('x'.repeat(500))).toHaveLength(MAX_TEXTO_LIBRE)
    expect(limpiarTextoLibre(null)).toBe('')
  })
  it('deja el texto como texto: no saca ni interpreta HTML (React lo escapa al mostrarlo)', () => {
    expect(limpiarTextoLibre('</script><b>hola</b>')).toBe('</script><b>hola</b>')
  })
})

describe('cuerpoPatch (Zod estricto por paso)', () => {
  it.each([
    { paso: 'gusto', valor: 'si' },
    { paso: 'gusto', valor: true, extra: 1 },
    { paso: 'precio', valor: 'carisimo' },
    { paso: 'oferta', monto: -5, declina: false },
    { paso: 'oferta', monto: 1.5, declina: false },
    { paso: 'inventado' },
  ])('rechaza %o', cuerpo => {
    expect(cuerpoPatch.safeParse(cuerpo).success).toBe(false)
  })
})

describe('patchDelPaso', () => {
  it('gusto', () => {
    expect(patch({ paso: 'gusto', valor: false })).toEqual({ ok: true, patch: { liked: false, last_step: 'gusto' } })
  })
  it('etiquetas: solo las de ESTA propiedad, sin repetidas', () => {
    expect(patch({ paso: 'mas_gusto', etiquetas: ['luz', 'cochera'] })).toEqual({
      ok: true, patch: { most_liked_tags: ['luz', 'cochera'], most_liked_other: null, last_step: 'mas_gusto' },
    })
    expect(patch({ paso: 'mas_gusto', etiquetas: ['vista'] })).toEqual({ ok: false, error: 'Elegí una de las opciones' })
    expect(patch({ paso: 'mas_gusto', etiquetas: ['luz', 'luz'] })).toEqual({ ok: false, error: 'Elegí una de las opciones' })
    expect(patch({ paso: 'mas_gusto', etiquetas: [] })).toEqual({ ok: false, error: 'Elegí al menos una opción' })
  })
  it('"Otra cosa" exige el texto y lo limpia; sin "Otra cosa" el texto se descarta', () => {
    expect(patch({ paso: 'menos_gusto', etiquetas: ['otra'], otra: '  ' })).toEqual({ ok: false, error: 'Contanos qué otra cosa' })
    expect(patch({ paso: 'menos_gusto', etiquetas: ['otra'], otra: 'El ascensor\u0007' })).toEqual({
      ok: true, patch: { least_liked_tags: ['otra'], least_liked_other: 'El ascensor', last_step: 'menos_gusto' },
    })
    expect(patch({ paso: 'menos_gusto', etiquetas: ['ruido'], otra: 'algo' })).toEqual({
      ok: true, patch: { least_liked_tags: ['ruido'], least_liked_other: null, last_step: 'menos_gusto' },
    })
  })
  it('"Nada en especial" va sola', () => {
    expect(patch({ paso: 'menos_gusto', etiquetas: ['nada', 'ruido'] })).toEqual({ ok: false, error: '"Nada en especial" va sola' })
  })
  it('oferta: monto en la moneda publicada, o "prefiero no decirlo"', () => {
    expect(patch({ paso: 'oferta', monto: 135000, declina: false })).toEqual({
      ok: true, patch: { offer_amount: 135000, offer_currency: 'USD', offer_declined: false, last_step: 'oferta' },
    })
    expect(patch({ paso: 'oferta', monto: null, declina: true })).toEqual({
      ok: true, patch: { offer_amount: null, offer_currency: null, offer_declined: true, last_step: 'oferta' },
    })
    expect(patch({ paso: 'oferta', monto: null, declina: false })).toEqual({ ok: false, error: 'Escribí un monto o tocá "Prefiero no decirlo"' })
    expect(patch({ paso: 'oferta', monto: 500_000_000, declina: false })).toEqual({ ok: false, error: 'Revisá el monto' })
  })
})

describe('final', () => {
  it('cuerpoFinal es estricto', () => {
    expect(cuerpoFinal.safeParse({ similares: true, otro: 1 }).success).toBe(false)
    expect(cuerpoFinal.safeParse({ similares: true }).success).toBe(true)
  })
  it('sin teléfono nuevo usa el de la visita; con uno nuevo lo valida', () => {
    expect(contactoFinal({ similares: false }, '+54 9 11 5823-4521', normalizar)).toEqual({
      ok: true, contacto: { contact_phone: '5491158234521', contact_email: null, wants_similar: false },
    })
    expect(contactoFinal({ telefono: '11 4444-5555', similares: true }, '+5491158234521', normalizar)).toEqual({
      ok: true, contacto: { contact_phone: '5491144445555', contact_email: null, wants_similar: true },
    })
    expect(contactoFinal({ telefono: '123', similares: true }, '+5491158234521', normalizar)).toEqual({
      ok: false, error: 'Revisá tu WhatsApp: no parece un número válido',
    })
  })
  it('si la visita no tenía teléfono (MercadoLibre lo oculta) hay que escribirlo', () => {
    expect(contactoFinal({ similares: false }, null, normalizar)).toEqual({ ok: false, error: 'Dejanos tu WhatsApp' })
  })
  it('email opcional: vacío → null; mal escrito → error; se guarda en minúsculas', () => {
    expect(contactoFinal({ email: ' ', similares: false }, '+5491158234521', normalizar)).toMatchObject({ ok: true, contacto: { contact_email: null } })
    expect(contactoFinal({ email: 'Ana@Mail.COM', similares: false }, '+5491158234521', normalizar)).toMatchObject({ ok: true, contacto: { contact_email: 'ana@mail.com' } })
    expect(contactoFinal({ email: 'ana@', similares: false }, '+5491158234521', normalizar)).toEqual({ ok: false, error: 'Revisá el email' })
  })
  it('honeypot', () => {
    expect(esHoneypot({ similares: false, empresa: 'ACME' })).toBe(true)
    expect(esHoneypot({ similares: false, empresa: '' })).toBe(false)
    expect(esHoneypot({ similares: false })).toBe(false)
  })
  it('faltaParaTerminar devuelve el primer paso sin responder', () => {
    expect(faltaParaTerminar(RESPUESTAS_VACIAS)).toBe('gusto')
  })
})
```

  `lib/visitas/encuesta/oferta.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { atajosDeOferta, textoMonto } from './oferta'

describe('atajosDeOferta', () => {
  it('−10 %, −5 % y el publicado, redondeados (USD a 1.000)', () => {
    expect(atajosDeOferta(149_900, 'USD')).toEqual([
      { etiqueta: '−10 %', monto: 135_000 },
      { etiqueta: '−5 %', monto: 142_000 },
      { etiqueta: 'Precio publicado', monto: 150_000 },
    ])
  })
  it('en pesos redondea a 100.000', () => {
    expect(atajosDeOferta(98_450_000, 'ARS')[2]).toEqual({ etiqueta: 'Precio publicado', monto: 98_500_000 })
  })
  it('sin precio (o precio inválido) no hay atajos', () => {
    expect(atajosDeOferta(null, 'USD')).toEqual([])
    expect(atajosDeOferta(0, 'USD')).toEqual([])
    expect(atajosDeOferta(Number.NaN, 'USD')).toEqual([])
  })
  it('un precio muy bajo no repite el mismo atajo', () => {
    const a = atajosDeOferta(1_000, 'USD')
    expect(new Set(a.map(x => x.monto)).size).toBe(a.length)
  })
})

describe('textoMonto', () => {
  it('agrupado como se escribe en Argentina', () => {
    expect(textoMonto(1_290_000, 'USD')).toBe('US$ 1.290.000')
    expect(textoMonto(98_500_000, 'ARS')).toBe('$ 98.500.000')
  })
})
```

  `lib/visitas/encuesta/contacto.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { enmascararTelefono } from './contacto'

describe('enmascararTelefono', () => {
  it('muestra el área y los últimos 4, nunca el número entero', () => {
    expect(enmascararTelefono('+5491158234521')).toBe('11 ••••-4521')
    expect(enmascararTelefono('5492214567890')).toBe('22 ••••-7890')
  })
  it('un número corto o vacío no se inventa', () => {
    expect(enmascararTelefono('4567')).toBeNull()
    expect(enmascararTelefono(null)).toBeNull()
    expect(enmascararTelefono('44652269')).toBe('••••-2269')
  })
})
```

- [ ] **Paso 2: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/opciones.test.ts lib/visitas/encuesta/respuestas.test.ts lib/visitas/encuesta/oferta.test.ts lib/visitas/encuesta/contacto.test.ts`.
  Esperado: FAIL (módulos inexistentes).

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/opciones.ts`**

```ts
/**
 * Opciones de "¿qué te gustó más / menos?" armadas con lo que tiene ESA propiedad (spec §4.8).
 * Sin IA: reglas fijas sobre amenities, cochera, piso, tipo y expensas. Puro y seguro para el
 * navegador. Las claves son globales (el email y la ficha las traducen con ETIQUETA_DE_OPCION).
 */
export interface OpcionEncuesta { clave: string; etiqueta: string }
export interface OpcionesDeLaEncuesta { masGusto: OpcionEncuesta[]; menosGusto: OpcionEncuesta[] }
export interface PropiedadParaOpciones {
  property_type: string | null
  amenities: unknown
  garages: number | null
  floor: number | null
  expensas: number | null
}

export const OTRA = 'otra'
export const NADA = 'nada'
export const MAX_OPCIONES = 8
/** Desde este piso la vista es un argumento de venta. */
const PISO_CON_VISTA = 6

export const ETIQUETA_DE_OPCION: Readonly<Record<string, string>> = {
  ubicacion: 'La ubicación', luz: 'La luz', distribucion: 'La distribución', estado: 'El estado',
  tamano: 'El tamaño', patio_jardin: 'El patio o jardín', balcon_terraza: 'El balcón o terraza',
  cochera: 'La cochera', vista: 'La vista', amenities: 'Los amenities', precio: 'El precio',
  ruido: 'El ruido', expensas: 'Las expensas', nada: 'Nada en especial', otra: 'Otra cosa',
}

export function etiquetaDeOpcion(clave: string): string {
  return ETIQUETA_DE_OPCION[clave] ?? clave
}

/** Sin tildes y en minúsculas: "Balcón" (NFD, como lo pega macOS) tiene que dar "balcon". */
function plano(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function amenitiesPlanos(a: unknown): string[] {
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string').map(plano) : []
}

const ESPACIOS_PROPIOS = /patio|jardin|parque|balcon|terraza|cochera|garage/

export function opcionesDeLaEncuesta(p: PropiedadParaOpciones): OpcionesDeLaEncuesta {
  const ams = amenitiesPlanos(p.amenities)
  const tiene = (re: RegExp) => ams.some(a => re.test(a))
  const tipo = plano(p.property_type ?? '')
  // Orden de prioridad de los extras: si no entran todos (tope de 8), quedan los primeros.
  const extras: string[] = []
  if (tiene(/patio|jardin|parque/) || tipo === 'casa') extras.push('patio_jardin')
  if (tiene(/balcon|terraza/)) extras.push('balcon_terraza')
  if ((p.garages ?? 0) > 0 || tiene(/cochera|garage/)) extras.push('cochera')
  if ((p.floor ?? 0) >= PISO_CON_VISTA) extras.push('vista')
  if (ams.some(a => !ESPACIOS_PROPIOS.test(a))) extras.push('amenities')
  const mas = ['ubicacion', 'luz', 'distribucion', 'estado', 'tamano', ...extras].slice(0, MAX_OPCIONES - 1)
  const menos = ['precio', 'tamano', 'estado', 'ruido', ...((p.expensas ?? 0) > 0 ? ['expensas'] : []), NADA]
  const aOpcion = (clave: string): OpcionEncuesta => ({ clave, etiqueta: etiquetaDeOpcion(clave) })
  return { masGusto: [...mas, OTRA].map(aOpcion), menosGusto: [...menos, OTRA].map(aOpcion) }
}
```

- [ ] **Paso 4: Implementar `lib/visitas/encuesta/respuestas.ts`**

```ts
/**
 * Validación de lo que manda la encuesta pública (spec §4.10): Zod ESTRICTO por paso y para el
 * final, más las reglas que Zod no expresa (etiquetas de ESA propiedad, "Nada en especial" sola,
 * "Otra cosa" con texto). Todo lo que entra por acá lo escribió un desconocido: se valida en el
 * servidor aunque la pantalla ya lo haya validado.
 */
import { z } from 'zod'
import { OPINIONES_PRECIO, type Moneda, type PasoGuardable, type RespuestasEncuesta } from './tipos'
import { MAX_OPCIONES, NADA, OTRA, type OpcionesDeLaEncuesta } from './opciones'
import { primerPasoSinResponder } from './pasos'

export const MAX_TEXTO_LIBRE = 280

/**
 * Los caracteres de control se cambian por espacio recorriendo el texto, no con una regex
 * `[\u0000-\u001F]`: esa regex la marca la regla `no-control-regex` de ESLint.
 */
export function sinControles(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    out += c < 32 || c === 127 ? ' ' : ch
  }
  return out
}

/** NFC (macOS pega NFD), sin caracteres de control, espacios colapsados, con tope. Texto, no HTML. */
export function limpiarTextoLibre(v: string | null | undefined): string {
  return sinControles((v ?? '').normalize('NFC'))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXTO_LIBRE)
}

/** Mismo techo que la ficha (lib/properties/editable-fields.ts): un monto mayor es un error de tipeo. */
export const TECHO_OFERTA: Readonly<Record<Moneda, number>> = { USD: 100_000_000, ARS: 200_000_000_000 }

const etiquetas = z.array(z.string().min(1).max(40)).max(MAX_OPCIONES)

export const cuerpoPatch = z.discriminatedUnion('paso', [
  z.object({ paso: z.literal('abierta') }).strict(),
  z.object({ paso: z.literal('gusto'), valor: z.boolean() }).strict(),
  z.object({ paso: z.literal('mas_gusto'), etiquetas, otra: z.string().max(1000).nullish() }).strict(),
  z.object({ paso: z.literal('menos_gusto'), etiquetas, otra: z.string().max(1000).nullish() }).strict(),
  z.object({ paso: z.literal('precio'), valor: z.enum(OPINIONES_PRECIO) }).strict(),
  z.object({ paso: z.literal('oferta'), monto: z.number().int().positive().nullable(), declina: z.boolean() }).strict(),
])
export type CuerpoPatch = z.infer<typeof cuerpoPatch>
export type CuerpoRespuesta = Exclude<CuerpoPatch, { paso: 'abierta' }>

export type PatchPaso = Partial<RespuestasEncuesta> & { last_step: PasoGuardable }
type Resultado = { ok: true; patch: PatchPaso } | { ok: false; error: string }

function validarEtiquetas(
  tags: readonly string[], otra: string | null | undefined, permitidas: readonly { clave: string }[],
): { ok: true; tags: string[]; otra: string | null } | { ok: false; error: string } {
  if (tags.length === 0) return { ok: false, error: 'Elegí al menos una opción' }
  const validas = new Set(permitidas.map(o => o.clave))
  if (new Set(tags).size !== tags.length || tags.some(t => !validas.has(t))) return { ok: false, error: 'Elegí una de las opciones' }
  if (tags.includes(NADA) && tags.length > 1) return { ok: false, error: '"Nada en especial" va sola' }
  if (!tags.includes(OTRA)) return { ok: true, tags: [...tags], otra: null }
  const texto = limpiarTextoLibre(otra)
  if (texto.length < 2) return { ok: false, error: 'Contanos qué otra cosa' }
  return { ok: true, tags: [...tags], otra: texto }
}

export function patchDelPaso(c: CuerpoRespuesta, ctx: { opciones: OpcionesDeLaEncuesta; moneda: Moneda }): Resultado {
  switch (c.paso) {
    case 'gusto':
      return { ok: true, patch: { liked: c.valor, last_step: 'gusto' } }
    case 'mas_gusto': {
      const v = validarEtiquetas(c.etiquetas, c.otra, ctx.opciones.masGusto)
      if (!v.ok) return v
      return { ok: true, patch: { most_liked_tags: v.tags, most_liked_other: v.otra, last_step: 'mas_gusto' } }
    }
    case 'menos_gusto': {
      const v = validarEtiquetas(c.etiquetas, c.otra, ctx.opciones.menosGusto)
      if (!v.ok) return v
      return { ok: true, patch: { least_liked_tags: v.tags, least_liked_other: v.otra, last_step: 'menos_gusto' } }
    }
    case 'precio':
      return { ok: true, patch: { price_opinion: c.valor, last_step: 'precio' } }
    case 'oferta': {
      if (c.declina) return { ok: true, patch: { offer_amount: null, offer_currency: null, offer_declined: true, last_step: 'oferta' } }
      if (c.monto === null) return { ok: false, error: 'Escribí un monto o tocá "Prefiero no decirlo"' }
      if (c.monto > TECHO_OFERTA[ctx.moneda]) return { ok: false, error: 'Revisá el monto' }
      return { ok: true, patch: { offer_amount: c.monto, offer_currency: ctx.moneda, offer_declined: false, last_step: 'oferta' } }
    }
  }
}

export const cuerpoFinal = z.object({
  telefono: z.string().max(40).nullish(),
  email: z.string().max(254).nullish(),
  similares: z.boolean(),
  /** Honeypot: invisible para personas; los robots lo llenan. */
  empresa: z.string().max(200).optional(),
}).strict()
export type CuerpoFinal = z.infer<typeof cuerpoFinal>

export interface ContactoFinal {
  contact_phone: string | null
  contact_email: string | null
  wants_similar: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function contactoFinal(
  c: CuerpoFinal,
  telefonoDeLaVisita: string | null,
  normalizar: (v: string | null | undefined) => string | null,
): { ok: true; contacto: ContactoFinal } | { ok: false; error: string } {
  let telefono: string | null
  if (c.telefono?.trim()) {
    telefono = normalizar(c.telefono)
    if (!telefono) return { ok: false, error: 'Revisá tu WhatsApp: no parece un número válido' }
  } else {
    telefono = normalizar(telefonoDeLaVisita)
    if (!telefono) return { ok: false, error: 'Dejanos tu WhatsApp' }
  }
  const email = (c.email ?? '').normalize('NFC').trim().toLowerCase()
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Revisá el email' }
  return { ok: true, contacto: { contact_phone: telefono, contact_email: email || null, wants_similar: c.similares } }
}

export function esHoneypot(c: Pick<CuerpoFinal, 'empresa'>): boolean {
  return !!c.empresa?.trim()
}

/** El primer paso sin responder; `null` = se puede terminar. */
export function faltaParaTerminar(r: RespuestasEncuesta): PasoGuardable | null {
  return primerPasoSinResponder(r)
}
```

- [ ] **Paso 5: Implementar `lib/visitas/encuesta/oferta.ts`**

```ts
/**
 * Atajos de "¿cuánto ofertarías?" (spec §3.6 paso 6) y cómo se escribe un monto. Puro y seguro
 * para el navegador. Sin precio publicado no hay atajos: inventar un ancla sería peor que nada.
 */
import { formatearMiles } from '@/lib/properties/money-input'
import type { Moneda } from './tipos'

export interface AtajoOferta { etiqueta: string; monto: number }

function redondear(monto: number, moneda: Moneda): number {
  const paso = moneda === 'ARS' ? 100_000 : 1_000
  return Math.max(paso, Math.round(monto / paso) * paso)
}

export function atajosDeOferta(precio: number | null, moneda: Moneda): AtajoOferta[] {
  if (precio === null || !Number.isFinite(precio) || precio <= 0) return []
  const lista: AtajoOferta[] = [
    { etiqueta: '−10 %', monto: redondear(precio * 0.9, moneda) },
    { etiqueta: '−5 %', monto: redondear(precio * 0.95, moneda) },
    { etiqueta: 'Precio publicado', monto: redondear(precio, moneda) },
  ]
  const vistos = new Set<number>()
  return lista.filter(a => (vistos.has(a.monto) ? false : (vistos.add(a.monto), true)))
}

export function textoMonto(monto: number, moneda: Moneda): string {
  const n = formatearMiles(String(Math.round(monto)))
  return moneda === 'USD' ? `US$ ${n}` : `$ ${n}`
}
```

- [ ] **Paso 6: Implementar `lib/visitas/encuesta/contacto.ts`**

```ts
/**
 * El teléfono que muestra la página pública: enmascarado ("11 ••••-4521"). Quien tiene el link no
 * tiene por qué ver el número entero (spec §4.10). Puro y seguro para el navegador.
 */
export function enmascararTelefono(t: string | null | undefined): string | null {
  const d = (t ?? '').replace(/\D/g, '')
  if (d.length < 8) return null
  if (d.length < 10) return `••••-${d.slice(-4)}`
  const diez = d.slice(-10)
  return `${diez.slice(0, 2)} ••••-${diez.slice(-4)}`
}
```

- [ ] **Paso 7: Correr y verlos pasar** — el comando del Paso 2. Esperado: PASS. Más `tsc` y
  `npx eslint lib/visitas/encuesta`.

- [ ] **Paso 8: Commit** — `git add lib/visitas/encuesta/opciones.ts lib/visitas/encuesta/opciones.test.ts lib/visitas/encuesta/respuestas.ts lib/visitas/encuesta/respuestas.test.ts lib/visitas/encuesta/oferta.ts lib/visitas/encuesta/oferta.test.ts lib/visitas/encuesta/contacto.ts lib/visitas/encuesta/contacto.test.ts`;
  mensaje `feat(visitas): opciones por propiedad y validación de cada respuesta de la encuesta`.

---

### Tarea 4: Plantillas, decisión de envío y estado visible

**Files:**
- Create: `lib/visitas/encuesta/plantillas.ts` (+`plantillas.test.ts`)
- Create: `lib/visitas/encuesta/envio.ts` (+`envio.test.ts`)
- Create: `lib/visitas/encuesta/estado-envio.ts` (+`estado-envio.test.ts`)

**Interfaces:**
- Consumes: tipos de la Tarea 2; `estaVencida` (Tarea 2); `ultimos10Digitos` de `lib/phone/ultimos-digitos.ts`.
- Produces:
  - `plantillas.ts` (SIN alias `@/`): `IDIOMA_PLANTILLAS = 'es_AR'`, `PLANTILLA_ENCUESTA_V1`,
    `CUERPO_ENCUESTA_V1`, `BOTON_ENCUESTA_V1`, `PLANTILLA_REGALO_V1`, `CUERPO_REGALO_V1`,
    `DefinicionPlantilla`, `PLANTILLAS_ENCUESTA`, `PLANTILLAS_REGALO`,
    `EnvioArmado { templateName; bodyParams: string[]; urlButtonParam: string | null; necesitaDocumento: boolean; bodyText: string }`,
    `cantidadDeVariables`, `rellenar`, `paramSeguro(v, max)`, `nombreDePila(nombre, siNoHay?)`,
    `definicionDe(catalogo, nombre)`, `armarEnvioEncuesta(plantilla, d)`, `armarEnvioRegalo(plantilla, d)`.
  - `envio.ts`: `Normalizador`, `EntradaEnvioEncuesta`, `DecisionEnvio`, `esTelefonoDePrueba(tel, lista)`,
    `decidirEnvioEncuesta(e, normalizar)`, `MotivoSinRegalo`, `DecisionRegalo`,
    `decidirRegaloPorWhatsapp(e, normalizar)`.
  - `estado-envio.ts`: `ClaveEstadoEncuesta`, `EstadoEncuestaVisible { clave; texto }`,
    `TEXTO_MOTIVO_OMISION`, `motivoLegibleDeMeta(codigo, mensaje)`,
    `estadoVisibleDeLaEncuesta(e, wa, ahora)`.

- [ ] **Paso 1: Tests** — `lib/visitas/encuesta/plantillas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  PLANTILLAS_ENCUESTA, PLANTILLAS_REGALO, CUERPO_ENCUESTA_V1, CUERPO_REGALO_V1, BOTON_ENCUESTA_V1,
  cantidadDeVariables, armarEnvioEncuesta, armarEnvioRegalo, nombreDePila, paramSeguro,
} from './plantillas'

const TOKEN = 'Ab3xK9pQ2rTz8LmN4vWq1Y'

describe('catálogo de plantillas', () => {
  it('cada definición declara exactamente las variables de su cuerpo', () => {
    for (const d of [...Object.values(PLANTILLAS_ENCUESTA), ...Object.values(PLANTILLAS_REGALO)]) {
      expect(cantidadDeVariables(d.cuerpo)).toBe(d.variables)
    }
  })
  it('sin vocabulario de venta (Meta las reclasifica a MARKETING y deja de entregarlas)', () => {
    for (const cuerpo of [CUERPO_ENCUESTA_V1, CUERPO_REGALO_V1]) {
      expect(cuerpo).not.toMatch(/regalo|gratis|gratuit|oferta|descuento|promo|sin costo|sin compromiso/i)
    }
  })
  it('el link también va en el cuerpo (en WhatsApp de computadora el botón no abre)', () => {
    expect(CUERPO_ENCUESTA_V1).toContain('https://inmodf.com.ar/encuesta/{{4}}')
    expect(BOTON_ENCUESTA_V1.url).toBe('https://inmodf.com.ar/encuesta/{{1}}')
    expect(BOTON_ENCUESTA_V1.texto.length).toBeLessThanOrEqual(25)
  })
})

describe('armarEnvioEncuesta', () => {
  it('cuatro datos, el botón lleva el token y el texto guardado es el que recibe la persona', () => {
    const e = armarEnvioEncuesta('encuesta_visita_v1', { nombre: 'Mariana Gómez', direccion: 'Doblas 248', fecha: '14/10', token: TOKEN })
    expect(e).toEqual({
      templateName: 'encuesta_visita_v1',
      bodyParams: ['Mariana', 'Doblas 248', '14/10', TOKEN],
      urlButtonParam: TOKEN,
      necesitaDocumento: false,
      bodyText: `Hola Mariana. Registramos tu visita a Doblas 248 del 14/10. Para completar la ficha de la visita, entrá acá: https://inmodf.com.ar/encuesta/${TOKEN}`,
    })
  })
  it('una plantilla que no está en el catálogo no se arma (no se adivinan datos ni botón)', () => {
    expect(armarEnvioEncuesta('encuesta_visita_v2', { nombre: 'A', direccion: 'B', fecha: '1/1', token: TOKEN })).toBeNull()
    expect(armarEnvioEncuesta('constructor', { nombre: 'A', direccion: 'B', fecha: '1/1', token: TOKEN })).toBeNull()
    expect(armarEnvioEncuesta(null, { nombre: 'A', direccion: 'B', fecha: '1/1', token: TOKEN })).toBeNull()
  })
  it('sin dirección dice "la propiedad"; datos sin saltos de línea (Meta los rechaza)', () => {
    const e = armarEnvioEncuesta('encuesta_visita_v1', { nombre: null, direccion: 'Av.\nCorrientes\t 1500', fecha: '14/10', token: TOKEN })
    expect(e?.bodyParams.slice(0, 2)).toEqual(['de nuevo', 'Av. Corrientes 1500'])
    expect(armarEnvioEncuesta('encuesta_visita_v1', { nombre: 'A', direccion: '  ', fecha: '14/10', token: TOKEN })?.bodyParams[1]).toBe('la propiedad')
  })
})

describe('armarEnvioRegalo', () => {
  it('dos datos, sin botón y con documento obligatorio', () => {
    expect(armarEnvioRegalo('regalo_visita_v1', { nombre: 'Mariana', direccion: 'Doblas 248' })).toEqual({
      templateName: 'regalo_visita_v1',
      bodyParams: ['Mariana', 'Doblas 248'],
      urlButtonParam: null,
      necesitaDocumento: true,
      bodyText: 'Hola Mariana. Acá tenés el material de Doblas 248 que pediste.',
    })
  })
})

describe('nombreDePila y paramSeguro', () => {
  it('NFD → NFC y solo el primer nombre', () => {
    expect(nombreDePila('María José Pérez')).toBe('María')
    expect(nombreDePila('   ')).toBe('de nuevo')
    expect(nombreDePila('', '')).toBe('')
  })
  it('tope de largo sin cortar en un espacio', () => {
    expect(paramSeguro('a '.repeat(100), 9)).toBe('a a a a a')
  })
})
```

  `lib/visitas/encuesta/envio.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decidirEnvioEncuesta, decidirRegaloPorWhatsapp, esTelefonoDePrueba, type EntradaEnvioEncuesta } from './envio'
import { AJUSTES_PRUEBA } from './envio.test-datos'

const normalizar = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length >= 10 ? `549${d.slice(-10)}` : null
}
const base: EntradaEnvioEncuesta = {
  ajustes: { ...AJUSTES_PRUEBA, envio_automatico: true }, tieneRegalo: true, telefono: '+5491158234521',
  plantilla: 'encuesta_visita_v1', yaEnviada: false, reenvio: false, completada: false, vencida: false,
}

describe('decidirEnvioEncuesta (adenda §11.4, en ese orden)', () => {
  it('todo en orden: manda', () => {
    expect(decidirEnvioEncuesta(base, normalizar)).toEqual({ enviar: true, telefono: '5491158234521', esPrueba: false })
  })
  it.each([
    ['ajustes ilegibles', { ajustes: null }, 'ajustes_ilegibles'],
    ['ya respondida', { completada: true }, 'ya_respondio'],
    ['vencida', { vencida: true }, 'vencida'],
    ['teléfono inválido', { telefono: '123' }, 'telefono_invalido'],
    ['sin teléfono', { telefono: null }, 'telefono_invalido'],
    ['envío apagado', { ajustes: { ...AJUSTES_PRUEBA, envio_automatico: false } }, 'envio_apagado'],
    ['sin regalo con "solo con regalo"', { tieneRegalo: false }, 'sin_regalo'],
    ['sin plantilla', { plantilla: null }, 'plantilla_sin_configurar'],
    ['plantilla desconocida', { plantilla: 'encuesta_visita_v9' }, 'plantilla_desconocida'],
    ['ya enviada', { yaEnviada: true }, 'ya_enviada'],
  ] as const)('%s → no manda', (_n, cambios, motivo) => {
    expect(decidirEnvioEncuesta({ ...base, ...cambios }, normalizar)).toEqual({ enviar: false, motivo })
  })
  it('"solo con regalo" apagado manda aunque no haya regalo', () => {
    const e = { ...base, tieneRegalo: false, ajustes: { ...AJUSTES_PRUEBA, envio_automatico: true, solo_con_regalo: false } }
    expect(decidirEnvioEncuesta(e, normalizar).enviar).toBe(true)
  })
  it('un teléfono de prueba saltea el interruptor y el regalo, pero no la plantilla', () => {
    const prueba = { ...AJUSTES_PRUEBA, envio_automatico: false, telefonos_prueba: ['11 5823-4521'] }
    expect(decidirEnvioEncuesta({ ...base, ajustes: prueba, tieneRegalo: false }, normalizar))
      .toEqual({ enviar: true, telefono: '5491158234521', esPrueba: true })
    expect(decidirEnvioEncuesta({ ...base, ajustes: prueba, plantilla: null }, normalizar))
      .toEqual({ enviar: false, motivo: 'plantilla_sin_configurar' })
  })
  it('un reenvío pedido a mano pasa aunque ya se haya enviado', () => {
    expect(decidirEnvioEncuesta({ ...base, yaEnviada: true, reenvio: true }, normalizar).enviar).toBe(true)
  })
})

describe('esTelefonoDePrueba', () => {
  it('compara por los últimos 10 dígitos (con o sin 9, con o sin +54)', () => {
    expect(esTelefonoDePrueba('5491158234521', ['+54 11 5823-4521'])).toBe(true)
    expect(esTelefonoDePrueba('5491158234521', ['1158234522'])).toBe(false)
    expect(esTelefonoDePrueba('5491158234521', ['', '123'])).toBe(false)
  })
})

describe('decidirRegaloPorWhatsapp', () => {
  const r = { ajustes: { ...AJUSTES_PRUEBA, regalo_por_whatsapp: true }, tieneRegalo: true, telefono: '+5491158234521', plantilla: 'regalo_visita_v1', yaEnviado: false }
  it('todo en orden: manda', () => {
    expect(decidirRegaloPorWhatsapp(r, normalizar)).toEqual({ enviar: true, telefono: '5491158234521', esPrueba: false })
  })
  it.each([
    ['apagado', { ajustes: AJUSTES_PRUEBA }, 'apagado'],
    ['sin regalo', { tieneRegalo: false }, 'sin_regalo'],
    ['sin plantilla', { plantilla: null }, 'plantilla_sin_configurar'],
    ['plantilla de la encuesta en vez de la del regalo', { plantilla: 'encuesta_visita_v1' }, 'plantilla_desconocida'],
    ['ya enviado', { yaEnviado: true }, 'ya_enviado'],
    ['ajustes ilegibles', { ajustes: null }, 'ajustes_ilegibles'],
  ] as const)('%s → no manda', (_n, cambios, motivo) => {
    expect(decidirRegaloPorWhatsapp({ ...r, ...cambios }, normalizar)).toEqual({ enviar: false, motivo })
  })
  it('un teléfono de prueba lo recibe con el interruptor apagado (para probar sin prenderlo para todos)', () => {
    const prueba = { ...AJUSTES_PRUEBA, telefonos_prueba: ['5491158234521'] }
    expect(decidirRegaloPorWhatsapp({ ...r, ajustes: prueba }, normalizar).enviar).toBe(true)
  })
})
```

  Junto al test, `lib/visitas/encuesta/envio.test-datos.ts` (datos compartidos por los tests de envío,
  ajustes y servicio):

```ts
import type { AjustesEncuesta } from './tipos'

/** Los ajustes de fábrica de la migración: todo apagado salvo "solo con regalo". */
export const AJUSTES_PRUEBA: AjustesEncuesta = {
  envio_automatico: false, solo_con_regalo: true, regalo_por_whatsapp: false, telefonos_prueba: [],
}
```

  `lib/visitas/encuesta/estado-envio.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { estadoVisibleDeLaEncuesta, motivoLegibleDeMeta } from './estado-envio'
import { encuestaDePrueba } from '@/test/visitas/encuesta-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
const enviada = encuestaDePrueba({ send_status: 'enviada', sent_at: '2026-10-15T14:00:00Z', wa_message_id: 'wamid.1' })

describe('estadoVisibleDeLaEncuesta (adenda §11.4)', () => {
  it('sin enviar con su motivo', () => {
    expect(estadoVisibleDeLaEncuesta(encuestaDePrueba({ send_status: 'omitida', send_skip_reason: 'envio_apagado' }), null, AHORA))
      .toEqual({ clave: 'sin_enviar', texto: 'Sin enviar (envío apagado)' })
    expect(estadoVisibleDeLaEncuesta(encuestaDePrueba({ send_status: 'omitida', send_skip_reason: 'modo_prueba_whatsapp' }), null, AHORA).texto)
      .toBe('Sin enviar (WhatsApp en modo prueba)')
    expect(estadoVisibleDeLaEncuesta(encuestaDePrueba(), null, AHORA)).toEqual({ clave: 'sin_enviar', texto: 'Sin enviar' })
  })
  it('enviada → entregada → leída según el webhook', () => {
    expect(estadoVisibleDeLaEncuesta(enviada, { status: 'accepted', error_code: null, error_message: null }, AHORA).texto).toBe('Enviada')
    expect(estadoVisibleDeLaEncuesta(enviada, { status: 'delivered', error_code: null, error_message: null }, AHORA).texto).toBe('Entregada')
    expect(estadoVisibleDeLaEncuesta(enviada, { status: 'read', error_code: null, error_message: null }, AHORA).texto).toBe('Leída')
  })
  it('Meta la rechazó DESPUÉS de aceptarla (webhook "failed"): falla, en castellano', () => {
    expect(estadoVisibleDeLaEncuesta(enviada, { status: 'failed', error_code: '131026', error_message: 'Message undeliverable' }, AHORA))
      .toEqual({ clave: 'fallo', texto: 'Falló: el número no tiene WhatsApp o no puede recibir este mensaje' })
  })
  it('falló al mandar: el motivo guardado', () => {
    expect(estadoVisibleDeLaEncuesta(encuestaDePrueba({ send_status: 'fallida', send_error: 'la plantilla no existe o todavía no está aprobada' }), null, AHORA).texto)
      .toBe('Falló: la plantilla no existe o todavía no está aprobada')
  })
  it('abierta y respondida mandan sobre el envío; vencida sin responder lo dice', () => {
    expect(estadoVisibleDeLaEncuesta({ ...enviada, opened_at: '2026-10-15T14:30:00Z' }, null, AHORA).clave).toBe('abierta')
    expect(estadoVisibleDeLaEncuesta({ ...enviada, completed_at: '2026-10-15T14:40:00Z' }, null, AHORA).clave).toBe('respondida')
    expect(estadoVisibleDeLaEncuesta({ ...enviada, expires_at: '2026-10-01T00:00:00Z' }, null, AHORA))
      .toEqual({ clave: 'vencida', texto: 'Venció sin respuesta' })
  })
})

describe('motivoLegibleDeMeta', () => {
  it.each([
    ['131047', null, 'pasaron más de 24 h desde el último mensaje de la persona'],
    [131008, null, 'faltó un dato de la plantilla'],
    ['132001', null, 'la plantilla no existe o todavía no está aprobada'],
    [null, 'The operation was aborted due to timeout', 'WhatsApp no respondió a tiempo'],
    ['999', 'algo raro', 'WhatsApp rechazó el mensaje (código 999)'],
    [null, null, 'WhatsApp rechazó el mensaje'],
  ])('%s / %s', (codigo, mensaje, esperado) => {
    expect(motivoLegibleDeMeta(codigo, mensaje)).toBe(esperado)
  })
})
```

- [ ] **Paso 2: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/plantillas.test.ts lib/visitas/encuesta/envio.test.ts lib/visitas/encuesta/estado-envio.test.ts`.
  Esperado: FAIL (módulos inexistentes).

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/plantillas.ts`**

```ts
/**
 * Las dos plantillas de WhatsApp de la encuesta (spec §11.8), con el cuerpo en UN solo lugar: lo
 * usan el envío y el script que las crea en Meta (scripts/create-whatsapp-templates-encuesta-visita.ts).
 * Si el texto aprobado y el que se manda divergen, el Inbox muestra un mensaje que nadie recibió.
 *
 * Plantilla y botón/encabezado se deciden JUNTOS (incidente 2026-09-17): Meta rechaza el mensaje
 * ENTERO si a una plantilla con botón le falta el dato del botón, o si le sobra a una sin botón.
 * Por eso una plantilla configurada que NO está en este catálogo no se manda: sus datos no se adivinan.
 *
 * SIN alias `@/`: el script de creación importa este archivo con una ruta relativa.
 */
export const IDIOMA_PLANTILLAS = 'es_AR'

export const PLANTILLA_ENCUESTA_V1 = 'encuesta_visita_v1'
/** {{1}} nombre de pila · {{2}} dirección · {{3}} fecha (dd/mm) · {{4}} token. Texto aprobado por el dueño (§4.11). */
export const CUERPO_ENCUESTA_V1 =
  'Hola {{1}}. Registramos tu visita a {{2}} del {{3}}. Para completar la ficha de la visita, entrá acá: https://inmodf.com.ar/encuesta/{{4}}'
/** El botón abre en el celular; el link del cuerpo salva a WhatsApp de computadora (verificado 2026-08-03). */
export const BOTON_ENCUESTA_V1 = { texto: 'Completar ficha', url: 'https://inmodf.com.ar/encuesta/{{1}}' } as const

export const PLANTILLA_REGALO_V1 = 'regalo_visita_v1'
/** {{1}} nombre de pila · {{2}} dirección. Encabezado DOCUMENTO (el PDF). Sin "regalo": Meta lo leería como promoción. */
export const CUERPO_REGALO_V1 = 'Hola {{1}}. Acá tenés el material de {{2}} que pediste.'

export interface DefinicionPlantilla {
  nombre: string
  cuerpo: string
  variables: number
  conBoton: boolean
  encabezado: 'document' | null
}

export const PLANTILLAS_ENCUESTA: Readonly<Record<string, DefinicionPlantilla>> = {
  [PLANTILLA_ENCUESTA_V1]: { nombre: PLANTILLA_ENCUESTA_V1, cuerpo: CUERPO_ENCUESTA_V1, variables: 4, conBoton: true, encabezado: null },
}

export const PLANTILLAS_REGALO: Readonly<Record<string, DefinicionPlantilla>> = {
  [PLANTILLA_REGALO_V1]: { nombre: PLANTILLA_REGALO_V1, cuerpo: CUERPO_REGALO_V1, variables: 2, conBoton: false, encabezado: 'document' },
}

export interface EnvioArmado {
  templateName: string
  bodyParams: string[]
  /** Solo si la plantilla declara el botón. */
  urlButtonParam: string | null
  /** La plantilla tiene encabezado de documento: mandarla sin el PDF la hace rechazar entera. */
  necesitaDocumento: boolean
  /** El cuerpo ya armado: es lo que se guarda en whatsapp_messages (lo que la persona leyó). */
  bodyText: string
}

export function cantidadDeVariables(cuerpo: string): number {
  return new Set([...cuerpo.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])).size
}

export function rellenar(cuerpo: string, params: readonly string[]): string {
  return cuerpo.replace(/\{\{(\d+)\}\}/g, (_t, n: string) => params[Number(n) - 1] ?? '')
}

/** Meta rechaza datos con saltos de línea, tabulaciones o muchos espacios seguidos. */
export function paramSeguro(v: string | null | undefined, max: number): string {
  let s = ''
  for (const ch of (v ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 0
    s += c < 32 || c === 127 ? ' ' : ch
  }
  return s.replace(/\s+/g, ' ').trim().slice(0, max).trim()
}

/** Meta tampoco acepta un dato vacío: sin nombre, "Hola de nuevo." se lee bien. */
export function nombreDePila(nombre: string | null | undefined, siNoHay = 'de nuevo'): string {
  return paramSeguro(nombre, 60).split(' ')[0] || siNoHay
}

/** `Object.hasOwn`: un nombre como "constructor" no puede sacar algo del prototipo. */
export function definicionDe(catalogo: Readonly<Record<string, DefinicionPlantilla>>, nombre: string | null): DefinicionPlantilla | null {
  if (!nombre || !Object.hasOwn(catalogo, nombre)) return null
  return catalogo[nombre]
}

export function armarEnvioEncuesta(
  plantilla: string | null,
  d: { nombre: string | null; direccion: string | null; fecha: string; token: string },
): EnvioArmado | null {
  const def = definicionDe(PLANTILLAS_ENCUESTA, plantilla)
  if (!def) return null
  const params = [nombreDePila(d.nombre), paramSeguro(d.direccion, 120) || 'la propiedad', paramSeguro(d.fecha, 10), d.token]
  return {
    templateName: def.nombre,
    bodyParams: params,
    urlButtonParam: def.conBoton ? d.token : null,
    necesitaDocumento: def.encabezado === 'document',
    bodyText: rellenar(def.cuerpo, params),
  }
}

export function armarEnvioRegalo(
  plantilla: string | null,
  d: { nombre: string | null; direccion: string | null },
): EnvioArmado | null {
  const def = definicionDe(PLANTILLAS_REGALO, plantilla)
  if (!def) return null
  const params = [nombreDePila(d.nombre), paramSeguro(d.direccion, 120) || 'la propiedad']
  return {
    templateName: def.nombre,
    bodyParams: params,
    urlButtonParam: null,
    necesitaDocumento: def.encabezado === 'document',
    bodyText: rellenar(def.cuerpo, params),
  }
}
```

- [ ] **Paso 4: Implementar `lib/visitas/encuesta/envio.ts`**

```ts
/**
 * ¿Le mandamos la encuesta (o el regalo) por WhatsApp a esta persona? (adenda §11.4 y §11.8)
 * Puro, con todos los frenos juntos y en orden: primero lo que apaga todo, después lo que falta.
 * Fail-closed: ajustes ilegibles = no. Devuelve SIEMPRE el motivo (se muestra en la ficha).
 *
 * El normalizador entra por parámetro (como en lib/leads/consulta-envio.ts): libphonenumber carga
 * distinto dentro y fuera de Next y no tiene que entrar a los tests de reglas.
 */
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { PLANTILLAS_ENCUESTA, PLANTILLAS_REGALO, definicionDe } from './plantillas'
import type { AjustesEncuesta, MotivoOmision } from './tipos'

export type Normalizador = (v: string | null | undefined) => string | null

/** La lista de prueba compara por últimos 10 dígitos: la gente la carga con y sin 9, con y sin +54. */
export function esTelefonoDePrueba(tel: string, lista: readonly string[]): boolean {
  const n = ultimos10Digitos(tel)
  return n !== null && lista.some(p => ultimos10Digitos(p) === n)
}

export interface EntradaEnvioEncuesta {
  ajustes: AjustesEncuesta | null
  tieneRegalo: boolean
  telefono: string | null
  plantilla: string | null
  yaEnviada: boolean
  reenvio: boolean
  completada: boolean
  vencida: boolean
}

export type DecisionEnvio =
  | { enviar: true; telefono: string; esPrueba: boolean }
  | { enviar: false; motivo: MotivoOmision }

const no = (motivo: MotivoOmision): DecisionEnvio => ({ enviar: false, motivo })

export function decidirEnvioEncuesta(e: EntradaEnvioEncuesta, normalizar: Normalizador): DecisionEnvio {
  if (!e.ajustes) return no('ajustes_ilegibles')
  if (e.completada) return no('ya_respondio')
  if (e.vencida) return no('vencida')
  const telefono = normalizar(e.telefono)
  if (!telefono) return no('telefono_invalido')
  const esPrueba = esTelefonoDePrueba(telefono, e.ajustes.telefonos_prueba)
  if (!esPrueba) {
    if (!e.ajustes.envio_automatico) return no('envio_apagado')
    if (e.ajustes.solo_con_regalo && !e.tieneRegalo) return no('sin_regalo')
  }
  if (!e.plantilla) return no('plantilla_sin_configurar')
  if (!definicionDe(PLANTILLAS_ENCUESTA, e.plantilla)) return no('plantilla_desconocida')
  if (e.yaEnviada && !e.reenvio) return no('ya_enviada')
  return { enviar: true, telefono, esPrueba }
}

export type MotivoSinRegalo =
  | 'ajustes_ilegibles' | 'sin_regalo' | 'telefono_invalido' | 'apagado'
  | 'plantilla_sin_configurar' | 'plantilla_desconocida' | 'ya_enviado'

export type DecisionRegalo =
  | { enviar: true; telefono: string; esPrueba: boolean }
  | { enviar: false; motivo: MotivoSinRegalo }

export function decidirRegaloPorWhatsapp(
  e: { ajustes: AjustesEncuesta | null; tieneRegalo: boolean; telefono: string | null; plantilla: string | null; yaEnviado: boolean },
  normalizar: Normalizador,
): DecisionRegalo {
  const noR = (motivo: MotivoSinRegalo): DecisionRegalo => ({ enviar: false, motivo })
  if (!e.ajustes) return noR('ajustes_ilegibles')
  if (!e.tieneRegalo) return noR('sin_regalo')
  const telefono = normalizar(e.telefono)
  if (!telefono) return noR('telefono_invalido')
  const esPrueba = esTelefonoDePrueba(telefono, e.ajustes.telefonos_prueba)
  if (!esPrueba && !e.ajustes.regalo_por_whatsapp) return noR('apagado')
  if (!e.plantilla) return noR('plantilla_sin_configurar')
  if (!definicionDe(PLANTILLAS_REGALO, e.plantilla)) return noR('plantilla_desconocida')
  if (e.yaEnviado) return noR('ya_enviado')
  return { enviar: true, telefono, esPrueba }
}
```

- [ ] **Paso 5: Implementar `lib/visitas/encuesta/estado-envio.ts`**

```ts
/**
 * Lo que dice la ficha de la visita sobre la encuesta (adenda §11.4), en castellano. Entregada /
 * Leída / Falló-después-de-aceptada salen del estado que el webhook mantiene en whatsapp_messages:
 * no se copian a otra tabla (dos fuentes del mismo dato terminan diciendo cosas distintas).
 * Puro y seguro para el navegador.
 */
import { estaVencida } from './link'
import type { EncuestaFila, EstadoWa, MotivoOmision } from './tipos'

export type ClaveEstadoEncuesta = 'respondida' | 'abierta' | 'vencida' | 'leida' | 'entregada' | 'enviada' | 'fallo' | 'sin_enviar'
export interface EstadoEncuestaVisible { clave: ClaveEstadoEncuesta; texto: string }

export const TEXTO_MOTIVO_OMISION: Readonly<Record<MotivoOmision, string>> = {
  envio_apagado: 'envío apagado',
  sin_regalo: 'la propiedad no tiene regalo',
  telefono_invalido: 'el teléfono no es un WhatsApp válido',
  plantilla_sin_configurar: 'falta configurar la plantilla',
  plantilla_desconocida: 'la plantilla configurada no es una de las conocidas',
  ajustes_ilegibles: 'no se pudieron leer los ajustes',
  modo_prueba_whatsapp: 'WhatsApp en modo prueba',
  ya_respondio: 'ya respondió',
  vencida: 'el link venció',
  ya_enviada: 'ya se había enviado',
}

/** Códigos de Meta que ya vimos en este proyecto (CLAUDE.md § WhatsApp), en palabras del equipo. */
const MOTIVOS_META: Readonly<Record<string, string>> = {
  '131026': 'el número no tiene WhatsApp o no puede recibir este mensaje',
  '131047': 'pasaron más de 24 h desde el último mensaje de la persona',
  '131049': 'Meta no lo entregó para no saturar a la persona con mensajes de empresas',
  '131050': 'la persona pidió no recibir mensajes de empresas',
  '131008': 'faltó un dato de la plantilla',
  '132000': 'la cantidad de datos no coincide con la plantilla',
  '132001': 'la plantilla no existe o todavía no está aprobada',
  '131056': 'demasiados mensajes seguidos a ese número',
  '130429': 'se llegó al límite de mensajes por segundo',
  '131048': 'se llegó al límite de mensajes de la cuenta',
  '80007': 'se llegó al límite de la cuenta de WhatsApp',
}

export function motivoLegibleDeMeta(codigo: string | number | null | undefined, mensaje: string | null | undefined): string {
  const c = codigo === null || codigo === undefined ? '' : String(codigo)
  if (c && Object.hasOwn(MOTIVOS_META, c)) return MOTIVOS_META[c]
  if (/abort|timeout/i.test(mensaje ?? '')) return 'WhatsApp no respondió a tiempo'
  if (c) return `WhatsApp rechazó el mensaje (código ${c})`
  return 'WhatsApp rechazó el mensaje'
}

export function estadoVisibleDeLaEncuesta(
  e: Pick<EncuestaFila, 'completed_at' | 'opened_at' | 'expires_at' | 'send_status' | 'send_skip_reason' | 'send_error'>,
  wa: EstadoWa | null,
  ahora: Date,
): EstadoEncuestaVisible {
  if (e.completed_at) return { clave: 'respondida', texto: 'Respondida' }
  if (e.opened_at) return { clave: 'abierta', texto: 'Abierta' }
  if (estaVencida(e.expires_at, ahora)) return { clave: 'vencida', texto: 'Venció sin respuesta' }
  switch (e.send_status) {
    case 'enviada':
      if (wa?.status === 'failed') return { clave: 'fallo', texto: `Falló: ${motivoLegibleDeMeta(wa.error_code, wa.error_message)}` }
      if (wa?.status === 'read') return { clave: 'leida', texto: 'Leída' }
      if (wa?.status === 'delivered') return { clave: 'entregada', texto: 'Entregada' }
      return { clave: 'enviada', texto: 'Enviada' }
    case 'fallida':
      return { clave: 'fallo', texto: `Falló: ${e.send_error ?? 'WhatsApp rechazó el mensaje'}` }
    case 'omitida':
      return { clave: 'sin_enviar', texto: e.send_skip_reason ? `Sin enviar (${TEXTO_MOTIVO_OMISION[e.send_skip_reason]})` : 'Sin enviar' }
    case 'sin_enviar':
      return { clave: 'sin_enviar', texto: 'Sin enviar' }
  }
}
```

- [ ] **Paso 6: Correr y verlos pasar** — el comando del Paso 2. Esperado: PASS. Más `tsc` y
  `npx eslint lib/visitas/encuesta`.

- [ ] **Paso 7: Commit** — `git add lib/visitas/encuesta/plantillas.ts lib/visitas/encuesta/plantillas.test.ts lib/visitas/encuesta/envio.ts lib/visitas/encuesta/envio.test.ts lib/visitas/encuesta/envio.test-datos.ts lib/visitas/encuesta/estado-envio.ts lib/visitas/encuesta/estado-envio.test.ts`;
  mensaje `feat(visitas): plantillas, decisión de envío (fail-closed) y estado visible de la encuesta`.

---

### Tarea 5: Reglas del regalo y armado de la página pública

**Files:**
- Create: `lib/visitas/encuesta/regalo.ts` (+`regalo.test.ts`)
- Create: `lib/visitas/encuesta/publica.ts` (+`publica.test.ts`)

**Interfaces:**
- Consumes: Tareas 2–4 (`opcionesDeLaEncuesta`, `nombreDePila`, `enmascararTelefono`,
  `pasoParaRetomar`, `estaVencida`, `monedaDe`).
- Produces:
  - `regalo.ts`: `BUCKET_REGALOS = 'visit-survey-gifts'`, `MAX_REGALO_BYTES`, `MAX_PORTADA_BYTES`,
    `EXTENSIONES_PORTADA`, `SEGUNDOS_URL_DESCARGA = 600`, `SEGUNDOS_URL_WHATSAPP = 3600`,
    `SEGUNDOS_URL_PORTADA = 3600`, `MetaArchivo { nombre: string; bytes: number }`,
    `validarArchivoRegalo(m)`, `validarPortada(m)`, `pathDelRegalo(propertyId, uuid)`,
    `pathDePortada(propertyId, uuid, nombreArchivo)`, `esPathDelRegalo(path, propertyId)`,
    `esPathDePortada(path, propertyId)`, `nombreDeDescarga(nombre)`, `validarTitulo(t)`,
    `RegaloVista { titulo; archivoNombre; archivoBytes; archivoPath; portadaPath: string | null; portadaUrl: string | null; descargaUrl: string | null }`.
  - `publica.ts`: `HOSTS_EXACTOS`, `SUFIJOS_DE_HOSTS`, `fotoParaEncuesta(photos)`, `EncuestaPublica`,
    `ResultadoEncuestaPublica`, `ExtraPublica`, `armarEncuestaPublica(ec, extra)`,
    `urlDescargaDelRegalo(token)`, `opcionesDeLaPropiedad(p: PropiedadDeEncuesta | null)`.

- [ ] **Paso 1: Tests** — `lib/visitas/encuesta/regalo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  validarArchivoRegalo, validarPortada, pathDelRegalo, pathDePortada, esPathDelRegalo, esPathDePortada,
  nombreDeDescarga, validarTitulo, MAX_REGALO_BYTES,
} from './regalo'

const PROP = '33333333-3333-4333-8333-333333333333'
const OTRA = '77777777-7777-4777-8777-777777777777'
const UUID = '11111111-1111-4111-8111-111111111111'

describe('archivo y portada', () => {
  it('solo PDF de hasta 20 MB', () => {
    expect(validarArchivoRegalo({ nombre: 'Guía.PDF', bytes: 1000 })).toBeNull()
    expect(validarArchivoRegalo({ nombre: 'guia.docx', bytes: 1000 })).toBe('El regalo tiene que ser un PDF')
    expect(validarArchivoRegalo({ nombre: 'guia.pdf', bytes: 0 })).toBe('El archivo está vacío')
    expect(validarArchivoRegalo({ nombre: 'guia.pdf', bytes: MAX_REGALO_BYTES + 1 })).toBe('El PDF supera los 20 MB')
  })
  it('portada JPG/PNG/WEBP de hasta 5 MB', () => {
    expect(validarPortada({ nombre: 'tapa.jpeg', bytes: 100 })).toBeNull()
    expect(validarPortada({ nombre: 'tapa.gif', bytes: 100 })).toBe('La portada tiene que ser JPG, PNG o WEBP')
    expect(validarPortada({ nombre: 'tapa.png', bytes: 6 * 1024 * 1024 })).toBe('La portada supera los 5 MB')
  })
})

describe('paths atados a la propiedad', () => {
  it('se arman con un uuid y la extensión normalizada (jpeg → jpg)', () => {
    expect(pathDelRegalo(PROP, UUID)).toBe(`properties/${PROP}/regalo-${UUID}.pdf`)
    expect(pathDePortada(PROP, UUID, 'Tapa.JPEG')).toBe(`properties/${PROP}/portada-${UUID}.jpg`)
  })
  it('solo los de ESTA propiedad, con forma exacta (nada de startsWith)', () => {
    expect(esPathDelRegalo(pathDelRegalo(PROP, UUID), PROP)).toBe(true)
    expect(esPathDelRegalo(pathDelRegalo(OTRA, UUID), PROP)).toBe(false)
    expect(esPathDelRegalo(`properties/${PROP}/regalo-${UUID}.pdf/../../x`, PROP)).toBe(false)
    expect(esPathDelRegalo(`properties/${PROP}/photos/${UUID}.pdf`, PROP)).toBe(false)
    expect(esPathDelRegalo(pathDelRegalo(PROP, UUID), 'no-es-uuid')).toBe(false)
    expect(esPathDePortada(pathDePortada(PROP, UUID, 'a.webp'), PROP)).toBe(true)
    expect(esPathDePortada(pathDelRegalo(PROP, UUID), PROP)).toBe(false)
  })
})

describe('nombreDeDescarga y validarTitulo', () => {
  it('nombre seguro, con .pdf, sin rutas ni comillas', () => {
    expect(nombreDeDescarga('Guía del barrio "Caballito".pdf')).toBe('Guía del barrio Caballito.pdf')
    expect(nombreDeDescarga('../../etc/passwd')).toBe('etcpasswd.pdf')
    expect(nombreDeDescarga('   ')).toBe('regalo.pdf')
  })
  it('título de 3 a 120 caracteres, en NFC y sin saltos', () => {
    expect(validarTitulo('Guía\ndel barrio')).toEqual({ ok: true, titulo: 'Guía del barrio' })
    expect(validarTitulo('ab')).toEqual({ ok: false, error: 'El título tiene que tener entre 3 y 120 caracteres' })
    expect(validarTitulo(42)).toEqual({ ok: false, error: 'El título tiene que tener entre 3 y 120 caracteres' })
  })
})
```

  `lib/visitas/encuesta/publica.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { armarEncuestaPublica, fotoParaEncuesta, HOSTS_EXACTOS, SUFIJOS_DE_HOSTS } from './publica'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
const extra = { regalo: null, regaloPorWhatsapp: false, ahora: AHORA }

describe('fotoParaEncuesta', () => {
  it('la primera https de un host que next/image acepta', () => {
    expect(fotoParaEncuesta(['data:image/png;base64,xx', 'http://img.zonaprop.com.ar/a.jpg', 'https://imgar.zonaprop.com.ar/a.jpg']))
      .toBe('https://imgar.zonaprop.com.ar/a.jpg')
  })
  it('compara el host EXACTO (un dominio que solo contiene el nombre no pasa)', () => {
    expect(fotoParaEncuesta(['https://zonaprop.com.ar.evil.com/a.jpg', 'https://evilmlstatic.com/a.jpg'])).toBeNull()
    expect(fotoParaEncuesta('no es lista')).toBeNull()
  })
  it('los hosts permitidos son los de images.remotePatterns de next.config.ts (si no, la foto rompe)', () => {
    const config = readFileSync('next.config.ts', 'utf8')
    for (const h of HOSTS_EXACTOS) expect(config).toContain(`hostname: '${h}'`)
    for (const s of SUFIJOS_DE_HOSTS) expect(config).toContain(`hostname: '**${s}'`)
  })
})

describe('armarEncuestaPublica', () => {
  it('disponible: solo lo necesario, sin apellido, teléfono completo ni email', () => {
    const r = armarEncuestaPublica(encuestaConVisitaDePrueba({ contact_email: 'mariana@mail.com' }), extra)
    expect(r.tipo).toBe('disponible')
    if (r.tipo !== 'disponible') return
    expect(r.encuesta).toMatchObject({
      token: TOKEN_DE_PRUEBA, nombre: 'Mariana', direccion: 'Doblas 248', barrio: 'Caballito',
      precio: 150000, moneda: 'USD', telefonoEnmascarado: '11 ••••-4521', pasoInicial: 'bienvenida',
      completa: false, regalo: null, regaloPorWhatsapp: false,
    })
    const json = JSON.stringify(r)
    expect(json).not.toContain('Gómez')
    expect(json).not.toContain('58234521')
    expect(json).not.toContain('mariana@mail.com')
    expect(json).not.toContain('22222222-2222-4222-8222-222222222222')
  })
  it('retoma donde quedó (criterio 21)', () => {
    const r = armarEncuestaPublica(encuestaConVisitaDePrueba({ liked: true, most_liked_tags: ['luz'] }), extra)
    expect(r.tipo === 'disponible' && r.encuesta.pasoInicial).toBe('menos_gusto')
  })
  it('link inexistente o visita reabierta → no disponible; vencido → vencida', () => {
    expect(armarEncuestaPublica(null, extra)).toEqual({ tipo: 'no_disponible' })
    expect(armarEncuestaPublica(encuestaConVisitaDePrueba({}, { status: 'scheduled' }), extra)).toEqual({ tipo: 'no_disponible' })
    expect(armarEncuestaPublica(encuestaConVisitaDePrueba({ expires_at: '2026-10-01T00:00:00Z' }), extra)).toEqual({ tipo: 'vencida' })
  })
  it('terminada: gracias aunque el link ya haya vencido (lo ganado no se quita)', () => {
    const r = armarEncuestaPublica(encuestaConVisitaDePrueba({ completed_at: '2026-10-02T00:00:00Z', expires_at: '2026-10-01T00:00:00Z', contact_email: 'a@b.co' }), extra)
    expect(r.tipo === 'disponible' && r.encuesta).toMatchObject({ completa: true, pasoInicial: 'gracias', emailDejado: true })
  })
  it('sin precio publicado no inventa uno; ARS se respeta; sin propiedad no rompe', () => {
    // `!`: el constructor de pruebas SIEMPRE arma la propiedad; una guarda acá no probaría nada.
    const sinPrecio = armarEncuestaPublica(encuestaConVisitaDePrueba({}, { propiedad: { ...encuestaConVisitaDePrueba().visita.propiedad!, asking_price: 0, currency: 'ARS' } }), extra)
    expect(sinPrecio.tipo === 'disponible' && sinPrecio.encuesta).toMatchObject({ precio: null, moneda: 'ARS' })
    const sinProp = armarEncuestaPublica(encuestaConVisitaDePrueba({}, { propiedad: null }), extra)
    expect(sinProp.tipo === 'disponible' && sinProp.encuesta.direccion).toBe('la propiedad')
  })
  it('el regalo y la promesa de WhatsApp vienen de afuera, tal cual', () => {
    const r = armarEncuestaPublica(encuestaConVisitaDePrueba(), { regalo: { titulo: 'Guía de Caballito', portada: null }, regaloPorWhatsapp: true, ahora: AHORA })
    expect(r.tipo === 'disponible' && r.encuesta).toMatchObject({ regalo: { titulo: 'Guía de Caballito', portada: null }, regaloPorWhatsapp: true })
  })
})
```

- [ ] **Paso 2: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/regalo.test.ts lib/visitas/encuesta/publica.test.ts`.
  Esperado: FAIL (módulos inexistentes).

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/regalo.ts`**

```ts
/**
 * Reglas del regalo de la encuesta (adenda §11.2): un PDF por propiedad, con título y portada
 * opcional, en el bucket PRIVADO `visit-survey-gifts`. Puro y seguro para el navegador (lo usa la
 * pantalla para validar antes de subir y la ruta para revalidar).
 *
 * Los paths se validan con regex EXACTA atada al property_id: un `startsWith` sobre texto que manda
 * el navegador deja pasar "properties/<id>/regalo-x.pdf/../../otra-cosa". La base tiene el mismo
 * CHECK (property_survey_gifts_file_path_check): se tocan juntos.
 */
export const BUCKET_REGALOS = 'visit-survey-gifts'
export const MAX_REGALO_BYTES = 20 * 1024 * 1024
export const MAX_PORTADA_BYTES = 5 * 1024 * 1024
export const EXTENSIONES_PORTADA = ['jpg', 'jpeg', 'png', 'webp'] as const
/** La descarga de la persona: corta, se pide de nuevo cada vez que toca el botón. */
export const SEGUNDOS_URL_DESCARGA = 600
/** Meta descarga el PDF del encabezado cuando procesa el mensaje: le damos una hora. */
export const SEGUNDOS_URL_WHATSAPP = 3600
export const SEGUNDOS_URL_PORTADA = 3600

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UUID_RE = new RegExp(`^${UUID}$`)

export interface MetaArchivo { nombre: string; bytes: number }

function extension(nombre: string): string {
  return (nombre.split('.').pop() ?? '').toLowerCase()
}

export function validarArchivoRegalo(m: MetaArchivo): string | null {
  if (extension(m.nombre) !== 'pdf') return 'El regalo tiene que ser un PDF'
  if (!Number.isFinite(m.bytes) || m.bytes <= 0) return 'El archivo está vacío'
  if (m.bytes > MAX_REGALO_BYTES) return 'El PDF supera los 20 MB'
  return null
}

export function validarPortada(m: MetaArchivo): string | null {
  if (!(EXTENSIONES_PORTADA as readonly string[]).includes(extension(m.nombre))) return 'La portada tiene que ser JPG, PNG o WEBP'
  if (!Number.isFinite(m.bytes) || m.bytes <= 0) return 'La portada está vacía'
  if (m.bytes > MAX_PORTADA_BYTES) return 'La portada supera los 5 MB'
  return null
}

export function pathDelRegalo(propertyId: string, uuid: string): string {
  return `properties/${propertyId}/regalo-${uuid}.pdf`
}

export function pathDePortada(propertyId: string, uuid: string, nombreArchivo: string): string {
  const ext = extension(nombreArchivo) === 'jpeg' ? 'jpg' : extension(nombreArchivo)
  return `properties/${propertyId}/portada-${uuid}.${ext}`
}

export function esPathDelRegalo(path: string, propertyId: string): boolean {
  if (!UUID_RE.test(propertyId)) return false
  return new RegExp(`^properties/${propertyId}/regalo-${UUID}\\.pdf$`).test(path)
}

export function esPathDePortada(path: string, propertyId: string): boolean {
  if (!UUID_RE.test(propertyId)) return false
  return new RegExp(`^properties/${propertyId}/portada-${UUID}\\.(jpg|png|webp)$`).test(path)
}

/** El nombre con que se baja el archivo: sin rutas, comillas ni caracteres raros; siempre .pdf. */
export function nombreDeDescarga(nombre: string): string {
  const base = nombre.normalize('NFC').replace(/\.pdf$/i, '').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/\.{2,}/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)
  return `${base || 'regalo'}.pdf`
}

export function validarTitulo(t: unknown): { ok: true; titulo: string } | { ok: false; error: string } {
  const error = 'El título tiene que tener entre 3 y 120 caracteres'
  if (typeof t !== 'string') return { ok: false, error }
  let limpio = ''
  for (const ch of t.normalize('NFC')) {
    const c = ch.codePointAt(0) ?? 0
    limpio += c < 32 || c === 127 ? ' ' : ch
  }
  const titulo = limpio.replace(/\s+/g, ' ').trim()
  if (titulo.length < 3 || titulo.length > 120) return { ok: false, error }
  return { ok: true, titulo }
}

/** Lo que la ruta de la ficha devuelve del regalo (con URLs firmadas de vida corta). */
export interface RegaloVista {
  titulo: string
  archivoNombre: string
  archivoBytes: number
  archivoPath: string
  portadaPath: string | null
  portadaUrl: string | null
  descargaUrl: string | null
}
```

  (Ojo con `nombreDeDescarga('../../etc/passwd')`: saca `/`, los `..` y queda `etcpasswd` → el test
  lo fija.)

- [ ] **Paso 4: Implementar `lib/visitas/encuesta/publica.ts`**

```ts
/**
 * Lo que recibe la página pública de la encuesta (spec §4.10 + adenda §11.3): SOLO nombre de pila,
 * dirección/barrio, una foto, precio y el teléfono enmascarado. Nunca apellido, email, teléfono
 * entero, asesor ni datos de otros visitantes. Puro: se testea qué SALE, no cómo se lee.
 */
import { opcionesDeLaEncuesta, type OpcionesDeLaEncuesta } from './opciones'
import { nombreDePila } from './plantillas'
import { enmascararTelefono } from './contacto'
import { pasoParaRetomar } from './pasos'
import { estaVencida } from './link'
import { monedaDe, type EncuestaConVisita, type Moneda, type PasoEncuesta, type PropiedadDeEncuesta, type RespuestasEncuesta } from './tipos'

/** Las opciones de ESA propiedad. Las usan la página (para mostrar) y la ruta (para validar). */
export function opcionesDeLaPropiedad(p: PropiedadDeEncuesta | null): OpcionesDeLaEncuesta {
  return opcionesDeLaEncuesta({
    property_type: p?.property_type ?? null, amenities: p?.amenities ?? [], garages: p?.garages ?? null,
    floor: p?.floor ?? null, expensas: p?.expensas ?? null,
  })
}

/**
 * MISMA lista que `images.remotePatterns` de next.config.ts (hay un test que las compara):
 * next/image rechaza cualquier otro host y la bienvenida quedaría con una imagen rota.
 */
export const HOSTS_EXACTOS = ['mncsnastmcjdjxrehdep.supabase.co'] as const
export const SUFIJOS_DE_HOSTS = ['.zonaprop.com.ar', '.naventcdn.com', '.argenprop.com', '.mlstatic.com'] as const

/** Host comparado EXACTO o por sufijo con punto: nunca `includes` (zonaprop.com.ar.evil.com). */
export function fotoParaEncuesta(photos: unknown): string | null {
  if (!Array.isArray(photos)) return null
  for (const f of photos) {
    if (typeof f !== 'string') continue
    let url: URL
    try { url = new URL(f) } catch { continue }
    if (url.protocol !== 'https:') continue
    const h = url.hostname
    if ((HOSTS_EXACTOS as readonly string[]).includes(h) || SUFIJOS_DE_HOSTS.some(s => h.endsWith(s))) return f
  }
  return null
}

export interface EncuestaPublica {
  token: string
  /** Nombre de pila; '' si no hay (la pantalla saluda sin nombre). */
  nombre: string
  direccion: string
  barrio: string | null
  foto: string | null
  precio: number | null
  moneda: Moneda
  telefonoEnmascarado: string | null
  opciones: OpcionesDeLaEncuesta
  regalo: { titulo: string; portada: string | null } | null
  /** La encuesta promete "te lo mandamos por WhatsApp" SOLO si ese envío va a ocurrir. */
  regaloPorWhatsapp: boolean
  emailDejado: boolean
  respuestas: RespuestasEncuesta
  pasoInicial: PasoEncuesta
  completa: boolean
}

export type ResultadoEncuestaPublica =
  | { tipo: 'disponible'; encuesta: EncuestaPublica }
  | { tipo: 'vencida' }
  | { tipo: 'no_disponible' }

export interface ExtraPublica {
  regalo: { titulo: string; portada: string | null } | null
  regaloPorWhatsapp: boolean
  ahora: Date
}

export function urlDescargaDelRegalo(token: string): string {
  return `/api/public/encuesta/${token}/regalo`
}

export function armarEncuestaPublica(ec: EncuestaConVisita | null, x: ExtraPublica): ResultadoEncuestaPublica {
  // Visita reabierta (se marcó "Se realizó" por error): el link deja de servir hasta que se vuelva a marcar.
  if (!ec || ec.visita.status !== 'completed') return { tipo: 'no_disponible' }
  const { encuesta: e, visita: v } = ec
  const completa = e.completed_at !== null
  if (!completa && estaVencida(e.expires_at, x.ahora)) return { tipo: 'vencida' }
  const p = v.propiedad
  const respuestas: RespuestasEncuesta = {
    liked: e.liked, most_liked_tags: e.most_liked_tags, most_liked_other: e.most_liked_other,
    least_liked_tags: e.least_liked_tags, least_liked_other: e.least_liked_other,
    price_opinion: e.price_opinion, offer_amount: e.offer_amount, offer_currency: e.offer_currency,
    offer_declined: e.offer_declined,
  }
  const precio = p?.asking_price && p.asking_price > 0 ? p.asking_price : null
  return {
    tipo: 'disponible',
    encuesta: {
      token: e.token,
      nombre: nombreDePila(v.client_name, ''),
      direccion: p?.address?.trim() || 'la propiedad',
      barrio: p?.neighborhood?.trim() || null,
      foto: fotoParaEncuesta(p?.photos),
      precio,
      moneda: monedaDe(p?.currency),
      telefonoEnmascarado: enmascararTelefono(e.contact_phone ?? v.client_phone),
      opciones: opcionesDeLaPropiedad(p),
      regalo: x.regalo,
      regaloPorWhatsapp: x.regaloPorWhatsapp,
      emailDejado: completa && !!e.contact_email,
      respuestas,
      pasoInicial: pasoParaRetomar(respuestas, completa),
      completa,
    },
  }
}
```

- [ ] **Paso 5: Correr y verlos pasar** — el comando del Paso 2. Esperado: PASS. Más `tsc` y eslint.

- [ ] **Paso 6: Commit** — `git add lib/visitas/encuesta/regalo.ts lib/visitas/encuesta/regalo.test.ts lib/visitas/encuesta/publica.ts lib/visitas/encuesta/publica.test.ts`;
  mensaje `feat(visitas): reglas del regalo por propiedad y lo que ve la persona en la encuesta`.

---

### Tarea 6: Capa de datos de la encuesta (clave de servicio)

**Files:**
- Create: `lib/visitas/encuesta/datos.ts`
- Create: `lib/visitas/encuesta/datos.test.ts`

**Interfaces:**
- Consumes: tipos (Tarea 2), `PatchPaso`/`ContactoFinal` (Tarea 3), `BUCKET_REGALOS` (Tarea 5),
  `esEstadoVisita` de `lib/visitas/transiciones.ts`.
- Produces (todas `async`, todas lanzan con contexto ante un error de la base salvo donde se dice):
  - `leerAjustesEncuesta(): Promise<AjustesEncuesta | null>` (NO lanza: `null` = fail-closed)
  - `guardarAjustesEncuesta(cambios: Partial<AjustesEncuesta>, actorId: string): Promise<AjustesEncuesta>`
  - `leerRegalo(propertyId): Promise<RegaloDeLaPropiedad | null>`
  - `guardarRegalo(r: RegaloNuevo): Promise<void>`; `RegaloNuevo { propertyId; titulo; archivoPath; archivoNombre; archivoBytes; portadaPath: string | null; actorId }`
  - `borrarRegalo(propertyId): Promise<void>`
  - `crearSubidaFirmada(path): Promise<{ signedUrl: string; token: string; path: string }>`
  - `existeArchivo(path): Promise<boolean>`
  - `urlFirmada(path, segundos, descarga?): Promise<string | null>` (NO lanza)
  - `borrarArchivos(paths: string[]): Promise<void>` (NO lanza: best-effort)
  - `asegurarEncuesta(f: { visitId; token; expiresAt; actorId: string | null }): Promise<EncuestaFila>`
  - `leerEncuestaDeVisita(visitId): Promise<EncuestaFila | null>`
  - `leerEncuestaConVisita(por: { token: string } | { id: string } | { visitId: string }): Promise<EncuestaConVisita | null>`
  - `registrarEnvio(id, c: CamposEnvio): Promise<void>`; `CamposEnvio { send_status; send_skip_reason; send_error; sent_at?; sent_to?; wa_message_id? }`
  - `estadoDelMensaje(waMessageId): Promise<EstadoWa | null>` (NO lanza)
  - `MAX_ESCRITURAS_POR_LINK = 200`; `registrarUso(token, tipo: 'abierta' | 'escritura'): Promise<boolean>`
  - `guardarPaso(id, patch: PatchPaso, ahora: Date): Promise<boolean>`
  - `completarEncuesta(id, contacto: ContactoFinal, ahora: Date): Promise<EncuestaFila | null>`
  - `reservarAviso(id, canal: CanalAviso): Promise<boolean>`
  - `cerrarAviso(id, canal, estado: 'enviado' | 'fallido' | 'no_corresponde' | 'pendiente', extra?: { error?: string | null; waMessageId?: string | null; intentos?: number }): Promise<void>`
  - `encuestasConAvisosPendientes(rango: { desde: string; hasta: string }, maxIntentos: number, limite?: number): Promise<string[]>`
  - `marcarRegaloDescargado(id): Promise<void>` (NO lanza)

- [ ] **Paso 1: Test** — `lib/visitas/encuesta/datos.test.ts` (mismo mock por Proxy que
  `lib/visitas/datos-listado.test.ts`, más `rpc` y `storage`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Paso { metodo: string; args: unknown[] }
interface Llamada { tabla: string; pasos: Paso[] }
interface Respuesta { data: unknown; error: { message: string } | null }

const { registro } = vi.hoisted(() => {
  const registro = {
    llamadas: [] as Llamada[],
    responder: (_l: Llamada): Respuesta => ({ data: null, error: null }),
    rpcs: [] as Array<{ nombre: string; args: unknown }>,
    rpcRespuesta: { data: true, error: null } as Respuesta,
    storage: [] as Array<{ bucket: string; metodo: string; args: unknown[] }>,
    storageRespuesta: (_metodo: string): Respuesta => ({ data: { signedUrl: 'https://firmada', token: 'tk', path: 'p' }, error: null }),
  }
  return { registro }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const llamada: Llamada = { tabla, pasos: [] }
      registro.llamadas.push(llamada)
      const cadena: object = new Proxy({}, {
        get(_o, prop) {
          if (prop === 'then') {
            return (ok: (r: Respuesta) => unknown, mal: (e: unknown) => unknown) =>
              Promise.resolve().then(() => registro.responder(llamada)).then(ok, mal)
          }
          return (...args: unknown[]) => { llamada.pasos.push({ metodo: String(prop), args }); return cadena }
        },
      })
      return cadena
    },
    rpc: async (nombre: string, args: unknown) => { registro.rpcs.push({ nombre, args }); return registro.rpcRespuesta },
    storage: {
      from: (bucket: string) => new Proxy({}, {
        get: (_o, metodo) => async (...args: unknown[]) => {
          registro.storage.push({ bucket, metodo: String(metodo), args })
          return registro.storageRespuesta(String(metodo))
        },
      }),
    },
  }),
}))

import * as datos from './datos'
import { encuestaDePrueba } from '@/test/visitas/encuesta-de-prueba'

const pasos = (l: Llamada, metodo: string) => l.pasos.filter(p => p.metodo === metodo).map(p => p.args)
const FILA = encuestaDePrueba()
const AHORA = new Date('2026-10-15T15:00:00Z')

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://falso.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa')
  registro.llamadas = []; registro.rpcs = []; registro.storage = []
  registro.responder = () => ({ data: FILA, error: null })
  registro.rpcRespuesta = { data: true, error: null }
  registro.storageRespuesta = () => ({ data: { signedUrl: 'https://firmada', token: 'tk', path: 'p' }, error: null })
})

describe('ajustes', () => {
  it('lee la fila única', async () => {
    registro.responder = () => ({ data: { envio_automatico: true, solo_con_regalo: false, regalo_por_whatsapp: false, telefonos_prueba: ['5491158234521'] }, error: null })
    expect(await datos.leerAjustesEncuesta()).toEqual({ envio_automatico: true, solo_con_regalo: false, regalo_por_whatsapp: false, telefonos_prueba: ['5491158234521'] })
    expect(pasos(registro.llamadas[0], 'eq')).toEqual([['id', true]])
  })
  it('un error o una fila rara NO lanza: devuelve null (fail-closed)', async () => {
    registro.responder = () => ({ data: null, error: { message: 'boom' } })
    expect(await datos.leerAjustesEncuesta()).toBeNull()
    registro.responder = () => ({ data: { envio_automatico: 'si', solo_con_regalo: true, regalo_por_whatsapp: false, telefonos_prueba: [] }, error: null })
    expect(await datos.leerAjustesEncuesta()).toBeNull()
  })
})

describe('encuesta', () => {
  it('asegurar: upsert que no pisa (UNIQUE visit_id) y relectura', async () => {
    const r = await datos.asegurarEncuesta({ visitId: FILA.visit_id, token: FILA.token, expiresAt: FILA.expires_at, actorId: null })
    expect(pasos(registro.llamadas[0], 'upsert')).toEqual([[
      { visit_id: FILA.visit_id, token: FILA.token, expires_at: FILA.expires_at, created_by: null },
      { onConflict: 'visit_id', ignoreDuplicates: true },
    ]])
    expect(pasos(registro.llamadas[1], 'eq')).toEqual([['visit_id', FILA.visit_id]])
    expect(r.token).toBe(FILA.token)
  })
  it('lee con la visita y la propiedad anidadas, aplanadas campo por campo', async () => {
    registro.responder = () => ({
      data: { ...FILA, visita: { id: FILA.visit_id, property_id: 'p1', client_name: 'Mariana', client_phone: null,
        scheduled_at: '2026-10-14T13:30:00+00:00', status: 'completed', advisor_id: null, lead_id: null,
        propiedad: { id: 'p1', address: 'Doblas 248', neighborhood: null, photos: [], asking_price: '150000', currency: 'USD',
          property_type: 'departamento', amenities: [], garages: 1, floor: 3, expensas: null } } },
      error: null,
    })
    const r = await datos.leerEncuestaConVisita({ token: FILA.token })
    expect(pasos(registro.llamadas[0], 'eq')).toEqual([['token', FILA.token]])
    expect(r?.visita.propiedad?.asking_price).toBe(150000)
    expect(r?.visita.status).toBe('completed')
  })
  it('un estado de envío desconocido falla ruidoso (nunca un dato a medias)', async () => {
    registro.responder = () => ({ data: { ...FILA, send_status: 'mandada' }, error: null })
    await expect(datos.leerEncuestaDeVisita(FILA.visit_id)).rejects.toThrow('estado de envío desconocido')
  })
  it('guardar un paso solo si no está terminada ni vencida', async () => {
    registro.responder = () => ({ data: { id: FILA.id }, error: null })
    expect(await datos.guardarPaso(FILA.id, { liked: true, last_step: 'gusto' }, AHORA)).toBe(true)
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')).toEqual([[{ liked: true, last_step: 'gusto' }]])
    expect(pasos(l, 'is')).toEqual([['completed_at', null]])
    expect(pasos(l, 'gt')).toEqual([['expires_at', AHORA.toISOString()]])
    registro.responder = () => ({ data: null, error: null })
    expect(await datos.guardarPaso(FILA.id, { liked: true, last_step: 'gusto' }, AHORA)).toBe(false)
  })
  it('completar es una reserva atómica (completed_at IS NULL): la segunda vez no devuelve nada', async () => {
    const contacto = { contact_phone: '5491158234521', contact_email: null, wants_similar: true }
    expect((await datos.completarEncuesta(FILA.id, contacto, AHORA))?.id).toBe(FILA.id)
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')).toEqual([[{ ...contacto, completed_at: AHORA.toISOString() }]])
    expect(pasos(l, 'is')).toEqual([['completed_at', null]])
    registro.responder = () => ({ data: null, error: null })
    expect(await datos.completarEncuesta(FILA.id, contacto, AHORA)).toBeNull()
  })
  it('registrarUso llama a la función con el tope', async () => {
    expect(await datos.registrarUso(FILA.token, 'abierta')).toBe(true)
    expect(registro.rpcs).toEqual([{ nombre: 'visit_survey_registrar', args: { p_token: FILA.token, p_tipo: 'abierta', p_max: datos.MAX_ESCRITURAS_POR_LINK } }])
    registro.rpcRespuesta = { data: false, error: null }
    expect(await datos.registrarUso(FILA.token, 'escritura')).toBe(false)
  })
})

describe('avisos', () => {
  it('reservar pasa de pendiente a enviando solo en encuestas terminadas', async () => {
    registro.responder = () => ({ data: { id: FILA.id }, error: null })
    expect(await datos.reservarAviso(FILA.id, 'equipo')).toBe(true)
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')[0][0]).toMatchObject({ team_notice_status: 'enviando' })
    expect(pasos(l, 'eq')).toEqual([['id', FILA.id], ['team_notice_status', 'pendiente']])
    expect(pasos(l, 'not')).toEqual([['completed_at', 'is', null]])
  })
  it('cerrar solo toca una reserva propia (estado enviando)', async () => {
    await datos.cerrarAviso(FILA.id, 'regalo_whatsapp', 'enviado', { waMessageId: 'wamid.9' })
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')).toEqual([[{ gift_whatsapp_status: 'enviado', gift_wa_message_id: 'wamid.9' }]])
    expect(pasos(l, 'eq')).toEqual([['id', FILA.id], ['gift_whatsapp_status', 'enviando']])
  })
  it('pendientes: terminadas en la ventana, con intentos bajo el tope, algún canal pendiente', async () => {
    registro.responder = () => ({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    const ids = await datos.encuestasConAvisosPendientes({ desde: '2026-10-08T15:00:00.000Z', hasta: '2026-10-15T14:58:00.000Z' }, 3)
    const l = registro.llamadas[0]
    expect(ids).toEqual(['a', 'b'])
    expect(pasos(l, 'gte')).toEqual([['completed_at', '2026-10-08T15:00:00.000Z']])
    expect(pasos(l, 'lte')).toEqual([['completed_at', '2026-10-15T14:58:00.000Z']])
    expect(pasos(l, 'lt')).toEqual([['notice_attempts', 3]])
    expect(pasos(l, 'or')).toEqual([['team_notice_status.eq.pendiente,gift_whatsapp_status.eq.pendiente,gift_email_status.eq.pendiente']])
  })
})

describe('Storage', () => {
  it('firma una descarga en el bucket privado con el nombre del archivo', async () => {
    expect(await datos.urlFirmada('properties/x/regalo-y.pdf', 600, 'Guía.pdf')).toBe('https://firmada')
    expect(registro.storage).toEqual([{ bucket: 'visit-survey-gifts', metodo: 'createSignedUrl', args: ['properties/x/regalo-y.pdf', 600, { download: 'Guía.pdf' }] }])
  })
  it('una firma que falla devuelve null (no lanza)', async () => {
    registro.storageRespuesta = () => ({ data: null, error: { message: 'Object not found' } })
    expect(await datos.urlFirmada('x', 60)).toBeNull()
    expect(await datos.existeArchivo('x')).toBe(false)
  })
})
```

- [ ] **Paso 2: Correr y verlo fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/datos.test.ts`.
  Esperado: FAIL (`Cannot find module './datos'`).

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/datos.ts`**

```ts
import 'server-only'
/**
 * Lecturas y escrituras de la encuesta con SERVICE ROLE (adenda §11.5). Sin lógica de negocio: las
 * decisiones están en los módulos puros de esta carpeta y los permisos en las rutas (que los chequean
 * ANTES de llamar acá). Las tablas no tienen políticas de escritura: este archivo es la única puerta.
 *
 * Cliente sin tipar (types/database.types.ts no tiene estas tablas): cada fila se arma campo por
 * campo con guardas. Un valor fuera de catálogo falla ruidoso: nunca un dato a medias.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { esEstadoVisita } from '../transiciones'
import { BUCKET_REGALOS } from './regalo'
import {
  COLUMNAS_DE_CANAL, ESTADOS_AVISO, ESTADOS_ENVIO, MONEDAS, MOTIVOS_OMISION, OPINIONES_PRECIO, PASOS_GUARDABLES,
  type AjustesEncuesta, type CanalAviso, type EncuestaConVisita, type EncuestaFila, type EstadoAviso, type EstadoEnvio,
  type EstadoWa, type MotivoOmision, type PropiedadDeEncuesta, type RegaloDeLaPropiedad,
} from './tipos'
import type { PatchPaso, ContactoFinal } from './respuestas'

function sb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan las credenciales de Supabase en el servidor')
  return createClient(url, key)
}

function fallo(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'error desconocido'}`)
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function booleano(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}
function lista(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
function deCatalogo<T extends string>(v: unknown, catalogo: readonly T[]): T | null {
  return typeof v === 'string' ? catalogo.find(c => c === v) ?? null : null
}
function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

// ───────────────────────────── Ajustes ─────────────────────────────

const SELECT_AJUSTES = 'envio_automatico, solo_con_regalo, regalo_por_whatsapp, telefonos_prueba'

/** NO lanza: ante cualquier problema devuelve null y quien decide lo trata como "apagado". */
export async function leerAjustesEncuesta(): Promise<AjustesEncuesta | null> {
  try {
    const { data, error } = await sb().from('visit_survey_settings').select(SELECT_AJUSTES).eq('id', true).maybeSingle()
    if (error || !data) {
      console.error('[encuesta] no se pudieron leer los ajustes', error?.message ?? 'sin fila')
      return null
    }
    const r = data as Record<string, unknown>
    if (typeof r.envio_automatico !== 'boolean' || typeof r.solo_con_regalo !== 'boolean' || typeof r.regalo_por_whatsapp !== 'boolean') {
      console.error('[encuesta] la fila de ajustes tiene tipos inesperados')
      return null
    }
    return { envio_automatico: r.envio_automatico, solo_con_regalo: r.solo_con_regalo, regalo_por_whatsapp: r.regalo_por_whatsapp, telefonos_prueba: lista(r.telefonos_prueba) }
  } catch (e) {
    console.error('[encuesta] no se pudieron leer los ajustes', e)
    return null
  }
}

export async function guardarAjustesEncuesta(cambios: Partial<AjustesEncuesta>, actorId: string): Promise<AjustesEncuesta> {
  const { error } = await sb().from('visit_survey_settings')
    .update({ ...cambios, updated_at: new Date().toISOString(), updated_by: actorId }).eq('id', true)
  if (error) fallo('guardar ajustes de la encuesta', error)
  const leidos = await leerAjustesEncuesta()
  if (!leidos) throw new Error('guardar ajustes de la encuesta: no se pudieron releer')
  return leidos
}

// ───────────────────────────── Regalo ─────────────────────────────

const SELECT_REGALO = 'property_id, title, file_path, file_name, file_size, cover_path, updated_at'

export async function leerRegalo(propertyId: string): Promise<RegaloDeLaPropiedad | null> {
  const { data, error } = await sb().from('property_survey_gifts').select(SELECT_REGALO).eq('property_id', propertyId).maybeSingle()
  if (error) fallo('leer regalo', error)
  if (!data) return null
  const r = data as Record<string, unknown>
  const titulo = texto(r.title)
  const archivoPath = texto(r.file_path)
  const archivoNombre = texto(r.file_name)
  const archivoBytes = numero(r.file_size)
  if (!titulo || !archivoPath || !archivoNombre || archivoBytes === null) throw new Error('leer regalo: fila incompleta')
  return { propertyId: String(r.property_id), titulo, archivoPath, archivoNombre, archivoBytes, portadaPath: texto(r.cover_path), actualizadoEl: String(r.updated_at) }
}

export interface RegaloNuevo {
  propertyId: string
  titulo: string
  archivoPath: string
  archivoNombre: string
  archivoBytes: number
  portadaPath: string | null
  actorId: string
}

/** `onConflict: 'property_id'`: es la PK (CLAUDE.md: upsert con onConflict ⇒ UNIQUE en la base). */
export async function guardarRegalo(r: RegaloNuevo): Promise<void> {
  const { error } = await sb().from('property_survey_gifts').upsert({
    property_id: r.propertyId, title: r.titulo, file_path: r.archivoPath, file_name: r.archivoNombre,
    file_size: r.archivoBytes, cover_path: r.portadaPath, updated_at: new Date().toISOString(), updated_by: r.actorId,
  }, { onConflict: 'property_id' })
  if (error) fallo('guardar regalo', error)
}

export async function borrarRegalo(propertyId: string): Promise<void> {
  const { error } = await sb().from('property_survey_gifts').delete().eq('property_id', propertyId)
  if (error) fallo('borrar regalo', error)
}

// ───────────────────────────── Storage (bucket privado) ─────────────────────────────

export async function crearSubidaFirmada(path: string): Promise<{ signedUrl: string; token: string; path: string }> {
  const { data, error } = await sb().storage.from(BUCKET_REGALOS).createSignedUploadUrl(path)
  if (error || !data) fallo('preparar la subida', error)
  return { signedUrl: data.signedUrl, token: data.token, path: data.path }
}

export async function existeArchivo(path: string): Promise<boolean> {
  const { data, error } = await sb().storage.from(BUCKET_REGALOS).createSignedUrl(path, 60)
  return !error && !!data?.signedUrl
}

/** NO lanza: sin URL, quien llama responde 503 o deja el canal pendiente. */
export async function urlFirmada(path: string, segundos: number, descarga?: string): Promise<string | null> {
  const { data, error } = await sb().storage.from(BUCKET_REGALOS)
    .createSignedUrl(path, segundos, descarga ? { download: descarga } : undefined)
  if (error || !data?.signedUrl) {
    console.error('[encuesta] no se pudo firmar', path, error?.message ?? 'sin url')
    return null
  }
  return data.signedUrl
}

/** Best-effort: un archivo viejo que no se pudo borrar es costo, no un error para la persona. */
export async function borrarArchivos(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await sb().storage.from(BUCKET_REGALOS).remove(paths)
  if (error) console.error('[encuesta] no se pudieron borrar archivos viejos del regalo', paths, error.message)
}

// ───────────────────────────── Encuesta ─────────────────────────────

const SELECT_ENCUESTA = `id, visit_id, token, expires_at, created_at, updated_at, send_status, send_skip_reason,
  send_error, sent_at, sent_to, wa_message_id, opened_at, open_count, last_step, completed_at, liked,
  most_liked_tags, most_liked_other, least_liked_tags, least_liked_other, price_opinion, offer_amount,
  offer_currency, offer_declined, contact_phone, contact_email, wants_similar, team_notice_status,
  gift_whatsapp_status, gift_email_status, gift_wa_message_id, notice_attempts, notice_error, gift_downloaded_at`

const SELECT_CON_VISITA = `${SELECT_ENCUESTA},
  visita:property_visits!visit_surveys_visit_id_fkey(id, property_id, client_name, client_phone, scheduled_at,
    status, advisor_id, lead_id,
    propiedad:properties(id, address, neighborhood, photos, asking_price, currency, property_type, amenities,
      garages, floor, expensas))`

function aviso(v: unknown, campo: string): EstadoAviso {
  const e = deCatalogo(v, ESTADOS_AVISO)
  if (!e) throw new Error(`encuesta: ${campo} desconocido "${String(v)}"`)
  return e
}

function aEncuesta(r: Record<string, unknown>): EncuestaFila {
  const send_status: EstadoEnvio | null = deCatalogo(r.send_status, ESTADOS_ENVIO)
  if (!send_status) throw new Error(`encuesta: estado de envío desconocido "${String(r.send_status)}"`)
  const motivo: MotivoOmision | null = deCatalogo(r.send_skip_reason, MOTIVOS_OMISION)
  return {
    id: String(r.id),
    visit_id: String(r.visit_id),
    token: String(r.token),
    expires_at: String(r.expires_at),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    send_status,
    send_skip_reason: motivo,
    send_error: texto(r.send_error),
    sent_at: texto(r.sent_at),
    sent_to: texto(r.sent_to),
    wa_message_id: texto(r.wa_message_id),
    opened_at: texto(r.opened_at),
    open_count: numero(r.open_count) ?? 0,
    last_step: deCatalogo(r.last_step, PASOS_GUARDABLES),
    completed_at: texto(r.completed_at),
    liked: booleano(r.liked),
    most_liked_tags: lista(r.most_liked_tags),
    most_liked_other: texto(r.most_liked_other),
    least_liked_tags: lista(r.least_liked_tags),
    least_liked_other: texto(r.least_liked_other),
    price_opinion: deCatalogo(r.price_opinion, OPINIONES_PRECIO),
    offer_amount: numero(r.offer_amount),
    offer_currency: deCatalogo(r.offer_currency, MONEDAS),
    offer_declined: booleano(r.offer_declined),
    contact_phone: texto(r.contact_phone),
    contact_email: texto(r.contact_email),
    wants_similar: booleano(r.wants_similar),
    team_notice_status: aviso(r.team_notice_status, 'team_notice_status'),
    gift_whatsapp_status: aviso(r.gift_whatsapp_status, 'gift_whatsapp_status'),
    gift_email_status: aviso(r.gift_email_status, 'gift_email_status'),
    gift_wa_message_id: texto(r.gift_wa_message_id),
    notice_attempts: numero(r.notice_attempts) ?? 0,
    notice_error: texto(r.notice_error),
    gift_downloaded_at: texto(r.gift_downloaded_at),
  }
}

function aPropiedad(p: Record<string, unknown>): PropiedadDeEncuesta {
  return {
    id: String(p.id),
    address: String(p.address ?? ''),
    neighborhood: texto(p.neighborhood),
    photos: p.photos ?? [],
    asking_price: numero(p.asking_price),
    currency: texto(p.currency),
    property_type: texto(p.property_type),
    amenities: p.amenities ?? [],
    garages: numero(p.garages),
    floor: numero(p.floor),
    expensas: numero(p.expensas),
  }
}

export async function asegurarEncuesta(f: { visitId: string; token: string; expiresAt: string; actorId: string | null }): Promise<EncuestaFila> {
  // UNIQUE(visit_id) existe: si ya hay encuesta no se pisa nada (el link es UNO por visita).
  const { error } = await sb().from('visit_surveys')
    .upsert({ visit_id: f.visitId, token: f.token, expires_at: f.expiresAt, created_by: f.actorId }, { onConflict: 'visit_id', ignoreDuplicates: true })
  if (error) fallo('crear encuesta', error)
  const fila = await leerEncuestaDeVisita(f.visitId)
  if (!fila) throw new Error('crear encuesta: la fila no quedó')
  return fila
}

export async function leerEncuestaDeVisita(visitId: string): Promise<EncuestaFila | null> {
  const { data, error } = await sb().from('visit_surveys').select(SELECT_ENCUESTA).eq('visit_id', visitId).maybeSingle()
  if (error) fallo('leer encuesta', error)
  return data ? aEncuesta(data as Record<string, unknown>) : null
}

export async function leerEncuestaConVisita(por: { token: string } | { id: string } | { visitId: string }): Promise<EncuestaConVisita | null> {
  let q = sb().from('visit_surveys').select(SELECT_CON_VISITA)
  if ('token' in por) q = q.eq('token', por.token)
  else if ('id' in por) q = q.eq('id', por.id)
  else q = q.eq('visit_id', por.visitId)
  const { data, error } = await q.maybeSingle()
  if (error) fallo('leer encuesta', error)
  if (!data) return null
  const r = data as Record<string, unknown>
  const v = uno(r.visita as Record<string, unknown> | Record<string, unknown>[] | null)
  if (!v) return null
  if (!esEstadoVisita(v.status)) throw new Error(`leer encuesta: estado de visita desconocido "${String(v.status)}"`)
  const p = uno(v.propiedad as Record<string, unknown> | Record<string, unknown>[] | null)
  return {
    encuesta: aEncuesta(r),
    visita: {
      id: String(v.id),
      property_id: String(v.property_id),
      client_name: String(v.client_name ?? ''),
      client_phone: texto(v.client_phone),
      scheduled_at: String(v.scheduled_at),
      status: v.status,
      advisor_id: texto(v.advisor_id),
      lead_id: texto(v.lead_id),
      propiedad: p ? aPropiedad(p) : null,
    },
  }
}

export interface CamposEnvio {
  send_status: EstadoEnvio
  send_skip_reason: MotivoOmision | null
  send_error: string | null
  sent_at?: string | null
  sent_to?: string | null
  wa_message_id?: string | null
}

export async function registrarEnvio(id: string, c: CamposEnvio): Promise<void> {
  const cambios = { ...c, send_error: c.send_error ? c.send_error.slice(0, 500) : null }
  const { error } = await sb().from('visit_surveys').update(cambios).eq('id', id)
  if (error) fallo('registrar envío de la encuesta', error)
}

/** NO lanza: sin estado del webhook, la ficha dice "Enviada" (lo último que se sabe con certeza). */
export async function estadoDelMensaje(waMessageId: string): Promise<EstadoWa | null> {
  const { data, error } = await sb().from('whatsapp_messages').select('status, error_code, error_message')
    .eq('wa_message_id', waMessageId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error || !data) {
    if (error) console.error('[encuesta] no se pudo leer el estado del mensaje', error.message)
    return null
  }
  const r = data as Record<string, unknown>
  return { status: String(r.status ?? ''), error_code: texto(r.error_code), error_message: texto(r.error_message) }
}

/** Tope de escrituras por link (spec §4.10 "límite por token"): sobra para 5 preguntas con idas y vueltas. */
export const MAX_ESCRITURAS_POR_LINK = 200

export async function registrarUso(token: string, tipo: 'abierta' | 'escritura'): Promise<boolean> {
  const { data, error } = await sb().rpc('visit_survey_registrar', { p_token: token, p_tipo: tipo, p_max: MAX_ESCRITURAS_POR_LINK })
  if (error) fallo('registrar uso de la encuesta', error)
  return data === true
}

export async function guardarPaso(id: string, patch: PatchPaso, ahora: Date): Promise<boolean> {
  const { data, error } = await sb().from('visit_surveys').update(patch)
    .eq('id', id).is('completed_at', null).gt('expires_at', ahora.toISOString())
    .select('id').maybeSingle()
  if (error) fallo('guardar respuesta', error)
  return !!data
}

/** Reserva ATÓMICA del final: solo la primera llamada encuentra `completed_at IS NULL`. */
export async function completarEncuesta(id: string, contacto: ContactoFinal, ahora: Date): Promise<EncuestaFila | null> {
  const { data, error } = await sb().from('visit_surveys')
    .update({ ...contacto, completed_at: ahora.toISOString() })
    .eq('id', id).is('completed_at', null).gt('expires_at', ahora.toISOString())
    .select(SELECT_ENCUESTA).maybeSingle()
  if (error) fallo('completar encuesta', error)
  return data ? aEncuesta(data as Record<string, unknown>) : null
}

export async function reservarAviso(id: string, canal: CanalAviso): Promise<boolean> {
  const col = COLUMNAS_DE_CANAL[canal]
  const { data, error } = await sb().from('visit_surveys')
    .update({ [col.estado]: 'enviando', [col.momento]: new Date().toISOString() })
    .eq('id', id).eq(col.estado, 'pendiente').not('completed_at', 'is', null)
    .select('id').maybeSingle()
  if (error) fallo('reservar aviso', error)
  return !!data
}

export async function cerrarAviso(
  id: string,
  canal: CanalAviso,
  estado: 'enviado' | 'fallido' | 'no_corresponde' | 'pendiente',
  extra: { error?: string | null; waMessageId?: string | null; intentos?: number } = {},
): Promise<void> {
  const col = COLUMNAS_DE_CANAL[canal]
  const cambios: Record<string, unknown> = { [col.estado]: estado }
  if (extra.error !== undefined) cambios.notice_error = extra.error ? extra.error.slice(0, 500) : null
  if (extra.waMessageId !== undefined) cambios.gift_wa_message_id = extra.waMessageId
  if (extra.intentos !== undefined) cambios.notice_attempts = extra.intentos
  const { error } = await sb().from('visit_surveys').update(cambios).eq('id', id).eq(col.estado, 'enviando')
  if (error) fallo('cerrar aviso', error)
}

export async function encuestasConAvisosPendientes(
  rango: { desde: string; hasta: string }, maxIntentos: number, limite = 20,
): Promise<string[]> {
  const { data, error } = await sb().from('visit_surveys').select('id')
    .gte('completed_at', rango.desde).lte('completed_at', rango.hasta).lt('notice_attempts', maxIntentos)
    .or('team_notice_status.eq.pendiente,gift_whatsapp_status.eq.pendiente,gift_email_status.eq.pendiente')
    .order('completed_at', { ascending: true }).limit(limite)
  if (error) fallo('buscar avisos pendientes', error)
  return ((data ?? []) as Array<{ id: unknown }>).map(r => String(r.id))
}

export async function marcarRegaloDescargado(id: string): Promise<void> {
  const { error } = await sb().from('visit_surveys').update({ gift_downloaded_at: new Date().toISOString() })
    .eq('id', id).is('gift_downloaded_at', null)
  if (error) console.error('[encuesta] no se pudo marcar la descarga del regalo', id, error.message)
}
```

- [ ] **Paso 4: Correr y verlo pasar** — el comando del Paso 2. Esperado: PASS. Más `tsc` y eslint.

- [ ] **Paso 5: Commit** — `git add lib/visitas/encuesta/datos.ts lib/visitas/encuesta/datos.test.ts`;
  mensaje `feat(visitas): capa de datos de la encuesta (reservas atómicas, bucket privado, fail-closed)`.

---

### Tarea 7: WhatsApp de la encuesta (origen, envío y script de plantillas)

**Files:**
- Modify: `lib/integrations/whatsapp/log.ts` (tipo `OrigenWhatsapp`)
- Modify: `lib/integrations/whatsapp/core.ts` (las tres uniones de `origen` usan `OrigenWhatsapp`)
- Create: `lib/visitas/encuesta/whatsapp.ts` (+`whatsapp.test.ts`)
- Create: `scripts/create-whatsapp-templates-encuesta-visita.ts`

**Interfaces:**
- Consumes: `sendWhatsappTemplate` de `lib/integrations/whatsapp/meta-cloud.ts`; `EnvioArmado`,
  `IDIOMA_PLANTILLAS` (Tarea 4).
- Produces: `OrigenWhatsapp = 'consulta_portal' | 'landing' | 'manual' | 'encuesta_visita'` (en
  `log.ts`); `TIMEOUT_WHATSAPP_MS = 8000`;
  `ResultadoWhatsapp = { ok: true; modoPrueba: boolean; messageId: string | null } | { ok: false; error: string; codigo: number | null }`;
  `mandarPlantilla(envio: EnvioArmado, d: { telefono: string; leadId: string | null; propertyId: string | null; sentBy: string | null; documento?: { link: string; nombre: string } }): Promise<ResultadoWhatsapp>`.

- [ ] **Paso 1: Grep de consumidores del origen** — `grep -rn "'consulta_portal' | 'landing' | 'manual'" lib app components`
  (esperado: `core.ts` ×3 y `log.ts` ×1) y `grep -rn "origen" app/api/whatsapp components/inbox "app/(dashboard)/inbox"`
  (esperado: ningún filtro por `whatsapp_messages.origen`; si aparece uno, sumarle `encuesta_visita`
  con su etiqueta "Encuesta de visita" en esta misma tarea). Anotar la salida en el reporte.

- [ ] **Paso 2: Test** — `lib/visitas/encuesta/whatsapp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { enviar } = vi.hoisted(() => ({ enviar: vi.fn() }))
vi.mock('@/lib/integrations/whatsapp/meta-cloud', () => ({ sendWhatsappTemplate: enviar }))

import { mandarPlantilla, TIMEOUT_WHATSAPP_MS } from './whatsapp'
import { armarEnvioEncuesta, armarEnvioRegalo } from './plantillas'

const TOKEN = 'Ab3xK9pQ2rTz8LmN4vWq1Y'
// armarEnvio* devuelve null solo con una plantilla fuera del catálogo; acá son las conocidas.
const encuesta = armarEnvioEncuesta('encuesta_visita_v1', { nombre: 'Mariana', direccion: 'Doblas 248', fecha: '14/10', token: TOKEN })!
const regalo = armarEnvioRegalo('regalo_visita_v1', { nombre: 'Mariana', direccion: 'Doblas 248' })!
const destino = { telefono: '5491158234521', leadId: 'lead-1', propertyId: 'prop-1', sentBy: 'user-1' }

beforeEach(() => { enviar.mockReset(); enviar.mockResolvedValue({ ok: true, skipped: false, messageId: 'wamid.1' }) })

describe('mandarPlantilla', () => {
  it('la encuesta: origen, idioma, botón con el token, techo de 8 s y el texto que recibe la persona', async () => {
    expect(await mandarPlantilla(encuesta, destino)).toEqual({ ok: true, modoPrueba: false, messageId: 'wamid.1' })
    expect(enviar).toHaveBeenCalledWith({
      origen: 'encuesta_visita', to: '5491158234521', templateName: 'encuesta_visita_v1', languageCode: 'es_AR',
      bodyParams: ['Mariana', 'Doblas 248', '14/10', TOKEN], urlButtonParam: TOKEN,
      timeoutMs: TIMEOUT_WHATSAPP_MS, leadId: 'lead-1', propertyId: 'prop-1', sentBy: 'user-1', bodyText: encuesta.bodyText,
    })
  })
  it('el regalo lleva el PDF en el encabezado y NO manda dato de botón', async () => {
    await mandarPlantilla(regalo, { ...destino, documento: { link: 'https://firmada/pdf', nombre: 'Guía.pdf' } })
    const llamada = enviar.mock.calls[0][0]
    expect(llamada.headerMedia).toEqual({ type: 'document', link: 'https://firmada/pdf', filename: 'Guía.pdf' })
    expect(llamada).not.toHaveProperty('urlButtonParam')
  })
  it('plantilla con encabezado sin documento (o al revés) NO sale: Meta la rechazaría entera', async () => {
    expect(await mandarPlantilla(regalo, destino)).toEqual({ ok: false, error: 'La plantilla necesita el PDF y no vino', codigo: null })
    expect(await mandarPlantilla(encuesta, { ...destino, documento: { link: 'x', nombre: 'y' } }))
      .toEqual({ ok: false, error: 'La plantilla no lleva documento', codigo: null })
    expect(enviar).not.toHaveBeenCalled()
  })
  it('modo prueba y rechazo de Meta se distinguen', async () => {
    enviar.mockResolvedValueOnce({ ok: true, skipped: true })
    expect(await mandarPlantilla(encuesta, destino)).toEqual({ ok: true, modoPrueba: true, messageId: null })
    enviar.mockResolvedValueOnce({ ok: false, skipped: false, error: 'Template not found', errorCode: 132001 })
    expect(await mandarPlantilla(encuesta, destino)).toEqual({ ok: false, error: 'Template not found', codigo: 132001 })
  })
})
```

- [ ] **Paso 3: Correr y verlo fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/whatsapp.test.ts`.
  Esperado: FAIL (`Cannot find module './whatsapp'`).

- [ ] **Paso 4: Tipo del origen** — en `lib/integrations/whatsapp/log.ts`, arriba de `export interface LogOutboundInput`, agregar:

```ts
/**
 * De dónde nació la conversación. Mismo catálogo que el CHECK `whatsapp_messages_origen_check`
 * (migraciones 20260806000001 y 20261015000002): se tocan JUNTOS.
 */
export type OrigenWhatsapp = 'consulta_portal' | 'landing' | 'manual' | 'encuesta_visita'
```

  y reemplazar en `LogOutboundInput` la línea
  `origen?: 'consulta_portal' | 'landing' | 'manual' | null` por `origen?: OrigenWhatsapp | null`.
  En `lib/integrations/whatsapp/core.ts`: cambiar el import a
  `import { logOutbound, type OrigenWhatsapp } from './log'` y reemplazar las TRES apariciones de
  `origen?: 'consulta_portal' | 'landing' | 'manual' | null` por `origen?: OrigenWhatsapp | null`.

- [ ] **Paso 5: Implementar `lib/visitas/encuesta/whatsapp.ts`**

```ts
import 'server-only'
/**
 * Manda una plantilla de la encuesta (la del link o la del regalo) por WhatsApp. Una sola llamada
 * a Meta con techo de 8 s (spec §7 riesgo 11). NUNCA lanza: `sendWhatsappTemplate` tampoco, y quien
 * llama decide qué escribir en la encuesta según el resultado.
 *
 * Plantilla y encabezado se chequean JUNTOS acá, antes de llamar a Meta: una plantilla con
 * encabezado de documento sin el PDF (o al revés) la rechaza Meta ENTERA, y ese rechazo no le
 * avisa a nadie (incidente 2026-09-17).
 */
import { sendWhatsappTemplate } from '@/lib/integrations/whatsapp/meta-cloud'
import { IDIOMA_PLANTILLAS, type EnvioArmado } from './plantillas'

export const TIMEOUT_WHATSAPP_MS = 8_000

export type ResultadoWhatsapp =
  | { ok: true; modoPrueba: boolean; messageId: string | null }
  | { ok: false; error: string; codigo: number | null }

export async function mandarPlantilla(
  envio: EnvioArmado,
  d: { telefono: string; leadId: string | null; propertyId: string | null; sentBy: string | null; documento?: { link: string; nombre: string } },
): Promise<ResultadoWhatsapp> {
  if (envio.necesitaDocumento && !d.documento) return { ok: false, error: 'La plantilla necesita el PDF y no vino', codigo: null }
  if (!envio.necesitaDocumento && d.documento) return { ok: false, error: 'La plantilla no lleva documento', codigo: null }
  const r = await sendWhatsappTemplate({
    origen: 'encuesta_visita',
    to: d.telefono,
    templateName: envio.templateName,
    languageCode: IDIOMA_PLANTILLAS,
    bodyParams: envio.bodyParams,
    ...(envio.urlButtonParam ? { urlButtonParam: envio.urlButtonParam } : {}),
    ...(d.documento ? { headerMedia: { type: 'document' as const, link: d.documento.link, filename: d.documento.nombre } } : {}),
    timeoutMs: TIMEOUT_WHATSAPP_MS,
    leadId: d.leadId,
    propertyId: d.propertyId,
    sentBy: d.sentBy,
    bodyText: envio.bodyText,
  })
  if (!r.ok) return { ok: false, error: r.error ?? 'error desconocido', codigo: r.errorCode ?? null }
  return { ok: true, modoPrueba: r.skipped, messageId: r.messageId ?? null }
}
```

- [ ] **Paso 6: Correr y verlo pasar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/whatsapp.test.ts lib/integrations/whatsapp/core.test.ts lib/integrations/whatsapp/log.test.ts`
  (los dos de `lib/integrations/whatsapp` entraron a la config en la Tarea 0: el cambio de tipo no
  puede romper el armado del payload). Esperado: PASS. Más `tsc` y eslint sobre los cuatro archivos.

- [ ] **Paso 7: Script de plantillas** — `scripts/create-whatsapp-templates-encuesta-visita.ts`:

```ts
/**
 * Crea las dos plantillas de la encuesta post-visita (spec §11.8). Los cuerpos vienen de
 * lib/visitas/encuesta/plantillas.ts: el texto que se aprueba y el que se manda son el MISMO.
 *
 *   encuesta_visita_v1 → 4 datos + botón URL "Completar ficha" (el link también va en el cuerpo)
 *   regalo_visita_v1   → encabezado DOCUMENTO (el PDF) + 2 datos, sin botón
 *
 * Meta no acepta una URL de ejemplo para el encabezado: pide un `header_handle`, que se obtiene
 * subiendo un PDF de muestra por la Resumable Upload API (dos pasos; el segundo son los bytes crudos
 * con `file_offset: 0`). Para eso hay que pasar `--muestra=<url de un PDF>` (cualquier plano de una
 * propiedad, del bucket público property-files). El handle es SOLO para la aprobación.
 *
 * Uso (desde el worktree):
 *   node --env-file=../../../.env.local --import tsx scripts/create-whatsapp-templates-encuesta-visita.ts                     # estado
 *   node --env-file=../../../.env.local --import tsx scripts/create-whatsapp-templates-encuesta-visita.ts --create=encuesta
 *   node --env-file=../../../.env.local --import tsx scripts/create-whatsapp-templates-encuesta-visita.ts --create=regalo --muestra=https://…/plano.pdf
 *
 * Después de que Meta apruebe: correr scripts/sincronizar-cuerpos-plantillas.ts (para que el Inbox
 * muestre el texto real) y pedirle al dueño que cargue en Netlify WHATSAPP_TEMPLATE_ENCUESTA_VISITA
 * y/o WHATSAPP_TEMPLATE_REGALO_VISITA. Si una queda en MARKETING, NO se configura: se rediseña.
 */
import {
  PLANTILLA_ENCUESTA_V1, CUERPO_ENCUESTA_V1, BOTON_ENCUESTA_V1, PLANTILLA_REGALO_V1, CUERPO_REGALO_V1, IDIOMA_PLANTILLAS,
} from '../lib/visitas/encuesta/plantillas'

const API = process.env.WHATSAPP_API_VERSION ?? 'v21.0'
const TOKEN_EJEMPLO = 'Ab3xK9pQ2rTz8LmN4vWq1Y'

function env(nombre: string): string {
  const v = process.env[nombre]
  if (!v) throw new Error(`Falta ${nombre} en el entorno`)
  return v
}

function argumento(nombre: string): string | null {
  const a = process.argv.find(x => x.startsWith(`--${nombre}=`))
  return a ? a.slice(nombre.length + 3) : null
}

async function subirMuestra(url: string): Promise<string> {
  const appId = env('META_APP_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')
  const archivo = await fetch(url)
  if (!archivo.ok) throw new Error(`No se pudo bajar la muestra (${archivo.status}): ${url}`)
  const bytes = Buffer.from(await archivo.arrayBuffer())
  const sesion = await fetch(
    `https://graph.facebook.com/${API}/${appId}/uploads?file_length=${bytes.length}&file_type=application%2Fpdf&access_token=${encodeURIComponent(token)}`,
    { method: 'POST' },
  )
  const sj = (await sesion.json()) as { id?: string; error?: unknown }
  if (!sesion.ok || !sj.id) throw new Error(`No se pudo abrir la subida: ${JSON.stringify(sj.error ?? sj)}`)
  const subida = await fetch(`https://graph.facebook.com/${API}/${sj.id}`, {
    method: 'POST',
    headers: { authorization: `OAuth ${token}`, file_offset: '0' },
    body: new Uint8Array(bytes),
  })
  const uj = (await subida.json()) as { h?: string; error?: unknown }
  if (!subida.ok || !uj.h) throw new Error(`No se pudieron subir los bytes: ${JSON.stringify(uj.error ?? uj)}`)
  return uj.h
}

async function estado(waba: string, token: string): Promise<Array<Record<string, string>>> {
  const r = await fetch(`https://graph.facebook.com/${API}/${waba}/message_templates?limit=200&fields=name,status,category,rejected_reason&access_token=${encodeURIComponent(token)}`)
  const j = (await r.json()) as { data?: Array<Record<string, string>>; error?: unknown }
  if (!r.ok || j.error) throw new Error(`Meta rechazó la consulta: ${JSON.stringify(j.error ?? j).slice(0, 300)}`)
  return (j.data ?? []).filter(t => t.name === PLANTILLA_ENCUESTA_V1 || t.name === PLANTILLA_REGALO_V1)
}

async function crear(waba: string, token: string, cuerpo: Record<string, unknown>): Promise<void> {
  const r = await fetch(`https://graph.facebook.com/${API}/${waba}/message_templates?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo),
  })
  const j = (await r.json()) as Record<string, unknown>
  if (!r.ok || j.error) throw new Error(`Meta rechazó la creación: ${JSON.stringify(j.error ?? j)}`)
  console.log(`✅ ${String(cuerpo.name)} enviada a aprobación: ${JSON.stringify(j)}`)
}

async function main() {
  const waba = env('WHATSAPP_BUSINESS_ACCOUNT_ID')
  const token = env('WHATSAPP_ACCESS_TOKEN')
  const actuales = await estado(waba, token)
  console.log('Plantillas de la encuesta en la cuenta:')
  for (const t of actuales) {
    console.log(`  ${String(t.category).padEnd(9)} ${String(t.status).padEnd(9)} ${t.name}` +
      (t.rejected_reason && t.rejected_reason !== 'NONE' ? `  (${t.rejected_reason})` : ''))
    if (t.status === 'APPROVED' && t.category !== 'UTILITY') {
      console.log(`  ⚠️  ${t.name} quedó como ${t.category}: NO configurarla en Netlify (Meta retiene las de marketing).`)
    }
  }
  const pedido = argumento('create')
  if (!pedido) { console.log('\nSin --create: solo estado.'); return }
  const nombre = pedido === 'encuesta' ? PLANTILLA_ENCUESTA_V1 : pedido === 'regalo' ? PLANTILLA_REGALO_V1 : null
  if (!nombre) throw new Error('--create tiene que ser "encuesta" o "regalo"')
  if (actuales.some(t => t.name === nombre)) { console.log(`\n"${nombre}" ya existe: no se vuelve a crear.`); return }

  if (pedido === 'encuesta') {
    await crear(waba, token, {
      name: PLANTILLA_ENCUESTA_V1, language: IDIOMA_PLANTILLAS, category: 'UTILITY',
      components: [
        { type: 'BODY', text: CUERPO_ENCUESTA_V1, example: { body_text: [['Mariana', 'Doblas 248', '14/10', TOKEN_EJEMPLO]] } },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: BOTON_ENCUESTA_V1.texto, url: BOTON_ENCUESTA_V1.url, example: [`https://inmodf.com.ar/encuesta/${TOKEN_EJEMPLO}`] }] },
      ],
    })
    return
  }
  const muestra = argumento('muestra')
  if (!muestra) throw new Error('Para la del regalo hace falta --muestra=<url de un PDF>')
  const handle = await subirMuestra(muestra)
  await crear(waba, token, {
    name: PLANTILLA_REGALO_V1, language: IDIOMA_PLANTILLAS, category: 'UTILITY',
    components: [
      { type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [handle] } },
      { type: 'BODY', text: CUERPO_REGALO_V1, example: { body_text: [['Mariana', 'Doblas 248']] } },
    ],
  })
}

main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
```

  Verificación del script SIN crear nada: `node --env-file=../../../.env.local --import tsx scripts/create-whatsapp-templates-encuesta-visita.ts`
  (solo estado). Esperado: lista vacía o las dos con su estado, y "Sin --create: solo estado.". Pegar
  la salida en el reporte. **No correr `--create` en esta tarea** (va en la Tarea 23, con el OK).

- [ ] **Paso 8: Commit** — `git add lib/integrations/whatsapp/log.ts lib/integrations/whatsapp/core.ts lib/visitas/encuesta/whatsapp.ts lib/visitas/encuesta/whatsapp.test.ts scripts/create-whatsapp-templates-encuesta-visita.ts`;
  mensaje `feat(visitas): envío de las plantillas de la encuesta y script para crearlas en Meta`.

---

### Tarea 8: Crear el link y mandar al marcar "Se realizó" (servicio, ficha y rutas)

**Files:**
- Create: `lib/visitas/encuesta/ficha.ts` (+`ficha.test.ts`)
- Create: `lib/visitas/encuesta/servicio.ts` (+`servicio.test.ts`)
- Modify: `app/api/visits/[id]/estado/route.ts` (+`route.test.ts`)
- Modify: `app/api/visits/[id]/route.ts` (+`route.test.ts`)
- Create: `app/api/visits/[id]/encuesta/route.ts` (+`route.test.ts`)

**Interfaces:**
- Consumes: Tareas 2–7 (`datos.*`, `mandarPlantilla`, `decidirEnvioEncuesta`, `armarEnvioEncuesta`,
  `motivoLegibleDeMeta`, `estadoVisibleDeLaEncuesta`, `tokenDesdeBytes`, `vencimientoDesde`,
  `estaVencida`, `urlDeLaEncuesta`, `textoMonto`, `etiquetaDeOpcion`); `EventoVisitaR` de
  `lib/visitas/tipos.ts`; `fechaEnArgentina` de `lib/visitas/horario.ts`;
  `normalizeWhatsappPhone` de `lib/integrations/whatsapp/phone.ts`.
- Produces:
  - `ficha.ts`: `TEXTO_PRECIO`, `RespuestasParaFicha { completa; leGusto; masGusto: string[]; menosGusto: string[]; precio: string | null; oferta: string | null; quiereSimilares: boolean | null; telefono: string | null; email: string | null }`,
    `EncuestaParaFicha { link; estado: EstadoEncuestaVisible; puedeReenviar; vencida; venceEl; respondidaEl: string | null; respuestas: RespuestasParaFicha | null; eventos: EventoVisitaR[] }`,
    `KINDS_DE_ENCUESTA`, `respuestasParaFicha(e)`, `filasDeRespuestas(r): Array<{ etiqueta: string; valor: string }>`,
    `eventosDeLaEncuesta(e)`, `mezclarEventos(historial, deEncuesta)`, `armarEncuestaParaFicha(e, x)`.
  - `servicio.ts`: `ReenvioNoPermitido` (con `.motivo: MotivoOmision`),
    `asegurarLinkDeEncuesta(visitaId, actorId, ahora): Promise<EncuestaFila>`,
    `prepararYEnviarEncuesta(visitaId, o: { reenvio: boolean; actorId: string | null; ahora: Date }): Promise<EncuestaParaFicha>`,
    `encuestaParaFicha(visitaId, ahora): Promise<EncuestaParaFicha | null>`,
    `encuestaParaFichaSegura(visitaId, ahora): Promise<EncuestaParaFicha | null>` (NO lanza).
  - `GET /api/visits/[id]` y `POST /api/visits/[id]/estado` suman `data.encuesta: EncuestaParaFicha | null`
    y los eventos de la encuesta dentro de `data.eventos`.
  - `GET/POST /api/visits/[id]/encuesta` (`{ accion: 'link' | 'reenviar' }`) → `{ data: EncuestaParaFicha | null }`.

- [ ] **Paso 1: Test de `ficha.ts`** — `lib/visitas/encuesta/ficha.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { armarEncuestaParaFicha, respuestasParaFicha, eventosDeLaEncuesta, mezclarEventos, filasDeRespuestas } from './ficha'
import { encuestaDePrueba, TOKEN_DE_PRUEBA, ENCUESTA_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import type { EventoVisitaR } from '../tipos'

const AHORA = new Date('2026-10-15T15:00:00Z')
const evento = (kind: string, created_at: string): EventoVisitaR => ({
  id: `${kind}-1`, kind, from_status: null, to_status: null, from_scheduled_at: null, to_scheduled_at: null,
  reason: null, note: null, created_at, actor: 'Lucas', desde_asesor: null, hacia_asesor: null,
})

describe('respuestasParaFicha', () => {
  it('sin nada respondido: null', () => {
    expect(respuestasParaFicha(encuestaDePrueba())).toBeNull()
  })
  it('en palabras: etiquetas, "Otra" con su texto, precio y oferta', () => {
    const r = respuestasParaFicha(encuestaDePrueba({
      completed_at: '2026-10-15T14:00:00Z', liked: true, most_liked_tags: ['luz', 'otra'], most_liked_other: 'El barrio',
      least_liked_tags: ['nada'], price_opinion: 'alto', offer_amount: 135000, offer_currency: 'USD', wants_similar: true,
      contact_phone: '5491158234521', contact_email: 'a@b.co',
    }))
    expect(r).toEqual({
      completa: true, leGusto: true, masGusto: ['La luz', 'Otra: El barrio'], menosGusto: ['Nada en especial'],
      precio: 'Le parece alto', oferta: 'US$ 135.000', quiereSimilares: true, telefono: '5491158234521', email: 'a@b.co',
    })
  })
  it('"prefiero no decirlo" se dice así; a medio responder no es "completa"', () => {
    const r = respuestasParaFicha(encuestaDePrueba({ liked: false, offer_declined: true }))
    expect(r).toMatchObject({ completa: false, leGusto: false, oferta: 'Prefirió no decirlo' })
  })
})

describe('filasDeRespuestas', () => {
  it('en palabras, con "—" donde no respondió', () => {
    expect(filasDeRespuestas({
      completa: true, leGusto: null, masGusto: ['La luz'], menosGusto: [], precio: 'Le parece alto',
      oferta: null, quiereSimilares: false, telefono: '5491158234521', email: null,
    })).toEqual([
      { etiqueta: '¿Le gustó?', valor: '—' },
      { etiqueta: 'Lo que más le gustó', valor: 'La luz' },
      { etiqueta: 'Lo que menos le gustó', valor: '—' },
      { etiqueta: 'El precio', valor: 'Le parece alto' },
      { etiqueta: 'Cuánto ofertaría', valor: '—' },
      { etiqueta: 'Avisarle si entra algo parecido', valor: 'No' },
      { etiqueta: 'WhatsApp', valor: '5491158234521' },
    ])
  })
})

describe('eventos de la encuesta en la línea de tiempo', () => {
  it('enviada, abierta y respondida, con ids estables', () => {
    const ev = eventosDeLaEncuesta(encuestaDePrueba({ send_status: 'enviada', sent_at: '2026-10-14T18:00:00Z', opened_at: '2026-10-14T19:00:00Z', completed_at: '2026-10-14T19:02:00Z' }))
    expect(ev.map(e => [e.kind, e.id])).toEqual([
      ['encuesta_enviada', `encuesta-enviada-${ENCUESTA_DE_PRUEBA}`],
      ['encuesta_abierta', `encuesta-abierta-${ENCUESTA_DE_PRUEBA}`],
      ['encuesta_respondida', `encuesta-respondida-${ENCUESTA_DE_PRUEBA}`],
    ])
  })
  it('un envío omitido no figura como "enviada"', () => {
    expect(eventosDeLaEncuesta(encuestaDePrueba({ send_status: 'omitida', sent_at: null }))).toEqual([])
  })
  it('mezclar ordena por fecha y no duplica los de encuesta al refrescar', () => {
    const historial = [evento('realizada', '2026-10-14T17:00:00Z'), evento('encuesta_enviada', '2026-10-14T18:00:00Z')]
    const deEncuesta = eventosDeLaEncuesta(encuestaDePrueba({ send_status: 'enviada', sent_at: '2026-10-14T18:00:00Z' }))
    const r = mezclarEventos(historial, deEncuesta)
    expect(r.map(e => e.kind)).toEqual(['realizada', 'encuesta_enviada'])
  })
})

describe('armarEncuestaParaFicha', () => {
  it('link copiable, estado, vencimiento y si se puede reenviar', () => {
    const f = armarEncuestaParaFicha(encuestaDePrueba({ send_status: 'omitida', send_skip_reason: 'envio_apagado' }),
      { wa: null, puedeReenviar: false, ahora: AHORA, base: 'https://inmodf.com.ar' })
    expect(f).toMatchObject({
      link: `https://inmodf.com.ar/encuesta/${TOKEN_DE_PRUEBA}`,
      estado: { clave: 'sin_enviar', texto: 'Sin enviar (envío apagado)' },
      puedeReenviar: false, vencida: false, respondidaEl: null, respuestas: null, eventos: [],
    })
  })
})
```

- [ ] **Paso 2: Test del servicio** — `lib/visitas/encuesta/servicio.test.ts` (base en memoria:
  `registrarEnvio` cambia la fila que después leen las demás funciones):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EncuestaFila } from './tipos'

const { mem, datosMock, mandarMock } = vi.hoisted(() => {
  const mem: { fila: EncuestaFila | null; existe: boolean } = { fila: null, existe: false }
  return {
    mem,
    mandarMock: vi.fn(),
    datosMock: {
      leerEncuestaDeVisita: vi.fn(async () => (mem.existe ? mem.fila : null)),
      asegurarEncuesta: vi.fn(async (f: { token: string; expiresAt: string }) => {
        mem.existe = true
        // Los tests siempre cargan la fila base antes de llamar.
        if (mem.fila) mem.fila = { ...mem.fila, token: f.token, expires_at: f.expiresAt }
        return mem.fila
      }),
      leerEncuestaConVisita: vi.fn(),
      leerAjustesEncuesta: vi.fn(),
      leerRegalo: vi.fn(),
      registrarEnvio: vi.fn(async (_id: string, c: Partial<EncuestaFila>) => { if (mem.fila) mem.fila = { ...mem.fila, ...c } }),
      estadoDelMensaje: vi.fn(async () => null),
    },
  }
})
vi.mock('./datos', () => datosMock)
vi.mock('./whatsapp', () => ({ mandarPlantilla: mandarMock }))
vi.mock('@/lib/integrations/whatsapp/phone', () => ({
  normalizeWhatsappPhone: (v: string | null | undefined) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `549${d.slice(-10)}` : null
  },
}))

import { prepararYEnviarEncuesta, encuestaParaFicha, ReenvioNoPermitido } from './servicio'
import { encuestaConVisitaDePrueba, encuestaDePrueba, VISITA_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import { AJUSTES_PRUEBA } from './envio.test-datos'

const AHORA = new Date('2026-10-15T15:00:00Z')
const REGALO = { propertyId: 'p', titulo: 'Guía', archivoPath: 'x', archivoNombre: 'g.pdf', archivoBytes: 10, portadaPath: null, actualizadoEl: '' }

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockClear())
  mandarMock.mockReset()
  mem.fila = encuestaDePrueba(); mem.existe = false
  datosMock.leerEncuestaConVisita.mockImplementation(async () => (mem.fila ? { ...encuestaConVisitaDePrueba(), encuesta: mem.fila } : null))
  datosMock.leerAjustesEncuesta.mockResolvedValue(AJUSTES_PRUEBA)
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  vi.stubEnv('WHATSAPP_TEMPLATE_ENCUESTA_VISITA', 'encuesta_visita_v1')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://inmodf.com.ar')
})

describe('prepararYEnviarEncuesta', () => {
  it('crea el link (22 caracteres, 30 días) y con el envío apagado lo deja "Sin enviar (envío apagado)"', async () => {
    const f = await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    const pedido = datosMock.asegurarEncuesta.mock.calls[0][0]
    expect(pedido.token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(pedido.expiresAt).toBe('2026-11-14T15:00:00.000Z')
    expect(datosMock.registrarEnvio).toHaveBeenCalledWith(mem.fila?.id, { send_status: 'omitida', send_skip_reason: 'envio_apagado', send_error: null })
    expect(mandarMock).not.toHaveBeenCalled()
    expect(f.estado.texto).toBe('Sin enviar (envío apagado)')
    expect(f.link).toMatch(/^https:\/\/inmodf\.com\.ar\/encuesta\/[A-Za-z0-9_-]{22}$/)
  })
  it('teléfono de prueba: manda la plantilla y anota envío, destino y mensaje', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['11 5823-4521'] })
    mandarMock.mockResolvedValue({ ok: true, modoPrueba: false, messageId: 'wamid.7' })
    const f = await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    const [envio, destino] = mandarMock.mock.calls[0]
    expect(envio.templateName).toBe('encuesta_visita_v1')
    expect(envio.bodyParams.slice(0, 3)).toEqual(['Mariana', 'Doblas 248', '14/10'])
    expect(destino).toMatchObject({ telefono: '5491158234521', propertyId: '33333333-3333-4333-8333-333333333333', sentBy: 'u1' })
    expect(datosMock.registrarEnvio).toHaveBeenCalledWith(mem.fila?.id, {
      send_status: 'enviada', send_skip_reason: null, send_error: null,
      sent_at: AHORA.toISOString(), sent_to: '5491158234521', wa_message_id: 'wamid.7',
    })
    expect(f.estado.texto).toBe('Enviada')
  })
  it('Meta la rechaza: "Falló" con el motivo en castellano, y la función no lanza', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, envio_automatico: true })
    mandarMock.mockResolvedValue({ ok: false, error: 'Template does not exist', codigo: 132001 })
    const f = await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    expect(f.estado).toEqual({ clave: 'fallo', texto: 'Falló: la plantilla no existe o todavía no está aprobada' })
  })
  it('WhatsApp en modo prueba: no se finge un envío', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, envio_automatico: true })
    mandarMock.mockResolvedValue({ ok: true, modoPrueba: true, messageId: null })
    expect((await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })).estado.texto)
      .toBe('Sin enviar (WhatsApp en modo prueba)')
  })
  it('visita reabierta y vuelta a marcar realizada: mismo link y NO se pisa un envío que ya salió', async () => {
    mem.existe = true
    mem.fila = encuestaDePrueba({ send_status: 'enviada', sent_at: '2026-10-14T18:00:00Z', wa_message_id: 'wamid.1' })
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, envio_automatico: true })
    await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    expect(datosMock.asegurarEncuesta).not.toHaveBeenCalled()
    expect(datosMock.registrarEnvio).not.toHaveBeenCalled()
    expect(mandarMock).not.toHaveBeenCalled()
  })
  it('un reenvío que la decisión no permite avisa por qué', async () => {
    mem.existe = true
    await expect(prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: true, actorId: 'u1', ahora: AHORA }))
      .rejects.toThrow(new ReenvioNoPermitido('envio_apagado'))
  })
  it('si no se puede leer el regalo cuenta como "sin regalo" (no manda con "solo con regalo")', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, envio_automatico: true })
    datosMock.leerRegalo.mockRejectedValue(new Error('boom'))
    const f = await prepararYEnviarEncuesta(VISITA_DE_PRUEBA, { reenvio: false, actorId: 'u1', ahora: AHORA })
    expect(f.estado.texto).toBe('Sin enviar (la propiedad no tiene regalo)')
  })
})

describe('encuestaParaFicha', () => {
  it('sin encuesta: null', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(null)
    expect(await encuestaParaFicha(VISITA_DE_PRUEBA, AHORA)).toBeNull()
  })
  it('lee el estado del webhook por wa_message_id y dice si se puede reenviar', async () => {
    mem.fila = encuestaDePrueba({ send_status: 'enviada', sent_at: '2026-10-14T18:00:00Z', wa_message_id: 'wamid.1' })
    datosMock.estadoDelMensaje.mockResolvedValueOnce({ status: 'delivered', error_code: null, error_message: null })
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, envio_automatico: true })
    const f = await encuestaParaFicha(VISITA_DE_PRUEBA, AHORA)
    expect(datosMock.estadoDelMensaje).toHaveBeenCalledWith('wamid.1')
    expect(f).toMatchObject({ estado: { texto: 'Entregada' }, puedeReenviar: true })
  })
})
```

- [ ] **Paso 3: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/ficha.test.ts lib/visitas/encuesta/servicio.test.ts`.
  Esperado: FAIL (módulos inexistentes).

- [ ] **Paso 4: Implementar `lib/visitas/encuesta/ficha.ts`**

```ts
/**
 * Lo que ve el equipo de la encuesta en la ficha de la visita (spec §3.3 "Realizada: ver/copiar/
 * reenviar encuesta; ver respuestas" + adenda §11.4). Puro y seguro para el navegador: la ficha es
 * un componente de cliente que recibe esto por JSON.
 *
 * Los eventos de la encuesta se ARMAN desde la fila (no se agregan valores al CHECK de
 * property_visit_events.kind): son derivados, y si se guardaran aparte podrían contradecirla.
 */
import type { EventoVisitaR } from '../tipos'
import { estadoVisibleDeLaEncuesta, type EstadoEncuestaVisible } from './estado-envio'
import { estaVencida, urlDeLaEncuesta } from './link'
import { etiquetaDeOpcion, OTRA } from './opciones'
import { textoMonto } from './oferta'
import { pasoRespondido } from './pasos'
import { PASOS_GUARDABLES, type EncuestaFila, type EstadoWa, type OpinionPrecio } from './tipos'

export const TEXTO_PRECIO: Readonly<Record<OpinionPrecio, string>> = {
  correcto: 'Le parece correcto', alto: 'Le parece alto', bajo: 'Le parece bajo',
}

export interface RespuestasParaFicha {
  completa: boolean
  leGusto: boolean | null
  masGusto: string[]
  menosGusto: string[]
  precio: string | null
  oferta: string | null
  quiereSimilares: boolean | null
  telefono: string | null
  email: string | null
}

export interface EncuestaParaFicha {
  link: string
  estado: EstadoEncuestaVisible
  puedeReenviar: boolean
  vencida: boolean
  venceEl: string
  respondidaEl: string | null
  respuestas: RespuestasParaFicha | null
  eventos: EventoVisitaR[]
}

function etiquetas(tags: readonly string[], otra: string | null): string[] {
  const lista = tags.filter(t => t !== OTRA).map(etiquetaDeOpcion)
  return otra ? [...lista, `Otra: ${otra}`] : lista
}

export function respuestasParaFicha(e: EncuestaFila): RespuestasParaFicha | null {
  const completa = e.completed_at !== null
  if (!completa && !PASOS_GUARDABLES.some(p => pasoRespondido(p, e))) return null
  return {
    completa,
    leGusto: e.liked,
    masGusto: etiquetas(e.most_liked_tags, e.most_liked_other),
    menosGusto: etiquetas(e.least_liked_tags, e.least_liked_other),
    precio: e.price_opinion ? TEXTO_PRECIO[e.price_opinion] : null,
    oferta: e.offer_declined ? 'Prefirió no decirlo'
      : e.offer_amount !== null ? textoMonto(e.offer_amount, e.offer_currency ?? 'USD') : null,
    quiereSimilares: e.wants_similar,
    telefono: e.contact_phone,
    email: e.contact_email,
  }
}

const siNo = (v: boolean | null) => (v === null ? '—' : v ? 'Sí' : 'No')
const lista = (v: string[]) => (v.length ? v.join(', ') : '—')

/** Las respuestas como filas "etiqueta: valor". Las usan la ficha de la visita y el email al equipo. */
export function filasDeRespuestas(r: RespuestasParaFicha): Array<{ etiqueta: string; valor: string }> {
  const filas = [
    { etiqueta: '¿Le gustó?', valor: siNo(r.leGusto) },
    { etiqueta: 'Lo que más le gustó', valor: lista(r.masGusto) },
    { etiqueta: 'Lo que menos le gustó', valor: lista(r.menosGusto) },
    { etiqueta: 'El precio', valor: r.precio ?? '—' },
    { etiqueta: 'Cuánto ofertaría', valor: r.oferta ?? '—' },
    { etiqueta: 'Avisarle si entra algo parecido', valor: siNo(r.quiereSimilares) },
  ]
  if (r.telefono) filas.push({ etiqueta: 'WhatsApp', valor: r.telefono })
  if (r.email) filas.push({ etiqueta: 'Email', valor: r.email })
  return filas
}

export const KINDS_DE_ENCUESTA = ['encuesta_enviada', 'encuesta_abierta', 'encuesta_respondida'] as const

const SIN_DETALLE = {
  from_status: null, to_status: null, from_scheduled_at: null, to_scheduled_at: null,
  reason: null, note: null, actor: null, desde_asesor: null, hacia_asesor: null,
} as const

export function eventosDeLaEncuesta(e: Pick<EncuestaFila, 'id' | 'send_status' | 'sent_at' | 'opened_at' | 'completed_at'>): EventoVisitaR[] {
  const ev: EventoVisitaR[] = []
  if (e.send_status === 'enviada' && e.sent_at) ev.push({ ...SIN_DETALLE, id: `encuesta-enviada-${e.id}`, kind: 'encuesta_enviada', created_at: e.sent_at })
  if (e.opened_at) ev.push({ ...SIN_DETALLE, id: `encuesta-abierta-${e.id}`, kind: 'encuesta_abierta', created_at: e.opened_at })
  if (e.completed_at) ev.push({ ...SIN_DETALLE, id: `encuesta-respondida-${e.id}`, kind: 'encuesta_respondida', created_at: e.completed_at })
  return ev
}

/** Historial de la base + eventos de la encuesta, en orden. Saca los de encuesta previos: al refrescar no se duplican. */
export function mezclarEventos(historial: readonly EventoVisitaR[], deEncuesta: readonly EventoVisitaR[]): EventoVisitaR[] {
  return [...historial.filter(e => !(KINDS_DE_ENCUESTA as readonly string[]).includes(e.kind)), ...deEncuesta]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
}

export function armarEncuestaParaFicha(
  e: EncuestaFila,
  x: { wa: EstadoWa | null; puedeReenviar: boolean; ahora: Date; base: string },
): EncuestaParaFicha {
  return {
    link: urlDeLaEncuesta(e.token, x.base),
    estado: estadoVisibleDeLaEncuesta(e, x.wa, x.ahora),
    puedeReenviar: x.puedeReenviar,
    vencida: e.completed_at === null && estaVencida(e.expires_at, x.ahora),
    venceEl: e.expires_at,
    respondidaEl: e.completed_at,
    respuestas: respuestasParaFicha(e),
    eventos: eventosDeLaEncuesta(e),
  }
}
```

- [ ] **Paso 5: Implementar `lib/visitas/encuesta/servicio.ts`**

```ts
import 'server-only'
/**
 * Crear el link de la encuesta y decidir/mandar el WhatsApp (adenda §11.4). Lo llaman
 * POST /api/visits/[id]/estado (al marcar "Se realizó") y POST /api/visits/[id]/encuesta.
 * UNA sola llamada a Meta por pedido (techo 8 s): cabe en el límite de Netlify.
 *
 * Regla que no se rompe: un envío que YA salió no se pisa con un "omitida" (pasa al reabrir una
 * visita y volver a marcarla realizada: el link es el mismo y la persona ya lo tiene).
 */
import { randomBytes } from 'node:crypto'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import * as datos from './datos'
import { mandarPlantilla } from './whatsapp'
import { tokenDesdeBytes, vencimientoDesde, estaVencida } from './link'
import { decidirEnvioEncuesta, type DecisionEnvio } from './envio'
import { armarEnvioEncuesta } from './plantillas'
import { motivoLegibleDeMeta, TEXTO_MOTIVO_OMISION } from './estado-envio'
import { armarEncuestaParaFicha, type EncuestaParaFicha } from './ficha'
import type { EncuestaConVisita, EncuestaFila, MotivoOmision } from './tipos'

export class ReenvioNoPermitido extends Error {
  constructor(public readonly motivo: MotivoOmision) {
    super(`No se puede reenviar: ${TEXTO_MOTIVO_OMISION[motivo]}`)
    this.name = 'ReenvioNoPermitido'
  }
}

function baseDeLaApp(): string {
  // `||`: una variable seteada pero VACÍA (vista previa mal configurada) no deja un link relativo.
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://inmodf.com.ar').replace(/\/+$/, '')
}

function plantillaConfigurada(): string | null {
  return process.env.WHATSAPP_TEMPLATE_ENCUESTA_VISITA?.trim() || null
}

/** "14/10" en hora argentina: es la fecha que la persona recuerda. */
function fechaCorta(iso: string): string {
  const [, mes, dia] = fechaEnArgentina(new Date(iso)).split('-')
  return `${dia}/${mes}`
}

/** Si no se puede leer el regalo, cuenta como "sin regalo": con "solo con regalo" eso FRENA el envío (fail-closed). */
async function tieneRegalo(propertyId: string): Promise<boolean> {
  try {
    return (await datos.leerRegalo(propertyId)) !== null
  } catch (e) {
    console.error('[encuesta] no se pudo leer el regalo; se trata como "sin regalo"', propertyId, e)
    return false
  }
}

export async function asegurarLinkDeEncuesta(visitaId: string, actorId: string | null, ahora: Date): Promise<EncuestaFila> {
  const existente = await datos.leerEncuestaDeVisita(visitaId)
  if (existente) return existente
  let ultimo: unknown = null
  // Un choque de token (128 bits: prácticamente imposible) haría fallar el INSERT por UNIQUE: otro intento con otro token.
  for (let intento = 0; intento < 2; intento++) {
    try {
      return await datos.asegurarEncuesta({ visitId: visitaId, token: tokenDesdeBytes(randomBytes(16)), expiresAt: vencimientoDesde(ahora), actorId })
    } catch (e) {
      ultimo = e
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error('no se pudo crear la encuesta')
}

async function decidir(ec: EncuestaConVisita, reenvio: boolean, ahora: Date): Promise<{ decision: DecisionEnvio; plantilla: string | null }> {
  const { encuesta, visita } = ec
  const plantilla = plantillaConfigurada()
  const decision = decidirEnvioEncuesta({
    ajustes: await datos.leerAjustesEncuesta(),
    tieneRegalo: await tieneRegalo(visita.property_id),
    telefono: visita.client_phone,
    plantilla,
    yaEnviada: encuesta.send_status === 'enviada',
    reenvio,
    completada: encuesta.completed_at !== null,
    vencida: estaVencida(encuesta.expires_at, ahora),
  }, normalizeWhatsappPhone)
  return { decision, plantilla }
}

export async function prepararYEnviarEncuesta(
  visitaId: string,
  o: { reenvio: boolean; actorId: string | null; ahora: Date },
): Promise<EncuestaParaFicha> {
  const fila = await asegurarLinkDeEncuesta(visitaId, o.actorId, o.ahora)
  const ec = await datos.leerEncuestaConVisita({ id: fila.id })
  if (!ec) throw new Error('la encuesta recién creada no se pudo leer')
  const { encuesta, visita } = ec
  const { decision, plantilla } = await decidir(ec, o.reenvio, o.ahora)

  if (!decision.enviar) {
    if (o.reenvio) throw new ReenvioNoPermitido(decision.motivo)
    if (encuesta.send_status !== 'enviada' && decision.motivo !== 'ya_enviada') {
      await datos.registrarEnvio(encuesta.id, { send_status: 'omitida', send_skip_reason: decision.motivo, send_error: null })
    }
  } else {
    const envio = armarEnvioEncuesta(plantilla, {
      nombre: visita.client_name, direccion: visita.propiedad?.address ?? null,
      fecha: fechaCorta(visita.scheduled_at), token: encuesta.token,
    })
    if (!envio) {
      await datos.registrarEnvio(encuesta.id, { send_status: 'omitida', send_skip_reason: 'plantilla_desconocida', send_error: null })
    } else {
      const r = await mandarPlantilla(envio, { telefono: decision.telefono, leadId: visita.lead_id, propertyId: visita.property_id, sentBy: o.actorId })
      if (r.ok && r.modoPrueba) {
        await datos.registrarEnvio(encuesta.id, { send_status: 'omitida', send_skip_reason: 'modo_prueba_whatsapp', send_error: null })
      } else if (r.ok) {
        await datos.registrarEnvio(encuesta.id, {
          send_status: 'enviada', send_skip_reason: null, send_error: null,
          sent_at: o.ahora.toISOString(), sent_to: decision.telefono, wa_message_id: r.messageId,
        })
      } else {
        await datos.registrarEnvio(encuesta.id, { send_status: 'fallida', send_skip_reason: null, send_error: motivoLegibleDeMeta(r.codigo, r.error) })
      }
    }
  }
  const ficha = await encuestaParaFicha(visitaId, o.ahora)
  if (!ficha) throw new Error('la encuesta no se pudo releer')
  return ficha
}

export async function encuestaParaFicha(visitaId: string, ahora: Date): Promise<EncuestaParaFicha | null> {
  const ec = await datos.leerEncuestaConVisita({ visitId: visitaId })
  if (!ec) return null
  const wa = ec.encuesta.wa_message_id ? await datos.estadoDelMensaje(ec.encuesta.wa_message_id) : null
  const { decision } = await decidir(ec, true, ahora)
  return armarEncuestaParaFicha(ec.encuesta, { wa, puedeReenviar: decision.enviar, ahora, base: baseDeLaApp() })
}

/** Para las rutas de la ficha: si la encuesta no se puede leer, la ficha se muestra igual (sin la tarjeta). */
export async function encuestaParaFichaSegura(visitaId: string, ahora: Date): Promise<EncuestaParaFicha | null> {
  try {
    return await encuestaParaFicha(visitaId, ahora)
  } catch (e) {
    console.error('[encuesta] no se pudo leer la encuesta de la ficha', visitaId, e)
    return null
  }
}
```

- [ ] **Paso 6: Correr y verlos pasar** — el comando del Paso 3. Esperado: PASS.

- [ ] **Paso 7: Tests nuevos de las rutas de la ficha** — en `app/api/visits/[id]/estado/route.test.ts`,
  sumar al `vi.hoisted` un `servicioMock: { prepararYEnviarEncuesta: vi.fn(), encuestaParaFichaSegura: vi.fn() }`,
  el mock `vi.mock('@/lib/visitas/encuesta/servicio', () => servicioMock)`, en `beforeEach`
  `servicioMock.prepararYEnviarEncuesta.mockReset().mockResolvedValue(ENCUESTA_FICHA)` y
  `servicioMock.encuestaParaFichaSegura.mockReset().mockResolvedValue(null)`, con
  `const ENCUESTA_FICHA = { link: 'https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y', estado: { clave: 'sin_enviar', texto: 'Sin enviar (envío apagado)' }, puedeReenviar: false, vencida: false, venceEl: '2099-02-09T15:00:00.000Z', respondidaEl: null, respuestas: null, eventos: [] }`,
  y estos tres `it`:

```ts
  it('"Se realizó" crea la encuesta con el autor y la devuelve', async () => {
    const res = await pedir({ tipo: 'realizada', interes: 'alto' })
    expect(servicioMock.prepararYEnviarEncuesta).toHaveBeenCalledWith(VISITA, { reenvio: false, actorId: estado.id, ahora: expect.any(Date) })
    expect((await res.json()).data.encuesta).toEqual(ENCUESTA_FICHA)
  })
  it('si la encuesta falla, la visita queda realizada igual (200) y la ficha la relee', async () => {
    servicioMock.prepararYEnviarEncuesta.mockRejectedValue(new Error('boom'))
    const res = await pedir({ tipo: 'realizada', interes: 'medio' })
    expect(res.status).toBe(200)
    expect(datosMock.actualizarVisita).toHaveBeenCalled()
    expect(servicioMock.encuestaParaFichaSegura).toHaveBeenCalledWith(VISITA, expect.any(Date))
  })
  it('"No se realizó" no crea encuesta', async () => {
    await pedir({ tipo: 'no_realizada', motivo: 'no_vino' })
    expect(servicioMock.prepararYEnviarEncuesta).not.toHaveBeenCalled()
  })
```

  En `app/api/visits/[id]/route.test.ts`: mismo `servicioMock` (solo `encuestaParaFichaSegura`,
  resuelto con `null` en `beforeEach`) y:

```ts
  it('suma la encuesta y sus eventos ordenados en el historial', async () => {
    servicioMock.encuestaParaFichaSegura.mockResolvedValue({
      link: 'x', estado: { clave: 'enviada', texto: 'Enviada' }, puedeReenviar: false, vencida: false, venceEl: '2099-02-09T00:00:00Z',
      respondidaEl: null, respuestas: null,
      eventos: [{ id: 'encuesta-enviada-1', kind: 'encuesta_enviada', created_at: '2099-01-02T00:00:00Z', from_status: null, to_status: null,
        from_scheduled_at: null, to_scheduled_at: null, reason: null, note: null, actor: null, desde_asesor: null, hacia_asesor: null }],
    })
    datosMock.eventosDeLaVisita.mockResolvedValue([{ id: 'e1', kind: 'creada', created_at: '2099-01-01T00:00:00Z', from_status: null, to_status: null,
      from_scheduled_at: null, to_scheduled_at: null, reason: null, note: null, actor: 'Lucas', desde_asesor: null, hacia_asesor: null }])
    const body = await (await pedir(VISITA)).json()
    expect(body.data.encuesta.estado.texto).toBe('Enviada')
    expect(body.data.eventos.map((e: { kind: string }) => e.kind)).toEqual(['creada', 'encuesta_enviada'])
  })
```

  Test NUEVO `app/api/visits/[id]/encuesta/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, datosMock, servicioMock } = vi.hoisted(() => ({
  estado: { role: 'asesor', id: '22222222-2222-4222-8222-222222222222', logueado: true },
  datosMock: { leerVisita: vi.fn() },
  servicioMock: { asegurarLinkDeEncuesta: vi.fn(), encuestaParaFicha: vi.fn(), prepararYEnviarEncuesta: vi.fn(), ReenvioNoPermitido: class extends Error {} },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado ? { id: estado.id, email: 'a@b.c', profile: { id: estado.id, role: estado.role, is_active: true } } : null),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)
vi.mock('@/lib/visitas/encuesta/servicio', () => servicioMock)

import { GET, POST } from './route'

const VISITA = '66666666-6666-4666-8666-666666666666'
const FICHA = { link: 'https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y' }
const visita = (p: Record<string, unknown> = {}) => ({ id: VISITA, status: 'completed', advisor_id: estado.id, created_by: estado.id, ...p })
const ctx = (id = VISITA) => ({ params: Promise.resolve({ id }) })
const post = (body: unknown, id = VISITA) => POST(new Request('http://local', { method: 'POST', body: JSON.stringify(body) }) as never, ctx(id))

beforeEach(() => {
  datosMock.leerVisita.mockReset().mockResolvedValue(visita())
  servicioMock.asegurarLinkDeEncuesta.mockReset()
  servicioMock.encuestaParaFicha.mockReset().mockResolvedValue(FICHA)
  servicioMock.prepararYEnviarEncuesta.mockReset().mockResolvedValue(FICHA)
  estado.role = 'asesor'; estado.logueado = true
})

describe('/api/visits/[id]/encuesta', () => {
  it('sin sesión 401; abogado 403; ninguno lee', async () => {
    estado.logueado = false
    expect((await GET(new Request('http://local') as never, ctx())).status).toBe(401)
    estado.logueado = true; estado.role = 'abogado'
    expect((await GET(new Request('http://local') as never, ctx())).status).toBe(403)
    expect(datosMock.leerVisita).not.toHaveBeenCalled()
  })
  it('una visita ajena es 404 para el asesor; un id inventado también', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ advisor_id: 'otro', created_by: 'otro' }))
    expect((await GET(new Request('http://local') as never, ctx())).status).toBe(404)
    expect((await GET(new Request('http://local') as never, ctx('x'))).status).toBe(404)
  })
  it('GET devuelve la encuesta de la ficha', async () => {
    const body = await (await GET(new Request('http://local') as never, ctx())).json()
    expect(body.data).toEqual(FICHA)
  })
  it('crear link solo en una visita realizada', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ status: 'scheduled' }))
    const res = await post({ accion: 'link' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('La encuesta se crea cuando la visita se marca como realizada')
  })
  it('crear link (sin mandar nada)', async () => {
    expect((await post({ accion: 'link' })).status).toBe(200)
    expect(servicioMock.asegurarLinkDeEncuesta).toHaveBeenCalledWith(VISITA, estado.id, expect.any(Date))
    expect(servicioMock.prepararYEnviarEncuesta).not.toHaveBeenCalled()
  })
  it('reenviar llama con reenvío explícito; si no se puede, 409 con el motivo', async () => {
    expect((await post({ accion: 'reenviar' })).status).toBe(200)
    expect(servicioMock.prepararYEnviarEncuesta).toHaveBeenCalledWith(VISITA, { reenvio: true, actorId: estado.id, ahora: expect.any(Date) })
    servicioMock.prepararYEnviarEncuesta.mockRejectedValue(new servicioMock.ReenvioNoPermitido('No se puede reenviar: envío apagado'))
    const res = await post({ accion: 'reenviar' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('No se puede reenviar: envío apagado')
  })
  it('acción inválida: 400', async () => {
    expect((await post({ accion: 'borrar' })).status).toBe(400)
  })
})
```

- [ ] **Paso 8: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts app/api/visits`.
  Esperado: FAIL en los `it` nuevos (la ruta de encuesta no existe; las otras no devuelven `encuesta`).

- [ ] **Paso 9: Modificar `app/api/visits/[id]/estado/route.ts`** — agregar los imports:

```ts
import { prepararYEnviarEncuesta, encuestaParaFichaSegura } from '@/lib/visitas/encuesta/servicio'
import { mezclarEventos, type EncuestaParaFicha } from '@/lib/visitas/encuesta/ficha'
```

  inmediatamente DESPUÉS del bloque `if (r.patch.status === 'completed') { try { … advancePipelineState … } catch … }`, agregar:

```ts
    // La encuesta se crea SIEMPRE al marcar "Se realizó" (adenda §11.1) y se decide el envío.
    // Un fallo acá (base, Meta) NUNCA revierte la visita: ya quedó realizada, y la ficha ofrece
    // "Crear link de la encuesta" o "Reenviar por WhatsApp".
    let encuesta: EncuestaParaFicha | null = null
    if (r.patch.status === 'completed') {
      try {
        encuesta = await prepararYEnviarEncuesta(id, { reenvio: false, actorId: user.id, ahora })
      } catch (e) {
        console.error('[visits/estado] la encuesta no se pudo preparar; la visita quedó realizada igual', e)
      }
    }
```

  dentro del `try` de la relectura, después de `eventos = await datos.eventosDeLaVisita(id)`:

```ts
      if (!encuesta) encuesta = await encuestaParaFichaSegura(id, new Date())
```

  y el `return` final pasa a:

```ts
    return NextResponse.json({
      data: actualizada
        ? { ...actualizada, eventos: mezclarEventos(eventos, encuesta?.eventos ?? []), acciones: accionesParaRol(accionesDisponibles(actualizada, new Date()), role), encuesta }
        : null,
    })
```

- [ ] **Paso 10: Modificar `app/api/visits/[id]/route.ts`** — imports:

```ts
import { encuestaParaFichaSegura } from '@/lib/visitas/encuesta/servicio'
import { mezclarEventos } from '@/lib/visitas/encuesta/ficha'
```

  y reemplazar las dos líneas finales del `try` por:

```ts
    const eventos = await datos.eventosDeLaVisita(id)
    const encuesta = await encuestaParaFichaSegura(id, new Date())
    return NextResponse.json({
      data: { ...visita, eventos: mezclarEventos(eventos, encuesta?.eventos ?? []), acciones: accionesParaRol(accionesDisponibles(visita, new Date()), role), encuesta },
    })
```

- [ ] **Paso 11: Crear `app/api/visits/[id]/encuesta/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { puedeGestionarVisitas, puedeVerVisita } from '@/lib/visitas/acceso'
import { asegurarLinkDeEncuesta, encuestaParaFicha, prepararYEnviarEncuesta, ReenvioNoPermitido } from '@/lib/visitas/encuesta/servicio'
import type { Role, UserWithProfile } from '@/types/auth.types'

/**
 * La encuesta desde la ficha de la visita (adenda §11.4): estado, "Crear link" (visitas realizadas
 * antes de esta entrega) y "Reenviar por WhatsApp". Mismo permiso que ver la visita; el abogado no.
 */
const cuerpo = z.object({ accion: z.enum(['link', 'reenviar']) }).strict()

async function permitir(id: string): Promise<{ ok: true; user: UserWithProfile; status: string } | { ok: false; res: NextResponse }> {
  const user = await getUser()
  if (!user || !user.profile.is_active) return { ok: false, res: NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 }) }
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return { ok: false, res: NextResponse.json({ error: 'No tenés permiso sobre esta visita' }, { status: 403 }) }
  if (!z.string().uuid().safeParse(id).success) return { ok: false, res: NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 }) }
  const visita = await datos.leerVisita(id)
  if (!visita || !puedeVerVisita(role, user.id, visita)) return { ok: false, res: NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 }) }
  return { ok: true, user, status: visita.status }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const p = await permitir(id)
    if (!p.ok) return p.res
    return NextResponse.json({ data: await encuestaParaFicha(id, new Date()) })
  } catch (e) {
    console.error('[GET /api/visits/[id]/encuesta]', e)
    return NextResponse.json({ error: 'No pudimos cargar la encuesta' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const p = await permitir(id)
    if (!p.ok) return p.res
    const parsed = cuerpo.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    if (p.status !== 'completed') {
      return NextResponse.json({ error: 'La encuesta se crea cuando la visita se marca como realizada' }, { status: 409 })
    }
    const ahora = new Date()
    if (parsed.data.accion === 'link') {
      await asegurarLinkDeEncuesta(id, p.user.id, ahora)
      return NextResponse.json({ data: await encuestaParaFicha(id, ahora) })
    }
    try {
      return NextResponse.json({ data: await prepararYEnviarEncuesta(id, { reenvio: true, actorId: p.user.id, ahora }) })
    } catch (e) {
      if (e instanceof ReenvioNoPermitido) return NextResponse.json({ error: e.message }, { status: 409 })
      throw e
    }
  } catch (e) {
    console.error('[POST /api/visits/[id]/encuesta]', e)
    return NextResponse.json({ error: 'No pudimos hacer el cambio. Probá de nuevo.' }, { status: 500 })
  }
}
```

- [ ] **Paso 12: Correr y verlos pasar** — `npx vitest run --config vitest.visitas.config.ts app/api/visits lib/visitas/encuesta`.
  Esperado: PASS (incluidos todos los `it` previos de las Entregas 1 y 2 de esas rutas). Más `tsc` y
  eslint sobre los archivos tocados.

- [ ] **Paso 13: Commit** — `git add lib/visitas/encuesta/ficha.ts lib/visitas/encuesta/ficha.test.ts lib/visitas/encuesta/servicio.ts lib/visitas/encuesta/servicio.test.ts "app/api/visits/[id]/estado/route.ts" "app/api/visits/[id]/estado/route.test.ts" "app/api/visits/[id]/route.ts" "app/api/visits/[id]/route.test.ts" "app/api/visits/[id]/encuesta/route.ts" "app/api/visits/[id]/encuesta/route.test.ts"`;
  mensaje `feat(visitas): "Se realizó" crea la encuesta y decide el WhatsApp; ficha y reenvío por API`.

---

### Tarea 9: Emails — al equipo cuando responden y el regalo a la persona

**Files:**
- Create: `emails/VisitSurveyAnsweredEmail.tsx`, `lib/email/notifications/visit-survey-answered.ts` (+`visit-survey-answered.test.ts`)
- Create: `emails/VisitSurveyGiftEmail.tsx`, `lib/email/notifications/visit-survey-gift.ts` (+`visit-survey-gift.test.ts`)
- Modify: `app/(dashboard)/settings/notifications/page.tsx` (`TYPE_LABELS`)

**Interfaces:**
- Consumes: `RespuestasParaFicha` (Tarea 8); `sendEmail`, `renderEmail`, `getUserById`,
  `getEmailsByRole`, `getAdminsAndOwners`, `dedupEmails`, `emailsOf`; `formatearFechaLarga`.
- Produces:
  - `TECHO_POR_DESTINATARIO_MS = 3000`; `DatosEncuestaRespondida { visitaId; asesorId: string | null; direccion: string; persona: string; scheduledAt: string; respuestas: RespuestasParaFicha }`;
    `notificarEncuestaRespondida(d): Promise<SendEmailResult | null>` (`null` = nadie activo a quien
    avisar). Las filas del email salen de `filasDeRespuestas` (Tarea 8), las mismas que la ficha.
  - `DatosRegaloPorEmail { encuestaId; email; nombre; direccion; titulo; urlDescarga }`;
    `enviarRegaloPorEmail(d): Promise<SendEmailResult>`.

- [ ] **Paso 1: Tests** — `lib/email/notifications/visit-survey-answered.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { envio, receptores } = vi.hoisted(() => ({
  envio: vi.fn(),
  receptores: { getUserById: vi.fn(), getEmailsByRole: vi.fn(), getAdminsAndOwners: vi.fn() },
}))
vi.mock('@/lib/email/resend-client', () => ({ sendEmail: envio }))
vi.mock('@/lib/email/recipients', async () => {
  const real = await vi.importActual<typeof import('@/lib/email/recipients')>('@/lib/email/recipients')
  return { ...receptores, dedupEmails: real.dedupEmails, emailsOf: real.emailsOf }
})

import { notificarEncuestaRespondida, TECHO_POR_DESTINATARIO_MS } from './visit-survey-answered'
import type { RespuestasParaFicha } from '@/lib/visitas/encuesta/ficha'

const RESPUESTAS: RespuestasParaFicha = {
  completa: true, leGusto: true, masGusto: ['La luz'], menosGusto: ['Nada en especial'], precio: 'Le parece alto',
  oferta: 'US$ 135.000', quiereSimilares: true, telefono: '5491158234521', email: null,
}
const DATOS = { visitaId: 'v1', asesorId: 'a1', direccion: 'Doblas 248', persona: 'Mariana Gómez', scheduledAt: '2026-10-14T13:30:00Z', respuestas: RESPUESTAS }

beforeEach(() => {
  envio.mockReset().mockResolvedValue({ ok: true, sent: 3, skipped: 0, failed: 0, errors: [] })
  receptores.getUserById.mockReset().mockResolvedValue({ id: 'a1', email: 'lucas@inmodf.com.ar', full_name: 'Lucas', role: 'asesor' })
  receptores.getEmailsByRole.mockReset().mockResolvedValue(['coordi@inmodf.com.ar', 'LUCAS@inmodf.com.ar'])
  receptores.getAdminsAndOwners.mockReset().mockResolvedValue([{ id: 'd', email: 'diego@inmodf.com.ar', full_name: 'Diego', role: 'dueno' }])
})

describe('notificarEncuestaRespondida', () => {
  it('asesor + coordinadores + admins/dueños, sin repetidos, con techo de 3 s por destinatario', async () => {
    await notificarEncuestaRespondida(DATOS)
    expect(receptores.getEmailsByRole).toHaveBeenCalledWith('coordinador')
    const pedido = envio.mock.calls[0][0]
    expect(pedido.to).toEqual(['lucas@inmodf.com.ar', 'coordi@inmodf.com.ar', 'diego@inmodf.com.ar'])
    expect(pedido).toMatchObject({ notificationType: 'visit_survey_answered', entityId: 'v1', idempotent: true, timeoutMs: TECHO_POR_DESTINATARIO_MS })
    expect(pedido.subject).toBe('Respondieron la encuesta: Doblas 248')
    expect(pedido.html).toContain('https://inmodf.com.ar/visits/v1')
  })
  it('sin nadie activo: null (el aviso no corresponde, no es un error)', async () => {
    receptores.getUserById.mockResolvedValue(null); receptores.getEmailsByRole.mockResolvedValue([]); receptores.getAdminsAndOwners.mockResolvedValue([])
    expect(await notificarEncuestaRespondida(DATOS)).toBeNull()
    expect(envio).not.toHaveBeenCalled()
  })
  it('lo que escribió la persona viaja como TEXTO (escapado)', async () => {
    await notificarEncuestaRespondida({ ...DATOS, persona: '<script>alert(1)</script>', respuestas: { ...RESPUESTAS, masGusto: ['Otra: <b>todo</b>'] } })
    const html: string = envio.mock.calls[0][0].html
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<b>todo</b>')
  })
  it('las respuestas van en palabras (las mismas filas que la ficha)', async () => {
    await notificarEncuestaRespondida(DATOS)
    const html: string = envio.mock.calls[0][0].html
    expect(html).toContain('Le parece alto')
    expect(html).toContain('US$ 135.000')
  })
})
```

  `lib/email/notifications/visit-survey-gift.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { envio } = vi.hoisted(() => ({ envio: vi.fn() }))
vi.mock('@/lib/email/resend-client', () => ({ sendEmail: envio }))

import { enviarRegaloPorEmail } from './visit-survey-gift'

beforeEach(() => { envio.mockReset().mockResolvedValue({ ok: true, sent: 1, skipped: 0, failed: 0, errors: [] }) })

describe('enviarRegaloPorEmail', () => {
  it('a la persona, una sola vez por encuesta, con el link de descarga', async () => {
    await enviarRegaloPorEmail({ encuestaId: 'e1', email: 'ana@mail.com', nombre: 'Ana', direccion: 'Doblas 248', titulo: 'Guía de Caballito', urlDescarga: 'https://inmodf.com.ar/api/public/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y/regalo' })
    const pedido = envio.mock.calls[0][0]
    expect(pedido).toMatchObject({ notificationType: 'visit_survey_gift_client', entityId: 'e1', to: 'ana@mail.com', subject: 'Tu material de Doblas 248' })
    expect(pedido.idempotent).not.toBe(false)
    expect(pedido.html).toContain('https://inmodf.com.ar/api/public/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y/regalo')
    expect(pedido.html).toContain('Guía de Caballito')
  })
})
```

- [ ] **Paso 2: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/email/notifications/visit-survey-answered.test.ts lib/email/notifications/visit-survey-gift.test.ts`.
  Esperado: FAIL (módulos inexistentes).

- [ ] **Paso 3: Plantillas de email** — `emails/VisitSurveyAnsweredEmail.tsx`:

```tsx
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr } from '@react-email/components'

export interface PropsEncuestaRespondida {
  direccion: string
  persona: string
  fechaVisita: string
  filas: Array<{ etiqueta: string; valor: string }>
  visitaUrl: string
}

/** Todo lo que viene de la persona se pasa como texto: React lo escapa. Nada de HTML armado a mano. */
export default function VisitSurveyAnsweredEmail(p: PropsEncuestaRespondida) {
  return (
    <Html>
      <Head />
      <Preview>{p.persona} respondió la encuesta de {p.direccion}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#fff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ fontSize: 20 }}>Respondieron la encuesta</Heading>
          <Text>{p.persona} contó qué le pareció la visita a {p.direccion} del {p.fechaVisita}.</Text>
          <Section style={{ backgroundColor: '#f0f4f8', padding: 16, borderRadius: 6 }}>
            {p.filas.map(f => (
              <Text key={f.etiqueta} style={{ margin: '4px 0' }}><strong>{f.etiqueta}:</strong> {f.valor}</Text>
            ))}
          </Section>
          <Section style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button href={p.visitaUrl} style={{ backgroundColor: '#2563eb', color: '#fff', padding: '12px 24px', borderRadius: 6 }}>
              Ver la visita
            </Button>
          </Section>
          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>El propietario no ve el nombre de quien respondió. Diego Ferreyra Inmobiliaria</Text>
        </Container>
      </Body>
    </Html>
  )
}
```

  `emails/VisitSurveyGiftEmail.tsx`:

```tsx
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr } from '@react-email/components'

export interface PropsRegaloEncuesta { nombre: string; direccion: string; titulo: string; urlDescarga: string }

export default function VisitSurveyGiftEmail(p: PropsRegaloEncuesta) {
  return (
    <Html>
      <Head />
      <Preview>{p.titulo}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#fff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ fontSize: 20 }}>{p.titulo}</Heading>
          <Text>{p.nombre ? `Hola ${p.nombre}, gracias` : 'Gracias'} por contarnos qué te pareció {p.direccion}.</Text>
          <Text>Acá tenés el material que pediste:</Text>
          <Section style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button href={p.urlDescarga} style={{ backgroundColor: '#2563eb', color: '#fff', padding: '12px 24px', borderRadius: 6 }}>
              Descargar
            </Button>
          </Section>
          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>Si querés volver a verla o hacer una oferta, respondé el WhatsApp de la visita. Diego Ferreyra Inmobiliaria</Text>
        </Container>
      </Body>
    </Html>
  )
}
```

- [ ] **Paso 4: Implementar `lib/email/notifications/visit-survey-answered.ts`**

```ts
import 'server-only'
/**
 * Email al equipo cuando alguien completa la encuesta (spec §4.10): asesor de la visita +
 * coordinadores + admins/dueños. Lo dispara el canal "equipo" de los avisos
 * (lib/visitas/encuesta/avisos-servicio.ts), fuera del pedido final de la encuesta.
 *
 * `idempotent: true`: es UNA encuesta por visita, así que un reintento (por un destinatario que
 * falló) no le repite el email a los que ya lo recibieron. Techo de 3 s por destinatario (no 8):
 * son varios en serie y el pedido entero tiene que caber en Netlify (ver avisos.ts).
 * Devuelve `null` si no hay nadie activo a quien avisar. `sendEmail` NUNCA lanza.
 */
import { sendEmail, type SendEmailResult } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { getUserById, getEmailsByRole, getAdminsAndOwners, dedupEmails, emailsOf } from '@/lib/email/recipients'
import { formatearFechaLarga } from '@/lib/visitas/horario'
import { filasDeRespuestas, type RespuestasParaFicha } from '@/lib/visitas/encuesta/ficha'
import VisitSurveyAnsweredEmail from '@/emails/VisitSurveyAnsweredEmail'

export const TECHO_POR_DESTINATARIO_MS = 3_000

export interface DatosEncuestaRespondida {
  visitaId: string
  asesorId: string | null
  direccion: string
  persona: string
  scheduledAt: string
  respuestas: RespuestasParaFicha
}

function urlDeLaApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://inmodf.com.ar').replace(/\/+$/, '')
}

export async function notificarEncuestaRespondida(d: DatosEncuestaRespondida): Promise<SendEmailResult | null> {
  const [asesor, coordinadores, admins] = await Promise.all([
    getUserById(d.asesorId), getEmailsByRole('coordinador'), getAdminsAndOwners(),
  ])
  const to = dedupEmails(asesor ? [asesor.email] : [], coordinadores, emailsOf(admins))
  if (to.length === 0) return null
  const html = await renderEmail(VisitSurveyAnsweredEmail({
    direccion: d.direccion,
    persona: d.persona.trim() || 'La persona',
    fechaVisita: formatearFechaLarga(d.scheduledAt),
    filas: filasDeRespuestas(d.respuestas),
    visitaUrl: `${urlDeLaApp()}/visits/${d.visitaId}`,
  }))
  return sendEmail({
    notificationType: 'visit_survey_answered',
    entityType: 'property',
    entityId: d.visitaId,
    to,
    subject: `Respondieron la encuesta: ${d.direccion}`,
    html,
    idempotent: true,
    timeoutMs: TECHO_POR_DESTINATARIO_MS,
  })
}
```

- [ ] **Paso 5: Implementar `lib/email/notifications/visit-survey-gift.ts`**

```ts
import 'server-only'
/**
 * Email con el regalo para la persona que completó la encuesta y dejó su email (adenda §11.1.4b).
 * El link apunta a NUESTRA ruta de descarga, que firma una URL nueva cada vez: el email sirve
 * aunque pasen días (una URL firmada pegada en el email vencería en 10 minutos).
 * Idempotente por encuesta: un reintento no le repite el email. `sendEmail` NUNCA lanza.
 */
import { sendEmail, type SendEmailResult } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import VisitSurveyGiftEmail from '@/emails/VisitSurveyGiftEmail'

export interface DatosRegaloPorEmail {
  encuestaId: string
  email: string
  nombre: string
  direccion: string
  titulo: string
  urlDescarga: string
}

export async function enviarRegaloPorEmail(d: DatosRegaloPorEmail): Promise<SendEmailResult> {
  const html = await renderEmail(VisitSurveyGiftEmail({ nombre: d.nombre, direccion: d.direccion, titulo: d.titulo, urlDescarga: d.urlDescarga }))
  return sendEmail({
    notificationType: 'visit_survey_gift_client',
    entityType: 'property',
    entityId: d.encuestaId,
    to: d.email,
    subject: `Tu material de ${d.direccion}`,
    html,
  })
}
```

- [ ] **Paso 6: Etiquetas del registro de emails** — en `app/(dashboard)/settings/notifications/page.tsx`,
  dentro de `TYPE_LABELS`, agregar:

```ts
  visit_survey_answered: 'Encuesta respondida (equipo)',
  visit_survey_gift_client: 'Regalo de la encuesta (cliente)',
```

- [ ] **Paso 7: Correr y verlos pasar** — el comando del Paso 2. Esperado: PASS. Más `tsc` y eslint
  sobre los cinco archivos.

- [ ] **Paso 8: Commit** — `git add emails/VisitSurveyAnsweredEmail.tsx emails/VisitSurveyGiftEmail.tsx lib/email/notifications/visit-survey-answered.ts lib/email/notifications/visit-survey-answered.test.ts lib/email/notifications/visit-survey-gift.ts lib/email/notifications/visit-survey-gift.test.ts "app/(dashboard)/settings/notifications/page.tsx"`;
  mensaje `feat(visitas): emails de encuesta respondida (equipo) y del regalo (persona)`.

---

### Tarea 10: Avisos en dos tiempos (ruta pública + barrido del cron)

**Files:**
- Create: `lib/visitas/encuesta/avisos.ts` (+`avisos.test.ts`)
- Create: `lib/visitas/encuesta/avisos-servicio.ts` (+`avisos-servicio.test.ts`)
- Create: `app/api/public/encuesta/[token]/avisos/route.ts` (+`route.test.ts`)
- Modify: `app/api/cron/visit-reminders/route.ts` (+`route.test.ts`)

**Interfaces:**
- Consumes: Tareas 2–9 (`datos.*`, `mandarPlantilla`, `decidirRegaloPorWhatsapp`, `armarEnvioRegalo`,
  `nombreDePila`, `motivoLegibleDeMeta`, `respuestasParaFicha`, `nombreDeDescarga`,
  `SEGUNDOS_URL_WHATSAPP`, `urlDescargaDelRegalo`, `notificarEncuestaRespondida`,
  `enviarRegaloPorEmail`, `TECHO_POR_DESTINATARIO_MS`); `PREFIJO_ERROR_TIEMPO`.
- Produces:
  - `avisos.ts`: `LIMITE_INICIO_MS`, `TECHO_NETLIFY_MS = 26000`, `TIMEOUT_CANAL_MS`,
    `MAX_INTENTOS_AVISO = 3`, `ESPERA_ANTES_DEL_BARRIDO_MS`, `DIAS_DEL_BARRIDO = 7`,
    `puedeEmpezar(canal, transcurridoMs)`, `canalesPendientes(e)`, `ResultadoEmailLike`,
    `cierreDeEmail(r)`, `cierreTrasFallo(intentosPrevios)`, `rangoDelBarrido(ahora)`,
    `peorCasoEquipoMs(destinatarios)`.
  - `avisos-servicio.ts`: `ResultadoCanal`, `ContextoAvisos { inicio: number; ahora: Date; reloj?: () => number }`,
    `procesarAvisosDeEncuesta(encuestaId, ctx): Promise<Partial<Record<CanalAviso, ResultadoCanal>>>`,
    `ResumenBarrido { revisadas; canalesEnviados; sinTiempo }`, `barrerAvisosPendientes(ctx): Promise<ResumenBarrido>`.
  - `POST /api/public/encuesta/[token]/avisos` → `{ data: Partial<Record<CanalAviso, ResultadoCanal>> }`.
  - La respuesta del cron suma `encuestas: ResumenBarrido | { error: string }`.

- [ ] **Paso 1: Tests** — `lib/visitas/encuesta/avisos.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  puedeEmpezar, canalesPendientes, cierreDeEmail, cierreTrasFallo, rangoDelBarrido, peorCasoEquipoMs,
  LIMITE_INICIO_MS, TECHO_NETLIFY_MS, TIMEOUT_CANAL_MS, MAX_INTENTOS_AVISO,
} from './avisos'
import { encuestaDePrueba } from '@/test/visitas/encuesta-de-prueba'

describe('presupuesto de tiempo (Netlify corta a ~26 s; maxDuration no sirve acá)', () => {
  it('con 6 destinatarios el email al equipo entra; con 7 ya no (si se suman, este test avisa)', () => {
    expect(peorCasoEquipoMs(6)).toBeLessThan(TECHO_NETLIFY_MS)
    expect(peorCasoEquipoMs(7)).toBeGreaterThanOrEqual(TECHO_NETLIFY_MS)
  })
  it('cada canal de regalo, empezado en su límite, termina antes del techo', () => {
    expect(LIMITE_INICIO_MS.regalo_whatsapp + TIMEOUT_CANAL_MS).toBeLessThan(TECHO_NETLIFY_MS)
    expect(LIMITE_INICIO_MS.regalo_email + TIMEOUT_CANAL_MS).toBeLessThan(TECHO_NETLIFY_MS)
  })
  it('puedeEmpezar respeta el límite de cada canal', () => {
    expect(puedeEmpezar('equipo', 4_999)).toBe(true)
    expect(puedeEmpezar('equipo', 5_000)).toBe(false)
    expect(puedeEmpezar('regalo_email', 15_000)).toBe(true)
  })
})

describe('canalesPendientes', () => {
  it('solo en encuestas terminadas, en orden, y con intentos bajo el tope', () => {
    expect(canalesPendientes(encuestaDePrueba())).toEqual([])
    const hecha = encuestaDePrueba({ completed_at: '2026-10-15T14:00:00Z', gift_whatsapp_status: 'no_corresponde' })
    expect(canalesPendientes(hecha)).toEqual(['equipo', 'regalo_email'])
    expect(canalesPendientes({ ...hecha, notice_attempts: MAX_INTENTOS_AVISO })).toEqual([])
  })
})

describe('cierres', () => {
  it('email: salió → enviado; vencido → fallido (no se reintenta: pudo haber salido); otro → pendiente', () => {
    expect(cierreDeEmail({ ok: true, sent: 2, failed: 0, errors: [] })).toBe('enviado')
    expect(cierreDeEmail({ ok: false, sent: 1, failed: 1, errors: ['Tiempo de espera agotado: Resend no respondió en 3000 ms'] })).toBe('fallido')
    expect(cierreDeEmail({ ok: false, sent: 0, failed: 0, errors: ['RESEND_API_KEY not set; skipping email send'] })).toBe('pendiente')
    expect(cierreDeEmail(null)).toBe('pendiente')
  })
  it('tras un fallo vuelve a pendiente hasta el tercero', () => {
    expect(cierreTrasFallo(0)).toEqual({ estado: 'pendiente', intentos: 1 })
    expect(cierreTrasFallo(2)).toEqual({ estado: 'fallido', intentos: 3 })
  })
  it('el barrido mira los últimos 7 días, dejando 2 minutos a la pantalla de gracias', () => {
    expect(rangoDelBarrido(new Date('2026-10-15T15:00:00Z'))).toEqual({ desde: '2026-10-08T15:00:00.000Z', hasta: '2026-10-15T14:58:00.000Z' })
  })
})
```

  `lib/visitas/encuesta/avisos-servicio.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock, mandarMock, equipoMock, regaloEmailMock } = vi.hoisted(() => ({
  datosMock: {
    leerEncuestaConVisita: vi.fn(), reservarAviso: vi.fn(), cerrarAviso: vi.fn(), leerRegalo: vi.fn(),
    leerAjustesEncuesta: vi.fn(), urlFirmada: vi.fn(), encuestasConAvisosPendientes: vi.fn(),
  },
  mandarMock: vi.fn(),
  equipoMock: vi.fn(),
  regaloEmailMock: vi.fn(),
}))
vi.mock('./datos', () => datosMock)
vi.mock('./whatsapp', () => ({ mandarPlantilla: mandarMock }))
vi.mock('@/lib/email/notifications/visit-survey-answered', () => ({ notificarEncuestaRespondida: equipoMock, TECHO_POR_DESTINATARIO_MS: 3000 }))
vi.mock('@/lib/email/notifications/visit-survey-gift', () => ({ enviarRegaloPorEmail: regaloEmailMock }))
vi.mock('@/lib/integrations/whatsapp/phone', () => ({
  normalizeWhatsappPhone: (v: string | null | undefined) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `549${d.slice(-10)}` : null
  },
}))

import { procesarAvisosDeEncuesta, barrerAvisosPendientes } from './avisos-servicio'
import { encuestaConVisitaDePrueba, ENCUESTA_DE_PRUEBA, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import { AJUSTES_PRUEBA } from './envio.test-datos'

const AHORA = new Date('2026-10-15T15:00:00Z')
const SALIO = { ok: true, sent: 1, skipped: 0, failed: 0, errors: [] }
const REGALO = { propertyId: 'p', titulo: 'Guía de Caballito', archivoPath: 'properties/p/regalo-x.pdf', archivoNombre: 'Guía.pdf', archivoBytes: 10, portadaPath: null, actualizadoEl: '' }
const terminada = (c = {}) => encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:59:00Z', contact_phone: '5491158234521', contact_email: 'ana@mail.com', liked: true, ...c })
let t = 0
const ctx = () => ({ inicio: 0, ahora: AHORA, reloj: () => t })

beforeEach(() => {
  t = 0
  Object.values(datosMock).forEach(m => m.mockReset())
  mandarMock.mockReset(); equipoMock.mockReset(); regaloEmailMock.mockReset()
  datosMock.leerEncuestaConVisita.mockResolvedValue(terminada())
  datosMock.reservarAviso.mockResolvedValue(true)
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  datosMock.leerAjustesEncuesta.mockResolvedValue(AJUSTES_PRUEBA)
  datosMock.urlFirmada.mockResolvedValue('https://firmada/pdf')
  equipoMock.mockResolvedValue(SALIO)
  regaloEmailMock.mockResolvedValue(SALIO)
  vi.stubEnv('WHATSAPP_TEMPLATE_REGALO_VISITA', 'regalo_visita_v1')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://inmodf.com.ar')
})

describe('procesarAvisosDeEncuesta', () => {
  it('equipo y email del regalo salen; WhatsApp apagado no corresponde', async () => {
    const r = await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())
    expect(r).toEqual({ equipo: 'enviado', regalo_whatsapp: 'no_corresponde', regalo_email: 'enviado' })
    expect(regaloEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ana@mail.com', nombre: 'Mariana', titulo: 'Guía de Caballito',
      urlDescarga: `https://inmodf.com.ar/api/public/encuesta/${TOKEN_DE_PRUEBA}/regalo`,
    }))
    expect(datosMock.cerrarAviso).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA, 'equipo', 'enviado', {})
  })
  it('un teléfono de prueba recibe el PDF por WhatsApp con el interruptor apagado', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['1158234521'] })
    mandarMock.mockResolvedValue({ ok: true, modoPrueba: false, messageId: 'wamid.9' })
    const r = await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())
    expect(r.regalo_whatsapp).toBe('enviado')
    expect(mandarMock.mock.calls[0][1]).toMatchObject({ telefono: '5491158234521', documento: { link: 'https://firmada/pdf', nombre: 'Guía.pdf' } })
    expect(datosMock.cerrarAviso).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA, 'regalo_whatsapp', 'enviado', { waMessageId: 'wamid.9' })
  })
  it('una reserva tomada por otro pedido no se manda (doble pantalla de gracias)', async () => {
    datosMock.reservarAviso.mockResolvedValue(false)
    expect(await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())).toEqual({ equipo: 'ocupado', regalo_whatsapp: 'ocupado', regalo_email: 'ocupado' })
    expect(equipoMock).not.toHaveBeenCalled()
  })
  it('email vencido: fallido, sin reintento; otro fallo: pendiente y cuenta el intento', async () => {
    equipoMock.mockResolvedValue({ ok: false, sent: 0, failed: 1, skipped: 0, errors: ['Tiempo de espera agotado: Resend no respondió en 3000 ms'] })
    regaloEmailMock.mockResolvedValue({ ok: false, sent: 0, failed: 1, skipped: 0, errors: ['500 Resend'] })
    const r = await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())
    expect(r.equipo).toBe('fallido')
    expect(r.regalo_email).toBe('pendiente')
    expect(datosMock.cerrarAviso).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA, 'regalo_email', 'pendiente', { error: '500 Resend', intentos: 1 })
  })
  it('si ya pasaron 6 s, el email al equipo queda para el barrido pero el regalo sale', async () => {
    t = 6_000
    const r = await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())
    expect(r.equipo).toBe('sin_tiempo')
    expect(r.regalo_email).toBe('enviado')
  })
  it('sin email no hay email del regalo; sin regalo no hay regalo', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(terminada({ contact_email: null }))
    datosMock.leerRegalo.mockResolvedValue(null)
    const r = await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())
    expect(r).toMatchObject({ regalo_whatsapp: 'no_corresponde', regalo_email: 'no_corresponde' })
    expect(regaloEmailMock).not.toHaveBeenCalled()
  })
  it('una encuesta sin terminar no avisa nada', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
    expect(await procesarAvisosDeEncuesta(ENCUESTA_DE_PRUEBA, ctx())).toEqual({})
    expect(datosMock.reservarAviso).not.toHaveBeenCalled()
  })
})

describe('barrerAvisosPendientes', () => {
  it('procesa las pendientes y corta cuando se acaba el tiempo', async () => {
    datosMock.encuestasConAvisosPendientes.mockResolvedValue(['a', 'b'])
    let llamadas = 0
    datosMock.leerEncuestaConVisita.mockImplementation(async () => { llamadas++; t = 17_000; return terminada() })
    const r = await barrerAvisosPendientes(ctx())
    expect(datosMock.encuestasConAvisosPendientes).toHaveBeenCalledWith({ desde: '2026-10-08T15:00:00.000Z', hasta: '2026-10-15T14:58:00.000Z' }, 3)
    expect(llamadas).toBe(1)
    expect(r).toEqual({ revisadas: 2, canalesEnviados: 0, sinTiempo: 1 })
  })
})
```

  `app/api/public/encuesta/[token]/avisos/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock, procesarMock } = vi.hoisted(() => ({
  datosMock: { leerEncuestaConVisita: vi.fn(), registrarUso: vi.fn() },
  procesarMock: vi.fn(),
}))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)
vi.mock('@/lib/visitas/encuesta/avisos-servicio', () => ({ procesarAvisosDeEncuesta: procesarMock }))

import { POST } from './route'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA, ENCUESTA_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'

const pedir = (token = TOKEN_DE_PRUEBA) => POST(new Request('http://local', { method: 'POST' }) as never, { params: Promise.resolve({ token }) })

beforeEach(() => {
  datosMock.leerEncuestaConVisita.mockReset().mockResolvedValue(encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:00:00Z' }))
  datosMock.registrarUso.mockReset().mockResolvedValue(true)
  procesarMock.mockReset().mockResolvedValue({ equipo: 'enviado' })
})

describe('POST /api/public/encuesta/[token]/avisos', () => {
  it('un token con otra forma: 404 sin tocar la base', async () => {
    expect((await pedir('x')).status).toBe(404)
    expect(datosMock.leerEncuestaConVisita).not.toHaveBeenCalled()
  })
  it('sin terminar: 409; tope de escrituras: 429', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
    expect((await pedir()).status).toBe(409)
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:00:00Z' }))
    datosMock.registrarUso.mockResolvedValue(false)
    expect((await pedir()).status).toBe(429)
    expect(procesarMock).not.toHaveBeenCalled()
  })
  it('terminada: procesa sus avisos con el reloj del pedido', async () => {
    const body = await (await pedir()).json()
    expect(procesarMock).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA, { inicio: expect.any(Number), ahora: expect.any(Date) })
    expect(body.data).toEqual({ equipo: 'enviado' })
  })
})
```

  En `app/api/cron/visit-reminders/route.test.ts`: agregar
  `const { barrerMock } = vi.hoisted(() => ({ barrerMock: vi.fn() }))`,
  `vi.mock('@/lib/visitas/encuesta/avisos-servicio', () => ({ barrerAvisosPendientes: barrerMock }))`,
  en `beforeEach` `barrerMock.mockReset().mockResolvedValue({ revisadas: 1, canalesEnviados: 2, sinTiempo: 0 })`, y:

```ts
  it('barre los avisos de encuestas pendientes y lo cuenta en la respuesta', async () => {
    const body = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(barrerMock).toHaveBeenCalledWith({ inicio: expect.any(Number), ahora: expect.any(Date) })
    expect(body.encuestas).toEqual({ revisadas: 1, canalesEnviados: 2, sinTiempo: 0 })
  })
  it('si el barrido falla, el recordatorio responde igual y dice qué falló', async () => {
    barrerMock.mockRejectedValue(new Error('boom'))
    const res = await POST(pedido('secreto-de-la-base'))
    expect(res.status).toBe(200)
    expect((await res.json()).encuestas).toEqual({ error: 'boom' })
  })
```

  (`pedido` es el helper que ya existe en ese archivo; `'secreto-de-la-base'` es el secreto que su
  `beforeEach` deja en `cron_config`.)

- [ ] **Paso 2: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/avisos.test.ts lib/visitas/encuesta/avisos-servicio.test.ts app/api/public/encuesta app/api/cron/visit-reminders`.
  Esperado: FAIL.

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/avisos.ts`**

```ts
/**
 * Reglas de los avisos que salen al completar la encuesta (adenda §11.7): email al equipo, regalo
 * por WhatsApp y regalo por email. Puro: los límites de tiempo y cómo se cierra cada canal.
 *
 * POR QUÉ HAY LÍMITES DE INICIO: Netlify corta la función a ~26 s y `maxDuration` no sirve acá
 * (CLAUDE.md § regla dura). Cada canal arranca solo si queda tiempo para su peor caso; lo que no
 * entra queda "pendiente" para el barrido del cron. Los números se pueden recalcular con los tests.
 */
import { PREFIJO_ERROR_TIEMPO } from '@/lib/email/resend-client'
import { TECHO_POR_DESTINATARIO_MS } from '@/lib/email/notifications/visit-survey-answered'
import { CANALES_AVISO, COLUMNAS_DE_CANAL, type CanalAviso, type EncuestaFila } from './tipos'

export const TECHO_NETLIFY_MS = 26_000
/** Peor caso de un canal de regalo: una llamada a Meta o un email, techo de 8 s. */
export const TIMEOUT_CANAL_MS = 8_000
export const LIMITE_INICIO_MS: Readonly<Record<CanalAviso, number>> = {
  equipo: 5_000,
  regalo_whatsapp: 12_000,
  regalo_email: 16_000,
}
export const MAX_INTENTOS_AVISO = 3
/** La pantalla de gracias pide los avisos enseguida: el barrido no se le cruza. */
export const ESPERA_ANTES_DEL_BARRIDO_MS = 2 * 60_000
export const DIAS_DEL_BARRIDO = 7

export function puedeEmpezar(canal: CanalAviso, transcurridoMs: number): boolean {
  return transcurridoMs < LIMITE_INICIO_MS[canal]
}

/** Peor caso del email al equipo: varios destinatarios EN SERIE (sendEmail manda de a uno). */
export function peorCasoEquipoMs(destinatarios: number): number {
  return LIMITE_INICIO_MS.equipo + destinatarios * TECHO_POR_DESTINATARIO_MS
}

export function canalesPendientes(
  e: Pick<EncuestaFila, 'completed_at' | 'notice_attempts' | 'team_notice_status' | 'gift_whatsapp_status' | 'gift_email_status'>,
): CanalAviso[] {
  if (!e.completed_at || e.notice_attempts >= MAX_INTENTOS_AVISO) return []
  return CANALES_AVISO.filter(c => e[COLUMNAS_DE_CANAL[c].estado] === 'pendiente')
}

export interface ResultadoEmailLike { ok: boolean; sent: number; failed: number; errors: string[] }

/**
 * `sendEmail` NUNCA lanza. Vencido = Resend pudo haberlo mandado: no se reintenta (se prefiere
 * perder un aviso a duplicarlo, mismo criterio que el recordatorio). `ok:false` con `failed:0` es
 * "falta RESEND_API_KEY": también es un fallo, y ese sí se reintenta.
 */
export function cierreDeEmail(r: ResultadoEmailLike | null): 'enviado' | 'fallido' | 'pendiente' {
  if (r && r.ok && r.failed === 0 && r.sent > 0) return 'enviado'
  if (r && r.errors.some(e => e.startsWith(PREFIJO_ERROR_TIEMPO))) return 'fallido'
  return 'pendiente'
}

export function cierreTrasFallo(intentosPrevios: number): { estado: 'pendiente' | 'fallido'; intentos: number } {
  const intentos = intentosPrevios + 1
  return { estado: intentos >= MAX_INTENTOS_AVISO ? 'fallido' : 'pendiente', intentos }
}

export function rangoDelBarrido(ahora: Date): { desde: string; hasta: string } {
  return {
    desde: new Date(ahora.getTime() - DIAS_DEL_BARRIDO * 86_400_000).toISOString(),
    hasta: new Date(ahora.getTime() - ESPERA_ANTES_DEL_BARRIDO_MS).toISOString(),
  }
}
```

- [ ] **Paso 4: Implementar `lib/visitas/encuesta/avisos-servicio.ts`**

```ts
import 'server-only'
/**
 * Procesa los avisos de UNA encuesta terminada (y el barrido de las pendientes). Cada canal:
 * reserva atómica (pendiente → enviando), envío, cierre. La reserva es lo que evita que la pantalla
 * de gracias (con dos pestañas abiertas) y el cron manden dos veces lo mismo.
 * Un `cerrarAviso` que falla deja el canal "enviando": se detecta con la consulta del CLAUDE.md.
 */
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import { notificarEncuestaRespondida } from '@/lib/email/notifications/visit-survey-answered'
import { enviarRegaloPorEmail } from '@/lib/email/notifications/visit-survey-gift'
import * as datos from './datos'
import { mandarPlantilla } from './whatsapp'
import { armarEnvioRegalo, nombreDePila } from './plantillas'
import { decidirRegaloPorWhatsapp } from './envio'
import { motivoLegibleDeMeta } from './estado-envio'
import { respuestasParaFicha } from './ficha'
import { nombreDeDescarga, SEGUNDOS_URL_WHATSAPP } from './regalo'
import { urlDescargaDelRegalo } from './publica'
import { canalesPendientes, puedeEmpezar, cierreDeEmail, cierreTrasFallo, rangoDelBarrido, MAX_INTENTOS_AVISO, LIMITE_INICIO_MS } from './avisos'
import type { CanalAviso, EncuestaConVisita } from './tipos'

export type ResultadoCanal = 'enviado' | 'fallido' | 'no_corresponde' | 'pendiente' | 'ocupado' | 'sin_tiempo'
export interface ContextoAvisos { inicio: number; ahora: Date; reloj?: () => number }

interface Cierre {
  estado: 'enviado' | 'fallido' | 'no_corresponde' | 'pendiente'
  error?: string | null
  waMessageId?: string | null
}

function baseDeLaApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://inmodf.com.ar').replace(/\/+$/, '')
}

async function ejecutar(canal: CanalAviso, ec: EncuestaConVisita): Promise<Cierre> {
  const { encuesta: e, visita: v } = ec
  const direccion = v.propiedad?.address?.trim() || 'la propiedad'
  switch (canal) {
    case 'equipo': {
      const respuestas = respuestasParaFicha(e)
      if (!respuestas) return { estado: 'no_corresponde', error: 'la encuesta no tiene respuestas' }
      const r = await notificarEncuestaRespondida({ visitaId: v.id, asesorId: v.advisor_id, direccion, persona: v.client_name, scheduledAt: v.scheduled_at, respuestas })
      if (r === null) return { estado: 'no_corresponde', error: 'no hay nadie activo para avisarle' }
      const estado = cierreDeEmail(r)
      return estado === 'enviado' ? { estado } : { estado, error: r.errors[0] ?? 'el email no salió' }
    }
    case 'regalo_whatsapp': {
      // Un error de la base acá LANZA: el canal vuelve a pendiente y se reintenta (no se pierde el regalo).
      const regalo = await datos.leerRegalo(v.property_id)
      const plantilla = process.env.WHATSAPP_TEMPLATE_REGALO_VISITA?.trim() || null
      const decision = decidirRegaloPorWhatsapp({
        ajustes: await datos.leerAjustesEncuesta(), tieneRegalo: regalo !== null,
        telefono: e.contact_phone ?? v.client_phone, plantilla, yaEnviado: e.gift_wa_message_id !== null,
      }, normalizeWhatsappPhone)
      const envio = armarEnvioRegalo(plantilla, { nombre: v.client_name, direccion })
      if (!decision.enviar || !regalo || !envio) return { estado: 'no_corresponde' }
      const link = await datos.urlFirmada(regalo.archivoPath, SEGUNDOS_URL_WHATSAPP)
      if (!link) throw new Error('no se pudo firmar el PDF para WhatsApp')
      const r = await mandarPlantilla(envio, {
        telefono: decision.telefono, leadId: v.lead_id, propertyId: v.property_id, sentBy: null,
        documento: { link, nombre: nombreDeDescarga(regalo.archivoNombre) },
      })
      if (r.ok && r.modoPrueba) return { estado: 'no_corresponde', error: 'WhatsApp en modo prueba' }
      if (r.ok) return { estado: 'enviado', waMessageId: r.messageId }
      // Un rechazo de Meta no se arregla reintentando: queda fallido, con el motivo legible.
      return { estado: 'fallido', error: motivoLegibleDeMeta(r.codigo, r.error) }
    }
    case 'regalo_email': {
      if (!e.contact_email) return { estado: 'no_corresponde' }
      const regalo = await datos.leerRegalo(v.property_id)
      if (!regalo) return { estado: 'no_corresponde' }
      const r = await enviarRegaloPorEmail({
        encuestaId: e.id, email: e.contact_email, nombre: nombreDePila(v.client_name, ''), direccion,
        titulo: regalo.titulo, urlDescarga: `${baseDeLaApp()}${urlDescargaDelRegalo(e.token)}`,
      })
      const estado = cierreDeEmail(r)
      return estado === 'enviado' ? { estado } : { estado, error: r.errors[0] ?? 'el email no salió' }
    }
  }
}

export async function procesarAvisosDeEncuesta(encuestaId: string, ctx: ContextoAvisos): Promise<Partial<Record<CanalAviso, ResultadoCanal>>> {
  const reloj = ctx.reloj ?? Date.now
  const ec = await datos.leerEncuestaConVisita({ id: encuestaId })
  if (!ec) return {}
  const id = ec.encuesta.id
  let intentos = ec.encuesta.notice_attempts
  const resultado: Partial<Record<CanalAviso, ResultadoCanal>> = {}
  for (const canal of canalesPendientes(ec.encuesta)) {
    if (!puedeEmpezar(canal, reloj() - ctx.inicio)) { resultado[canal] = 'sin_tiempo'; continue }
    if (!(await datos.reservarAviso(id, canal))) { resultado[canal] = 'ocupado'; continue }
    let cierre: Cierre
    try {
      cierre = await ejecutar(canal, ec)
    } catch (err) {
      cierre = { estado: 'pendiente', error: err instanceof Error ? err.message : String(err) }
    }
    if (cierre.estado === 'pendiente') {
      const t = cierreTrasFallo(intentos)
      intentos = t.intentos
      console.error('[encuesta/avisos] el canal no salió', canal, id, cierre.error)
      await datos.cerrarAviso(id, canal, t.estado, { error: cierre.error ?? 'falló sin detalle', intentos })
      resultado[canal] = t.estado
      continue
    }
    if (cierre.estado === 'fallido') console.error('[encuesta/avisos] el canal falló y no se reintenta', canal, id, cierre.error)
    await datos.cerrarAviso(id, canal, cierre.estado, {
      ...(cierre.error ? { error: cierre.error } : {}),
      ...(cierre.waMessageId !== undefined ? { waMessageId: cierre.waMessageId } : {}),
    })
    resultado[canal] = cierre.estado
  }
  return resultado
}

export interface ResumenBarrido { revisadas: number; canalesEnviados: number; sinTiempo: number }

export async function barrerAvisosPendientes(ctx: ContextoAvisos): Promise<ResumenBarrido> {
  const reloj = ctx.reloj ?? Date.now
  const ids = await datos.encuestasConAvisosPendientes(rangoDelBarrido(ctx.ahora), MAX_INTENTOS_AVISO)
  const r: ResumenBarrido = { revisadas: ids.length, canalesEnviados: 0, sinTiempo: 0 }
  for (const id of ids) {
    if (reloj() - ctx.inicio >= LIMITE_INICIO_MS.regalo_email) { r.sinTiempo++; continue }
    const res = await procesarAvisosDeEncuesta(id, ctx)
    r.canalesEnviados += Object.values(res).filter(x => x === 'enviado').length
  }
  return r
}
```

- [ ] **Paso 5: Crear `app/api/public/encuesta/[token]/avisos/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import * as datos from '@/lib/visitas/encuesta/datos'
import { esTokenEncuesta } from '@/lib/visitas/encuesta/link'
import { procesarAvisosDeEncuesta } from '@/lib/visitas/encuesta/avisos-servicio'

export const dynamic = 'force-dynamic'

/**
 * La pantalla de gracias lo pide (con keepalive) apenas la persona termina: el pedido final ya
 * respondió y la persona no espera a nadie. Público por token; repetirlo no duplica nada (cada
 * canal se reserva de forma atómica) y cuenta contra el límite del link.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const inicio = Date.now()
  const { token } = await params
  if (!esTokenEncuesta(token)) return NextResponse.json({ error: 'Este link no está disponible' }, { status: 404 })
  try {
    const ec = await datos.leerEncuestaConVisita({ token })
    if (!ec) return NextResponse.json({ error: 'Este link no está disponible' }, { status: 404 })
    if (!ec.encuesta.completed_at) return NextResponse.json({ error: 'La encuesta todavía no está terminada' }, { status: 409 })
    if (!(await datos.registrarUso(token, 'escritura'))) return NextResponse.json({ error: 'Demasiados intentos' }, { status: 429 })
    const resultado = await procesarAvisosDeEncuesta(ec.encuesta.id, { inicio, ahora: new Date() })
    return NextResponse.json({ data: resultado })
  } catch (e) {
    console.error('[POST /api/public/encuesta/[token]/avisos]', e)
    return NextResponse.json({ error: 'No pudimos procesar los avisos' }, { status: 500 })
  }
}
```

- [ ] **Paso 6: Sumar el barrido al cron** — en `app/api/cron/visit-reminders/route.ts`: import
  `import { barrerAvisosPendientes, type ResumenBarrido } from '@/lib/visitas/encuesta/avisos-servicio'`;
  en `interface Corrida` agregar `encuestas?: ResumenBarrido | { error: string }`; y justo ANTES de
  `if (visitas.length === 0) {` agregar:

```ts
    // Avisos de encuestas que la pantalla de gracias no llegó a disparar (la persona cerró la
    // página). Corre con el MISMO reloj que el recordatorio: cada canal mira cuánto queda.
    try {
      corrida.encuestas = await barrerAvisosPendientes({ inicio, ahora })
    } catch (e) {
      console.error('[cron/visit-reminders] el barrido de encuestas falló', e)
      corrida.encuestas = { error: e instanceof Error ? e.message : 'Error' }
    }
```

- [ ] **Paso 7: Correr y verlos pasar** — el comando del Paso 2. Esperado: PASS (incluidos los `it`
  previos del cron). Más `tsc` y eslint.

- [ ] **Paso 8: Commit** — `git add lib/visitas/encuesta/avisos.ts lib/visitas/encuesta/avisos.test.ts lib/visitas/encuesta/avisos-servicio.ts lib/visitas/encuesta/avisos-servicio.test.ts "app/api/public/encuesta/[token]/avisos/route.ts" "app/api/public/encuesta/[token]/avisos/route.test.ts" app/api/cron/visit-reminders/route.ts app/api/cron/visit-reminders/route.test.ts`;
  mensaje `feat(visitas): avisos de la encuesta en dos tiempos (pantalla de gracias + barrido horario)`.

---

### Tarea 11: API pública de la encuesta (guardado por paso, final, descarga) y middleware

**Files:**
- Create: `app/api/public/encuesta/[token]/route.ts` (+`route.test.ts`)
- Create: `app/api/public/encuesta/[token]/regalo/route.ts` (+`route.test.ts`)
- Modify: `middleware.ts`; Create: `middleware.encuesta.test.ts`
- Modify: `lib/supabase/middleware.ts` (+`lib/supabase/middleware.test.ts`)

**Interfaces:**
- Consumes: `datos.*` (Tarea 6), `esTokenEncuesta`, `estaVencida` (Tarea 2), `cuerpoPatch`,
  `patchDelPaso`, `cuerpoFinal`, `contactoFinal`, `esHoneypot`, `faltaParaTerminar` (Tarea 3),
  `opcionesDeLaPropiedad`, `urlDescargaDelRegalo` (Tarea 5), `monedaDe` (Tarea 2),
  `SEGUNDOS_URL_DESCARGA`, `nombreDeDescarga` (Tarea 5).
- Produces:
  - `PATCH /api/public/encuesta/[token]` body `CuerpoPatch` → `{ data: { ok: true } }` | 400 | 404 |
    409 (`code: 'COMPLETA'` o "ya no admite cambios") | 410 | 429.
  - `POST /api/public/encuesta/[token]` body `CuerpoFinal` →
    `{ data: { completa: true; regalo: { titulo: string; descarga: string } | null } }` | 400 | 404 |
    409 (`{ error, paso }`) | 410 | 429.
  - `GET /api/public/encuesta/[token]/regalo` → 302 a una URL firmada de 10 min (texto plano si no).
  - `/encuesta/<token>` es página pública; `/questionnaire` deja de serlo.

- [ ] **Paso 1: Tests** — `app/api/public/encuesta/[token]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock } = vi.hoisted(() => ({
  datosMock: {
    leerEncuestaConVisita: vi.fn(), registrarUso: vi.fn(), guardarPaso: vi.fn(), completarEncuesta: vi.fn(), leerRegalo: vi.fn(),
  },
}))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)
vi.mock('@/lib/integrations/whatsapp/phone', () => ({
  normalizeWhatsappPhone: (v: string | null | undefined) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `549${d.slice(-10)}` : null
  },
}))

import { PATCH, POST } from './route'
import { encuestaConVisitaDePrueba, encuestaDePrueba, TOKEN_DE_PRUEBA, ENCUESTA_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'

const ctx = (token = TOKEN_DE_PRUEBA) => ({ params: Promise.resolve({ token }) })
const patch = (body: unknown, token?: string) => PATCH(new Request('http://local', { method: 'PATCH', body: JSON.stringify(body) }) as never, ctx(token))
const post = (body: unknown, token?: string) => POST(new Request('http://local', { method: 'POST', body: JSON.stringify(body) }) as never, ctx(token))
const TODO = { liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto' as const, offer_declined: true }
const REGALO = { propertyId: 'p', titulo: 'Guía de Caballito', archivoPath: 'x', archivoNombre: 'g.pdf', archivoBytes: 10, portadaPath: null, actualizadoEl: '' }

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
  datosMock.registrarUso.mockResolvedValue(true)
  datosMock.guardarPaso.mockResolvedValue(true)
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
})

describe('PATCH (guardado pregunta a pregunta)', () => {
  it('un token inventado o con otra forma: 404 sin tocar la base', async () => {
    expect((await patch({ paso: 'gusto', valor: true }, 'x')).status).toBe(404)
    expect(datosMock.leerEncuestaConVisita).not.toHaveBeenCalled()
    datosMock.leerEncuestaConVisita.mockResolvedValue(null)
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(404)
  })
  it('cuerpo inválido: 400 sin tocar la base', async () => {
    expect((await patch({ paso: 'gusto', valor: 'si' })).status).toBe(400)
    expect(datosMock.leerEncuestaConVisita).not.toHaveBeenCalled()
  })
  it('una visita reabierta deja el link sin efecto (404)', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({}, { status: 'scheduled' }))
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(404)
  })
  it('terminada: 409 COMPLETA; vencida: 410; tope: 429', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:00:00Z' }))
    const r1 = await patch({ paso: 'gusto', valor: true })
    expect([r1.status, (await r1.json()).code]).toEqual([409, 'COMPLETA'])
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ expires_at: '2026-10-01T00:00:00Z' }))
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(410)
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
    datosMock.registrarUso.mockResolvedValue(false)
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(429)
    expect(datosMock.guardarPaso).not.toHaveBeenCalled()
  })
  it('"abierta" marca la apertura y no guarda respuestas', async () => {
    expect((await patch({ paso: 'abierta' })).status).toBe(200)
    expect(datosMock.registrarUso).toHaveBeenCalledWith(TOKEN_DE_PRUEBA, 'abierta')
    expect(datosMock.guardarPaso).not.toHaveBeenCalled()
  })
  it('guarda la respuesta del paso', async () => {
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(200)
    expect(datosMock.registrarUso).toHaveBeenCalledWith(TOKEN_DE_PRUEBA, 'escritura')
    expect(datosMock.guardarPaso).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA, { liked: true, last_step: 'gusto' }, expect.any(Date))
  })
  it('una opción que ESA propiedad no ofrece: 400 en castellano', async () => {
    const res = await patch({ paso: 'mas_gusto', etiquetas: ['vista'] })
    expect([res.status, (await res.json()).error]).toEqual([400, 'Elegí una de las opciones'])
  })
  it('si otro pedido la terminó en el medio: 409', async () => {
    datosMock.guardarPaso.mockResolvedValue(false)
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(409)
  })
})

describe('POST (final)', () => {
  beforeEach(() => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba(TODO))
    datosMock.completarEncuesta.mockResolvedValue(encuestaDePrueba({ ...TODO, completed_at: '2026-10-15T15:00:00Z' }))
  })
  it('honeypot lleno: éxito falso sin tocar la base', async () => {
    const res = await post({ similares: false, empresa: 'ACME' })
    expect(await res.json()).toEqual({ data: { completa: true, regalo: null } })
    expect(datosMock.leerEncuestaConVisita).not.toHaveBeenCalled()
  })
  it('si falta una respuesta: 409 con el paso al que hay que volver', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ liked: true }))
    const res = await post({ similares: false })
    expect([res.status, (await res.json()).paso]).toEqual([409, 'mas_gusto'])
  })
  it('termina con el WhatsApp de la visita y devuelve el regalo para descargar', async () => {
    const res = await post({ email: 'Ana@Mail.com', similares: true })
    expect(datosMock.completarEncuesta).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA,
      { contact_phone: '5491158234521', contact_email: 'ana@mail.com', wants_similar: true }, expect.any(Date))
    expect(await res.json()).toEqual({ data: { completa: true, regalo: { titulo: 'Guía de Caballito', descarga: `/api/public/encuesta/${TOKEN_DE_PRUEBA}/regalo` } } })
  })
  it('doble toque: el segundo no completa de nuevo y recibe el mismo éxito', async () => {
    datosMock.completarEncuesta.mockResolvedValue(null)
    datosMock.leerEncuestaConVisita
      .mockResolvedValueOnce(encuestaConVisitaDePrueba(TODO))
      .mockResolvedValueOnce(encuestaConVisitaDePrueba({ ...TODO, completed_at: '2026-10-15T15:00:00Z' }))
    const res = await post({ similares: false })
    expect(res.status).toBe(200)
    expect((await res.json()).data.completa).toBe(true)
  })
  it('ya terminada: éxito sin volver a completar', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ ...TODO, completed_at: '2026-10-15T14:00:00Z' }))
    expect((await post({ similares: false })).status).toBe(200)
    expect(datosMock.completarEncuesta).not.toHaveBeenCalled()
  })
  it('un WhatsApp nuevo mal escrito: 400', async () => {
    const res = await post({ telefono: '123', similares: false })
    expect([res.status, (await res.json()).error]).toEqual([400, 'Revisá tu WhatsApp: no parece un número válido'])
  })
  it('sin regalo en la propiedad: completa sin regalo', async () => {
    datosMock.leerRegalo.mockResolvedValue(null)
    expect((await (await post({ similares: false })).json()).data.regalo).toBeNull()
  })
})
```

  `app/api/public/encuesta/[token]/regalo/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock } = vi.hoisted(() => ({
  datosMock: { leerEncuestaConVisita: vi.fn(), leerRegalo: vi.fn(), urlFirmada: vi.fn(), marcarRegaloDescargado: vi.fn() },
}))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)

import { GET } from './route'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA, ENCUESTA_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'

const pedir = (token = TOKEN_DE_PRUEBA) => GET(new Request('http://local') as never, { params: Promise.resolve({ token }) })
const REGALO = { propertyId: 'p', titulo: 'Guía', archivoPath: 'properties/p/regalo-x.pdf', archivoNombre: 'Guía "del" barrio.pdf', archivoBytes: 10, portadaPath: null, actualizadoEl: '' }

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:00:00Z' }))
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  datosMock.urlFirmada.mockResolvedValue('https://firmada.supabase.co/x?token=1')
})

describe('GET /api/public/encuesta/[token]/regalo', () => {
  it('sin terminar la encuesta no entrega nada (criterio 27)', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
    expect((await pedir()).status).toBe(404)
    expect(datosMock.urlFirmada).not.toHaveBeenCalled()
  })
  it('terminada: 302 a una URL firmada de 10 minutos, con nombre seguro, sin caché', async () => {
    const res = await pedir()
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://firmada.supabase.co/x?token=1')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(datosMock.urlFirmada).toHaveBeenCalledWith('properties/p/regalo-x.pdf', 600, 'Guía del barrio.pdf')
    expect(datosMock.marcarRegaloDescargado).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA)
  })
  it('token con otra forma: 404; propiedad sin regalo: 404; firma caída: 503', async () => {
    expect((await pedir('x')).status).toBe(404)
    datosMock.leerRegalo.mockResolvedValue(null)
    expect((await pedir()).status).toBe(404)
    datosMock.leerRegalo.mockResolvedValue(REGALO)
    datosMock.urlFirmada.mockResolvedValue(null)
    expect((await pedir()).status).toBe(503)
  })
})
```

  `middleware.encuesta.test.ts` (en la raíz, al lado de `middleware.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { actualizar } = vi.hoisted(() => ({
  actualizar: vi.fn(async () => new Response(null, { status: 307, headers: { location: '/login' } })),
}))
vi.mock('@/lib/supabase/middleware', () => ({ updateSession: actualizar }))

import { middleware } from './middleware'

beforeEach(() => { actualizar.mockClear() })

describe('middleware raíz', () => {
  it('/encuesta/<token> pasa sin sesión (la abre un comprador desde WhatsApp)', async () => {
    const res = await middleware(new NextRequest('https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y'))
    expect(actualizar).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
  it('"/encuestas" (otra ruta que empieza igual) NO se cuela como pública', async () => {
    await middleware(new NextRequest('https://inmodf.com.ar/encuestas'))
    expect(actualizar).toHaveBeenCalled()
  })
  it('una página privada sigue pasando por la sesión', async () => {
    await middleware(new NextRequest('https://inmodf.com.ar/visits'))
    expect(actualizar).toHaveBeenCalled()
  })
})
```

  En `lib/supabase/middleware.test.ts`: reemplazar el `it('/api/public/questionnaire/<token> …')` por

```ts
    it('/api/public/encuesta/<token> (PATCH, POST, avisos y descarga del regalo) — encuesta post-visita', async () => {
        expect(await pasa('/api/public/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y', 'PATCH')).toBe(true)
        expect(await pasa('/api/public/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y', 'POST')).toBe(true)
        expect(await pasa('/api/public/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y/avisos', 'POST')).toBe(true)
        expect(await pasa('/api/public/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y/regalo')).toBe(true)
    })
```

  y en la lista `it.each([...])('%s es pública')` sacar `'/questionnaire'`, `'/questionnaire/Ab3xK9pQ2r'`
  y `'/questionnaire/Ab3xK9pQ2r/thanks'`, sumando debajo:

```ts
    it.each(['/questionnaire', '/questionnaire/Ab3xK9pQ2r'])('%s ya NO es pública (el cuestionario viejo se borró)', (ruta) => {
        expect(esPaginaPublica(ruta)).toBe(false)
    })
```

- [ ] **Paso 2: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts app/api/public/encuesta lib/supabase/middleware.test.ts middleware.encuesta.test.ts`.
  Esperado: FAIL (rutas inexistentes; `/encuesta/` todavía privada; `/questionnaire` todavía pública).

- [ ] **Paso 3: Crear `app/api/public/encuesta/[token]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import * as datos from '@/lib/visitas/encuesta/datos'
import { esTokenEncuesta, estaVencida } from '@/lib/visitas/encuesta/link'
import { cuerpoPatch, patchDelPaso, cuerpoFinal, contactoFinal, esHoneypot, faltaParaTerminar } from '@/lib/visitas/encuesta/respuestas'
import { opcionesDeLaPropiedad, urlDescargaDelRegalo } from '@/lib/visitas/encuesta/publica'
import { monedaDe, type EncuestaConVisita } from '@/lib/visitas/encuesta/tipos'

export const dynamic = 'force-dynamic'

/**
 * La encuesta pública (spec §4.10 + adenda §11.7). La responde alguien SIN cuenta: la seguridad es
 * el token (128 bits) más estas reglas: forma del token antes de tocar la base, Zod estricto por
 * paso, opciones validadas contra ESA propiedad, límite de escrituras por link, honeypot, y un
 * final con reserva atómica (un doble toque no duplica ni re-notifica).
 * Una visita reabierta (status ≠ completed) deja el link sin efecto.
 */
function noDisponible() {
  return NextResponse.json({ error: 'Este link no está disponible' }, { status: 404 })
}

async function cargar(token: string): Promise<EncuestaConVisita | null> {
  if (!esTokenEncuesta(token)) return null
  const ec = await datos.leerEncuestaConVisita({ token })
  if (!ec || ec.visita.status !== 'completed') return null
  return ec
}

/** El MISMO éxito para el primer toque, el segundo y el que llega con la encuesta ya terminada. */
async function exito(ec: EncuestaConVisita) {
  let regalo: { titulo: string; descarga: string } | null = null
  try {
    const r = await datos.leerRegalo(ec.visita.property_id)
    if (r) regalo = { titulo: r.titulo, descarga: urlDescargaDelRegalo(ec.encuesta.token) }
  } catch (e) {
    console.error('[encuesta] no se pudo leer el regalo al terminar', e)
  }
  return NextResponse.json({ data: { completa: true, regalo } })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!esTokenEncuesta(token)) return noDisponible()
  const parsed = cuerpoPatch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Respuesta inválida' }, { status: 400 })
  try {
    const ec = await cargar(token)
    if (!ec) return noDisponible()
    const ahora = new Date()
    if (ec.encuesta.completed_at) return NextResponse.json({ error: 'Esta encuesta ya está respondida', code: 'COMPLETA' }, { status: 409 })
    if (estaVencida(ec.encuesta.expires_at, ahora)) return NextResponse.json({ error: 'Este link venció' }, { status: 410 })
    const c = parsed.data
    if (!(await datos.registrarUso(token, c.paso === 'abierta' ? 'abierta' : 'escritura'))) {
      return NextResponse.json({ error: 'Demasiados intentos con este link' }, { status: 429 })
    }
    if (c.paso === 'abierta') return NextResponse.json({ data: { ok: true } })
    const p = ec.visita.propiedad
    const r = patchDelPaso(c, { opciones: opcionesDeLaPropiedad(p), moneda: monedaDe(p?.currency) })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    if (!(await datos.guardarPaso(ec.encuesta.id, r.patch, ahora))) {
      return NextResponse.json({ error: 'Esta encuesta ya no admite cambios' }, { status: 409 })
    }
    return NextResponse.json({ data: { ok: true } })
  } catch (e) {
    console.error('[PATCH /api/public/encuesta/[token]]', e)
    return NextResponse.json({ error: 'No pudimos guardar tu respuesta. Probá de nuevo.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!esTokenEncuesta(token)) return noDisponible()
  const parsed = cuerpoFinal.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Revisá tus datos' }, { status: 400 })
  if (esHoneypot(parsed.data)) {
    // Un robot: se le contesta lo mismo que a una persona para que no aprenda nada, sin escribir.
    console.warn('[encuesta] honeypot lleno: éxito falso sin guardar')
    return NextResponse.json({ data: { completa: true, regalo: null } })
  }
  try {
    const ec = await cargar(token)
    if (!ec) return noDisponible()
    if (ec.encuesta.completed_at) return exito(ec)
    const ahora = new Date()
    if (estaVencida(ec.encuesta.expires_at, ahora)) return NextResponse.json({ error: 'Este link venció' }, { status: 410 })
    if (!(await datos.registrarUso(token, 'escritura'))) return NextResponse.json({ error: 'Demasiados intentos con este link' }, { status: 429 })
    const falta = faltaParaTerminar(ec.encuesta)
    if (falta) return NextResponse.json({ error: 'Falta responder una pregunta', paso: falta }, { status: 409 })
    const c = contactoFinal(parsed.data, ec.visita.client_phone, normalizeWhatsappPhone)
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 })
    const fila = await datos.completarEncuesta(ec.encuesta.id, c.contacto, ahora)
    if (fila) return exito(ec)
    // Otro pedido (doble toque) la terminó un instante antes: mismo éxito, sin duplicar nada.
    const deNuevo = await datos.leerEncuestaConVisita({ token })
    if (deNuevo?.encuesta.completed_at) return exito(deNuevo)
    return NextResponse.json({ error: 'Este link venció' }, { status: 410 })
  } catch (e) {
    console.error('[POST /api/public/encuesta/[token]]', e)
    return NextResponse.json({ error: 'No pudimos guardar tus respuestas. Probá de nuevo.' }, { status: 500 })
  }
}
```

- [ ] **Paso 4: Crear `app/api/public/encuesta/[token]/regalo/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import * as datos from '@/lib/visitas/encuesta/datos'
import { esTokenEncuesta } from '@/lib/visitas/encuesta/link'
import { nombreDeDescarga, SEGUNDOS_URL_DESCARGA } from '@/lib/visitas/encuesta/regalo'

export const dynamic = 'force-dynamic'

/**
 * Descarga del regalo (adenda §11.2): SOLO con una encuesta terminada, y siempre con una URL
 * firmada NUEVA de 10 minutos (el archivo vive en un bucket privado). El email del regalo apunta
 * acá, por eso sirve aunque pasen días. Respuestas en texto plano: es una navegación, no un fetch.
 */
function texto(mensaje: string, status: number) {
  return new NextResponse(mensaje, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!esTokenEncuesta(token)) return texto('Este link no está disponible.', 404)
  try {
    const ec = await datos.leerEncuestaConVisita({ token })
    if (!ec || !ec.encuesta.completed_at) return texto('Este link no está disponible.', 404)
    const regalo = await datos.leerRegalo(ec.visita.property_id)
    if (!regalo) return texto('Esta propiedad ya no tiene material para descargar.', 404)
    const url = await datos.urlFirmada(regalo.archivoPath, SEGUNDOS_URL_DESCARGA, nombreDeDescarga(regalo.archivoNombre))
    if (!url) return texto('No pudimos preparar la descarga. Probá de nuevo en un rato.', 503)
    await datos.marcarRegaloDescargado(ec.encuesta.id)
    const res = NextResponse.redirect(url, 302)
    res.headers.set('cache-control', 'no-store')
    res.headers.set('referrer-policy', 'no-referrer')
    return res
  } catch (e) {
    console.error('[GET /api/public/encuesta/[token]/regalo]', e)
    return texto('No pudimos preparar la descarga. Probá de nuevo en un rato.', 500)
  }
}
```

- [ ] **Paso 5: Middleware** — en `middleware.ts`, dentro del `if (…)` de rutas públicas, después
  de la línea de `/r/`, agregar:

```ts
    // `/encuesta/<token>` es la encuesta post-visita que se manda por WhatsApp (spec §11): la
    // responde un comprador sin cuenta. Mismo criterio que `/v/`: la seguridad es el token (128
    // bits), no la sesión. Con barra final: `/encuestas` NO es pública.
    request.nextUrl.pathname.startsWith('/encuesta/') ||
```

  En `lib/supabase/middleware.ts`: sacar `'/questionnaire',` de `PAGINAS_PUBLICAS` y cambiar el
  comentario de arriba de esa lista por

```ts
/**
 * Rutas de PÁGINA (no `/api/`) que no requieren sesión. Se comparan por PREFIJO. `/p/`, `/v/`,
 * `/r/`, `/encuesta/` y los paths del embudo se resuelven antes, en `middleware.ts`, y ni siquiera
 * llegan acá. (`/questionnaire` se borró en la Entrega 3 del sistema de visitas.)
 */
```

  y el `motivo` de la entrada `/api/public/` por

```ts
        motivo:
            'Encuesta post-visita (`/api/public/encuesta/<token>`: PATCH por paso, POST final, ' +
            '`/avisos` y `/regalo`), que responde un comprador sin cuenta desde `/encuesta/<token>`. ' +
            'La seguridad es el token, validado por forma antes de tocar la base, más el límite por link.',
```

- [ ] **Paso 6: Correr y verlos pasar** — el comando del Paso 2. Esperado: PASS. Más `tsc` y eslint
  sobre los archivos tocados.

- [ ] **Paso 7: Commit** — `git add "app/api/public/encuesta/[token]/route.ts" "app/api/public/encuesta/[token]/route.test.ts" "app/api/public/encuesta/[token]/regalo/route.ts" "app/api/public/encuesta/[token]/regalo/route.test.ts" middleware.ts middleware.encuesta.test.ts lib/supabase/middleware.ts lib/supabase/middleware.test.ts`;
  mensaje `feat(visitas): API pública de la encuesta (por paso, final atómico, descarga del regalo) y /encuesta pública`.

---

### Tarea 12: API del regalo de la propiedad (subida firmada, guardar, quitar)

**Files:**
- Create: `lib/visitas/encuesta/acceso-regalo.ts` (+`acceso-regalo.test.ts`)
- Create: `app/api/properties/[id]/regalo/subida/route.ts` (+`route.test.ts`)
- Create: `app/api/properties/[id]/regalo/route.ts` (+`route.test.ts`)

**Interfaces:**
- Consumes: `getUser`; `puedeGestionarMedia` de `lib/properties/acceso-media.ts`; `datos.*`
  (Tarea 6); reglas de `regalo.ts` (Tarea 5).
- Produces:
  - `autorizarRegalo(propertyId): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403 | 404; error: string }>`.
  - `POST /api/properties/[id]/regalo/subida` body `{ archivo?: { nombre; bytes } | null; portada?: { nombre; bytes } | null }`
    → `{ data: { archivo: SlotSubida | null; portada: SlotSubida | null } }`, `SlotSubida { signedUrl; token; path }`.
  - `GET /api/properties/[id]/regalo` → `{ data: RegaloVista | null }`.
  - `PUT /api/properties/[id]/regalo` body `{ titulo; archivoPath; archivoNombre; archivoBytes; portadaPath: string | null }` → `{ data: RegaloVista }`.
  - `DELETE /api/properties/[id]/regalo` → `{ data: null }`.

- [ ] **Paso 1: Tests** — `lib/visitas/encuesta/acceso-regalo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, mediaMock } = vi.hoisted(() => ({
  estado: { logueado: true, role: 'asesor', activo: true },
  mediaMock: vi.fn(),
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado ? { id: 'u1', email: 'a@b.c', profile: { id: 'u1', role: estado.role, is_active: estado.activo } } : null),
}))
vi.mock('@/lib/properties/acceso-media', () => ({ puedeGestionarMedia: mediaMock }))

import { autorizarRegalo } from './acceso-regalo'

const PROP = '33333333-3333-4333-8333-333333333333'
beforeEach(() => { estado.logueado = true; estado.role = 'asesor'; estado.activo = true; mediaMock.mockReset().mockResolvedValue(true) })

describe('autorizarRegalo', () => {
  it('quien gestiona el material de la propiedad, sí', async () => {
    expect(await autorizarRegalo(PROP)).toEqual({ ok: true, userId: 'u1' })
  })
  it('sin sesión 401; inactivo 401; abogado 403 sin consultar; ajena 403; id inventado 404', async () => {
    estado.logueado = false
    expect((await autorizarRegalo(PROP)).ok).toBe(false)
    estado.logueado = true; estado.activo = false
    expect(await autorizarRegalo(PROP)).toMatchObject({ status: 401 })
    estado.activo = true; estado.role = 'abogado'
    expect(await autorizarRegalo(PROP)).toMatchObject({ status: 403 })
    expect(mediaMock).not.toHaveBeenCalled()
    estado.role = 'asesor'; mediaMock.mockResolvedValue(false)
    expect(await autorizarRegalo(PROP)).toMatchObject({ status: 403, error: 'Solo quien gestiona la propiedad puede cargar el regalo' })
    expect(await autorizarRegalo('x')).toMatchObject({ status: 404 })
  })
})
```

  `app/api/properties/[id]/regalo/subida/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { accesoMock, datosMock } = vi.hoisted(() => ({
  accesoMock: vi.fn(),
  datosMock: { crearSubidaFirmada: vi.fn() },
}))
vi.mock('@/lib/visitas/encuesta/acceso-regalo', () => ({ autorizarRegalo: accesoMock }))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)

import { POST } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
const post = (body: unknown) => POST(new Request('http://local', { method: 'POST', body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: PROP }) })

beforeEach(() => {
  accesoMock.mockReset().mockResolvedValue({ ok: true, userId: 'u1' })
  datosMock.crearSubidaFirmada.mockReset().mockImplementation(async (path: string) => ({ signedUrl: `https://sube/${path}`, token: 't', path }))
})

describe('POST /api/properties/[id]/regalo/subida', () => {
  it('firma la subida del PDF y de la portada en paths de ESTA propiedad', async () => {
    const body = await (await post({ archivo: { nombre: 'Guía.pdf', bytes: 1000 }, portada: { nombre: 'tapa.jpeg', bytes: 100 } })).json()
    expect(body.data.archivo.path).toMatch(new RegExp(`^properties/${PROP}/regalo-[0-9a-f-]{36}\\.pdf$`))
    expect(body.data.portada.path).toMatch(new RegExp(`^properties/${PROP}/portada-[0-9a-f-]{36}\\.jpg$`))
  })
  it('valida antes de firmar: no-PDF, demasiado grande, nada para subir', async () => {
    expect((await post({ archivo: { nombre: 'g.docx', bytes: 10 } })).status).toBe(400)
    expect((await post({ archivo: { nombre: 'g.pdf', bytes: 30 * 1024 * 1024 } })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect(datosMock.crearSubidaFirmada).not.toHaveBeenCalled()
  })
  it('sin permiso: el código de autorizarRegalo, sin firmar nada', async () => {
    accesoMock.mockResolvedValue({ ok: false, status: 403, error: 'Solo quien gestiona la propiedad puede cargar el regalo' })
    expect((await post({ archivo: { nombre: 'g.pdf', bytes: 10 } })).status).toBe(403)
    expect(datosMock.crearSubidaFirmada).not.toHaveBeenCalled()
  })
})
```

  `app/api/properties/[id]/regalo/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { accesoMock, datosMock } = vi.hoisted(() => ({
  accesoMock: vi.fn(),
  datosMock: { leerRegalo: vi.fn(), guardarRegalo: vi.fn(), borrarRegalo: vi.fn(), existeArchivo: vi.fn(), urlFirmada: vi.fn(), borrarArchivos: vi.fn() },
}))
vi.mock('@/lib/visitas/encuesta/acceso-regalo', () => ({ autorizarRegalo: accesoMock }))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)

import { GET, PUT, DELETE } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const ARCHIVO = `properties/${PROP}/regalo-${U1}.pdf`
const ARCHIVO_NUEVO = `properties/${PROP}/regalo-${U2}.pdf`
const ctx = { params: Promise.resolve({ id: PROP }) }
const req = (method: string, body?: unknown) => new Request('http://local', { method, ...(body ? { body: JSON.stringify(body) } : {}) }) as never
const REGALO = { propertyId: PROP, titulo: 'Guía', archivoPath: ARCHIVO, archivoNombre: 'Guía.pdf', archivoBytes: 1000, portadaPath: null, actualizadoEl: '' }
const PUT_OK = { titulo: 'Guía de Caballito', archivoPath: ARCHIVO_NUEVO, archivoNombre: 'Guía nueva.pdf', archivoBytes: 2000, portadaPath: null }

beforeEach(() => {
  accesoMock.mockReset().mockResolvedValue({ ok: true, userId: 'u1' })
  Object.values(datosMock).forEach(m => m.mockReset())
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  datosMock.existeArchivo.mockResolvedValue(true)
  datosMock.urlFirmada.mockResolvedValue('https://firmada')
})

describe('/api/properties/[id]/regalo', () => {
  it('GET: la vista con URLs firmadas (nunca públicas)', async () => {
    const body = await (await GET(req('GET'), ctx)).json()
    expect(body.data).toMatchObject({ titulo: 'Guía', archivoNombre: 'Guía.pdf', descargaUrl: 'https://firmada', portadaUrl: null })
  })
  it('PUT: guarda, con el nombre saneado, y borra el PDF viejo reemplazado', async () => {
    expect((await PUT(req('PUT', PUT_OK), ctx)).status).toBe(200)
    expect(datosMock.guardarRegalo).toHaveBeenCalledWith({
      propertyId: PROP, titulo: 'Guía de Caballito', archivoPath: ARCHIVO_NUEVO, archivoNombre: 'Guía nueva.pdf',
      archivoBytes: 2000, portadaPath: null, actorId: 'u1',
    })
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([ARCHIVO])
  })
  it('PUT: un path de otra propiedad o con trucos se rechaza; un archivo que no terminó de subir también', async () => {
    expect((await PUT(req('PUT', { ...PUT_OK, archivoPath: `properties/${U2}/regalo-${U1}.pdf` }), ctx)).status).toBe(400)
    expect((await PUT(req('PUT', { ...PUT_OK, archivoPath: `${ARCHIVO_NUEVO}/../x` }), ctx)).status).toBe(400)
    datosMock.existeArchivo.mockResolvedValue(false)
    const res = await PUT(req('PUT', PUT_OK), ctx)
    expect([res.status, (await res.json()).error]).toEqual([400, 'El archivo no terminó de subir. Probá de nuevo.'])
    expect(datosMock.guardarRegalo).not.toHaveBeenCalled()
  })
  it('PUT: título corto → 400', async () => {
    expect((await PUT(req('PUT', { ...PUT_OK, titulo: 'ab' }), ctx)).status).toBe(400)
  })
  it('DELETE: borra la fila y los archivos', async () => {
    expect((await DELETE(req('DELETE'), ctx)).status).toBe(200)
    expect(datosMock.borrarRegalo).toHaveBeenCalledWith(PROP)
    expect(datosMock.borrarArchivos).toHaveBeenCalledWith([ARCHIVO])
  })
  it('sin permiso: ningún método toca la base', async () => {
    accesoMock.mockResolvedValue({ ok: false, status: 403, error: 'El regalo no está disponible para tu rol' })
    for (const r of [await GET(req('GET'), ctx), await PUT(req('PUT', PUT_OK), ctx), await DELETE(req('DELETE'), ctx)]) expect(r.status).toBe(403)
    expect(datosMock.leerRegalo).not.toHaveBeenCalled()
  })
})
```

- [ ] **Paso 2: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/acceso-regalo.test.ts app/api/properties`.
  Esperado: FAIL.

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/acceso-regalo.ts`**

```ts
import 'server-only'
/**
 * Quién puede cargar/ver/quitar el regalo de una propiedad (adenda §11.2): el mismo criterio que el
 * material de la propiedad (`puedeGestionarMedia`: operaciones, el asesor asignado o el que la
 * captó). El abogado nunca (no ve visitas). El menú NO es la barrera: esto corre en cada ruta.
 */
import { getUser } from '@/lib/auth/get-user'
import { puedeGestionarMedia } from '@/lib/properties/acceso-media'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Autorizacion = { ok: true; userId: string } | { ok: false; status: 401 | 403 | 404; error: string }

export async function autorizarRegalo(propertyId: string): Promise<Autorizacion> {
  const user = await getUser()
  if (!user || !user.profile.is_active) return { ok: false, status: 401, error: 'Iniciá sesión de nuevo' }
  if (user.profile.role === 'abogado') return { ok: false, status: 403, error: 'El regalo no está disponible para tu rol' }
  if (!UUID_RE.test(propertyId)) return { ok: false, status: 404, error: 'No encontramos la propiedad' }
  if (!(await puedeGestionarMedia(user, propertyId))) {
    return { ok: false, status: 403, error: 'Solo quien gestiona la propiedad puede cargar el regalo' }
  }
  return { ok: true, userId: user.id }
}
```

- [ ] **Paso 4: Crear `app/api/properties/[id]/regalo/subida/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { autorizarRegalo } from '@/lib/visitas/encuesta/acceso-regalo'
import * as datos from '@/lib/visitas/encuesta/datos'
import { validarArchivoRegalo, validarPortada, pathDelRegalo, pathDePortada } from '@/lib/visitas/encuesta/regalo'

/**
 * Prepara la subida directa a Storage (bucket privado) del PDF y/o la portada. El archivo NUNCA pasa
 * por el servidor de Next (CLAUDE.md § Multimedia): acá solo se valida y se firma.
 */
const meta = z.object({ nombre: z.string().min(1).max(200), bytes: z.number().int().positive() }).strict()
const cuerpo = z.object({ archivo: meta.nullish(), portada: meta.nullish() }).strict()

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await autorizarRegalo(id)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  const parsed = cuerpo.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos del archivo inválidos' }, { status: 400 })
  const { archivo, portada } = parsed.data
  if (!archivo && !portada) return NextResponse.json({ error: 'No hay nada para subir' }, { status: 400 })
  const errArchivo = archivo ? validarArchivoRegalo(archivo) : null
  if (errArchivo) return NextResponse.json({ error: errArchivo }, { status: 400 })
  const errPortada = portada ? validarPortada(portada) : null
  if (errPortada) return NextResponse.json({ error: errPortada }, { status: 400 })
  try {
    return NextResponse.json({
      data: {
        archivo: archivo ? await datos.crearSubidaFirmada(pathDelRegalo(id, randomUUID())) : null,
        portada: portada ? await datos.crearSubidaFirmada(pathDePortada(id, randomUUID(), portada.nombre)) : null,
      },
    })
  } catch (e) {
    console.error('[POST /api/properties/[id]/regalo/subida]', e)
    return NextResponse.json({ error: 'No pudimos preparar la subida. Probá de nuevo.' }, { status: 500 })
  }
}
```

- [ ] **Paso 5: Crear `app/api/properties/[id]/regalo/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { autorizarRegalo } from '@/lib/visitas/encuesta/acceso-regalo'
import * as datos from '@/lib/visitas/encuesta/datos'
import {
  esPathDelRegalo, esPathDePortada, nombreDeDescarga, validarArchivoRegalo, validarTitulo,
  SEGUNDOS_URL_DESCARGA, SEGUNDOS_URL_PORTADA, type RegaloVista,
} from '@/lib/visitas/encuesta/regalo'
import type { RegaloDeLaPropiedad } from '@/lib/visitas/encuesta/tipos'

/**
 * El regalo de la encuesta de UNA propiedad (adenda §11.2). Los paths que manda el navegador se
 * validan con regex exacta atada al id (y la base repite el CHECK) y se confirma que el archivo
 * exista antes de guardarlo. Reemplazar borra los archivos viejos (best-effort).
 */
const cuerpoPut = z.object({
  titulo: z.string().max(400),
  archivoPath: z.string().max(300),
  archivoNombre: z.string().min(1).max(200),
  archivoBytes: z.number().int().positive(),
  portadaPath: z.string().max(300).nullable(),
}).strict()

async function vista(r: RegaloDeLaPropiedad): Promise<RegaloVista> {
  return {
    titulo: r.titulo,
    archivoNombre: r.archivoNombre,
    archivoBytes: r.archivoBytes,
    archivoPath: r.archivoPath,
    portadaPath: r.portadaPath,
    portadaUrl: r.portadaPath ? await datos.urlFirmada(r.portadaPath, SEGUNDOS_URL_PORTADA) : null,
    descargaUrl: await datos.urlFirmada(r.archivoPath, SEGUNDOS_URL_DESCARGA, nombreDeDescarga(r.archivoNombre)),
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await autorizarRegalo(id)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const r = await datos.leerRegalo(id)
    return NextResponse.json({ data: r ? await vista(r) : null })
  } catch (e) {
    console.error('[GET /api/properties/[id]/regalo]', e)
    return NextResponse.json({ error: 'No pudimos cargar el regalo' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await autorizarRegalo(id)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  const parsed = cuerpoPut.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos del regalo inválidos' }, { status: 400 })
  const b = parsed.data
  const t = validarTitulo(b.titulo)
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: 400 })
  if (!esPathDelRegalo(b.archivoPath, id)) return NextResponse.json({ error: 'El archivo no corresponde a esta propiedad' }, { status: 400 })
  if (b.portadaPath !== null && !esPathDePortada(b.portadaPath, id)) return NextResponse.json({ error: 'La portada no corresponde a esta propiedad' }, { status: 400 })
  const nombre = nombreDeDescarga(b.archivoNombre)
  const errArchivo = validarArchivoRegalo({ nombre, bytes: b.archivoBytes })
  if (errArchivo) return NextResponse.json({ error: errArchivo }, { status: 400 })
  try {
    const subidos = await Promise.all([datos.existeArchivo(b.archivoPath), b.portadaPath ? datos.existeArchivo(b.portadaPath) : Promise.resolve(true)])
    if (subidos.includes(false)) return NextResponse.json({ error: 'El archivo no terminó de subir. Probá de nuevo.' }, { status: 400 })
    const anterior = await datos.leerRegalo(id)
    await datos.guardarRegalo({ propertyId: id, titulo: t.titulo, archivoPath: b.archivoPath, archivoNombre: nombre, archivoBytes: b.archivoBytes, portadaPath: b.portadaPath, actorId: a.userId })
    if (anterior) {
      const viejos = [anterior.archivoPath, anterior.portadaPath].filter((p): p is string => !!p && p !== b.archivoPath && p !== b.portadaPath)
      await datos.borrarArchivos(viejos)
    }
    const actual = await datos.leerRegalo(id)
    if (!actual) throw new Error('el regalo no quedó guardado')
    return NextResponse.json({ data: await vista(actual) })
  } catch (e) {
    console.error('[PUT /api/properties/[id]/regalo]', e)
    return NextResponse.json({ error: 'No pudimos guardar el regalo. Probá de nuevo.' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const a = await autorizarRegalo(id)
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status })
  try {
    const anterior = await datos.leerRegalo(id)
    if (anterior) {
      await datos.borrarRegalo(id)
      await datos.borrarArchivos([anterior.archivoPath, anterior.portadaPath].filter((p): p is string => !!p))
    }
    return NextResponse.json({ data: null })
  } catch (e) {
    console.error('[DELETE /api/properties/[id]/regalo]', e)
    return NextResponse.json({ error: 'No pudimos quitar el regalo. Probá de nuevo.' }, { status: 500 })
  }
}
```

  (En el test del PUT, `leerRegalo` devuelve SIEMPRE el regalo viejo: la relectura final también lo
  devuelve y la respuesta es 200, que es lo que el test mira. El borrado de `[ARCHIVO]` sale de
  comparar el viejo contra el nuevo.)

- [ ] **Paso 6: Correr y verlos pasar** — el comando del Paso 2. Esperado: PASS. Más `tsc` y eslint.

- [ ] **Paso 7: Commit** — `git add lib/visitas/encuesta/acceso-regalo.ts lib/visitas/encuesta/acceso-regalo.test.ts "app/api/properties/[id]/regalo/route.ts" "app/api/properties/[id]/regalo/route.test.ts" "app/api/properties/[id]/regalo/subida/route.ts" "app/api/properties/[id]/regalo/subida/route.test.ts"`;
  mensaje `feat(visitas): API del regalo por propiedad (subida firmada a bucket privado, reemplazo y quitar)`.

---

### Tarea 13: Tarjeta "Regalo de la encuesta" en la pestaña Visitas

**Files:**
- Create: `lib/visitas/encuesta/subir-regalo.ts`
- Create: `components/visitas/encuesta/RegaloDeLaEncuesta.tsx` (+`RegaloDeLaEncuesta.test.tsx`)
- Modify: `components/properties/detail/tabs/VisitasTab.tsx` (+`VisitasTab.test.tsx`)

**Interfaces:**
- Consumes: rutas de la Tarea 12; `validarArchivoRegalo`, `validarPortada`, `validarTitulo`,
  `RegaloVista` (Tarea 5); `leerRespuesta` de `components/visitas/agendar/leer-respuesta.ts`.
- Produces: `subirRegalo(propertyId, d: { titulo: string; archivo: File; portada: File | null }, alAvanzar?: (pct: number) => void): Promise<RegaloVista>`,
  `cambiarTitulo(propertyId, actual: RegaloVista, titulo: string): Promise<RegaloVista>`,
  `quitarRegalo(propertyId): Promise<void>`; componente `RegaloDeLaEncuesta({ propertyId })`.

- [ ] **Paso 1: Test del componente** — `components/visitas/encuesta/RegaloDeLaEncuesta.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { subirMock, quitarMock } = vi.hoisted(() => ({ subirMock: vi.fn(), quitarMock: vi.fn() }))
vi.mock('@/lib/visitas/encuesta/subir-regalo', () => ({ subirRegalo: subirMock, quitarRegalo: quitarMock, cambiarTitulo: vi.fn() }))

import { RegaloDeLaEncuesta } from './RegaloDeLaEncuesta'

const PROP = '33333333-3333-4333-8333-333333333333'
const VISTA = { titulo: 'Guía de Caballito', archivoNombre: 'Guía.pdf', archivoBytes: 2_500_000, archivoPath: 'a', portadaPath: null, portadaUrl: null, descargaUrl: 'https://firmada/pdf' }
let respuesta: { status: number; body: unknown }

beforeEach(() => {
  subirMock.mockReset(); quitarMock.mockReset()
  respuesta = { status: 200, body: { data: null } }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(respuesta.body), { status: respuesta.status })))
})

describe('RegaloDeLaEncuesta', () => {
  it('sin regalo: explica para qué es y no deja subir hasta tener título y PDF', async () => {
    render(<RegaloDeLaEncuesta propertyId={PROP} />)
    expect(await screen.findByRole('heading', { name: 'Regalo de la encuesta' })).toBeInTheDocument()
    expect(screen.getByText(/recibe quien responde la encuesta de esta propiedad/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir regalo' })).toBeDisabled()
  })
  it('un archivo que no es PDF avisa y no sube', async () => {
    // applyAccept:false: sin esto userEvent descarta el .docx por el `accept` y el test no prueba nada.
    const usuario = userEvent.setup({ applyAccept: false })
    render(<RegaloDeLaEncuesta propertyId={PROP} />)
    await usuario.type(await screen.findByLabelText('Título'), 'Guía de Caballito')
    await usuario.upload(screen.getByLabelText('Archivo PDF'), new File(['x'], 'guia.docx', { type: 'application/msword' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El regalo tiene que ser un PDF')
    expect(subirMock).not.toHaveBeenCalled()
  })
  it('sube y muestra el regalo cargado', async () => {
    subirMock.mockResolvedValue(VISTA)
    render(<RegaloDeLaEncuesta propertyId={PROP} />)
    await userEvent.type(await screen.findByLabelText('Título'), 'Guía de Caballito')
    const pdf = new File(['%PDF'], 'Guía.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Archivo PDF'), pdf)
    await userEvent.click(screen.getByRole('button', { name: 'Subir regalo' }))
    expect(subirMock).toHaveBeenCalledWith(PROP, { titulo: 'Guía de Caballito', archivo: pdf, portada: null }, expect.any(Function))
    expect(await screen.findByText('Guía de Caballito')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver PDF' })).toHaveAttribute('href', 'https://firmada/pdf')
  })
  it('quitar pide confirmación en la misma tarjeta', async () => {
    respuesta = { status: 200, body: { data: VISTA } }
    quitarMock.mockResolvedValue(undefined)
    render(<RegaloDeLaEncuesta propertyId={PROP} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Quitar' }))
    expect(quitarMock).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Sí, quitar el regalo' }))
    expect(quitarMock).toHaveBeenCalledWith(PROP)
    expect(await screen.findByRole('button', { name: 'Subir regalo' })).toBeInTheDocument()
  })
  it('sin permiso (403) no muestra nada', async () => {
    respuesta = { status: 403, body: { error: 'Solo quien gestiona la propiedad puede cargar el regalo' } }
    const { container } = render(<RegaloDeLaEncuesta propertyId={PROP} />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
  it('error de carga: el mensaje y "Reintentar"', async () => {
    respuesta = { status: 500, body: { error: 'No pudimos cargar el regalo' } }
    render(<RegaloDeLaEncuesta propertyId={PROP} />)
    expect(await screen.findByText('No pudimos cargar el regalo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Correr y verlo fallar** — `npx vitest run --config vitest.visitas.config.ts components/visitas/encuesta`.
  Esperado: FAIL (componente inexistente).

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/subir-regalo.ts`**

```ts
/**
 * Subida del regalo desde el navegador: init (firma) → PUT directo a Storage → confirmar.
 * Mismo patrón que lib/properties/upload-plans.ts: el archivo nunca pasa por el body de Next.
 */
import { validarArchivoRegalo, validarPortada, validarTitulo, type RegaloVista } from './regalo'

interface SlotSubida { signedUrl: string; token: string; path: string }

async function leerJson(res: Response): Promise<Record<string, unknown>> {
  try { return (await res.json()) as Record<string, unknown> } catch { return {} }
}

function error(cuerpo: Record<string, unknown>, porDefecto: string): Error {
  return new Error(typeof cuerpo.error === 'string' ? cuerpo.error : porDefecto)
}

function subirASlot(archivo: File, slot: SlotSubida, alAvanzar?: (cargados: number) => void): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', slot.signedUrl, true)
    xhr.setRequestHeader('Content-Type', archivo.type || 'application/pdf')
    xhr.setRequestHeader('x-upsert', 'true')
    if (slot.token) xhr.setRequestHeader('Authorization', `Bearer ${slot.token}`)
    xhr.upload.onprogress = e => { if (e.lengthComputable) alAvanzar?.(e.loaded) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolver() : rechazar(new Error(`La subida falló (HTTP ${xhr.status})`)))
    xhr.onerror = () => rechazar(new Error('Se cortó la conexión durante la subida'))
    xhr.send(archivo)
  })
}

async function guardar(propertyId: string, cuerpo: Record<string, unknown>): Promise<RegaloVista> {
  const res = await fetch(`/api/properties/${propertyId}/regalo`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  })
  const j = await leerJson(res)
  if (!res.ok || !j.data) throw error(j, 'No pudimos guardar el regalo')
  return j.data as RegaloVista
}

export async function subirRegalo(
  propertyId: string,
  d: { titulo: string; archivo: File; portada: File | null },
  alAvanzar?: (pct: number) => void,
): Promise<RegaloVista> {
  const t = validarTitulo(d.titulo)
  if (!t.ok) throw new Error(t.error)
  const e1 = validarArchivoRegalo({ nombre: d.archivo.name, bytes: d.archivo.size })
  if (e1) throw new Error(e1)
  const e2 = d.portada ? validarPortada({ nombre: d.portada.name, bytes: d.portada.size }) : null
  if (e2) throw new Error(e2)

  const init = await fetch(`/api/properties/${propertyId}/regalo/subida`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      archivo: { nombre: d.archivo.name, bytes: d.archivo.size },
      portada: d.portada ? { nombre: d.portada.name, bytes: d.portada.size } : null,
    }),
  })
  const ij = await leerJson(init)
  if (!init.ok) throw error(ij, 'No pudimos preparar la subida')
  const slots = ij.data as { archivo: SlotSubida | null; portada: SlotSubida | null }
  if (!slots.archivo) throw new Error('No pudimos preparar la subida')

  const total = d.archivo.size + (d.portada?.size ?? 0)
  let cargadoPortada = 0
  await subirASlot(d.archivo, slots.archivo, n => alAvanzar?.(Math.round(((n + cargadoPortada) / total) * 100)))
  if (d.portada && slots.portada) {
    await subirASlot(d.portada, slots.portada, n => { cargadoPortada = n; alAvanzar?.(Math.round(((d.archivo.size + n) / total) * 100)) })
  }
  return guardar(propertyId, {
    titulo: t.titulo, archivoPath: slots.archivo.path, archivoNombre: d.archivo.name,
    archivoBytes: d.archivo.size, portadaPath: slots.portada?.path ?? null,
  })
}

export async function cambiarTitulo(propertyId: string, actual: RegaloVista, titulo: string): Promise<RegaloVista> {
  return guardar(propertyId, {
    titulo, archivoPath: actual.archivoPath, archivoNombre: actual.archivoNombre,
    archivoBytes: actual.archivoBytes, portadaPath: actual.portadaPath,
  })
}

export async function quitarRegalo(propertyId: string): Promise<void> {
  const res = await fetch(`/api/properties/${propertyId}/regalo`, { method: 'DELETE' })
  if (!res.ok) throw error(await leerJson(res), 'No pudimos quitar el regalo')
}
```

  (`j.data as RegaloVista` y `ij.data as …`: son respuestas de NUESTRAS rutas, tipadas por el
  servidor; es la excepción del repo para cuerpos JSON, igual que `leerRespuesta`.)

- [ ] **Paso 4: Implementar `components/visitas/encuesta/RegaloDeLaEncuesta.tsx`**

```tsx
'use client'
/**
 * "Regalo de la encuesta" en la pestaña Visitas de la ficha (adenda §11.2): el PDF que recibe quien
 * completa la encuesta de ESTA propiedad. Sin permiso (403) no se muestra: la barrera es la ruta.
 */
import { useCallback, useEffect, useState } from 'react'
import { Gift, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { subirRegalo, quitarRegalo } from '@/lib/visitas/encuesta/subir-regalo'
import { validarArchivoRegalo, validarPortada, type RegaloVista } from '@/lib/visitas/encuesta/regalo'

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'sin_permiso' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; regalo: RegaloVista | null }

function megas(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`
}

export function RegaloDeLaEncuesta({ propertyId }: { propertyId: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [portada, setPortada] = useState<File | null>(null)
  const [avance, setAvance] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)

  const cargar = useCallback(async () => {
    setEstado({ tipo: 'cargando' })
    try {
      const r = await leerRespuesta<RegaloVista | null>(await fetch(`/api/properties/${propertyId}/regalo`))
      if (!r.ok) {
        setEstado(r.status === 403 || r.status === 401 ? { tipo: 'sin_permiso' } : { tipo: 'error', mensaje: r.error })
        return
      }
      setEstado({ tipo: 'listo', regalo: r.data })
    } catch {
      setEstado({ tipo: 'error', mensaje: 'No hay conexión. Probá de nuevo.' })
    }
  }, [propertyId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dispara la primera lectura; el estado inicial ya es 'cargando'
    void cargar()
  }, [cargar])

  function elegirArchivo(f: File | null) {
    setError(f ? validarArchivoRegalo({ nombre: f.name, bytes: f.size }) : null)
    setArchivo(f && !validarArchivoRegalo({ nombre: f.name, bytes: f.size }) ? f : null)
  }
  function elegirPortada(f: File | null) {
    setError(f ? validarPortada({ nombre: f.name, bytes: f.size }) : null)
    setPortada(f && !validarPortada({ nombre: f.name, bytes: f.size }) ? f : null)
  }

  async function subir() {
    if (!archivo) return
    setError(null); setAvance(0)
    try {
      const regalo = await subirRegalo(propertyId, { titulo, archivo, portada }, setAvance)
      setEstado({ tipo: 'listo', regalo }); setEditando(false); setArchivo(null); setPortada(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos subir el regalo')
    } finally {
      setAvance(null)
    }
  }

  async function quitar() {
    setError(null)
    try {
      await quitarRegalo(propertyId)
      setConfirmarQuitar(false); setTitulo('')
      setEstado({ tipo: 'listo', regalo: null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos quitar el regalo')
    }
  }

  if (estado.tipo === 'sin_permiso') return null

  const regalo = estado.tipo === 'listo' ? estado.regalo : null
  const mostrarFormulario = estado.tipo === 'listo' && (!regalo || editando)
  const subiendo = avance !== null

  return (
    <section aria-labelledby="regalo-encuesta" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-brand" aria-hidden="true" />
        <h3 id="regalo-encuesta" className="text-base font-semibold">Regalo de la encuesta</h3>
      </div>

      {estado.tipo === 'cargando' && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" />}
      {estado.tipo === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{estado.mensaje}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void cargar()}>Reintentar</Button>
        </div>
      )}

      {regalo && !editando && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {regalo.portadaUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada de un bucket privado, de vida corta
            <img src={regalo.portadaUrl} alt="" className="h-20 w-16 shrink-0 rounded object-cover" />
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="break-words font-medium">{regalo.titulo}</p>
            <p className="break-all text-sm text-muted-foreground">{regalo.archivoNombre} · {megas(regalo.archivoBytes)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {regalo.descargaUrl && (
              <a href={regalo.descargaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm">Ver PDF</a>
            )}
            <Button type="button" variant="outline" className="min-h-11" onClick={() => { setEditando(true); setTitulo(regalo.titulo) }}>Reemplazar</Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmarQuitar(true)}>Quitar</Button>
          </div>
        </div>
      )}

      {confirmarQuitar && (
        <div className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm">
          <p>¿Quitar el regalo? La encuesta de esta propiedad deja de ofrecerlo y, con "solo propiedades con regalo", deja de mandarse.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" className="min-h-11" onClick={() => void quitar()}>Sí, quitar el regalo</Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirmarQuitar(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {mostrarFormulario && (
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); void subir() }}>
          {!regalo && (
            <p className="text-sm text-muted-foreground">
              Es el material (PDF de hasta 20 MB) que recibe quien responde la encuesta de esta propiedad. Sin regalo, la encuesta se ofrece igual pero no sale sola por WhatsApp.
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="regalo-titulo">Título</Label>
            <Input id="regalo-titulo" className="min-h-11 text-base" value={titulo} onChange={e => setTitulo(e.target.value)} maxLength={120} placeholder="Ej.: Guía del barrio de Caballito" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="regalo-archivo">Archivo PDF</Label>
            <Input id="regalo-archivo" type="file" accept="application/pdf,.pdf" className="min-h-11" onChange={e => elegirArchivo(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="regalo-portada">Portada (opcional, JPG/PNG/WEBP)</Label>
            <Input id="regalo-portada" type="file" accept="image/jpeg,image/png,image/webp" className="min-h-11" onChange={e => elegirPortada(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">Sin portada, la encuesta muestra la primera foto de la propiedad.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" className="min-h-11 bg-brand text-brand-foreground hover:bg-brand/90" disabled={subiendo || !archivo || titulo.trim().length < 3}>
              {subiendo ? `Subiendo… ${avance} %` : 'Subir regalo'}
            </Button>
            {regalo && <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditando(false)} disabled={subiendo}>Cancelar</Button>}
          </div>
          <p role="status" aria-live="polite" className="sr-only">{subiendo ? `Subiendo, ${avance} por ciento` : ''}</p>
        </form>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  )
}
```

- [ ] **Paso 5: Enganchar en la pestaña** — en `components/properties/detail/tabs/VisitasTab.tsx`:
  import `import { RegaloDeLaEncuesta } from '@/components/visitas/encuesta/RegaloDeLaEncuesta'` y,
  después del `<div>` del título ("Compradores" / "Visitas"), agregar
  `<RegaloDeLaEncuesta propertyId={propertyId} />`. En `VisitasTab.test.tsx` se mockea la tarjeta (su
  `fetch` propio desordenaría la cola de respuestas que esos tests arman a mano), arriba de los
  imports del componente:

```tsx
const { regaloMock } = vi.hoisted(() => ({ regaloMock: vi.fn((_props: { propertyId: string }) => null) }))
vi.mock('@/components/visitas/encuesta/RegaloDeLaEncuesta', () => ({ RegaloDeLaEncuesta: regaloMock }))
```

  y un `it` nuevo:

```tsx
  it('monta la tarjeta del regalo de ESTA propiedad', async () => {
    respuestas = [{ status: 200, body: { data: [], total: 0 } }]
    render(<VisitasTab propertyId={PROP} mostrarAsesor />)
    await screen.findByText('Todavía no hay visitas en esta propiedad.')
    expect(regaloMock.mock.calls[0][0]).toMatchObject({ propertyId: PROP })
  })
```

- [ ] **Paso 6: Correr y verlos pasar** — `npx vitest run --config vitest.visitas.config.ts components/visitas/encuesta components/properties/detail/tabs/VisitasTab.test.tsx`.
  Esperado: PASS. Más `tsc` y eslint.

- [ ] **Paso 7: Commit** — `git add lib/visitas/encuesta/subir-regalo.ts components/visitas/encuesta/RegaloDeLaEncuesta.tsx components/visitas/encuesta/RegaloDeLaEncuesta.test.tsx components/properties/detail/tabs/VisitasTab.tsx components/properties/detail/tabs/VisitasTab.test.tsx`;
  mensaje `feat(visitas): cargar, reemplazar y quitar el regalo de la encuesta desde la pestaña Visitas`.

---

### Tarea 14: Pantalla de configuración `/settings/encuesta` (admin y dueño)

**Files:**
- Create: `lib/visitas/encuesta/ajustes.ts` (+`ajustes.test.ts`)
- Create: `app/api/settings/encuesta-visitas/route.ts` (+`route.test.ts`)
- Create: `app/(dashboard)/settings/encuesta/page.tsx` (+`page.test.tsx`)
- Modify: `lib/nav/sections.ts` (+`lib/nav/sections.test.ts`)

**Interfaces:**
- Consumes: `leerAjustesEncuesta`, `guardarAjustesEncuesta` (Tarea 6); `PLANTILLAS_*`, `definicionDe`
  (Tarea 4); `hasPermission`; `whatsappTestMode` de `lib/integrations/whatsapp/core.ts`;
  `normalizeWhatsappPhone`; `ultimos10Digitos`.
- Produces: `MAX_TELEFONOS_PRUEBA = 10`, `cuerpoAjustes`, `sanearAjustes(body, normalizar)`,
  `EstadoPlantilla { uso: 'encuesta' | 'regalo'; variable: string; configurada: string | null; conocida: boolean; conBoton: boolean; conDocumento: boolean }`,
  `estadoDePlantillas(env: { encuesta?: string; regalo?: string })`;
  `GET/PATCH /api/settings/encuesta-visitas` → `{ data: { ajustes: AjustesEncuesta; plantillas: EstadoPlantilla[]; whatsappModoPrueba: boolean } }`.

- [ ] **Paso 1: Tests** — `lib/visitas/encuesta/ajustes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sanearAjustes, estadoDePlantillas } from './ajustes'

const normalizar = (v: string | null | undefined) => {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length >= 10 ? `549${d.slice(-10)}` : null
}

describe('sanearAjustes', () => {
  it('interruptores y teléfonos normalizados, sin repetidos por últimos 10 dígitos', () => {
    expect(sanearAjustes({ envio_automatico: true, telefonos_prueba: ['11 5823-4521', '+5491158234521', '11 4444-5555'] }, normalizar))
      .toEqual({ ok: true, cambios: { envio_automatico: true, telefonos_prueba: ['5491158234521', '5491144445555'] } })
  })
  it('un teléfono inválido se nombra en el error', () => {
    expect(sanearAjustes({ telefonos_prueba: ['123', '11 5823-4521'] }, normalizar)).toEqual({ ok: false, error: 'Revisá estos teléfonos: 123' })
  })
  it('estricto: campos desconocidos, tipos raros, más de 10 teléfonos o nada para cambiar → error', () => {
    expect(sanearAjustes({ envio_automatico: 'si' }, normalizar).ok).toBe(false)
    expect(sanearAjustes({ regalo: {} }, normalizar).ok).toBe(false)
    expect(sanearAjustes({ telefonos_prueba: Array.from({ length: 11 }, (_, i) => `11 5823-45${String(i).padStart(2, '0')}`) }, normalizar).ok).toBe(false)
    expect(sanearAjustes({}, normalizar)).toEqual({ ok: false, error: 'No hay cambios' })
  })
})

describe('estadoDePlantillas', () => {
  it('configurada y conocida, sin configurar, o configurada pero desconocida', () => {
    expect(estadoDePlantillas({ encuesta: 'encuesta_visita_v1', regalo: undefined })).toEqual([
      { uso: 'encuesta', variable: 'WHATSAPP_TEMPLATE_ENCUESTA_VISITA', configurada: 'encuesta_visita_v1', conocida: true, conBoton: true, conDocumento: false },
      { uso: 'regalo', variable: 'WHATSAPP_TEMPLATE_REGALO_VISITA', configurada: null, conocida: false, conBoton: false, conDocumento: false },
    ])
    expect(estadoDePlantillas({ encuesta: 'otra_v9', regalo: 'regalo_visita_v1' })[0]).toMatchObject({ configurada: 'otra_v9', conocida: false })
    expect(estadoDePlantillas({ encuesta: '  ', regalo: 'regalo_visita_v1' })[1]).toMatchObject({ conocida: true, conDocumento: true })
  })
})
```

  `app/api/settings/encuesta-visitas/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, datosMock } = vi.hoisted(() => ({
  estado: { role: 'admin', logueado: true },
  datosMock: { leerAjustesEncuesta: vi.fn(), guardarAjustesEncuesta: vi.fn() },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado ? { id: 'u1', email: 'a@b.c', profile: { id: 'u1', role: estado.role, is_active: true } } : null),
}))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)
vi.mock('@/lib/integrations/whatsapp/core', () => ({ whatsappTestMode: () => true }))
vi.mock('@/lib/integrations/whatsapp/phone', () => ({
  normalizeWhatsappPhone: (v: string | null | undefined) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `549${d.slice(-10)}` : null
  },
}))

import { GET, PATCH } from './route'

const AJUSTES = { envio_automatico: false, solo_con_regalo: true, regalo_por_whatsapp: false, telefonos_prueba: [] }
const patch = (body: unknown) => PATCH(new Request('http://local', { method: 'PATCH', body: JSON.stringify(body) }) as never)

beforeEach(() => {
  estado.role = 'admin'; estado.logueado = true
  datosMock.leerAjustesEncuesta.mockReset().mockResolvedValue(AJUSTES)
  datosMock.guardarAjustesEncuesta.mockReset().mockResolvedValue({ ...AJUSTES, envio_automatico: true })
  vi.stubEnv('WHATSAPP_TEMPLATE_ENCUESTA_VISITA', 'encuesta_visita_v1')
})

describe('/api/settings/encuesta-visitas', () => {
  it('admin y dueño leen ajustes, plantillas y el modo prueba de WhatsApp', async () => {
    for (const rol of ['admin', 'dueno']) {
      estado.role = rol
      const body = await (await GET()).json()
      expect(body.data.ajustes).toEqual(AJUSTES)
      expect(body.data.whatsappModoPrueba).toBe(true)
      expect(body.data.plantillas[0]).toMatchObject({ configurada: 'encuesta_visita_v1', conocida: true })
    }
  })
  it('coordinador, asesor y abogado: 403 sin tocar la base; sin sesión: 401', async () => {
    for (const rol of ['coordinador', 'asesor', 'abogado']) {
      estado.role = rol
      expect((await GET()).status).toBe(403)
      expect((await patch({ envio_automatico: true })).status).toBe(403)
    }
    expect(datosMock.leerAjustesEncuesta).not.toHaveBeenCalled()
    estado.logueado = false
    expect((await GET()).status).toBe(401)
  })
  it('PATCH guarda con el autor y devuelve lo que quedó', async () => {
    const body = await (await patch({ envio_automatico: true })).json()
    expect(datosMock.guardarAjustesEncuesta).toHaveBeenCalledWith({ envio_automatico: true }, 'u1')
    expect(body.data.ajustes.envio_automatico).toBe(true)
  })
  it('PATCH inválido: 400 con el motivo; ajustes ilegibles: 500 (no se inventan)', async () => {
    const res = await patch({ telefonos_prueba: ['123'] })
    expect([res.status, (await res.json()).error]).toEqual([400, 'Revisá estos teléfonos: 123'])
    datosMock.leerAjustesEncuesta.mockResolvedValue(null)
    expect((await GET()).status).toBe(500)
  })
})
```

  `app/(dashboard)/settings/encuesta/page.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AjustesEncuestaPage from './page'

const DATOS = {
  ajustes: { envio_automatico: false, solo_con_regalo: true, regalo_por_whatsapp: false, telefonos_prueba: ['5491158234521'] },
  plantillas: [
    { uso: 'encuesta', variable: 'WHATSAPP_TEMPLATE_ENCUESTA_VISITA', configurada: 'encuesta_visita_v1', conocida: true, conBoton: true, conDocumento: false },
    { uso: 'regalo', variable: 'WHATSAPP_TEMPLATE_REGALO_VISITA', configurada: null, conocida: false, conBoton: false, conDocumento: false },
  ],
  whatsappModoPrueba: false,
}
const pedidos: Array<{ metodo: string; cuerpo: unknown }> = []
let respuestaGet: { status: number; body: unknown }
let respuestaPatch: { status: number; body: unknown }

beforeEach(() => {
  pedidos.length = 0
  respuestaGet = { status: 200, body: { data: DATOS } }
  respuestaPatch = { status: 200, body: { data: { ...DATOS, ajustes: { ...DATOS.ajustes, envio_automatico: true } } } }
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    pedidos.push({ metodo, cuerpo: init?.body ? JSON.parse(String(init.body)) : null })
    const r = metodo === 'PATCH' ? respuestaPatch : respuestaGet
    return new Response(JSON.stringify(r.body), { status: r.status })
  }))
})

describe('/settings/encuesta', () => {
  it('muestra los interruptores, la lista de prueba y el estado de las plantillas', async () => {
    render(<AjustesEncuestaPage />)
    expect(await screen.findByRole('switch', { name: 'Mandar la encuesta por WhatsApp' })).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Solo propiedades con regalo' })).toBeChecked()
    expect(screen.getByText('5491158234521')).toBeInTheDocument()
    expect(screen.getByText('encuesta_visita_v1')).toBeInTheDocument()
    expect(screen.getByText('Sin configurar: no se manda nada')).toBeInTheDocument()
  })
  it('prender el envío pide confirmación y recién ahí guarda', async () => {
    render(<AjustesEncuestaPage />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Mandar la encuesta por WhatsApp' }))
    expect(pedidos.filter(p => p.metodo === 'PATCH')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Sí, prender' }))
    await waitFor(() => expect(pedidos.find(p => p.metodo === 'PATCH')?.cuerpo).toEqual({ envio_automatico: true }))
  })
  it('apagar "solo con regalo" guarda sin preguntar', async () => {
    render(<AjustesEncuestaPage />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Solo propiedades con regalo' }))
    await waitFor(() => expect(pedidos.find(p => p.metodo === 'PATCH')?.cuerpo).toEqual({ solo_con_regalo: false }))
  })
  it('un teléfono que el servidor rechaza muestra su error', async () => {
    respuestaPatch = { status: 400, body: { error: 'Revisá estos teléfonos: 123' } }
    render(<AjustesEncuestaPage />)
    await userEvent.type(await screen.findByLabelText('Agregar teléfono de prueba'), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar teléfonos' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisá estos teléfonos: 123')
  })
  it('sin permiso lo dice', async () => {
    respuestaGet = { status: 403, body: { error: 'No tenés permiso' } }
    render(<AjustesEncuestaPage />)
    expect(await screen.findByText('Solo admin y dueño pueden ver esta configuración.')).toBeInTheDocument()
  })
})
```

  En `lib/nav/sections.test.ts`, en el `it('el admin ve todo…')`, sumar `'/settings/encuesta'` a la
  lista de hrefs esperados.

- [ ] **Paso 2: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/ajustes.test.ts app/api/settings/encuesta-visitas "app/(dashboard)/settings/encuesta" lib/nav/sections.test.ts`.
  Esperado: FAIL.

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/ajustes.ts`**

```ts
/**
 * Saneo de los ajustes de la encuesta que manda /settings/encuesta (adenda §11.1.5) y estado de las
 * dos plantillas configuradas en Netlify. Puro: el normalizador de teléfonos entra por parámetro.
 */
import { z } from 'zod'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { PLANTILLAS_ENCUESTA, PLANTILLAS_REGALO, definicionDe } from './plantillas'
import type { AjustesEncuesta } from './tipos'

/** Mismo tope que el CHECK de visit_survey_settings.telefonos_prueba. */
export const MAX_TELEFONOS_PRUEBA = 10

export const cuerpoAjustes = z.object({
  envio_automatico: z.boolean().optional(),
  solo_con_regalo: z.boolean().optional(),
  regalo_por_whatsapp: z.boolean().optional(),
  telefonos_prueba: z.array(z.string().max(40)).max(MAX_TELEFONOS_PRUEBA).optional(),
}).strict()

export function sanearAjustes(
  body: unknown,
  normalizar: (v: string | null | undefined) => string | null,
): { ok: true; cambios: Partial<AjustesEncuesta> } | { ok: false; error: string } {
  const p = cuerpoAjustes.safeParse(body)
  if (!p.success) return { ok: false, error: 'Datos inválidos' }
  const cambios: Partial<AjustesEncuesta> = {}
  if (p.data.envio_automatico !== undefined) cambios.envio_automatico = p.data.envio_automatico
  if (p.data.solo_con_regalo !== undefined) cambios.solo_con_regalo = p.data.solo_con_regalo
  if (p.data.regalo_por_whatsapp !== undefined) cambios.regalo_por_whatsapp = p.data.regalo_por_whatsapp
  if (p.data.telefonos_prueba !== undefined) {
    const malos: string[] = []
    const vistos = new Set<string>()
    const buenos: string[] = []
    for (const crudo of p.data.telefonos_prueba) {
      const n = normalizar(crudo)
      const clave = n ? ultimos10Digitos(n) : null
      if (!n || !clave) { malos.push(crudo.trim() || '(vacío)'); continue }
      if (!vistos.has(clave)) { vistos.add(clave); buenos.push(n) }
    }
    if (malos.length > 0) return { ok: false, error: `Revisá estos teléfonos: ${malos.join(', ')}` }
    cambios.telefonos_prueba = buenos
  }
  if (Object.keys(cambios).length === 0) return { ok: false, error: 'No hay cambios' }
  return { ok: true, cambios }
}

export interface EstadoPlantilla {
  uso: 'encuesta' | 'regalo'
  variable: string
  configurada: string | null
  conocida: boolean
  conBoton: boolean
  conDocumento: boolean
}

export function estadoDePlantillas(env: { encuesta?: string; regalo?: string }): EstadoPlantilla[] {
  const una = (uso: 'encuesta' | 'regalo', variable: string, valor: string | undefined): EstadoPlantilla => {
    const configurada = valor?.trim() || null
    const def = definicionDe(uso === 'encuesta' ? PLANTILLAS_ENCUESTA : PLANTILLAS_REGALO, configurada)
    return { uso, variable, configurada, conocida: def !== null, conBoton: def?.conBoton ?? false, conDocumento: def?.encabezado === 'document' }
  }
  return [
    una('encuesta', 'WHATSAPP_TEMPLATE_ENCUESTA_VISITA', env.encuesta),
    una('regalo', 'WHATSAPP_TEMPLATE_REGALO_VISITA', env.regalo),
  ]
}
```

- [ ] **Paso 4: Crear `app/api/settings/encuesta-visitas/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { hasPermission } from '@/lib/auth/roles'
import { whatsappTestMode } from '@/lib/integrations/whatsapp/core'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import * as datos from '@/lib/visitas/encuesta/datos'
import { sanearAjustes, estadoDePlantillas } from '@/lib/visitas/encuesta/ajustes'
import type { AjustesEncuesta } from '@/lib/visitas/encuesta/tipos'
import type { Role } from '@/types/auth.types'

/**
 * Ajustes de la encuesta (adenda §11.1.5): solo `settings.manage` (admin y dueño). Reemplaza el
 * "por SQL" de la spec original: nadie tiene que tocar la base a mano para prender o apagar envíos.
 */
async function permitir(): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  const user = await getUser()
  if (!user || !user.profile.is_active) return { ok: false, res: NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 }) }
  let puede = false
  try { puede = hasPermission(user.profile.role as Role, 'settings.manage') } catch { puede = false }
  if (!puede) return { ok: false, res: NextResponse.json({ error: 'No tenés permiso' }, { status: 403 }) }
  return { ok: true, userId: user.id }
}

function respuesta(ajustes: AjustesEncuesta) {
  return NextResponse.json({
    data: {
      ajustes,
      plantillas: estadoDePlantillas({ encuesta: process.env.WHATSAPP_TEMPLATE_ENCUESTA_VISITA, regalo: process.env.WHATSAPP_TEMPLATE_REGALO_VISITA }),
      whatsappModoPrueba: whatsappTestMode(),
    },
  })
}

export async function GET() {
  const p = await permitir()
  if (!p.ok) return p.res
  const ajustes = await datos.leerAjustesEncuesta()
  if (!ajustes) return NextResponse.json({ error: 'No se pudieron leer los ajustes' }, { status: 500 })
  return respuesta(ajustes)
}

export async function PATCH(req: NextRequest) {
  const p = await permitir()
  if (!p.ok) return p.res
  const s = sanearAjustes(await req.json().catch(() => null), normalizeWhatsappPhone)
  if (!s.ok) return NextResponse.json({ error: s.error }, { status: 400 })
  try {
    return respuesta(await datos.guardarAjustesEncuesta(s.cambios, p.userId))
  } catch (e) {
    console.error('[PATCH /api/settings/encuesta-visitas]', e)
    return NextResponse.json({ error: 'No se pudieron guardar los ajustes' }, { status: 500 })
  }
}
```

- [ ] **Paso 5: Crear `app/(dashboard)/settings/encuesta/page.tsx`**

```tsx
'use client'
/**
 * /settings/encuesta (adenda §11.1.5): interruptores del envío de la encuesta y del regalo por
 * WhatsApp, teléfonos de prueba y estado de las plantillas. Prender algo que le escribe a clientes
 * pide confirmación ACÁ (no un confirm() del navegador). La barrera de permisos es la ruta.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import type { AjustesEncuesta } from '@/lib/visitas/encuesta/tipos'
import type { EstadoPlantilla } from '@/lib/visitas/encuesta/ajustes'

interface Datos { ajustes: AjustesEncuesta; plantillas: EstadoPlantilla[]; whatsappModoPrueba: boolean }
type Fase = { tipo: 'cargando' } | { tipo: 'sin_permiso' } | { tipo: 'error'; mensaje: string } | { tipo: 'listo'; datos: Datos }
type Interruptor = 'envio_automatico' | 'solo_con_regalo' | 'regalo_por_whatsapp'

const INTERRUPTORES: ReadonlyArray<{ clave: Interruptor; titulo: string; ayuda: string; confirmar: string | null }> = [
  {
    clave: 'envio_automatico', titulo: 'Mandar la encuesta por WhatsApp',
    ayuda: 'Al marcar una visita "Se realizó", se le manda la encuesta a la persona.',
    confirmar: 'Cada visita marcada "Se realizó" le va a mandar la encuesta por WhatsApp a la persona (en las propiedades con regalo, salvo que apagues "Solo propiedades con regalo"). ¿Prender?',
  },
  {
    clave: 'solo_con_regalo', titulo: 'Solo propiedades con regalo',
    ayuda: 'Si está prendido, la encuesta sale sola únicamente en propiedades que tienen su regalo cargado.',
    confirmar: null,
  },
  {
    clave: 'regalo_por_whatsapp', titulo: 'Mandar el regalo por WhatsApp',
    ayuda: 'Quien completa la encuesta recibe el PDF por WhatsApp. Prendelo solo cuando Meta haya aprobado la plantilla del regalo.',
    confirmar: 'Quien complete la encuesta va a recibir el PDF del regalo por WhatsApp. Prendelo solo si Meta ya aprobó la plantilla regalo_visita_v1. ¿Prender?',
  },
]

function cambio(clave: Interruptor, valor: boolean): Partial<AjustesEncuesta> {
  const c: Partial<AjustesEncuesta> = {}
  c[clave] = valor
  return c
}

export default function AjustesEncuestaPage() {
  const [fase, setFase] = useState<Fase>({ tipo: 'cargando' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aConfirmar, setAConfirmar] = useState<Interruptor | null>(null)
  const [telefonos, setTelefonos] = useState<string[]>([])
  const [nuevo, setNuevo] = useState('')

  const cargar = useCallback(async () => {
    try {
      const r = await leerRespuesta<Datos>(await fetch('/api/settings/encuesta-visitas'))
      if (!r.ok) {
        setFase(r.status === 403 ? { tipo: 'sin_permiso' } : { tipo: 'error', mensaje: r.error })
        return
      }
      setFase({ tipo: 'listo', datos: r.data }); setTelefonos(r.data.ajustes.telefonos_prueba)
    } catch {
      setFase({ tipo: 'error', mensaje: 'No hay conexión. Probá de nuevo.' })
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dispara la primera lectura; el estado inicial ya es 'cargando'
    void cargar()
  }, [cargar])

  async function guardar(cambios: Partial<AjustesEncuesta>) {
    setGuardando(true); setError(null)
    try {
      const r = await leerRespuesta<Datos>(await fetch('/api/settings/encuesta-visitas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cambios),
      }))
      if (!r.ok) { setError(r.error); return }
      setFase({ tipo: 'listo', datos: r.data }); setTelefonos(r.data.ajustes.telefonos_prueba)
    } catch {
      setError('No hay conexión. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  function alTocar(clave: Interruptor, valor: boolean) {
    const def = INTERRUPTORES.find(i => i.clave === clave)
    if (valor && def?.confirmar) { setAConfirmar(clave); return }
    void guardar(cambio(clave, valor))
  }

  if (fase.tipo === 'cargando') return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  if (fase.tipo === 'sin_permiso') return <p className="text-sm text-muted-foreground">Solo admin y dueño pueden ver esta configuración.</p>
  if (fase.tipo === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
        <span>{fase.mensaje}</span>
        <Button variant="outline" className="min-h-11" onClick={() => { setFase({ tipo: 'cargando' }); void cargar() }}>Reintentar</Button>
      </div>
    )
  }

  const { ajustes, plantillas, whatsappModoPrueba } = fase.datos
  const confirmacion = INTERRUPTORES.find(i => i.clave === aConfirmar)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold">Encuesta de visitas</h1>
        <p className="text-muted-foreground">Qué se le manda a la persona después de una visita realizada.</p>
        {whatsappModoPrueba && <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">WhatsApp está en modo prueba: no sale ningún mensaje real.</p>}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader><CardTitle className="text-base">Envío por WhatsApp</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {INTERRUPTORES.map(i => (
            <div key={i.clave} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor={`sw-${i.clave}`} className="font-medium">{i.titulo}</Label>
                <p className="text-sm text-muted-foreground">{i.ayuda}</p>
              </div>
              <Switch id={`sw-${i.clave}`} aria-label={i.titulo} checked={ajustes[i.clave]} disabled={guardando}
                onCheckedChange={v => alTocar(i.clave, v)} className="mt-1" />
            </div>
          ))}
          {confirmacion?.confirmar && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p>{confirmacion.confirmar}</p>
              <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" disabled={guardando} onClick={() => { const c = confirmacion.clave; setAConfirmar(null); void guardar(cambio(c, true)) }}>Sí, prender</Button>
                <Button variant="outline" className="min-h-11" onClick={() => setAConfirmar(null)}>Cancelar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Teléfonos de prueba</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Estos números reciben la encuesta y el regalo aunque el envío esté apagado. Vaciá la lista al terminar de probar.</p>
          <ul className="flex flex-wrap gap-2">
            {telefonos.map(t => (
              <li key={t} className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm">
                <span>{t}</span>
                <button type="button" aria-label={`Quitar ${t}`} className="min-h-11 min-w-11 inline-flex items-center justify-center" onClick={() => setTelefonos(ts => ts.filter(x => x !== t))}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Agregar teléfono de prueba" inputMode="tel" className="min-h-11 max-w-xs text-base" value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="11 5823-4521" />
            <Button type="button" variant="outline" className="min-h-11" disabled={!nuevo.trim() || telefonos.length >= 10}
              onClick={() => { setTelefonos(ts => [...ts, nuevo.trim()]); setNuevo('') }}>Agregar</Button>
            <Button type="button" className="min-h-11" disabled={guardando} onClick={() => void guardar({ telefonos_prueba: telefonos })}>Guardar teléfonos</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Plantillas de WhatsApp</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            {plantillas.map(p => (
              <li key={p.uso} className="space-y-1">
                <p className="font-medium">{p.uso === 'encuesta' ? 'Encuesta' : 'Regalo'} <span className="font-mono text-xs text-muted-foreground">({p.variable})</span></p>
                {p.configurada ? <p className="font-mono">{p.configurada}</p> : <p className="text-muted-foreground">Sin configurar: no se manda nada</p>}
                {p.configurada && !p.conocida && <p className="text-destructive">No es una de las plantillas conocidas: no se manda (Meta rechazaría el mensaje).</p>}
                {p.conocida && <p className="text-muted-foreground">{p.conBoton ? 'Con botón "Completar ficha".' : ''}{p.conDocumento ? 'Lleva el PDF adjunto.' : ''}</p>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Paso 6: Entrada en el menú** — en `lib/nav/sections.ts`, dentro de `items` de "Configuración",
  después de `/settings/portals`, agregar `{ href: '/settings/encuesta', label: 'Encuesta de visitas', icon: Settings },`.

- [ ] **Paso 7: Correr y verlos pasar** — el comando del Paso 2. Esperado: PASS. Más `tsc` y eslint.

- [ ] **Paso 8: Commit** — `git add lib/visitas/encuesta/ajustes.ts lib/visitas/encuesta/ajustes.test.ts app/api/settings/encuesta-visitas/route.ts app/api/settings/encuesta-visitas/route.test.ts "app/(dashboard)/settings/encuesta/page.tsx" "app/(dashboard)/settings/encuesta/page.test.tsx" lib/nav/sections.ts lib/nav/sections.test.ts`;
  mensaje `feat(visitas): pantalla de configuración de la encuesta (interruptores, lista de prueba, plantillas)`.

---

### Tarea 15: Reductor puro del reproductor de la encuesta

**Files:**
- Create: `lib/visitas/encuesta/reproductor.ts` (+`reproductor.test.ts`)

**Interfaces:**
- Consumes: `EncuestaPublica`, `urlDescargaDelRegalo` (Tarea 5); `pasoAnterior`, `pasoSiguiente`
  (Tarea 2); `NADA`, `OTRA`, `MAX_OPCIONES` (Tarea 3); `formatearMiles`, `parsearMonto`.
- Produces: `ContactoBorrador { cambiarTelefono; telefono; email; similares; empresa }`,
  `EstadoReproductor { paso; respuestas; ofertaTexto; contacto; animar; ocupado; error; descarga }`,
  `AccionReproductor`, `estadoInicial(e)`, `reducir(s, a)`, `puedeAvanzar(s, conTelefonoPrecargado)`,
  `CuerpoPasoCliente`, `cuerpoDelPaso(s)`, `cuerpoFinalDelEstado(s)`, `esPasoEncuesta(v)`,
  `alternarEtiqueta(sel, clave)`.

- [ ] **Paso 1: Test** — `lib/visitas/encuesta/reproductor.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { estadoInicial, reducir, puedeAvanzar, cuerpoDelPaso, cuerpoFinalDelEstado, alternarEtiqueta, esPasoEncuesta, type EstadoReproductor } from './reproductor'
import { armarEncuestaPublica, type EncuestaPublica } from './publica'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import type { EncuestaFila, VisitaDeEncuesta } from './tipos'

function publica(e: Partial<EncuestaFila> = {}, v: Partial<VisitaDeEncuesta> = {}, regalo: EncuestaPublica['regalo'] = null): EncuestaPublica {
  const r = armarEncuestaPublica(encuestaConVisitaDePrueba(e, v), { regalo, regaloPorWhatsapp: false, ahora: new Date('2026-10-15T15:00:00Z') })
  if (r.tipo !== 'disponible') throw new Error('la encuesta de prueba tendría que estar disponible')
  return r.encuesta
}
const en = (s: EstadoReproductor, paso: EstadoReproductor['paso']): EstadoReproductor => ({ ...s, paso })

describe('estado inicial', () => {
  it('arranca donde retoma, sin animar (la primera pantalla sale del servidor tal cual)', () => {
    const s = estadoInicial(publica({ liked: true }))
    expect(s).toMatchObject({ paso: 'mas_gusto', animar: false, ocupado: false, error: null, descarga: null })
    expect(s.contacto.cambiarTelefono).toBe(false)
  })
  it('sin teléfono precargado hay que escribirlo; terminada con regalo ya trae la descarga', () => {
    expect(estadoInicial(publica({}, { client_phone: null })).contacto.cambiarTelefono).toBe(true)
    const hecha = estadoInicial(publica({ completed_at: '2026-10-15T14:00:00Z' }, {}, { titulo: 'Guía', portada: null }))
    expect(hecha).toMatchObject({ paso: 'gracias', descarga: `/api/public/encuesta/${TOKEN_DE_PRUEBA}/regalo` })
  })
})

describe('transiciones', () => {
  const s0 = estadoInicial(publica())
  it('empezar va a la primera pregunta y anima desde ahí', () => {
    expect(reducir(s0, { tipo: 'empezar' })).toMatchObject({ paso: 'gusto', animar: true })
  })
  it('guardado → siguiente; error → se queda con el mensaje; atrás → anterior', () => {
    const ocupado = reducir(en(s0, 'gusto'), { tipo: 'ocupado' })
    expect(ocupado.ocupado).toBe(true)
    expect(reducir(ocupado, { tipo: 'avanzar' })).toMatchObject({ paso: 'mas_gusto', ocupado: false })
    expect(reducir(ocupado, { tipo: 'error', mensaje: 'x' })).toMatchObject({ paso: 'gusto', ocupado: false, error: 'x' })
    expect(reducir(en(s0, 'precio'), { tipo: 'atras' }).paso).toBe('menos_gusto')
    expect(reducir(s0, { tipo: 'atras' })).toBe(s0)
  })
  it('ir a un paso con mensaje (el servidor dijo que falta algo) y terminar', () => {
    expect(reducir(en(s0, 'contacto'), { tipo: 'ir_a', paso: 'precio', mensaje: 'Falta responder esta pregunta' }))
      .toMatchObject({ paso: 'precio', error: 'Falta responder esta pregunta' })
    expect(reducir(en(s0, 'contacto'), { tipo: 'terminado', descarga: '/d' })).toMatchObject({ paso: 'gracias', descarga: '/d' })
  })
})

describe('opciones de varias', () => {
  it('"Nada en especial" es exclusiva; sacar "Otra cosa" borra su texto; tope de 8', () => {
    expect(alternarEtiqueta(['ruido'], 'nada')).toEqual(['nada'])
    expect(alternarEtiqueta(['nada'], 'ruido')).toEqual(['ruido'])
    expect(alternarEtiqueta(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 'i')).toHaveLength(8)
    let s = en(estadoInicial(publica()), 'menos_gusto')
    s = reducir(s, { tipo: 'alternar', paso: 'menos_gusto', clave: 'otra' })
    s = reducir(s, { tipo: 'escribir_otra', paso: 'menos_gusto', texto: 'El ascensor' })
    expect(s.respuestas.least_liked_other).toBe('El ascensor')
    s = reducir(s, { tipo: 'alternar', paso: 'menos_gusto', clave: 'otra' })
    expect(s.respuestas).toMatchObject({ least_liked_tags: [], least_liked_other: null })
  })
})

describe('oferta', () => {
  const s = en(estadoInicial(publica()), 'oferta')
  it('se escribe agrupada y se lee como número; basura no es monto', () => {
    const a = reducir(s, { tipo: 'escribir_oferta', texto: '1290000' })
    expect([a.ofertaTexto, a.respuestas.offer_amount]).toEqual(['1.290.000', 1290000])
    expect(reducir(s, { tipo: 'escribir_oferta', texto: 'abc' }).respuestas.offer_amount).toBeNull()
  })
  it('atajo y "prefiero no decirlo"', () => {
    expect(reducir(s, { tipo: 'atajo_oferta', monto: 135000 })).toMatchObject({ ofertaTexto: '135.000', respuestas: { offer_amount: 135000, offer_declined: false } })
    expect(reducir(reducir(s, { tipo: 'escribir_oferta', texto: '5' }), { tipo: 'declinar_oferta' }))
      .toMatchObject({ ofertaTexto: '', respuestas: { offer_amount: null, offer_declined: true } })
  })
})

describe('puedeAvanzar y cuerpos', () => {
  const s = estadoInicial(publica())
  it('cada paso exige su respuesta', () => {
    expect(puedeAvanzar(en(s, 'gusto'), true)).toBe(false)
    expect(puedeAvanzar(reducir(en(s, 'gusto'), { tipo: 'elegir_gusto', valor: false }), true)).toBe(true)
    const conOtra = reducir(en(s, 'mas_gusto'), { tipo: 'alternar', paso: 'mas_gusto', clave: 'otra' })
    expect(puedeAvanzar(conOtra, true)).toBe(false)
    expect(puedeAvanzar(reducir(conOtra, { tipo: 'escribir_otra', paso: 'mas_gusto', texto: 'El barrio' }), true)).toBe(true)
  })
  it('contacto: con teléfono precargado alcanza; sin él hay que escribirlo; email mal escrito frena', () => {
    const c = en(s, 'contacto')
    expect(puedeAvanzar(c, true)).toBe(true)
    expect(puedeAvanzar({ ...c, contacto: { ...c.contacto, cambiarTelefono: true } }, true)).toBe(false)
    expect(puedeAvanzar({ ...c, contacto: { ...c.contacto, cambiarTelefono: true, telefono: '11 4444-5555' } }, false)).toBe(true)
    expect(puedeAvanzar({ ...c, contacto: { ...c.contacto, email: 'ana@' } }, true)).toBe(false)
  })
  it('el cuerpo de cada paso es el que valida el servidor', () => {
    expect(cuerpoDelPaso(reducir(en(s, 'precio'), { tipo: 'elegir_precio', valor: 'alto' }))).toEqual({ paso: 'precio', valor: 'alto' })
    expect(cuerpoDelPaso(reducir(en(s, 'oferta'), { tipo: 'declinar_oferta' }))).toEqual({ paso: 'oferta', monto: null, declina: true })
    expect(cuerpoDelPaso(en(s, 'bienvenida'))).toBeNull()
  })
  it('el final manda el teléfono solo si se cambió, y el honeypot tal cual', () => {
    const c = en(s, 'contacto')
    expect(cuerpoFinalDelEstado(c)).toEqual({ telefono: null, email: null, similares: false, empresa: '' })
    expect(cuerpoFinalDelEstado({ ...c, contacto: { cambiarTelefono: true, telefono: ' 11 4444-5555 ', email: ' ana@mail.com ', similares: true, empresa: 'x' } }))
      .toEqual({ telefono: '11 4444-5555', email: 'ana@mail.com', similares: true, empresa: 'x' })
  })
  it('esPasoEncuesta', () => {
    expect(esPasoEncuesta('precio')).toBe(true)
    expect(esPasoEncuesta('borrar')).toBe(false)
  })
})
```

- [ ] **Paso 2: Correr y verlo fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/reproductor.test.ts`.
  Esperado: FAIL (módulo inexistente).

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/reproductor.ts`**

```ts
/**
 * Estado del reproductor de la encuesta (patrones de openform/form-player, sin framer-motion):
 * un reductor PURO que se testea sin navegador. La pantalla solo despacha y pinta.
 * `animar` arranca en false: la primera pantalla se pinta tal cual sale del servidor (nunca
 * contenido esperando al JS); la animación existe recién desde el primer cambio de paso.
 */
import { formatearMiles, parsearMonto } from '@/lib/properties/money-input'
import { MAX_OPCIONES, NADA, OTRA } from './opciones'
import { pasoAnterior, pasoSiguiente } from './pasos'
import { urlDescargaDelRegalo, type EncuestaPublica } from './publica'
import { PASOS_ENCUESTA, type OpinionPrecio, type PasoEncuesta, type RespuestasEncuesta } from './tipos'

export interface ContactoBorrador {
  cambiarTelefono: boolean
  telefono: string
  email: string
  similares: boolean
  /** Honeypot: queda vacío para una persona. */
  empresa: string
}

export interface EstadoReproductor {
  paso: PasoEncuesta
  respuestas: RespuestasEncuesta
  ofertaTexto: string
  contacto: ContactoBorrador
  animar: boolean
  ocupado: boolean
  error: string | null
  descarga: string | null
}

export type AccionReproductor =
  | { tipo: 'empezar' }
  | { tipo: 'elegir_gusto'; valor: boolean }
  | { tipo: 'alternar'; paso: 'mas_gusto' | 'menos_gusto'; clave: string }
  | { tipo: 'escribir_otra'; paso: 'mas_gusto' | 'menos_gusto'; texto: string }
  | { tipo: 'elegir_precio'; valor: OpinionPrecio }
  | { tipo: 'escribir_oferta'; texto: string }
  | { tipo: 'atajo_oferta'; monto: number }
  | { tipo: 'declinar_oferta' }
  | { tipo: 'contacto'; cambios: Partial<ContactoBorrador> }
  | { tipo: 'ocupado' }
  | { tipo: 'avanzar' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'ir_a'; paso: PasoEncuesta; mensaje?: string }
  | { tipo: 'atras' }
  | { tipo: 'terminado'; descarga: string | null }

export function esPasoEncuesta(v: unknown): v is PasoEncuesta {
  return typeof v === 'string' && (PASOS_ENCUESTA as readonly string[]).includes(v)
}

export function estadoInicial(e: EncuestaPublica): EstadoReproductor {
  return {
    paso: e.pasoInicial,
    respuestas: e.respuestas,
    ofertaTexto: e.respuestas.offer_amount ? formatearMiles(String(e.respuestas.offer_amount)) : '',
    contacto: { cambiarTelefono: e.telefonoEnmascarado === null, telefono: '', email: '', similares: false, empresa: '' },
    animar: false,
    ocupado: false,
    error: null,
    descarga: e.completa && e.regalo ? urlDescargaDelRegalo(e.token) : null,
  }
}

/** "Nada en especial" va sola (el servidor también lo exige); tope de 8. */
export function alternarEtiqueta(sel: readonly string[], clave: string): string[] {
  if (sel.includes(clave)) return sel.filter(c => c !== clave)
  if (clave === NADA) return [NADA]
  const sinNada = sel.filter(c => c !== NADA)
  return sinNada.length >= MAX_OPCIONES ? sinNada : [...sinNada, clave]
}

export function reducir(s: EstadoReproductor, a: AccionReproductor): EstadoReproductor {
  const r = s.respuestas
  switch (a.tipo) {
    case 'empezar':
      return { ...s, paso: 'gusto', animar: true, error: null }
    case 'elegir_gusto':
      return { ...s, respuestas: { ...r, liked: a.valor }, error: null }
    case 'alternar': {
      if (a.paso === 'mas_gusto') {
        const tags = alternarEtiqueta(r.most_liked_tags, a.clave)
        return { ...s, error: null, respuestas: { ...r, most_liked_tags: tags, most_liked_other: tags.includes(OTRA) ? r.most_liked_other : null } }
      }
      const tags = alternarEtiqueta(r.least_liked_tags, a.clave)
      return { ...s, error: null, respuestas: { ...r, least_liked_tags: tags, least_liked_other: tags.includes(OTRA) ? r.least_liked_other : null } }
    }
    case 'escribir_otra':
      return a.paso === 'mas_gusto'
        ? { ...s, error: null, respuestas: { ...r, most_liked_other: a.texto } }
        : { ...s, error: null, respuestas: { ...r, least_liked_other: a.texto } }
    case 'elegir_precio':
      return { ...s, respuestas: { ...r, price_opinion: a.valor }, error: null }
    case 'escribir_oferta': {
      const texto = formatearMiles(a.texto)
      return { ...s, ofertaTexto: texto, respuestas: { ...r, offer_amount: parsearMonto(texto), offer_declined: false }, error: null }
    }
    case 'atajo_oferta':
      return { ...s, ofertaTexto: formatearMiles(String(a.monto)), respuestas: { ...r, offer_amount: a.monto, offer_declined: false }, error: null }
    case 'declinar_oferta':
      return { ...s, ofertaTexto: '', respuestas: { ...r, offer_amount: null, offer_declined: true }, error: null }
    case 'contacto':
      return { ...s, contacto: { ...s.contacto, ...a.cambios }, error: null }
    case 'ocupado':
      return { ...s, ocupado: true, error: null }
    case 'avanzar':
      return { ...s, paso: pasoSiguiente(s.paso), ocupado: false, animar: true, error: null }
    case 'error':
      return { ...s, ocupado: false, error: a.mensaje }
    case 'ir_a':
      return { ...s, paso: a.paso, ocupado: false, animar: true, error: a.mensaje ?? null }
    case 'atras': {
      const p = pasoAnterior(s.paso)
      return p ? { ...s, paso: p, animar: true, error: null } : s
    }
    case 'terminado':
      return { ...s, paso: 'gracias', ocupado: false, animar: true, error: null, descarga: a.descarga }
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function puedeAvanzar(s: EstadoReproductor, conTelefonoPrecargado: boolean): boolean {
  const r = s.respuestas
  const conOtra = (tags: string[], otra: string | null) => tags.length > 0 && (!tags.includes(OTRA) || (otra ?? '').trim().length >= 2)
  switch (s.paso) {
    case 'gusto': return r.liked !== null
    case 'mas_gusto': return conOtra(r.most_liked_tags, r.most_liked_other)
    case 'menos_gusto': return conOtra(r.least_liked_tags, r.least_liked_other)
    case 'precio': return r.price_opinion !== null
    case 'oferta': return r.offer_amount !== null || r.offer_declined === true
    case 'contacto': {
      const tel = (!s.contacto.cambiarTelefono && conTelefonoPrecargado) || s.contacto.telefono.replace(/\D/g, '').length >= 8
      const email = s.contacto.email.trim()
      return tel && (email === '' || EMAIL_RE.test(email))
    }
    case 'bienvenida':
    case 'gracias':
      return true
  }
}

export type CuerpoPasoCliente =
  | { paso: 'gusto'; valor: boolean }
  | { paso: 'mas_gusto' | 'menos_gusto'; etiquetas: string[]; otra: string | null }
  | { paso: 'precio'; valor: OpinionPrecio }
  | { paso: 'oferta'; monto: number | null; declina: boolean }

export function cuerpoDelPaso(s: EstadoReproductor): CuerpoPasoCliente | null {
  const r = s.respuestas
  switch (s.paso) {
    case 'gusto': return r.liked === null ? null : { paso: 'gusto', valor: r.liked }
    case 'mas_gusto': return { paso: 'mas_gusto', etiquetas: r.most_liked_tags, otra: r.most_liked_other }
    case 'menos_gusto': return { paso: 'menos_gusto', etiquetas: r.least_liked_tags, otra: r.least_liked_other }
    case 'precio': return r.price_opinion === null ? null : { paso: 'precio', valor: r.price_opinion }
    case 'oferta': return { paso: 'oferta', monto: r.offer_declined ? null : r.offer_amount, declina: r.offer_declined === true }
    default: return null
  }
}

export function cuerpoFinalDelEstado(s: EstadoReproductor): { telefono: string | null; email: string | null; similares: boolean; empresa: string } {
  return {
    telefono: s.contacto.cambiarTelefono ? s.contacto.telefono.trim() || null : null,
    email: s.contacto.email.trim() || null,
    similares: s.contacto.similares,
    empresa: s.contacto.empresa,
  }
}
```

- [ ] **Paso 4: Correr y verlo pasar** — el comando del Paso 2. Esperado: PASS. Más `tsc` y eslint.

- [ ] **Paso 5: Commit** — `git add lib/visitas/encuesta/reproductor.ts lib/visitas/encuesta/reproductor.test.ts`;
  mensaje `feat(visitas): reductor puro del reproductor de la encuesta (pasos, opciones, oferta, contacto)`.

---

### Tarea 16: El componente estilo Typeform

**Files:**
- Create: `components/encuesta/PantallasEncuesta.tsx`
- Create: `components/encuesta/EncuestaVisita.tsx` (+`EncuestaVisita.test.tsx`)
- Modify: `app/globals.css` (animación de entrada)

**Interfaces:**
- Consumes: reductor (Tarea 15); `EncuestaPublica` (Tarea 5); `avance`, `pasoAnterior`,
  `esPasoGuardable` (Tarea 2); `atajosDeOferta`, `textoMonto` (Tarea 3); `OPINIONES_PRECIO` (Tarea 2);
  `urlDescargaDelRegalo` (Tarea 5).
- Produces: `EncuestaVisita({ encuesta }: { encuesta: EncuestaPublica })` (cliente);
  `ESPERA_AUTOAVANCE_MS = 350`; en `PantallasEncuesta.tsx` (componentes de MÓDULO):
  `LETRAS`, `BarraDeAvance`, `BotonAtras`, `Bienvenida`, `PreguntaUnica`, `PreguntaVarias`,
  `PreguntaOferta`, `PasoContacto`, `Gracias`.

- [ ] **Paso 1: Test** — `components/encuesta/EncuestaVisita.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { createElement } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/image', () => ({ default: (p: { src: string; alt: string }) => createElement('img', { src: p.src, alt: p.alt }) }))

import { EncuestaVisita } from './EncuestaVisita'
import { armarEncuestaPublica, type EncuestaPublica } from '@/lib/visitas/encuesta/publica'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import type { EncuestaFila, VisitaDeEncuesta } from '@/lib/visitas/encuesta/tipos'

const REGALO = { titulo: 'Guía de Caballito', portada: null }
function encuesta(e: Partial<EncuestaFila> = {}, v: Partial<VisitaDeEncuesta> = {}, regalo: EncuestaPublica['regalo'] = REGALO): EncuestaPublica {
  const r = armarEncuestaPublica(encuestaConVisitaDePrueba(e, v), { regalo, regaloPorWhatsapp: false, ahora: new Date('2026-10-15T15:00:00Z') })
  if (r.tipo !== 'disponible') throw new Error('la encuesta de prueba tendría que estar disponible')
  return r.encuesta
}

interface Llamada { url: string; metodo: string; cuerpo: unknown }
let llamadas: Llamada[]
let responder: (l: Llamada) => Response | Promise<Response>
const BASE = `/api/public/encuesta/${TOKEN_DE_PRUEBA}`
const ok = (data: unknown = { ok: true }) => new Response(JSON.stringify({ data }), { status: 200 })
const patches = (paso?: string) => llamadas.filter(l => l.metodo === 'PATCH' && (!paso || (l.cuerpo as { paso: string }).paso === paso))

beforeEach(() => {
  llamadas = []
  responder = l => l.metodo === 'POST' && l.url === BASE
    ? ok({ completa: true, regalo: { titulo: 'Guía de Caballito', descarga: `${BASE}/regalo` } })
    : ok()
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const l = { url, metodo: init?.method ?? 'GET', cuerpo: init?.body ? JSON.parse(String(init.body)) : null }
    llamadas.push(l)
    return responder(l)
  }))
})

describe('EncuestaVisita (criterios 20, 21, 22)', () => {
  it('bienvenida con regalo: nombre, dirección, regalo, "menos de un minuto", sin contar preguntas', async () => {
    render(<EncuestaVisita encuesta={encuesta()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mariana, este regalo es tuyo.' })).toBeInTheDocument()
    expect(screen.getByText('Visitaste Doblas 248, Caballito')).toBeInTheDocument()
    expect(screen.getByText('Guía de Caballito')).toBeInTheDocument()
    expect(screen.getByText(/Te lleva menos de un minuto/)).toBeInTheDocument()
    expect(screen.queryByText(/\d+ (de|preguntas)/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quiero mi regalo' })).toBeInTheDocument()
    await waitFor(() => expect(patches('abierta')).toHaveLength(1))
  })
  it('sin regalo: bienvenida neutra, sin la palabra regalo', () => {
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mariana, ¿qué te pareció Doblas 248?' })).toBeInTheDocument()
    expect(screen.queryByText(/regalo/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Empezar' })).toBeInTheDocument()
  })
  it('la primera pantalla no anima ni se esconde (sale del servidor tal cual)', () => {
    const { container } = render(<EncuestaVisita encuesta={encuesta()} />)
    expect(container.querySelector('.encuesta-entra')).toBeNull()
  })
  it('Sí avanza solo y guarda esa respuesta', async () => {
    render(<EncuestaVisita encuesta={encuesta()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quiero mi regalo' }))
    await userEvent.click(await screen.findByRole('radio', { name: /Sí/ }))
    expect(await screen.findByRole('heading', { name: '¿Qué fue lo que más te gustó?' })).toBeInTheDocument()
    expect(patches('gusto')[0].cuerpo).toEqual({ paso: 'gusto', valor: true })
  })
  it('si no se puede guardar, se queda en la pregunta y lo dice', async () => {
    responder = l => (l.metodo === 'PATCH' && (l.cuerpo as { paso: string }).paso === 'gusto' ? Promise.reject(new Error('red')) : ok())
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    await userEvent.click(await screen.findByRole('radio', { name: /No/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos guardar tu respuesta')
    expect(screen.getByRole('heading', { name: 'Mariana, ¿te gustó Doblas 248?' })).toBeInTheDocument()
  })
  it('retoma en la 3 si ya respondió la 1 y la 2 (criterio 21)', () => {
    render(<EncuestaVisita encuesta={encuesta({ liked: true, most_liked_tags: ['luz'] })} />)
    expect(screen.getByRole('heading', { name: '¿Y lo que menos te gustó?' })).toBeInTheDocument()
  })
  it('atrás vuelve a la anterior con lo elegido marcado', async () => {
    render(<EncuestaVisita encuesta={encuesta({ liked: true })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Volver a la pregunta anterior' }))
    expect(await screen.findByRole('radio', { name: /Sí/ })).toHaveAttribute('aria-checked', 'true')
  })
  it('"Otra cosa" pide el texto antes del OK', async () => {
    render(<EncuestaVisita encuesta={encuesta({ liked: true })} />)
    await userEvent.click(screen.getByRole('button', { name: /Otra cosa/ }))
    expect(screen.getByRole('button', { name: /OK/ })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('¿Qué otra cosa?'), 'El barrio')
    await userEvent.click(screen.getByRole('button', { name: /OK/ }))
    await waitFor(() => expect(patches('mas_gusto')[0].cuerpo).toEqual({ paso: 'mas_gusto', etiquetas: ['otra'], otra: 'El barrio' }))
  })
  it('la oferta se ve agrupada; "Prefiero no decirlo" guarda y avanza', async () => {
    render(<EncuestaVisita encuesta={encuesta({ liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto' })} />)
    const campo = screen.getByLabelText('Tu oferta en dólares')
    await userEvent.type(campo, '1290000')
    expect(campo).toHaveValue('1.290.000')
    expect(campo).toHaveAttribute('inputmode', 'numeric')
    expect(screen.getByText('El propietario no ve tu nombre.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Prefiero no decirlo' }))
    await waitFor(() => expect(patches('oferta')[0].cuerpo).toEqual({ paso: 'oferta', monto: null, declina: true }))
    expect(await screen.findByRole('heading', { name: 'Confirmá tus datos para recibirlo' })).toBeInTheDocument()
  })
  it('final: un doble toque manda UNA vez; gracias con la descarga y los avisos', async () => {
    let soltar: () => void = () => {}
    responder = l => {
      if (l.metodo === 'POST' && l.url === BASE) {
        return new Promise<Response>(r => { soltar = () => r(ok({ completa: true, regalo: { titulo: 'Guía de Caballito', descarga: `${BASE}/regalo` } })) })
      }
      return ok()
    }
    const todo = { liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto' as const, offer_declined: true }
    render(<EncuestaVisita encuesta={encuesta(todo)} />)
    const boton = screen.getByRole('button', { name: 'Quiero mi regalo' })
    await userEvent.dblClick(boton)
    soltar()
    expect(await screen.findByRole('link', { name: /Descargar Guía de Caballito/ })).toHaveAttribute('href', `${BASE}/regalo`)
    expect(llamadas.filter(l => l.metodo === 'POST' && l.url === BASE)).toHaveLength(1)
    await waitFor(() => expect(llamadas.some(l => l.url === `${BASE}/avisos`)).toBe(true))
  })
  it('si el servidor dice que falta una respuesta, vuelve a esa pregunta', async () => {
    responder = l => (l.metodo === 'POST' && l.url === BASE
      ? new Response(JSON.stringify({ error: 'Falta responder una pregunta', paso: 'precio' }), { status: 409 })
      : ok())
    const todo = { liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto' as const, offer_declined: true }
    render(<EncuestaVisita encuesta={encuesta(todo)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quiero mi regalo' }))
    expect(await screen.findByRole('heading', { name: /Está publicada en US\$ 150\.000/ })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Falta responder esta pregunta')
  })
  it('ya respondida: directo a gracias, sin marcar "abierta"', async () => {
    render(<EncuestaVisita encuesta={encuesta({ completed_at: '2026-10-15T14:00:00Z' })} />)
    expect(screen.getByRole('link', { name: /Descargar Guía de Caballito/ })).toBeInTheDocument()
    await new Promise(r => setTimeout(r, 20))
    expect(patches('abierta')).toHaveLength(0)
  })
  it('el honeypot existe pero no es para personas', () => {
    const todo = { liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto' as const, offer_declined: true }
    const { container } = render(<EncuestaVisita encuesta={encuesta(todo)} />)
    const trampa = container.querySelector('input[name="empresa"]')
    expect(trampa).toHaveAttribute('tabindex', '-1')
    expect(trampa?.closest('[aria-hidden="true"]')).not.toBeNull()
  })
  it('teclado en computadora: B elige "No" en ¿Te gustó?', async () => {
    render(<EncuestaVisita encuesta={encuesta({}, {}, null)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Empezar' }))
    await screen.findByRole('radio', { name: /No/ })
    await userEvent.keyboard('b')
    await waitFor(() => expect(patches('gusto')[0]?.cuerpo).toEqual({ paso: 'gusto', valor: false }))
  })
  it('sin precio publicado pregunta en general y no ofrece atajos', () => {
    // propiedad siempre existe en el constructor de pruebas
    const sinPrecio = encuestaConVisitaDePrueba().visita.propiedad!
    render(<EncuestaVisita encuesta={encuesta({ liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'] }, { propiedad: { ...sinPrecio, asking_price: null } })} />)
    expect(screen.getByRole('heading', { name: '¿Qué te parece el precio?' })).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Correr y verlo fallar** — `npx vitest run --config vitest.visitas.config.ts components/encuesta`.
  Esperado: FAIL (componentes inexistentes).

- [ ] **Paso 3: Implementar `components/encuesta/PantallasEncuesta.tsx`**

```tsx
'use client'
/**
 * Pantallas de la encuesta (spec §3.6 + adenda §11.3). Componentes de MÓDULO, nunca declarados
 * dentro de otro (CLAUDE.md: un componente declarado en el render se remonta en cada cambio de
 * estado y se pierde el toque). Celular primero: opciones de ≥ 48 px, inputs de 16 px, botón de
 * cada paso EN EL FLUJO (no fijo: con el teclado abierto en iOS quedaría encima del campo).
 * Las letras A/B/C y "presioná Enter ↵" solo se ven con mouse (@media hover:hover).
 */
import Image from 'next/image'
import type { ReactNode, RefObject } from 'react'
import { ArrowLeft, Check, Download, Gift, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { atajosDeOferta, textoMonto } from '@/lib/visitas/encuesta/oferta'
import { OTRA, type OpcionEncuesta } from '@/lib/visitas/encuesta/opciones'
import type { EncuestaPublica } from '@/lib/visitas/encuesta/publica'
import type { ContactoBorrador } from '@/lib/visitas/encuesta/reproductor'

export const LETRAS = 'ABCDEFGH'
type Titulo = RefObject<HTMLHeadingElement | null>

const OPCION = 'flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-base transition-colors hover:border-brand disabled:opacity-60'
const OPCION_ELEGIDA = 'border-brand bg-brand-soft text-foreground'
const CAMPO = 'min-h-12 w-full min-w-0 rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-brand'
const BOTON = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-base font-semibold text-brand-foreground disabled:opacity-60 sm:w-auto'
const SECUNDARIO = 'inline-flex min-h-12 w-full items-center justify-center rounded-xl border px-5 text-base font-medium disabled:opacity-60 sm:w-auto'

function TituloPaso({ tituloRef, children }: { tituloRef: Titulo; children: ReactNode }) {
  return <h1 ref={tituloRef} tabIndex={-1} className="break-words text-2xl font-semibold leading-snug outline-none">{children}</h1>
}

function Letra({ i }: { i: number }) {
  return (
    <span aria-hidden="true" className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold [@media(hover:hover)]:inline-flex">
      {LETRAS[i]}
    </span>
  )
}

function PistaEnter() {
  return <span className="hidden text-sm text-muted-foreground [@media(hover:hover)]:inline">presioná <kbd className="font-sans font-semibold">Enter ↵</kbd></span>
}

export function BarraDeAvance({ valor }: { valor: number }) {
  const pct = Math.round(valor * 100)
  return (
    <div role="progressbar" aria-label="Avance de la encuesta" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function BotonAtras({ onAtras, deshabilitado }: { onAtras: () => void; deshabilitado: boolean }) {
  return (
    <button type="button" onClick={onAtras} disabled={deshabilitado} aria-label="Volver a la pregunta anterior"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted disabled:opacity-60">
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}

export function Bienvenida({ encuesta, tituloRef, onEmpezar }: { encuesta: EncuestaPublica; tituloRef: Titulo; onEmpezar: () => void }) {
  const lugar = encuesta.barrio ? `${encuesta.direccion}, ${encuesta.barrio}` : encuesta.direccion
  return (
    <div className="flex flex-col gap-5">
      {encuesta.foto && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
          <Image src={encuesta.foto} alt={`Foto de ${encuesta.direccion}`} fill priority sizes="(max-width: 640px) 100vw, 576px" className="object-cover" />
        </div>
      )}
      <p className="text-sm font-medium text-muted-foreground">Visitaste {lugar}</p>
      {encuesta.regalo ? (
        <>
          <div className="flex items-center gap-4 rounded-2xl border bg-card p-4">
            {encuesta.regalo.portada ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada de un bucket privado: no pasa por el optimizador
              <img src={encuesta.regalo.portada} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-brand-soft"><Gift className="h-7 w-7 text-brand" aria-hidden="true" /></span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tu regalo</p>
              <p className="break-words font-semibold">{encuesta.regalo.titulo}</p>
            </div>
          </div>
          <TituloPaso tituloRef={tituloRef}>{encuesta.nombre ? `${encuesta.nombre}, este regalo es tuyo.` : 'Este regalo es tuyo.'}</TituloPaso>
          <p className="text-base text-muted-foreground">Contanos qué te pareció la visita y es tuyo al instante. Te lleva menos de un minuto.</p>
          <div className="flex flex-wrap items-center gap-3"><button type="button" className={BOTON} onClick={onEmpezar}>Quiero mi regalo</button><PistaEnter /></div>
        </>
      ) : (
        <>
          <TituloPaso tituloRef={tituloRef}>
            {encuesta.nombre ? `${encuesta.nombre}, ¿qué te pareció ${encuesta.direccion}?` : `¿Qué te pareció ${encuesta.direccion}?`}
          </TituloPaso>
          <p className="text-base text-muted-foreground">Te lleva menos de un minuto.</p>
          <div className="flex flex-wrap items-center gap-3"><button type="button" className={BOTON} onClick={onEmpezar}>Empezar</button><PistaEnter /></div>
        </>
      )}
    </div>
  )
}

export function PreguntaUnica<T extends string | boolean>({ titulo, opciones, elegida, onElegir, tituloRef, ocupado }: {
  titulo: string
  opciones: ReadonlyArray<{ valor: T; etiqueta: string }>
  elegida: T | null
  onElegir: (v: T) => void
  tituloRef: Titulo
  ocupado: boolean
}) {
  return (
    <div className="flex flex-col gap-5">
      <TituloPaso tituloRef={tituloRef}>{titulo}</TituloPaso>
      <div role="radiogroup" aria-label={titulo} className="flex flex-col gap-3">
        {opciones.map((o, i) => (
          <button key={String(o.valor)} type="button" role="radio" aria-checked={elegida === o.valor} disabled={ocupado}
            onClick={() => onElegir(o.valor)} className={cn(OPCION, elegida === o.valor && OPCION_ELEGIDA)}>
            <Letra i={i} />
            <span className="min-w-0 break-words">{o.etiqueta}</span>
            {elegida === o.valor && (ocupado ? <Loader2 className="ml-auto h-5 w-5 shrink-0 animate-spin" aria-hidden="true" /> : <Check className="ml-auto h-5 w-5 shrink-0" aria-hidden="true" />)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function PreguntaVarias({ id, titulo, opciones, elegidas, otra, onAlternar, onOtra, onOk, puedeOk, tituloRef, ocupado }: {
  id: string
  titulo: string
  opciones: OpcionEncuesta[]
  elegidas: string[]
  otra: string | null
  onAlternar: (clave: string) => void
  onOtra: (texto: string) => void
  onOk: () => void
  puedeOk: boolean
  tituloRef: Titulo
  ocupado: boolean
}) {
  return (
    <form className="flex flex-col gap-5" onSubmit={e => { e.preventDefault(); if (puedeOk && !ocupado) onOk() }}>
      <TituloPaso tituloRef={tituloRef}>{titulo}</TituloPaso>
      <p className="text-sm text-muted-foreground">Podés elegir varias.</p>
      <div role="group" aria-label={titulo} className="flex flex-col gap-3">
        {opciones.map((o, i) => {
          const marcada = elegidas.includes(o.clave)
          return (
            <button key={o.clave} type="button" aria-pressed={marcada} disabled={ocupado} onClick={() => onAlternar(o.clave)} className={cn(OPCION, marcada && OPCION_ELEGIDA)}>
              <Letra i={i} />
              <span className="min-w-0 break-words">{o.etiqueta}</span>
              {marcada && <Check className="ml-auto h-5 w-5 shrink-0" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      {elegidas.includes(OTRA) && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`otra-${id}`} className="text-sm font-medium">¿Qué otra cosa?</label>
          <input id={`otra-${id}`} type="text" className={CAMPO} maxLength={280} value={otra ?? ''} onChange={e => onOtra(e.target.value)} enterKeyHint="next" autoComplete="off" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={BOTON} disabled={!puedeOk || ocupado}>
          {ocupado ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}OK
        </button>
        <PistaEnter />
      </div>
    </form>
  )
}

export function PreguntaOferta({ encuesta, texto, onTexto, onAtajo, onDeclinar, onOk, puedeOk, tituloRef, ocupado }: {
  encuesta: EncuestaPublica
  texto: string
  onTexto: (t: string) => void
  onAtajo: (monto: number) => void
  onDeclinar: () => void
  onOk: () => void
  puedeOk: boolean
  tituloRef: Titulo
  ocupado: boolean
}) {
  const atajos = atajosDeOferta(encuesta.precio, encuesta.moneda)
  return (
    <form className="flex flex-col gap-5" onSubmit={e => { e.preventDefault(); if (puedeOk && !ocupado) onOk() }}>
      <TituloPaso tituloRef={tituloRef}>Si fueras a comprarla, ¿cuánto ofertarías?</TituloPaso>
      <div className="flex flex-col gap-1">
        <label htmlFor="oferta" className="text-sm font-medium">Tu oferta en {encuesta.moneda === 'USD' ? 'dólares' : 'pesos'}</label>
        <div className="flex min-h-12 items-center gap-2 rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-brand">
          <span aria-hidden="true" className="text-base text-muted-foreground">{encuesta.moneda === 'USD' ? 'US$' : '$'}</span>
          <input id="oferta" inputMode="numeric" enterKeyHint="next" autoComplete="off" placeholder="0"
            className="min-h-11 w-full min-w-0 bg-transparent text-base outline-none" value={texto} onChange={e => onTexto(e.target.value)} />
        </div>
      </div>
      {atajos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {atajos.map(a => (
            <button key={a.etiqueta} type="button" disabled={ocupado} onClick={() => onAtajo(a.monto)} className="min-h-11 rounded-full border px-4 text-sm">
              {a.etiqueta}: {textoMonto(a.monto, encuesta.moneda)}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">El propietario no ve tu nombre.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" className={BOTON} disabled={!puedeOk || ocupado}>
          {ocupado ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}OK
        </button>
        <button type="button" className={SECUNDARIO} disabled={ocupado} onClick={onDeclinar}>Prefiero no decirlo</button>
      </div>
    </form>
  )
}

export function PasoContacto({ encuesta, contacto, onCambio, onEnviar, puedeEnviar, tituloRef, ocupado }: {
  encuesta: EncuestaPublica
  contacto: ContactoBorrador
  onCambio: (c: Partial<ContactoBorrador>) => void
  onEnviar: () => void
  puedeEnviar: boolean
  tituloRef: Titulo
  ocupado: boolean
}) {
  return (
    <form className="relative flex flex-col gap-5" onSubmit={e => { e.preventDefault(); if (puedeEnviar && !ocupado) onEnviar() }}>
      <TituloPaso tituloRef={tituloRef}>{encuesta.regalo ? 'Confirmá tus datos para recibirlo' : 'Último paso: confirmá tus datos'}</TituloPaso>
      {encuesta.regalo && <p className="text-base">Tu regalo: <strong className="break-words">{encuesta.regalo.titulo}</strong></p>}
      <div className="flex flex-col gap-1">
        {encuesta.telefonoEnmascarado && !contacto.cambiarTelefono ? (
          <>
            <span className="text-sm font-medium">Tu WhatsApp</span>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3">
              <span className="text-base">{encuesta.telefonoEnmascarado}</span>
              <button type="button" className="min-h-11 px-2 text-sm font-medium text-brand" onClick={() => onCambio({ cambiarTelefono: true })}>Cambiar</button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="telefono" className="text-sm font-medium">Tu WhatsApp</label>
            <input id="telefono" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" placeholder="11 5823-4521"
              className={CAMPO} value={contacto.telefono} onChange={e => onCambio({ telefono: e.target.value })} />
          </>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">Tu email (opcional)</label>
        <input id="email" type="email" inputMode="email" autoComplete="email" enterKeyHint="send"
          className={CAMPO} value={contacto.email} onChange={e => onCambio({ email: e.target.value })} />
      </div>
      <label className="flex min-h-11 items-start gap-3 text-base">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--brand)]" checked={contacto.similares} onChange={e => onCambio({ similares: e.target.checked })} />
        <span>Avisame si entra una propiedad parecida</span>
      </label>
      {/* Honeypot: fuera de la pantalla, sin tab y sin autocompletar. Una persona no lo ve; un robot lo llena. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
        <label htmlFor="empresa">Empresa</label>
        <input id="empresa" name="empresa" tabIndex={-1} autoComplete="off" value={contacto.empresa} onChange={e => onCambio({ empresa: e.target.value })} />
      </div>
      <button type="submit" className={BOTON} disabled={!puedeEnviar || ocupado}>
        {ocupado ? 'Enviando…' : encuesta.regalo ? 'Quiero mi regalo' : 'Enviar'}
      </button>
    </form>
  )
}

export function Gracias({ encuesta, descarga, dejoEmail, tituloRef }: { encuesta: EncuestaPublica; descarga: string | null; dejoEmail: boolean; tituloRef: Titulo }) {
  const canales = [dejoEmail ? 'a tu email' : null, encuesta.regaloPorWhatsapp ? 'por WhatsApp' : null].filter((c): c is string => c !== null)
  return (
    <div className="flex flex-col gap-5">
      <TituloPaso tituloRef={tituloRef}>{encuesta.nombre ? `¡Gracias, ${encuesta.nombre}!` : '¡Gracias!'}</TituloPaso>
      {encuesta.regalo && descarga && (
        <>
          <p className="text-base">Acá tenés tu regalo:</p>
          <a href={descarga} className={BOTON}><Download className="h-5 w-5" aria-hidden="true" />Descargar {encuesta.regalo.titulo}</a>
          {canales.length > 0 && <p className="text-sm text-muted-foreground">También te lo mandamos {canales.join(' y ')}.</p>}
        </>
      )}
      <p className="text-base text-muted-foreground">Si querés volver a verla o hacer una oferta, respondé el WhatsApp de la visita.</p>
    </div>
  )
}
```

- [ ] **Paso 4: Implementar `components/encuesta/EncuestaVisita.tsx`**

```tsx
'use client'
/**
 * La encuesta post-visita estilo Typeform (spec §3.6, §4.9 + adenda §11.3). Componente propio, sin
 * dependencias nuevas ni framer-motion. El servidor pinta la primera pantalla ya armada; desde ahí:
 *   - cada respuesta se GUARDA antes de avanzar (si falla, se queda y lo dice);
 *   - "Sí/No" y el precio avanzan solos a los 350 ms; las de varias piden "OK";
 *   - "Abierta" la marca ESTE navegador una vez (el previsualizador de WhatsApp no corre JS);
 *   - el foco va al título al cambiar de paso (no al cargar: iOS abre el teclado solo dentro de un toque);
 *   - el final se manda UNA vez (ref de ocupado + reserva atómica del servidor) y los avisos
 *     (email al equipo, regalo) los pide la pantalla de gracias aparte, con keepalive.
 */
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { avance, pasoAnterior } from '@/lib/visitas/encuesta/pasos'
import { textoMonto } from '@/lib/visitas/encuesta/oferta'
import { urlDescargaDelRegalo, type EncuestaPublica } from '@/lib/visitas/encuesta/publica'
import {
  estadoInicial, reducir, puedeAvanzar, cuerpoDelPaso, cuerpoFinalDelEstado, esPasoEncuesta,
  type AccionReproductor, type CuerpoPasoCliente,
} from '@/lib/visitas/encuesta/reproductor'
import { OPINIONES_PRECIO, PASOS_ENCUESTA, type OpinionPrecio } from '@/lib/visitas/encuesta/tipos'
import { LETRAS, BarraDeAvance, BotonAtras, Bienvenida, PreguntaUnica, PreguntaVarias, PreguntaOferta, PasoContacto, Gracias } from './PantallasEncuesta'

export const ESPERA_AUTOAVANCE_MS = 350
const NO_GUARDO = 'No pudimos guardar tu respuesta. Revisá la conexión y probá de nuevo.'
const NO_ENVIO = 'No pudimos enviar tus respuestas. Probá de nuevo.'
const OPCIONES_GUSTO = [{ valor: true, etiqueta: 'Sí' }, { valor: false, etiqueta: 'No' }] as const
const ETIQUETA_PRECIO: Record<OpinionPrecio, string> = { correcto: 'Correcto', alto: 'Alto', bajo: 'Bajo' }
const OPCIONES_PRECIO = OPINIONES_PRECIO.map(v => ({ valor: v, etiqueta: ETIQUETA_PRECIO[v] }))

async function leerCuerpo(res: Response): Promise<Record<string, unknown>> {
  try {
    const j: unknown = await res.json()
    return j && typeof j === 'object' ? { ...j } : {}
  } catch {
    return {}
  }
}

/** La descarga que devolvió el final, sin `as`: se mira la forma paso a paso. */
function descargaDe(j: Record<string, unknown>): string | null {
  const data = j.data
  if (!data || typeof data !== 'object' || !('regalo' in data)) return null
  const regalo = data.regalo
  if (!regalo || typeof regalo !== 'object' || !('descarga' in regalo)) return null
  return typeof regalo.descarga === 'string' ? regalo.descarga : null
}

/** "¿Te gustó…?" → "Mariana, ¿te gustó…?": la minúscula va DESPUÉS del "¿". */
function conNombre(nombre: string, pregunta: string): string {
  if (!nombre) return pregunta
  const i = pregunta.startsWith('¿') ? 1 : 0
  return `${nombre}, ${pregunta.slice(0, i)}${pregunta.charAt(i).toLowerCase()}${pregunta.slice(i + 1)}`
}

export function EncuestaVisita({ encuesta }: { encuesta: EncuestaPublica }) {
  const [s, despachar] = useReducer(reducir, encuesta, estadoInicial)
  const [dejoEmail, setDejoEmail] = useState(encuesta.emailDejado)
  const tituloRef = useRef<HTMLHeadingElement | null>(null)
  const ocupadoRef = useRef(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const primerPaso = useRef(true)
  const abiertaMarcada = useRef(false)
  const base = `/api/public/encuesta/${encuesta.token}`
  const telPrecargado = encuesta.telefonoEnmascarado !== null

  useEffect(() => {
    if (encuesta.completa || abiertaMarcada.current) return
    abiertaMarcada.current = true
    void fetch(base, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paso: 'abierta' }), keepalive: true,
    }).catch(() => {})
  }, [base, encuesta.completa])

  useEffect(() => {
    if (primerPaso.current) { primerPaso.current = false; return }
    tituloRef.current?.focus()
    document.title = s.paso === 'gracias' ? 'Gracias · Encuesta de tu visita' : `Paso ${PASOS_ENCUESTA.indexOf(s.paso)} · Encuesta de tu visita`
  }, [s.paso])

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])

  async function guardar(cuerpo: CuerpoPasoCliente) {
    if (ocupadoRef.current) return
    ocupadoRef.current = true
    despachar({ tipo: 'ocupado' })
    try {
      const res = await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = await leerCuerpo(res)
      if (res.ok) despachar({ tipo: 'avanzar' })
      else if (j.code === 'COMPLETA') despachar({ tipo: 'terminado', descarga: encuesta.regalo ? urlDescargaDelRegalo(encuesta.token) : null })
      else despachar({ tipo: 'error', mensaje: typeof j.error === 'string' ? j.error : NO_GUARDO })
    } catch {
      despachar({ tipo: 'error', mensaje: NO_GUARDO })
    } finally {
      ocupadoRef.current = false
    }
  }

  function elegirYAvanzar(accion: AccionReproductor, cuerpo: CuerpoPasoCliente) {
    if (ocupadoRef.current) return
    despachar(accion)
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => { void guardar(cuerpo) }, ESPERA_AUTOAVANCE_MS)
  }

  async function terminar() {
    if (ocupadoRef.current) return
    ocupadoRef.current = true
    despachar({ tipo: 'ocupado' })
    const cuerpo = cuerpoFinalDelEstado(s)
    try {
      const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) })
      const j = await leerCuerpo(res)
      if (res.ok) {
        setDejoEmail(cuerpo.email !== null)
        despachar({ tipo: 'terminado', descarga: descargaDe(j) })
        void fetch(`${base}/avisos`, { method: 'POST', keepalive: true }).catch(() => {})
      } else if (res.status === 409 && esPasoEncuesta(j.paso)) {
        despachar({ tipo: 'ir_a', paso: j.paso, mensaje: 'Falta responder esta pregunta' })
      } else {
        despachar({ tipo: 'error', mensaje: typeof j.error === 'string' ? j.error : NO_ENVIO })
      }
    } catch {
      despachar({ tipo: 'error', mensaje: NO_ENVIO })
    } finally {
      ocupadoRef.current = false
    }
  }

  function okDelPaso() {
    if (!puedeAvanzar(s, telPrecargado) || ocupadoRef.current) return
    if (s.paso === 'bienvenida') { despachar({ tipo: 'empezar' }); return }
    if (s.paso === 'contacto') { void terminar(); return }
    const cuerpo = cuerpoDelPaso(s)
    if (cuerpo) void guardar(cuerpo)
  }

  // Teclado en computadora: letras sobre las opciones y Enter para seguir. Sin lista de dependencias
  // a propósito: se re-engancha en cada render y siempre ve el estado actual.
  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      if (e.key === 'Enter') {
        if (t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement) return
        e.preventDefault()
        okDelPaso()
        return
      }
      const i = LETRAS.indexOf(e.key.toUpperCase())
      if (e.key.length !== 1 || i < 0) return
      if (s.paso === 'gusto' && i < OPCIONES_GUSTO.length) {
        const valor = OPCIONES_GUSTO[i].valor
        elegirYAvanzar({ tipo: 'elegir_gusto', valor }, { paso: 'gusto', valor })
      } else if (s.paso === 'precio' && i < OPCIONES_PRECIO.length) {
        const valor = OPCIONES_PRECIO[i].valor
        elegirYAvanzar({ tipo: 'elegir_precio', valor }, { paso: 'precio', valor })
      } else if (s.paso === 'mas_gusto' || s.paso === 'menos_gusto') {
        const lista = s.paso === 'mas_gusto' ? encuesta.opciones.masGusto : encuesta.opciones.menosGusto
        if (i < lista.length) despachar({ tipo: 'alternar', paso: s.paso, clave: lista[i].clave })
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  })

  const r = s.respuestas
  const puede = puedeAvanzar(s, telPrecargado)
  const mostrarAtras = pasoAnterior(s.paso) !== null

  // Una VARIABLE con el JSX del paso, no un componente declarado acá adentro (CLAUDE.md § A/B).
  let pantalla: ReactNode
  switch (s.paso) {
    case 'bienvenida':
      pantalla = <Bienvenida encuesta={encuesta} tituloRef={tituloRef} onEmpezar={() => despachar({ tipo: 'empezar' })} />
      break
    case 'gusto':
      pantalla = (
        <PreguntaUnica titulo={conNombre(encuesta.nombre, `¿Te gustó ${encuesta.direccion}?`)} opciones={OPCIONES_GUSTO} elegida={r.liked}
          tituloRef={tituloRef} ocupado={s.ocupado}
          onElegir={valor => elegirYAvanzar({ tipo: 'elegir_gusto', valor }, { paso: 'gusto', valor })} />
      )
      break
    case 'mas_gusto':
    case 'menos_gusto': {
      const mas = s.paso === 'mas_gusto'
      const paso = s.paso
      pantalla = (
        <PreguntaVarias id={paso} titulo={mas ? '¿Qué fue lo que más te gustó?' : '¿Y lo que menos te gustó?'}
          opciones={mas ? encuesta.opciones.masGusto : encuesta.opciones.menosGusto}
          elegidas={mas ? r.most_liked_tags : r.least_liked_tags} otra={mas ? r.most_liked_other : r.least_liked_other}
          onAlternar={clave => despachar({ tipo: 'alternar', paso, clave })}
          onOtra={texto => despachar({ tipo: 'escribir_otra', paso, texto })}
          onOk={okDelPaso} puedeOk={puede} tituloRef={tituloRef} ocupado={s.ocupado} />
      )
      break
    }
    case 'precio':
      pantalla = (
        <PreguntaUnica
          titulo={encuesta.precio ? `Está publicada en ${textoMonto(encuesta.precio, encuesta.moneda)}. ¿Te parece…?` : '¿Qué te parece el precio?'}
          opciones={OPCIONES_PRECIO} elegida={r.price_opinion} tituloRef={tituloRef} ocupado={s.ocupado}
          onElegir={valor => elegirYAvanzar({ tipo: 'elegir_precio', valor }, { paso: 'precio', valor })} />
      )
      break
    case 'oferta':
      pantalla = (
        <PreguntaOferta encuesta={encuesta} texto={s.ofertaTexto} tituloRef={tituloRef} ocupado={s.ocupado} puedeOk={puede} onOk={okDelPaso}
          onTexto={texto => despachar({ tipo: 'escribir_oferta', texto })}
          onAtajo={monto => despachar({ tipo: 'atajo_oferta', monto })}
          onDeclinar={() => { despachar({ tipo: 'declinar_oferta' }); void guardar({ paso: 'oferta', monto: null, declina: true }) }} />
      )
      break
    case 'contacto':
      pantalla = (
        <PasoContacto encuesta={encuesta} contacto={s.contacto} tituloRef={tituloRef} ocupado={s.ocupado} puedeEnviar={puede}
          onCambio={cambios => despachar({ tipo: 'contacto', cambios })} onEnviar={() => void terminar()} />
      )
      break
    case 'gracias':
      pantalla = <Gracias encuesta={encuesta} descarga={s.descarga} dejoEmail={dejoEmail} tituloRef={tituloRef} />
      break
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2">
        {mostrarAtras
          ? <BotonAtras onAtras={() => despachar({ tipo: 'atras' })} deshabilitado={s.ocupado} />
          : <span className="h-11 w-11 shrink-0" aria-hidden="true" />}
        <BarraDeAvance valor={avance(s.paso)} />
      </div>
      <div key={s.paso} className={cn('flex flex-1 flex-col justify-center py-2', s.animar && 'encuesta-entra')}>
        {pantalla}
      </div>
      {s.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">{s.error}</p>}
    </div>
  )
}
```

- [ ] **Paso 5: Animación en `app/globals.css`** — al final del archivo:

```css
/* Encuesta post-visita (components/encuesta/EncuestaVisita.tsx): entrada de cada paso. La clase la
   pone el JS RECIÉN al cambiar de paso (la primera pantalla sale del servidor sin ella) y solo si la
   persona no pidió reducir movimiento. Nunca arranca invisible: opacidad mínima 0.35. */
@media (prefers-reduced-motion: no-preference) {
  .encuesta-entra { animation: encuesta-entra 260ms ease-out both; }
}
@keyframes encuesta-entra {
  from { transform: translateY(14px); opacity: 0.35; }
  to { transform: none; opacity: 1; }
}
```

- [ ] **Paso 6: Correr y verlo pasar** — `npx vitest run --config vitest.visitas.config.ts components/encuesta`.
  Esperado: PASS (la primera corrida de happy-dom en frío puede tardar >60 s: reintentar una vez).
  Más `tsc` y `npx eslint components/encuesta`.

- [ ] **Paso 7: Commit** — `git add components/encuesta/PantallasEncuesta.tsx components/encuesta/EncuestaVisita.tsx components/encuesta/EncuestaVisita.test.tsx app/globals.css`;
  mensaje `feat(visitas): encuesta estilo Typeform propia (una pregunta por pantalla, celular primero, sin dependencias)`.

---

### Tarea 17: La página pública `/encuesta/[token]`

**Files:**
- Create: `lib/visitas/encuesta/publica-servidor.ts` (+`publica-servidor.test.ts`)
- Create: `components/encuesta/EncuestaNoDisponible.tsx`
- Create: `app/encuesta/[token]/page.tsx` (+`page.test.tsx`)

**Interfaces:**
- Consumes: `datos.*` (Tarea 6), `armarEncuestaPublica` (Tarea 5), `decidirRegaloPorWhatsapp`
  (Tarea 4), `esTokenEncuesta` (Tarea 2), `SEGUNDOS_URL_PORTADA` (Tarea 5), `EncuestaVisita` (Tarea 16).
- Produces: `leerEncuestaPublica(token, ahora): Promise<ResultadoEncuestaPublica>` (NO marca nada);
  `EncuestaNoDisponible({ motivo: 'vencida' | 'no_disponible' | 'error' })`; la página.

- [ ] **Paso 1: Tests** — `lib/visitas/encuesta/publica-servidor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock } = vi.hoisted(() => ({
  datosMock: { leerEncuestaConVisita: vi.fn(), leerRegalo: vi.fn(), urlFirmada: vi.fn(), leerAjustesEncuesta: vi.fn(), registrarUso: vi.fn() },
}))
vi.mock('./datos', () => datosMock)
vi.mock('@/lib/integrations/whatsapp/phone', () => ({
  normalizeWhatsappPhone: (v: string | null | undefined) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `549${d.slice(-10)}` : null
  },
}))

import { leerEncuestaPublica } from './publica-servidor'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'
import { AJUSTES_PRUEBA } from './envio.test-datos'

const AHORA = new Date('2026-10-15T15:00:00Z')
const REGALO = { propertyId: 'p', titulo: 'Guía', archivoPath: 'a', archivoNombre: 'g.pdf', archivoBytes: 1, portadaPath: 'properties/p/portada-x.jpg', actualizadoEl: '' }

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  datosMock.urlFirmada.mockResolvedValue('https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/sign/x')
  datosMock.leerAjustesEncuesta.mockResolvedValue(AJUSTES_PRUEBA)
  vi.stubEnv('WHATSAPP_TEMPLATE_REGALO_VISITA', 'regalo_visita_v1')
})

describe('leerEncuestaPublica', () => {
  it('un token con otra forma no toca la base', async () => {
    expect(await leerEncuestaPublica('x', AHORA)).toEqual({ tipo: 'no_disponible' })
    expect(datosMock.leerEncuestaConVisita).not.toHaveBeenCalled()
  })
  it('arma el regalo con su portada firmada y NO marca "abierta" (eso lo hace el navegador)', async () => {
    const r = await leerEncuestaPublica(TOKEN_DE_PRUEBA, AHORA)
    expect(r.tipo === 'disponible' && r.encuesta.regalo).toEqual({ titulo: 'Guía', portada: 'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/sign/x' })
    expect(r.tipo === 'disponible' && r.encuesta.regaloPorWhatsapp).toBe(false)
    expect(datosMock.registrarUso).not.toHaveBeenCalled()
  })
  it('promete WhatsApp solo si ese envío va a ocurrir (teléfono de prueba)', async () => {
    datosMock.leerAjustesEncuesta.mockResolvedValue({ ...AJUSTES_PRUEBA, telefonos_prueba: ['1158234521'] })
    const r = await leerEncuestaPublica(TOKEN_DE_PRUEBA, AHORA)
    expect(r.tipo === 'disponible' && r.encuesta.regaloPorWhatsapp).toBe(true)
  })
  it('si el regalo no se puede leer, la encuesta sale igual (sin regalo)', async () => {
    datosMock.leerRegalo.mockRejectedValue(new Error('boom'))
    const r = await leerEncuestaPublica(TOKEN_DE_PRUEBA, AHORA)
    expect(r.tipo === 'disponible' && r.encuesta.regalo).toBeNull()
  })
})
```

  `app/encuesta/[token]/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const { leerMock } = vi.hoisted(() => ({ leerMock: vi.fn() }))
vi.mock('@/lib/visitas/encuesta/publica-servidor', () => ({ leerEncuestaPublica: leerMock }))
vi.mock('next/image', () => ({ default: (p: { src: string; alt: string }) => createElement('img', { src: p.src, alt: p.alt }) }))

import PaginaEncuesta, { metadata } from './page'
import { armarEncuestaPublica } from '@/lib/visitas/encuesta/publica'
import { encuestaConVisitaDePrueba, TOKEN_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
async function html(token = TOKEN_DE_PRUEBA): Promise<string> {
  return renderToStaticMarkup(await PaginaEncuesta({ params: Promise.resolve({ token }) }))
}

beforeEach(() => {
  leerMock.mockReset().mockResolvedValue(armarEncuestaPublica(encuestaConVisitaDePrueba(), { regalo: { titulo: 'Guía de Caballito', portada: null }, regaloPorWhatsapp: false, ahora: AHORA }))
})

describe('/encuesta/[token]', () => {
  it('la bienvenida sale armada del servidor, visible (sin opacity:0 ni animación) y sin datos de más', async () => {
    const h = await html()
    expect(h).toContain('Mariana, este regalo es tuyo.')
    expect(h).toContain('Te lleva menos de un minuto.')
    expect(h).toContain('Doblas 248')
    expect(h).not.toMatch(/opacity:\s*0[;"]/)
    expect(h).not.toContain('encuesta-entra')
    expect(h).not.toContain('Gómez')
    expect(h).not.toContain('58234521')
    expect(h).toContain('<main')
  })
  it('vencido o inventado: página amable que no revela nada', async () => {
    leerMock.mockResolvedValue({ tipo: 'vencida' })
    const v = await html()
    expect(v).toContain('Este link venció')
    expect(v).not.toContain('Doblas')
    leerMock.mockResolvedValue({ tipo: 'no_disponible' })
    expect(await html('x')).toContain('Este link no está disponible')
  })
  it('si la base falla, una página de error amable (no la pantalla de error de Next)', async () => {
    leerMock.mockRejectedValue(new Error('boom'))
    expect(await html()).toContain('No pudimos abrir la encuesta')
  })
  it('fuera de los buscadores', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })
})
```

- [ ] **Paso 2: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/encuesta/publica-servidor.test.ts app/encuesta`.
  Esperado: FAIL.

- [ ] **Paso 3: Implementar `lib/visitas/encuesta/publica-servidor.ts`**

```ts
import 'server-only'
/**
 * Lo que necesita la página pública, leído en el servidor. NO marca "abierta" ni gasta escrituras:
 * el previsualizador de links de WhatsApp pide esta página sin correr JavaScript, y si el render del
 * servidor marcara la apertura, toda encuesta enviada figuraría "Abierta" (Review Focus 1).
 */
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'
import * as datos from './datos'
import { esTokenEncuesta } from './link'
import { armarEncuestaPublica, type ResultadoEncuestaPublica } from './publica'
import { decidirRegaloPorWhatsapp } from './envio'
import { SEGUNDOS_URL_PORTADA } from './regalo'
import type { RegaloDeLaPropiedad } from './tipos'

async function regaloSeguro(propertyId: string): Promise<RegaloDeLaPropiedad | null> {
  try {
    return await datos.leerRegalo(propertyId)
  } catch (e) {
    console.error('[encuesta] no se pudo leer el regalo para la página; sale sin regalo', propertyId, e)
    return null
  }
}

export async function leerEncuestaPublica(token: string, ahora: Date): Promise<ResultadoEncuestaPublica> {
  if (!esTokenEncuesta(token)) return { tipo: 'no_disponible' }
  const ec = await datos.leerEncuestaConVisita({ token })
  if (!ec || ec.visita.status !== 'completed') return { tipo: 'no_disponible' }
  const r = await regaloSeguro(ec.visita.property_id)
  let regalo: { titulo: string; portada: string | null } | null = null
  let prometeWhatsapp = false
  if (r) {
    regalo = { titulo: r.titulo, portada: r.portadaPath ? await datos.urlFirmada(r.portadaPath, SEGUNDOS_URL_PORTADA) : null }
    prometeWhatsapp = decidirRegaloPorWhatsapp({
      ajustes: await datos.leerAjustesEncuesta(), tieneRegalo: true,
      telefono: ec.encuesta.contact_phone ?? ec.visita.client_phone,
      plantilla: process.env.WHATSAPP_TEMPLATE_REGALO_VISITA?.trim() || null, yaEnviado: false,
    }, normalizeWhatsappPhone).enviar
  }
  return armarEncuestaPublica(ec, { regalo, regaloPorWhatsapp: prometeWhatsapp, ahora })
}
```

- [ ] **Paso 4: Implementar `components/encuesta/EncuestaNoDisponible.tsx`**

```tsx
/**
 * Link vencido, inventado o de una visita reabierta (criterio 23): un mensaje amable que NO dice
 * nada de la visita, la propiedad ni la persona. Componente de servidor (sin estado).
 */
const TEXTOS = {
  vencida: {
    titulo: 'Este link venció',
    cuerpo: 'Los links de la encuesta duran 30 días. Si querés contarnos qué te pareció la visita, respondé el WhatsApp de la visita.',
  },
  no_disponible: {
    titulo: 'Este link no está disponible',
    cuerpo: 'Puede que esté incompleto o mal copiado. Si querés contarnos qué te pareció la visita, respondé el WhatsApp de la visita.',
  },
  error: {
    titulo: 'No pudimos abrir la encuesta',
    cuerpo: 'Probá de nuevo en un rato. Si sigue sin abrir, respondé el WhatsApp de la visita.',
  },
} as const

export function EncuestaNoDisponible({ motivo }: { motivo: keyof typeof TEXTOS }) {
  const t = TEXTOS[motivo]
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col justify-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-semibold">{t.titulo}</h1>
      <p className="text-base text-muted-foreground">{t.cuerpo}</p>
      <p className="text-sm text-muted-foreground">Diego Ferreyra Inmobiliaria</p>
    </main>
  )
}
```

- [ ] **Paso 5: Implementar `app/encuesta/[token]/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { leerEncuestaPublica } from '@/lib/visitas/encuesta/publica-servidor'
import { EncuestaVisita } from '@/components/encuesta/EncuestaVisita'
import { EncuestaNoDisponible } from '@/components/encuesta/EncuestaNoDisponible'

/**
 * La encuesta post-visita (spec §3.6 + adenda §11.3). Pública por token (middleware: `/encuesta/`).
 * Dinámica: los datos son de UNA persona y cambian con cada respuesta (nada de caché). Al cliente
 * solo viaja `EncuestaPublica`, datos planos (frontera servidor→cliente).
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Contanos tu visita · Diego Ferreyra Inmobiliaria',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function PaginaEncuesta({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let resultado: Awaited<ReturnType<typeof leerEncuestaPublica>>
  try {
    resultado = await leerEncuestaPublica(token, new Date())
  } catch (e) {
    console.error('[encuesta] no se pudo armar la página', e)
    return <EncuestaNoDisponible motivo="error" />
  }
  if (resultado.tipo !== 'disponible') return <EncuestaNoDisponible motivo={resultado.tipo} />
  return (
    <main className="min-h-[100dvh] bg-background">
      <EncuestaVisita encuesta={resultado.encuesta} />
    </main>
  )
}
```

- [ ] **Paso 6: Correr y verlos pasar** — el comando del Paso 2. Esperado: PASS. Más `tsc` y eslint.

- [ ] **Paso 7: Commit** — `git add lib/visitas/encuesta/publica-servidor.ts lib/visitas/encuesta/publica-servidor.test.ts components/encuesta/EncuestaNoDisponible.tsx "app/encuesta/[token]/page.tsx" "app/encuesta/[token]/page.test.tsx"`;
  mensaje `feat(visitas): página pública /encuesta/[token] (armada en el servidor, noindex, sin datos de más)`.

---

### Tarea 18: La encuesta en la ficha de la visita

**Files:**
- Create: `components/visitas/ficha/EncuestaDeLaVisita.tsx` (+`EncuestaDeLaVisita.test.tsx`)
- Modify: `components/visitas/ficha/LineaDeTiempo.tsx` (+`LineaDeTiempo.test.tsx`)
- Modify: `components/visitas/ficha/AccionVisitaDialog.tsx` (tipo `VisitaConHistorial`)
- Modify: `app/(dashboard)/visits/[id]/page.tsx` (+`page.test.tsx`)

**Interfaces:**
- Consumes: `EncuestaParaFicha`, `RespuestasParaFicha`, `filasDeRespuestas`, `mezclarEventos`
  (Tarea 8); `ClaveEstadoEncuesta` (Tarea 4); `POST /api/visits/[id]/encuesta` (Tarea 8).
- Produces: `EncuestaDeLaVisita({ visitaId, realizada, encuesta, onCambio })`;
  `VisitaConHistorial = VisitaDetalle & { eventos; acciones; encuesta?: EncuestaParaFicha | null }`.

- [ ] **Paso 1: Tests** — `components/visitas/ficha/EncuestaDeLaVisita.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { EncuestaDeLaVisita } from './EncuestaDeLaVisita'
import type { EncuestaParaFicha } from '@/lib/visitas/encuesta/ficha'

const VISITA = '66666666-6666-4666-8666-666666666666'
const LINK = 'https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y'
const FICHA: EncuestaParaFicha = {
  link: LINK, estado: { clave: 'sin_enviar', texto: 'Sin enviar (envío apagado)' }, puedeReenviar: false, vencida: false,
  venceEl: '2026-11-14T15:00:00.000Z', respondidaEl: null, respuestas: null, eventos: [],
}
let respuesta: { status: number; body: unknown }
const pedidos: unknown[] = []

beforeEach(() => {
  pedidos.length = 0
  respuesta = { status: 200, body: { data: { ...FICHA, estado: { clave: 'enviada', texto: 'Enviada' } } } }
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
    pedidos.push(init?.body ? JSON.parse(String(init.body)) : null)
    return new Response(JSON.stringify(respuesta.body), { status: respuesta.status })
  }))
})

describe('EncuestaDeLaVisita (criterio 18)', () => {
  it('estado, vencimiento y "Copiar link" que copia el link', async () => {
    const usuario = userEvent.setup()
    render(<EncuestaDeLaVisita visitaId={VISITA} realizada encuesta={FICHA} onCambio={() => {}} />)
    expect(screen.getByText('Sin enviar (envío apagado)')).toBeInTheDocument()
    expect(screen.getByText(/El link vence el/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reenviar/ })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Copiar link/ }))
    expect(await navigator.clipboard.readText()).toBe(LINK)
  })
  it('si el navegador no deja copiar, muestra el link para copiarlo a mano', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => { throw new Error('denegado') }) } })
    render(<EncuestaDeLaVisita visitaId={VISITA} realizada encuesta={FICHA} onCambio={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Copiar link/ }))
    expect(await screen.findByLabelText('Link de la encuesta')).toHaveValue(LINK)
  })
  it('reenviar (solo si se puede) y su error en castellano', async () => {
    const onCambio = vi.fn()
    render(<EncuestaDeLaVisita visitaId={VISITA} realizada encuesta={{ ...FICHA, puedeReenviar: true }} onCambio={onCambio} />)
    await userEvent.click(screen.getByRole('button', { name: /Reenviar por WhatsApp/ }))
    expect(pedidos[0]).toEqual({ accion: 'reenviar' })
    expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({ estado: { clave: 'enviada', texto: 'Enviada' } }))
    respuesta = { status: 409, body: { error: 'No se puede reenviar: ya respondió' } }
    await userEvent.click(screen.getByRole('button', { name: /Reenviar por WhatsApp/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede reenviar: ya respondió')
  })
  it('una visita realizada sin encuesta ofrece crear el link', async () => {
    const onCambio = vi.fn()
    render(<EncuestaDeLaVisita visitaId={VISITA} realizada encuesta={null} onCambio={onCambio} />)
    await userEvent.click(screen.getByRole('button', { name: 'Crear link de la encuesta' }))
    expect(pedidos[0]).toEqual({ accion: 'link' })
    expect(onCambio).toHaveBeenCalled()
  })
  it('las respuestas, en palabras, y un fallo de Meta en rojo', () => {
    render(<EncuestaDeLaVisita visitaId={VISITA} realizada onCambio={() => {}} encuesta={{
      ...FICHA, estado: { clave: 'fallo', texto: 'Falló: la plantilla no existe o todavía no está aprobada' },
      respondidaEl: '2026-10-15T14:00:00Z',
      respuestas: { completa: true, leGusto: true, masGusto: ['La luz', 'Otra: El barrio'], menosGusto: ['Nada en especial'], precio: 'Le parece alto', oferta: 'US$ 135.000', quiereSimilares: true, telefono: '5491158234521', email: null },
    }} />)
    expect(screen.getByText('Falló: la plantilla no existe o todavía no está aprobada')).toBeInTheDocument()
    expect(screen.getByText('La luz, Otra: El barrio')).toBeInTheDocument()
    expect(screen.getByText('US$ 135.000')).toBeInTheDocument()
  })
  it('una visita no realizada y sin encuesta no muestra nada', () => {
    const { container } = render(<EncuestaDeLaVisita visitaId={VISITA} realizada={false} encuesta={null} onCambio={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

  En `components/visitas/ficha/LineaDeTiempo.test.tsx`, un `it` más:

```tsx
  it('nombra los eventos de la encuesta', () => {
    const base = { from_status: null, to_status: null, from_scheduled_at: null, to_scheduled_at: null, reason: null, note: null, actor: null, desde_asesor: null, hacia_asesor: null }
    render(<LineaDeTiempo eventos={[
      { ...base, id: 'a', kind: 'encuesta_enviada', created_at: '2026-10-14T18:00:00Z' },
      { ...base, id: 'b', kind: 'encuesta_abierta', created_at: '2026-10-14T19:00:00Z' },
      { ...base, id: 'c', kind: 'encuesta_respondida', created_at: '2026-10-14T19:02:00Z' },
    ]} />)
    expect(screen.getByText('Se envió la encuesta')).toBeInTheDocument()
    expect(screen.getByText('Abrió la encuesta')).toBeInTheDocument()
    expect(screen.getByText('Respondió la encuesta')).toBeInTheDocument()
  })
```

  En `app/(dashboard)/visits/[id]/page.test.tsx`, al final:

```tsx
describe('VisitDetailPage — encuesta (Entrega 3)', () => {
  it('una visita realizada muestra su encuesta con el estado y "Copiar link"', async () => {
    respuesta = async () => ok(visita({
      status: 'completed', acciones: ['reabrir'],
      encuesta: { link: 'https://inmodf.com.ar/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y', estado: { clave: 'sin_enviar', texto: 'Sin enviar (envío apagado)' },
        puedeReenviar: false, vencida: false, venceEl: '2026-09-04T15:00:00.000Z', respondidaEl: null, respuestas: null, eventos: [] },
    }))
    render(<VisitDetailPage />)
    expect(await screen.findByText('Sin enviar (envío apagado)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copiar link/ })).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts components/visitas/ficha "app/(dashboard)/visits"`
  (si el glob con paréntesis no matchea, correr la config entera). Esperado: FAIL en los `it` nuevos.

- [ ] **Paso 3: Implementar `components/visitas/ficha/EncuestaDeLaVisita.tsx`**

```tsx
'use client'
/**
 * La encuesta en la ficha de la visita (spec §3.3 "Realizada: ver/copiar/reenviar encuesta; ver
 * respuestas" + adenda §11.4). El estado y si se puede reenviar los calcula el SERVIDOR (decisión de
 * envío); acá solo se muestran. Copiar usa el portapapeles; si el navegador no lo permite, el link
 * aparece en un campo para copiarlo a mano.
 */
import { Fragment, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { formatearFechaLarga } from '@/lib/visitas/horario'
import { filasDeRespuestas, type EncuestaParaFicha } from '@/lib/visitas/encuesta/ficha'
import type { ClaveEstadoEncuesta } from '@/lib/visitas/encuesta/estado-envio'
import { cn } from '@/lib/utils'

const COLOR: Record<ClaveEstadoEncuesta, string> = {
  respondida: 'bg-emerald-50 text-emerald-900',
  abierta: 'bg-brand-soft text-brand',
  leida: 'bg-brand-soft text-brand',
  entregada: 'bg-brand-soft text-brand',
  enviada: 'bg-brand-soft text-brand',
  fallo: 'bg-red-50 text-red-900',
  vencida: 'bg-secondary text-muted-foreground',
  sin_enviar: 'bg-amber-50 text-amber-900',
}

export function EncuestaDeLaVisita({ visitaId, realizada, encuesta, onCambio }: {
  visitaId: string
  realizada: boolean
  encuesta: EncuestaParaFicha | null
  onCambio: (e: EncuestaParaFicha) => void
}) {
  const [ocupado, setOcupado] = useState<'link' | 'reenviar' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mostrarLink, setMostrarLink] = useState(false)

  async function pedir(accion: 'link' | 'reenviar') {
    setOcupado(accion); setError(null)
    try {
      const r = await leerRespuesta<EncuestaParaFicha | null>(await fetch(`/api/visits/${visitaId}/encuesta`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }),
      }))
      if (!r.ok) { setError(r.error); return }
      if (r.data) {
        onCambio(r.data)
        if (accion === 'reenviar') toast.success('Encuesta reenviada')
      }
    } catch {
      setError('No hay conexión. Probá de nuevo.')
    } finally {
      setOcupado(null)
    }
  }

  async function copiar(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copiado')
    } catch {
      setMostrarLink(true)
    }
  }

  if (!encuesta && !realizada) return null

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Encuesta</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!encuesta ? (
          <>
            <p className="text-muted-foreground">Esta visita todavía no tiene link de encuesta.</p>
            <Button type="button" className="min-h-11 max-md:w-full" disabled={ocupado !== null} onClick={() => void pedir('link')}>
              {ocupado === 'link' ? 'Creando…' : 'Crear link de la encuesta'}
            </Button>
          </>
        ) : (
          <>
            <span className={cn('inline-block rounded-full px-3 py-1 text-xs font-semibold', COLOR[encuesta.estado.clave])}>{encuesta.estado.texto}</span>
            {!encuesta.respondidaEl && (
              <p className="text-muted-foreground">{encuesta.vencida ? 'El link ya venció.' : `El link vence el ${formatearFechaLarga(encuesta.venceEl)}.`}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => void copiar(encuesta.link)}>
                <Copy className="h-4 w-4" aria-hidden="true" />Copiar link
              </Button>
              {encuesta.puedeReenviar && (
                <Button type="button" variant="outline" className="min-h-11" disabled={ocupado !== null} onClick={() => void pedir('reenviar')}>
                  <Send className="h-4 w-4" aria-hidden="true" />{ocupado === 'reenviar' ? 'Enviando…' : 'Reenviar por WhatsApp'}
                </Button>
              )}
            </div>
            {mostrarLink && (
              <input readOnly aria-label="Link de la encuesta" value={encuesta.link} onFocus={e => e.currentTarget.select()}
                className="w-full rounded-md border px-2 py-2 text-base" />
            )}
            {encuesta.respuestas && (
              <div className="space-y-2">
                <h4 className="font-semibold">{encuesta.respuestas.completa ? 'Respuestas' : 'Respuestas (sin terminar)'}</h4>
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                  {filasDeRespuestas(encuesta.respuestas).map(f => (
                    <Fragment key={f.etiqueta}>
                      <dt className="text-muted-foreground">{f.etiqueta}</dt>
                      <dd className="break-words">{f.valor}</dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            )}
          </>
        )}
        {error && <p role="alert" className="text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Paso 4: Línea de tiempo y tipo** — en `components/visitas/ficha/LineaDeTiempo.tsx`, en `TEXTO`
  agregar `encuesta_enviada: 'Se envió la encuesta', encuesta_abierta: 'Abrió la encuesta', encuesta_respondida: 'Respondió la encuesta',`.
  En `components/visitas/ficha/AccionVisitaDialog.tsx`: import
  `import type { EncuestaParaFicha } from '@/lib/visitas/encuesta/ficha'` y el tipo pasa a
  `export type VisitaConHistorial = VisitaDetalle & { eventos: EventoVisitaR[]; acciones: TipoAccion[]; encuesta?: EncuestaParaFicha | null }`
  (opcional: los fixtures de las Entregas 1 y 2 no lo traen).

- [ ] **Paso 5: Ficha** — en `app/(dashboard)/visits/[id]/page.tsx`: imports
  `import { EncuestaDeLaVisita } from '@/components/visitas/ficha/EncuestaDeLaVisita'` y
  `import { mezclarEventos } from '@/lib/visitas/encuesta/ficha'`; entre el `</div>` de la grilla
  Persona/Visita y la `<Card>` de Historial, agregar:

```tsx
      <EncuestaDeLaVisita
        visitaId={v.id}
        realizada={v.status === 'completed'}
        encuesta={v.encuesta ?? null}
        onCambio={nueva => setFase({ tipo: 'lista', visita: { ...v, encuesta: nueva, eventos: mezclarEventos(v.eventos, nueva.eventos) } })}
      />
```

- [ ] **Paso 6: Correr y verlos pasar** — el comando del Paso 2. Esperado: PASS (incluidos los `it`
  previos de la ficha). Más `tsc` y eslint.

- [ ] **Paso 7: Commit** — `git add components/visitas/ficha/EncuestaDeLaVisita.tsx components/visitas/ficha/EncuestaDeLaVisita.test.tsx components/visitas/ficha/LineaDeTiempo.tsx components/visitas/ficha/LineaDeTiempo.test.tsx components/visitas/ficha/AccionVisitaDialog.tsx "app/(dashboard)/visits/[id]/page.tsx" "app/(dashboard)/visits/[id]/page.test.tsx"`;
  mensaje `feat(visitas): la encuesta en la ficha de la visita (estado, copiar, reenviar, respuestas)`.

---

### Tarea 19: Métricas de la encuesta (listado, embudo, opiniones, pendientes)

**Files:**
- Modify: `lib/visitas/tipos.ts` (`EncuestaListado`, campos nuevos de `VisitaListado`)
- Modify: `lib/visitas/datos.ts` (+`lib/visitas/datos-listado.test.ts`)
- Modify: `test/visitas/visita-de-prueba.ts`
- Modify: `lib/visitas/metricas.ts` (+`metricas.test.ts`, `metricas-tiempos.test.ts`)
- Create: `lib/visitas/opiniones.ts` (+`opiniones.test.ts`)
- Modify: `lib/visitas/resumen.ts` (+`resumen.test.ts`)
- Modify: `app/api/visits/resumen/route.ts` (+`route.test.ts`)

**Interfaces:**
- Consumes: `Moneda`, `OpinionPrecio`, `OPINIONES_PRECIO`, `MONEDAS` (Tarea 2); `etiquetaDeOpcion`,
  `OTRA` (Tarea 3); `estaVencida` (Tarea 2).
- Produces:
  - `EncuestaListado { sent_at; completed_at; expires_at; liked; price_opinion; offer_amount; offer_currency; offer_declined; most_liked_tags; least_liked_tags; most_liked_other; least_liked_other }`;
    `VisitaListado` suma `precio_publicado: number | null`, `moneda_publicada: Moneda | null`,
    `encuesta: EncuestaListado | null`.
  - `metricas.ts`: `ConteoEncuestas { respondidas: Cifra; completas: number; conOferta: number }`,
    `contarEncuestas(visitas)`; `PasoEmbudo.clave` suma `'respondieron' | 'ofertarian'`;
    `TiemposVisitas` suma `respuestaEncuesta`; `Metricas` suma `encuestas: ConteoEncuestas`.
  - `opiniones.ts`: `ConteoEtiqueta`, `OpinionPropiedad`, `opinionesPorPropiedad(visitas)`.
  - `resumen.ts`: `HORAS_SIN_RESPONDER = 48`, `DIAS_ENCUESTAS_HACIA_ATRAS = 31`,
    `encuestasSinResponder(realizadas, ahora)`; `RequierenAccion` suma `encuestasSinResponder`;
    `requierenAccion(abiertas, ahora, realizadasRecientes = [])`; `EntradaResumen` suma
    `realizadasRecientes?`; `ResumenVisitas` suma `opiniones: OpinionPropiedad[]`.

- [ ] **Paso 1: Tipos y constructor de pruebas** — en `lib/visitas/tipos.ts` agregar arriba
  `import type { Moneda, OpinionPrecio } from './encuesta/tipos'` y:

```ts
/** La encuesta de una visita, tal como la leen los listados y las métricas (sin datos de contacto). */
export interface EncuestaListado {
  sent_at: string | null
  completed_at: string | null
  expires_at: string
  liked: boolean | null
  price_opinion: OpinionPrecio | null
  offer_amount: number | null
  offer_currency: Moneda | null
  offer_declined: boolean | null
  most_liked_tags: string[]
  least_liked_tags: string[]
  most_liked_other: string | null
  least_liked_other: string | null
}
```

  y dentro de `VisitaListado`, al final:

```ts
  /** Precio publicado HOY (la diferencia de la oferta se mide contra este, en la misma moneda). */
  precio_publicado: number | null
  moneda_publicada: Moneda | null
  encuesta: EncuestaListado | null
```

  En `test/visitas/visita-de-prueba.ts`, antes de `...cambios`, agregar
  `precio_publicado: 150000, moneda_publicada: 'USD', encuesta: null,`.

- [ ] **Paso 2: Tests** — en `lib/visitas/datos-listado.test.ts`, dentro de
  `describe('listarVisitas')`:

```ts
  it('suma el precio publicado y la encuesta (objeto o lista de PostgREST), sin datos de contacto', async () => {
    const encuesta = { sent_at: '2026-10-14T18:00:00+00:00', completed_at: '2026-10-14T19:00:00+00:00', expires_at: '2026-11-13T18:00:00+00:00',
      liked: true, price_opinion: 'alto', offer_amount: '135000', offer_currency: 'USD', offer_declined: false,
      most_liked_tags: ['luz'], least_liked_tags: ['nada'], most_liked_other: null, least_liked_other: null }
    registro.responder = () => ({ data: [{ ...fila(1), property: { address: 'Doblas 248', neighborhood: 'Caballito', asking_price: 150000, currency: 'USD' }, encuesta: [encuesta] }], error: null, count: 1 })
    const r = await listarVisitas({ alcance: { tipo: 'todo' } }, { desde: 0, hasta: 49 }, 'desc')
    expect(r.filas[0]).toMatchObject({ precio_publicado: 150000, moneda_publicada: 'USD', encuesta: { offer_amount: 135000, price_opinion: 'alto', completed_at: '2026-10-14T19:00:00+00:00' } })
    expect(String(pasos(registro.llamadas[0], 'select')[0][0])).toContain('visit_surveys!visit_surveys_visit_id_fkey')
  })
  it('sin encuesta y sin precio: null (no 0)', async () => {
    const r = await listarVisitas({ alcance: { tipo: 'todo' } }, { desde: 0, hasta: 49 }, 'desc')
    expect(r.filas[0]).toMatchObject({ precio_publicado: null, moneda_publicada: null, encuesta: null })
  })
```

  `lib/visitas/opiniones.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { opinionesPorPropiedad } from './opiniones'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'
import type { EncuestaListado } from './tipos'

const respondida = (c: Partial<EncuestaListado> = {}): EncuestaListado => ({
  sent_at: '2026-10-14T18:00:00Z', completed_at: '2026-10-14T19:00:00Z', expires_at: '2026-11-13T18:00:00Z',
  liked: true, price_opinion: 'alto', offer_amount: null, offer_currency: null, offer_declined: true,
  most_liked_tags: ['luz'], least_liked_tags: ['nada'], most_liked_other: null, least_liked_other: null, ...c,
})

describe('opinionesPorPropiedad (spec §4.5 "Opiniones")', () => {
  it('sin encuestas respondidas: lista vacía (la pantalla dice "Sin datos")', () => {
    expect(opinionesPorPropiedad([v({ status: 'completed' }), v({ status: 'completed', encuesta: respondida({ completed_at: null }) })])).toEqual([])
  })
  it('les gustó, precio, oferta mediana y diferencia contra el publicado, con su base', () => {
    const o = opinionesPorPropiedad([
      v({ status: 'completed', encuesta: respondida({ offer_amount: 130000, offer_currency: 'USD', offer_declined: false }) }),
      v({ status: 'completed', encuesta: respondida({ liked: false, price_opinion: 'correcto', offer_amount: 140000, offer_currency: 'USD', offer_declined: false }) }),
      v({ status: 'completed', encuesta: respondida() }),
    ])
    expect(o).toHaveLength(1)
    expect(o[0]).toMatchObject({
      direccion: 'Doblas 248', respuestas: 3, leGusto: { valor: 67, base: 3, orientativo: true },
      precio: { correcto: 1, alto: 2, bajo: 0 }, ofertaMediana: { valor: 135000, base: 2 }, moneda: 'USD',
      diferencia: { valor: -10, base: 2 },
    })
  })
  it('una oferta en OTRA moneda no entra en la mediana ni en la diferencia (Review Focus 5)', () => {
    const o = opinionesPorPropiedad([
      v({ status: 'completed', encuesta: respondida({ offer_amount: 150000000, offer_currency: 'ARS', offer_declined: false }) }),
    ])
    expect(o[0].ofertaMediana).toEqual({ valor: null, base: 0, orientativo: false })
    expect(o[0].diferencia.valor).toBeNull()
  })
  it('sin precio publicado no hay diferencia, aunque haya ofertas', () => {
    const o = opinionesPorPropiedad([v({ status: 'completed', precio_publicado: null, moneda_publicada: 'USD', encuesta: respondida({ offer_amount: 100000, offer_currency: 'USD', offer_declined: false }) })])
    expect(o[0].diferencia.valor).toBeNull()
  })
  it('etiquetas en palabras con su cantidad y los comentarios escritos, más recientes primero', () => {
    const o = opinionesPorPropiedad([
      v({ status: 'completed', encuesta: respondida({ most_liked_tags: ['luz', 'otra'], most_liked_other: 'El barrio', completed_at: '2026-10-10T00:00:00Z' }) }),
      v({ status: 'completed', encuesta: respondida({ most_liked_tags: ['luz'], least_liked_tags: ['otra'], least_liked_other: 'El ascensor', completed_at: '2026-10-12T00:00:00Z' }) }),
    ])
    expect(o[0].masGusto).toEqual([{ clave: 'luz', etiqueta: 'La luz', cantidad: 2 }])
    expect(o[0].comentarios).toEqual(['No le gustó: El ascensor', 'Le gustó: El barrio'])
  })
})
```

  En `lib/visitas/metricas.test.ts`, reemplazar el `describe('armarEmbudo', …)` entero por:

```ts
describe('armarEmbudo', () => {
  it('sin visitas: cinco pasos en 0 y ningún salto resaltado', () => {
    const e = armarEmbudo([])
    expect(e.map(p => p.cantidad)).toEqual([0, 0, 0, 0, 0])
    expect(e.some(p => p.saltoMasGrande)).toBe(false)
  })
  it('resalta SOLO el salto relativo más grande; sin encuestas, sus pasos no compiten', () => {
    const visitas = [
      ...Array.from({ length: 10 }, () => v({ confirmed_at: null, status: 'pending_confirmation' })),
      ...Array.from({ length: 6 }, () => v({ status: 'scheduled' })),
      ...Array.from({ length: 4 }, () => v({ status: 'completed' })),
    ]
    const e = armarEmbudo(visitas)
    expect(e.map(p => [p.clave, p.cantidad])).toEqual([['agendadas', 20], ['confirmadas', 10], ['realizadas', 4], ['respondieron', 0], ['ofertarian', 0]])
    // 20→10 pierde 50 %; 10→4 pierde 60 %; los de encuesta no cuentan porque ninguna realizada tiene encuesta.
    expect(e.filter(p => p.saltoMasGrande).map(p => p.clave)).toEqual(['realizadas'])
  })
  it('con encuestas, "respondieron" y "dijeron cuánto ofertarían" entran al cálculo', () => {
    const enc = { sent_at: '2026-10-14T18:00:00Z', expires_at: '2026-11-13T18:00:00Z', liked: true, price_opinion: null, offer_currency: null,
      offer_declined: null, most_liked_tags: [], least_liked_tags: [], most_liked_other: null, least_liked_other: null }
    const e = armarEmbudo([
      v({ status: 'completed', encuesta: { ...enc, completed_at: '2026-10-14T19:00:00Z', offer_amount: 100000, offer_currency: 'USD' } }),
      v({ status: 'completed', encuesta: { ...enc, completed_at: null, offer_amount: null } }),
      v({ status: 'completed', encuesta: { ...enc, completed_at: null, offer_amount: null } }),
      v({ status: 'completed', encuesta: { ...enc, completed_at: null, offer_amount: null } }),
    ])
    expect(e.map(p => p.cantidad)).toEqual([4, 4, 4, 1, 1])
    expect(e.filter(p => p.saltoMasGrande).map(p => p.clave)).toEqual(['respondieron'])
  })
  it('una realizada sin haber pasado por "Confirmar" igual cuenta como confirmada (el embudo nunca sube)', () => {
    const e = armarEmbudo([v({ confirmed_at: null, status: 'completed' }), v({ confirmed_at: null, status: 'pending_confirmation' })])
    expect(e.map(p => p.cantidad)).toEqual([2, 1, 1, 0, 0])
  })
})

describe('contarEncuestas', () => {
  it('respondidas sobre las realizadas, con su base; sin realizadas, "Sin datos"', () => {
    const enc = { sent_at: null, expires_at: '2026-11-13T18:00:00Z', liked: true, price_opinion: null, offer_amount: null, offer_currency: null,
      offer_declined: true, most_liked_tags: [], least_liked_tags: [], most_liked_other: null, least_liked_other: null }
    expect(contarEncuestas([v({ status: 'completed', encuesta: { ...enc, completed_at: '2026-10-14T19:00:00Z' } }), v({ status: 'completed' })]))
      .toEqual({ respondidas: { valor: 50, base: 2, orientativo: true }, completas: 1, conOferta: 0 })
    expect(contarEncuestas([v({ status: 'scheduled' })]).respondidas.valor).toBeNull()
  })
})
```

  (y sumar `contarEncuestas` al import de la primera línea de ese archivo). En
  `lib/visitas/metricas-tiempos.test.ts`: cambiar `expect(m.embudo).toHaveLength(3)` por
  `expect(m.embudo).toHaveLength(5)` y agregar al final del archivo:

```ts
describe('tiempo de respuesta de la encuesta', () => {
  it('de enviada a respondida; sin envío no cuenta', () => {
    const enc = { expires_at: '2026-11-13T18:00:00Z', liked: true, price_opinion: null, offer_amount: null, offer_currency: null,
      offer_declined: true, most_liked_tags: [], least_liked_tags: [], most_liked_other: null, least_liked_other: null }
    const t = tiemposDeVisitas([
      v({ status: 'completed', encuesta: { ...enc, sent_at: '2026-10-14T18:00:00Z', completed_at: '2026-10-14T20:00:00Z' } }),
      v({ status: 'completed', encuesta: { ...enc, sent_at: null, completed_at: '2026-10-14T20:00:00Z' } }),
    ])
    expect(t.respuestaEncuesta).toEqual({ valor: 7_200_000, base: 1, orientativo: true })
  })
})
```

  (sumar `tiemposDeVisitas` al import si no estaba). En `lib/visitas/resumen.test.ts`, dentro de
  `describe('requierenAccion')`:

```ts
  it('encuestas enviadas hace más de 48 h, sin responder ni vencer, la más vieja primero', () => {
    const enc = (sent_at: string, completed_at: string | null = null, expires_at = '2026-11-01T00:00:00Z') => ({
      sent_at, completed_at, expires_at, liked: null, price_opinion: null, offer_amount: null, offer_currency: null,
      offer_declined: null, most_liked_tags: [], least_liked_tags: [], most_liked_other: null, least_liked_other: null,
    })
    const vieja = v({ status: 'completed', encuesta: enc('2026-10-10T12:00:00Z') })
    const doce = v({ status: 'completed', encuesta: enc('2026-10-12T12:00:00Z') })
    const r = requierenAccion([], AHORA, [
      doce,
      vieja,
      v({ status: 'completed', encuesta: enc('2026-10-14T12:00:00Z') }),
      v({ status: 'completed', encuesta: enc('2026-10-09T12:00:00Z', '2026-10-10T00:00:00Z') }),
      v({ status: 'completed', encuesta: enc('2026-09-01T12:00:00Z', null, '2026-10-01T00:00:00Z') }),
      v({ status: 'completed', encuesta: null }),
    ])
    expect(r.encuestasSinResponder.map(x => x.id)).toEqual([vieja.id, doce.id])
    expect(r.total).toBe(2)
  })
```

  (`AHORA` en ese archivo es `2026-10-15T15:00:00Z`: 48 h antes es el 13/10 15:00, así que entran
  la del 10/10 y la del 12/10; la del 14/10 todavía no.) Y dentro de `describe('armarResumen')`:

```ts
  it('suma las opiniones del período y las encuestas pendientes', () => {
    const r = armarResumen({ ...base, verTodo: true, realizadasRecientes: [] })
    expect(r.opiniones).toEqual([])
    expect(r.requieren.encuestasSinResponder).toEqual([])
  })
```

  En `app/api/visits/resumen/route.test.ts`, dentro del `it('lee el período en días argentinos…')`,
  agregar al final:

```ts
    const realizadas = todasMock.mock.calls[3][0]
    expect(realizadas).toMatchObject({ estados: ['completed'], desde: '2026-09-14T00:00:00.000-03:00' })
```

- [ ] **Paso 3: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts lib/visitas app/api/visits/resumen`.
  Esperado: FAIL en los `it` nuevos y en los modificados.

- [ ] **Paso 4: `lib/visitas/datos.ts`** — imports: sumar
  `import { MONEDAS, OPINIONES_PRECIO } from './encuesta/tipos'` y en el import de `./tipos` el tipo
  `EncuestaListado`. Reemplazar `SELECT_LISTADO` por:

```ts
const SELECT_LISTADO = `
  id, property_id, advisor_id, created_by, client_name, client_phone, status, origin, origin_detail,
  outcome_reason, scheduled_at, created_at, updated_at, confirmed_at, outcome_at,
  property:properties(address, neighborhood, asking_price, currency),
  advisor:profiles!property_visits_advisor_id_fkey(full_name),
  lead:property_leads!property_visits_lead_id_fkey(created_at),
  consulta:portal_inquiries!property_visits_portal_inquiry_id_fkey(received_at, created_at),
  encuesta:visit_surveys!visit_surveys_visit_id_fkey(sent_at, completed_at, expires_at, liked, price_opinion,
    offer_amount, offer_currency, offer_declined, most_liked_tags, least_liked_tags, most_liked_other, least_liked_other)`
```

  agregar, antes de `aListado`:

```ts
function numeroPositivo(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function listaDeTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/** La encuesta embebida (1 a 1 por UNIQUE visit_id; PostgREST puede mandarla como objeto o lista). */
function aEncuestaListado(e: Record<string, unknown> | null): EncuestaListado | null {
  if (!e) return null
  return {
    sent_at: textoONulo(e.sent_at),
    completed_at: textoONulo(e.completed_at),
    expires_at: String(e.expires_at ?? ''),
    liked: typeof e.liked === 'boolean' ? e.liked : null,
    price_opinion: OPINIONES_PRECIO.find(p => p === e.price_opinion) ?? null,
    offer_amount: numeroPositivo(e.offer_amount),
    offer_currency: MONEDAS.find(m => m === e.offer_currency) ?? null,
    offer_declined: typeof e.offer_declined === 'boolean' ? e.offer_declined : null,
    most_liked_tags: listaDeTextos(e.most_liked_tags),
    least_liked_tags: listaDeTextos(e.least_liked_tags),
    most_liked_other: textoONulo(e.most_liked_other),
    least_liked_other: textoONulo(e.least_liked_other),
  }
}
```

  y en el `return` de `aListado`, al final:

```ts
    precio_publicado: numeroPositivo(p?.asking_price),
    moneda_publicada: MONEDAS.find(m => m === p?.currency) ?? null,
    encuesta: aEncuestaListado(uno(r.encuesta as Record<string, unknown> | Record<string, unknown>[] | null)),
```

- [ ] **Paso 5: `lib/visitas/metricas.ts`** — cambiar la interfaz y la función del embudo, sumar el
  conteo de encuestas y el tiempo de respuesta:

```ts
export interface PasoEmbudo {
  clave: 'agendadas' | 'confirmadas' | 'realizadas' | 'respondieron' | 'ofertarian'
  etiqueta: string
  cantidad: number
  saltoMasGrande: boolean
}

/**
 * Agendadas → Confirmadas → Se realizaron → Respondieron la encuesta → Dijeron cuánto ofertarían
 * (spec §3.4). "Confirmadas" = tuvieron `confirmed_at` O se realizaron (el embudo nunca sube). Los dos
 * pasos de la encuesta compiten por el "salto más grande" SOLO si alguna realizada del período tiene
 * encuesta: las visitas anteriores a la Entrega 3 no tienen link y no son "no respondió".
 */
export function armarEmbudo(visitas: readonly VisitaListado[]): PasoEmbudo[] {
  let confirmadas = 0
  let realizadas = 0
  let respondieron = 0
  let ofertarian = 0
  let conEncuesta = false
  for (const v of visitas) {
    if (v.status === 'completed') {
      realizadas++; confirmadas++
      if (v.encuesta) conEncuesta = true
      if (v.encuesta?.completed_at) {
        respondieron++
        if (v.encuesta.offer_amount !== null) ofertarian++
      }
    } else if (v.confirmed_at) confirmadas++
  }
  const pasos: Omit<PasoEmbudo, 'saltoMasGrande'>[] = [
    { clave: 'agendadas', etiqueta: 'Agendadas', cantidad: visitas.length },
    { clave: 'confirmadas', etiqueta: 'Confirmadas', cantidad: confirmadas },
    { clave: 'realizadas', etiqueta: 'Se realizaron', cantidad: realizadas },
    { clave: 'respondieron', etiqueta: 'Respondieron la encuesta', cantidad: respondieron },
    { clave: 'ofertarian', etiqueta: 'Dijeron cuánto ofertarían', cantidad: ofertarian },
  ]
  const hasta = conEncuesta ? pasos.length : 3
  let indiceSalto = -1
  let mayorCaida = 0
  for (let i = 1; i < hasta; i++) {
    const anterior = pasos[i - 1].cantidad
    if (anterior <= 0) continue
    const caida = (anterior - pasos[i].cantidad) / anterior
    if (caida > mayorCaida) { mayorCaida = caida; indiceSalto = i }
  }
  return pasos.map((p, i) => ({ ...p, saltoMasGrande: i === indiceSalto }))
}

export interface ConteoEncuestas { respondidas: Cifra; completas: number; conOferta: number }

/** "Encuestas respondidas %" = encuestas completas ÷ visitas realizadas del período (spec §4.5). */
export function contarEncuestas(visitas: readonly VisitaListado[]): ConteoEncuestas {
  let realizadas = 0
  let completas = 0
  let conOferta = 0
  for (const v of visitas) {
    if (v.status !== 'completed') continue
    realizadas++
    if (v.encuesta?.completed_at) {
      completas++
      if (v.encuesta.offer_amount !== null) conOferta++
    }
  }
  return { respondidas: porcentaje(completas, realizadas), completas, conOferta }
}
```

  En `TiemposVisitas` sumar `respuestaEncuesta: Cifra`; en `tiemposDeVisitas` sumar
  `const respuesta: number[] = []`, dentro del `for`:

```ts
    if (v.encuesta?.sent_at && v.encuesta.completed_at) {
      const d = Date.parse(v.encuesta.completed_at) - Date.parse(v.encuesta.sent_at)
      if (d >= 0) respuesta.push(d)
    }
```

  y en el `return`, `respuestaEncuesta: mediana(respuesta)`. En `Metricas` sumar
  `encuestas: ConteoEncuestas` y en `calcularMetricas`, `encuestas: contarEncuestas(visitas),`.

- [ ] **Paso 6: Crear `lib/visitas/opiniones.ts`**

```ts
/**
 * "Qué opinan los que visitaron" por propiedad (spec §3.4, §3.5, §4.5). Puro. Solo encuestas
 * TERMINADAS. La oferta mediana y su diferencia contra el precio publicado usan SOLO ofertas en la
 * misma moneda en que la propiedad está publicada hoy: mezclar pesos con dólares da cualquier cosa.
 */
import type { VisitaListado } from './tipos'
import { cifra, mediana, porcentaje, type Cifra } from './metricas'
import { etiquetaDeOpcion, OTRA } from './encuesta/opciones'
import type { Moneda } from './encuesta/tipos'

export interface ConteoEtiqueta { clave: string; etiqueta: string; cantidad: number }

export interface OpinionPropiedad {
  propertyId: string
  direccion: string
  respuestas: number
  /** % que dijo "Sí" sobre los que respondieron esa pregunta. */
  leGusto: Cifra
  precio: { correcto: number; alto: number; bajo: number }
  ofertaMediana: Cifra
  moneda: Moneda | null
  /** % de la oferta mediana contra el publicado (negativo = por debajo). */
  diferencia: Cifra
  masGusto: ConteoEtiqueta[]
  menosGusto: ConteoEtiqueta[]
  /** Lo que escribieron en "Otra cosa", más recientes primero, hasta 20. */
  comentarios: string[]
}

export const MAX_COMENTARIOS = 20

function contar(listas: string[][]): ConteoEtiqueta[] {
  const n = new Map<string, number>()
  for (const tags of listas) for (const t of tags) if (t !== OTRA) n.set(t, (n.get(t) ?? 0) + 1)
  return [...n.entries()]
    .map(([clave, cantidad]) => ({ clave, etiqueta: etiquetaDeOpcion(clave), cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

export function opinionesPorPropiedad(visitas: readonly VisitaListado[]): OpinionPropiedad[] {
  const grupos = new Map<string, VisitaListado[]>()
  for (const v of visitas) {
    if (!v.encuesta?.completed_at) continue
    const g = grupos.get(v.property_id) ?? []
    g.push(v)
    grupos.set(v.property_id, g)
  }
  const salida: OpinionPropiedad[] = []
  for (const [propertyId, g] of grupos) {
    const encuestas = g.flatMap(v => (v.encuesta ? [v.encuesta] : []))
    const conRespuesta = encuestas.filter(e => e.liked !== null)
    const moneda = g[0].moneda_publicada
    const precio = g[0].precio_publicado
    const ofertas = encuestas.filter(e => e.offer_amount !== null && moneda !== null && e.offer_currency === moneda).map(e => e.offer_amount ?? 0)
    const ofertaMediana = mediana(ofertas)
    const diferencia = ofertaMediana.valor !== null && precio !== null && precio > 0
      ? cifra(Math.round((ofertaMediana.valor / precio - 1) * 100), ofertaMediana.base)
      : cifra(0, 0)
    const comentarios = [...encuestas]
      .sort((a, b) => Date.parse(b.completed_at ?? '') - Date.parse(a.completed_at ?? ''))
      .flatMap(e => [
        ...(e.least_liked_other ? [`No le gustó: ${e.least_liked_other}`] : []),
        ...(e.most_liked_other ? [`Le gustó: ${e.most_liked_other}`] : []),
      ])
      .slice(0, MAX_COMENTARIOS)
    salida.push({
      propertyId,
      direccion: g[0].direccion?.trim() || 'Propiedad sin dirección',
      respuestas: encuestas.length,
      leGusto: porcentaje(conRespuesta.filter(e => e.liked === true).length, conRespuesta.length),
      precio: {
        correcto: encuestas.filter(e => e.price_opinion === 'correcto').length,
        alto: encuestas.filter(e => e.price_opinion === 'alto').length,
        bajo: encuestas.filter(e => e.price_opinion === 'bajo').length,
      },
      ofertaMediana,
      moneda,
      diferencia,
      masGusto: contar(encuestas.map(e => e.most_liked_tags)),
      menosGusto: contar(encuestas.map(e => e.least_liked_tags)),
      comentarios,
    })
  }
  return salida.sort((a, b) => b.respuestas - a.respuestas || a.direccion.localeCompare(b.direccion, 'es'))
}
```

  (En el test de "etiquetas…" la del 12/10 escribió "El ascensor" en lo que menos le gustó y la
  del 10/10 "El barrio" en lo que más: el orden sale por fecha, más reciente primero.)

- [ ] **Paso 7: `lib/visitas/resumen.ts`** — imports: `import { opinionesPorPropiedad, type OpinionPropiedad } from './opiniones'`
  y `import { estaVencida } from './encuesta/link'`. Agregar constantes y función:

```ts
export const HORAS_SIN_RESPONDER = 48
/** El link vence a los 30 días de creado (al marcar realizada): 31 días hacia atrás alcanza. */
export const DIAS_ENCUESTAS_HACIA_ATRAS = 31

/** Spec §3.4: "Encuestas sin responder hace más de 48 h" (enviadas, sin responder, sin vencer). */
export function encuestasSinResponder(realizadas: readonly VisitaListado[], ahora: Date): VisitaListado[] {
  const limite = ahora.getTime() - HORAS_SIN_RESPONDER * 3_600_000
  return realizadas
    .filter(v => v.status === 'completed' && v.encuesta?.sent_at && !v.encuesta.completed_at
      && Date.parse(v.encuesta.sent_at) <= limite && !estaVencida(v.encuesta.expires_at, ahora))
    .sort((a, b) => Date.parse(a.encuesta?.sent_at ?? '') - Date.parse(b.encuesta?.sent_at ?? ''))
}
```

  `RequierenAccion` suma `encuestasSinResponder: VisitaListado[]`; `requierenAccion` pasa a:

```ts
export function requierenAccion(abiertas: readonly VisitaListado[], ahora: Date, realizadasRecientes: readonly VisitaListado[] = []): RequierenAccion {
  const t = ahora.getTime()
  const activas = abiertas.filter(v => ESTADOS_ACTIVOS.includes(v.status))
  const sinResultado = activas.filter(v => Date.parse(v.scheduled_at) < t).sort((a, b) => porHorario(b, a))
  const aConfirmar = activas
    .filter(v => v.status === 'pending_confirmation' && Date.parse(v.scheduled_at) >= t)
    .sort(porHorario)
  const encuestas = encuestasSinResponder(realizadasRecientes, ahora)
  return {
    sinResultado: sinResultado.slice(0, MAX_POR_LISTA),
    aConfirmar: aConfirmar.slice(0, MAX_POR_LISTA),
    encuestasSinResponder: encuestas.slice(0, MAX_POR_LISTA),
    total: sinResultado.length + aConfirmar.length + encuestas.length,
  }
}
```

  `EntradaResumen` suma `realizadasRecientes?: readonly VisitaListado[]`; `ResumenVisitas` suma
  `opiniones: OpinionPropiedad[]`; en `armarResumen`: el `for` de propiedades recorre también
  `...(e.realizadasRecientes ?? [])`, `requieren: requierenAccion(e.abiertas, e.ahora, e.realizadasRecientes ?? [])`
  y `opiniones: opinionesPorPropiedad(e.delPeriodo)`.

- [ ] **Paso 8: `app/api/visits/resumen/route.ts`** — importar `DIAS_ENCUESTAS_HACIA_ATRAS` de
  `@/lib/visitas/resumen`; el `Promise.all` suma una cuarta lectura:

```ts
      // Realizadas del último mes para "Encuestas sin responder hace más de 48 h" (el link vence a los 30 días).
      datos.todasLasVisitas({
        ...base,
        estados: ['completed'],
        desde: inicioDelDiaArgentina(sumarDias(hoy, -DIAS_ENCUESTAS_HACIA_ATRAS)),
      }),
```

  (desestructurando `const [delPeriodo, abiertas, proximas, realizadas] = …`), y `armarResumen`
  recibe `realizadasRecientes: realizadas.filas` y `truncado: … || realizadas.truncado`.

- [ ] **Paso 9: Correr y verlos pasar** — el comando del Paso 3, más `npx tsc --noEmit -p tsconfig.visitas.json`
  (los componentes que leen `Metricas`/`RequierenAccion` siguen compilando: los campos son nuevos).
  Medir que el rendimiento de la Entrega 2 se sostiene:
  `npx vitest run --config vitest.visitas.config.ts lib/visitas/metricas-tiempos.test.ts` (el test de
  20.000 visitas < 150 ms sigue en verde).

- [ ] **Paso 10: Commit** — `git add lib/visitas/tipos.ts lib/visitas/datos.ts lib/visitas/datos-listado.test.ts test/visitas/visita-de-prueba.ts lib/visitas/metricas.ts lib/visitas/metricas.test.ts lib/visitas/metricas-tiempos.test.ts lib/visitas/opiniones.ts lib/visitas/opiniones.test.ts lib/visitas/resumen.ts lib/visitas/resumen.test.ts app/api/visits/resumen/route.ts app/api/visits/resumen/route.test.ts`;
  mensaje `feat(visitas): métricas de la encuesta (respondidas, embudo de 5 pasos, opiniones, pendientes de 48 h)`.

---

### Tarea 20: Las métricas de la encuesta en pantalla

**Files:**
- Create: `components/visitas/seccion/QueOpinan.tsx` (+`QueOpinan.test.tsx`)
- Modify: `components/visitas/seccion/TarjetasVisitas.tsx` (+test), `ComoVienen.tsx` (+test),
  `RequierenAccion.tsx` (+test), `components/properties/detail/tabs/VisitasTab.tsx` (+test),
  `app/(dashboard)/visits/page.tsx`, `lib/visitas/presentacion.ts`

**Interfaces:**
- Consumes: `OpinionPropiedad`, `opinionesPorPropiedad` (Tarea 19); `Metricas.encuestas`,
  `ResumenVisitas.opiniones`, `RequierenAccion.encuestasSinResponder` (Tarea 19); `textoMonto` (Tarea 3).
- Produces: `QueOpinan({ opiniones, modo }: { opiniones: OpinionPropiedad[]; modo: 'seccion' | 'propiedad' })`;
  `ComoVienen` recibe `opiniones: OpinionPropiedad[]`; `presentacion.ts` exporta
  `TEXTO_SIN_RESPUESTAS = 'Sin datos — todavía nadie respondió la encuesta'` y deja de exportar
  `TEXTO_LLEGA_CON_LA_ENCUESTA`.

- [ ] **Paso 1: Grep de consumidores** — `grep -rn "TEXTO_LLEGA_CON_LA_ENCUESTA\|llega con la encuesta" app components lib`
  → `ComoVienen.tsx` (×2), `VisitasTab.tsx`, `presentacion.ts`, y los tests `ComoVienen.test.tsx`,
  `VisitasTab.test.tsx`, `TarjetasVisitas.test.tsx`. Todos se tocan en esta tarea.

- [ ] **Paso 2: Tests** — `components/visitas/seccion/QueOpinan.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { QueOpinan } from './QueOpinan'
import type { OpinionPropiedad } from '@/lib/visitas/opiniones'

const OPINION: OpinionPropiedad = {
  propertyId: 'p1', direccion: 'Doblas 248', respuestas: 3,
  leGusto: { valor: 67, base: 3, orientativo: true }, precio: { correcto: 1, alto: 2, bajo: 0 },
  ofertaMediana: { valor: 135000, base: 2, orientativo: true }, moneda: 'USD', diferencia: { valor: -10, base: 2, orientativo: true },
  masGusto: [{ clave: 'luz', etiqueta: 'La luz', cantidad: 2 }], menosGusto: [{ clave: 'ruido', etiqueta: 'El ruido', cantidad: 1 }],
  comentarios: ['No le gustó: <b>El ascensor</b>'],
}

describe('QueOpinan', () => {
  it('sin respuestas: "Sin datos", nunca 0', () => {
    render(<QueOpinan opiniones={[]} modo="seccion" />)
    expect(screen.getByText('Sin datos — todavía nadie respondió la encuesta')).toBeInTheDocument()
  })
  it('sección: por propiedad, con su base y la oferta contra el publicado', () => {
    render(<QueOpinan opiniones={[OPINION]} modo="seccion" />)
    expect(screen.getByText('Doblas 248')).toBeInTheDocument()
    expect(screen.getByText('3 respuestas')).toBeInTheDocument()
    expect(screen.getByText('Les gustó: 67 % (de 3 · orientativo)')).toBeInTheDocument()
    expect(screen.getByText('Precio: 1 correcto · 2 alto · 0 bajo')).toBeInTheDocument()
    expect(screen.getByText('Oferta mediana: US$ 135.000 (10 % debajo del publicado · de 2)')).toBeInTheDocument()
  })
  it('propiedad: también lo que más y menos gustó y los comentarios, como texto', () => {
    const { container } = render(<QueOpinan opiniones={[OPINION]} modo="propiedad" />)
    expect(screen.getByText('La luz (2)')).toBeInTheDocument()
    expect(screen.getByText('El ruido (1)')).toBeInTheDocument()
    expect(screen.getByText('No le gustó: <b>El ascensor</b>')).toBeInTheDocument()
    expect(container.querySelector('b')).toBeNull()
  })
  it('sin ofertas en la moneda publicada lo dice', () => {
    render(<QueOpinan opiniones={[{ ...OPINION, ofertaMediana: { valor: null, base: 0, orientativo: false }, diferencia: { valor: null, base: 0, orientativo: false } }]} modo="seccion" />)
    expect(screen.getByText('Oferta mediana: sin ofertas en la moneda publicada')).toBeInTheDocument()
  })
})
```

  En `components/visitas/seccion/TarjetasVisitas.test.tsx`, en el segundo `it`, cambiar la última
  línea por:

```tsx
    expect(within(tarjeta('Encuestas respondidas')).getByText('0 %')).toBeInTheDocument()
    expect(within(tarjeta('Encuestas respondidas')).getByText('de 1 realizada · orientativo')).toBeInTheDocument()
```

  En `components/visitas/seccion/ComoVienen.test.tsx`: todos los `render(<ComoVienen … />)` suman la
  prop `opiniones={[]}`; el primer `it` pasa a llamarse
  `'el embudo tiene los 5 pasos y resalta UN solo salto'` (las tres aserciones siguen igual); el
  tercero reemplaza la última línea por
  `expect(screen.getByText('Sin datos — todavía nadie respondió la encuesta')).toBeInTheDocument()`.

  En `components/visitas/seccion/RequierenAccion.test.tsx`, un `it` más:

```tsx
  it('lista las encuestas sin responder hace más de 48 h, sin botones de etapa', () => {
    const enc = { sent_at: '2026-10-10T12:00:00Z', completed_at: null, expires_at: '2026-11-09T12:00:00Z', liked: null, price_opinion: null,
      offer_amount: null, offer_currency: null, offer_declined: null, most_liked_tags: [], least_liked_tags: [], most_liked_other: null, least_liked_other: null }
    const r = requierenAccion([], AHORA, [v({ status: 'completed', client_name: 'Ana Encuesta', encuesta: enc })])
    render(<RequierenAccion requieren={r} mostrarAsesor onCambio={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Encuestas sin responder hace más de 48 h' })).toBeInTheDocument()
    expect(screen.getByText(/Ana Encuesta/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Se realizó' })).not.toBeInTheDocument()
  })
```

  En `components/properties/detail/tabs/VisitasTab.test.tsx`: el `it('sin visitas lo dice; "Qué opinan" espera a la encuesta')`
  pasa a `it('sin visitas lo dice; "Qué opinan" dice que nadie respondió')` con la última línea
  `expect(screen.getByText('Sin datos — todavía nadie respondió la encuesta')).toBeInTheDocument()`, y un `it` más:

```tsx
  it('"Qué opinan" de ESTA propiedad con lo que respondieron', async () => {
    const enc = { sent_at: '2026-10-01T12:00:00Z', completed_at: '2026-10-01T13:00:00Z', expires_at: '2026-10-31T12:00:00Z', liked: true,
      price_opinion: 'correcto', offer_amount: null, offer_currency: null, offer_declined: true,
      most_liked_tags: ['luz'], least_liked_tags: ['nada'], most_liked_other: null, least_liked_other: null }
    respuestas = [{ status: 200, body: { data: [v({ scheduled_at: '2026-10-01T13:00:00Z', status: 'completed', encuesta: enc })], total: 1 } }]
    render(<VisitasTab propertyId={PROP} mostrarAsesor />)
    expect(await screen.findByText('La luz (1)')).toBeInTheDocument()
  })
```

- [ ] **Paso 3: Correr y verlos fallar** — `npx vitest run --config vitest.visitas.config.ts components/visitas/seccion components/properties/detail/tabs/VisitasTab.test.tsx`.
  Esperado: FAIL.

- [ ] **Paso 4: `lib/visitas/presentacion.ts`** — reemplazar la línea de
  `TEXTO_LLEGA_CON_LA_ENCUESTA` por:

```ts
/** "Qué opinan" sin ninguna encuesta respondida en el período (regla del tablero: nunca 0). */
export const TEXTO_SIN_RESPUESTAS = 'Sin datos — todavía nadie respondió la encuesta'
```

- [ ] **Paso 5: Crear `components/visitas/seccion/QueOpinan.tsx`**

```tsx
/**
 * "Qué opinan los que visitaron" (spec §3.4 y §3.5). En la sección: una fila por propiedad. En la
 * ficha de una propiedad: además lo que más y menos gustó y los comentarios escritos. Todo como
 * TEXTO (lo escribió un desconocido). Cada cifra con su base; sin respuestas, "Sin datos".
 */
import type { OpinionPropiedad } from '@/lib/visitas/opiniones'
import type { Cifra } from '@/lib/visitas/metricas'
import { textoMonto } from '@/lib/visitas/encuesta/oferta'
import { TEXTO_SIN_RESPUESTAS } from '@/lib/visitas/presentacion'

function base(c: Cifra): string {
  return `de ${c.base}${c.orientativo ? ' · orientativo' : ''}`
}

function textoOferta(o: OpinionPropiedad): string {
  if (o.ofertaMediana.valor === null || !o.moneda) return 'Oferta mediana: sin ofertas en la moneda publicada'
  const monto = textoMonto(o.ofertaMediana.valor, o.moneda)
  if (o.diferencia.valor === null) return `Oferta mediana: ${monto} (${base(o.ofertaMediana)})`
  const d = o.diferencia.valor
  const relacion = d === 0 ? 'igual al publicado' : d < 0 ? `${Math.abs(d)} % debajo del publicado` : `${d} % arriba del publicado`
  return `Oferta mediana: ${monto} (${relacion} · de ${o.ofertaMediana.base})`
}

function Detalle({ o, completo }: { o: OpinionPropiedad; completo: boolean }) {
  return (
    <div className="space-y-1 text-sm">
      <p className="text-muted-foreground">{`${o.respuestas} ${o.respuestas === 1 ? 'respuesta' : 'respuestas'}`}</p>
      <p>{o.leGusto.valor === null ? 'Les gustó: sin datos' : `Les gustó: ${o.leGusto.valor} % (${base(o.leGusto)})`}</p>
      <p>{`Precio: ${o.precio.correcto} correcto · ${o.precio.alto} alto · ${o.precio.bajo} bajo`}</p>
      <p>{textoOferta(o)}</p>
      {completo && (
        <>
          {[{ titulo: 'Lo que más gustó', lista: o.masGusto }, { titulo: 'Lo que menos gustó', lista: o.menosGusto }].map(g => (
            <div key={g.titulo} className="pt-2">
              <p className="font-medium">{g.titulo}</p>
              {g.lista.length === 0
                ? <p className="text-muted-foreground">—</p>
                : <ul className="flex flex-wrap gap-2 pt-1">{g.lista.map(e => <li key={e.clave} className="rounded-full border px-3 py-1">{`${e.etiqueta} (${e.cantidad})`}</li>)}</ul>}
            </div>
          ))}
          {o.comentarios.length > 0 && (
            <div className="pt-2">
              <p className="font-medium">Comentarios</p>
              <ul className="space-y-1 pt-1">{o.comentarios.map((c, i) => <li key={i} className="break-words text-muted-foreground">{c}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function QueOpinan({ opiniones, modo }: { opiniones: OpinionPropiedad[]; modo: 'seccion' | 'propiedad' }) {
  const Titulo = modo === 'seccion' ? 'h2' : 'h3'
  return (
    <section aria-labelledby={`opinan-${modo}`} className="space-y-3 rounded-xl border bg-card p-4">
      <Titulo id={`opinan-${modo}`} className={modo === 'seccion' ? 'text-lg font-semibold' : 'text-base font-semibold'}>Qué opinan los que visitaron</Titulo>
      {opiniones.length === 0
        ? <p className="text-sm text-muted-foreground">{TEXTO_SIN_RESPUESTAS}</p>
        : modo === 'propiedad'
          ? <Detalle o={opiniones[0]} completo />
          : (
            <ul className="divide-y rounded-lg border">
              {opiniones.map(o => (
                <li key={o.propertyId} className="space-y-1 p-3">
                  <p className="break-words font-medium">{o.direccion}</p>
                  <Detalle o={o} completo={false} />
                </li>
              ))}
            </ul>
          )}
    </section>
  )
}
```

  (`Titulo` es una VARIABLE con el nombre de la etiqueta (`'h2' | 'h3'`), no un componente declarado
  dentro de otro.)

- [ ] **Paso 6: Tarjetas, embudo, pendientes y pestaña** —
  `components/visitas/seccion/TarjetasVisitas.tsx`: reemplazar el `StatTile` de "Encuestas respondidas"
  (y su comentario) por

```tsx
      <StatTile
        label="Encuestas respondidas"
        value={textoPorcentaje(m.encuestas.respondidas)}
        context={m.encuestas.respondidas.valor === null
          ? 'ninguna visita realizada todavía'
          : textoDeBase(m.encuestas.respondidas, { uno: 'realizada', varios: 'realizadas' })}
      />
```

  `components/visitas/seccion/ComoVienen.tsx`: la firma pasa a
  `export function ComoVienen({ metricas: m, mostrarAsesor, opiniones }: { metricas: Metricas; mostrarAsesor: boolean; opiniones: OpinionPropiedad[] })`
  (import `type OpinionPropiedad` de `@/lib/visitas/opiniones` y `QueOpinan` de `./QueOpinan`); borrar
  el bloque `{['Respondieron la encuesta', 'Dijeron cuánto ofertarían'].map(…)}` (los pasos ya vienen
  en `m.embudo`); en `TIEMPOS` sumar `{ clave: 'respuestaEncuesta', etiqueta: 'Responder la encuesta (desde que se envió)' }`;
  reemplazar la `<section aria-labelledby="opinan-titulo">…</section>` final por
  `<QueOpinan opiniones={opiniones} modo="seccion" />`; sacar `TEXTO_LLEGA_CON_LA_ENCUESTA` del import.

  `components/visitas/seccion/RequierenAccion.tsx`: `mostradas` suma
  `requieren.encuestasSinResponder.length`; actualizar el comentario del componente (ya no "llega con
  la Entrega 3"); después del bloque "A confirmar", agregar:

```tsx
      {requieren.encuestasSinResponder.length > 0 && (
        <div className="space-y-2">
          <h3 className="eyebrow">Encuestas sin responder hace más de 48 h</h3>
          <ul className="space-y-2">
            {requieren.encuestasSinResponder.map(v => (
              // Sin botones: copiar o reenviar se hace desde la ficha (la fila lleva ahí).
              <FilaVisita key={v.id} visita={v} mostrarAsesor={mostrarAsesor} />
            ))}
          </ul>
        </div>
      )}
```

  `components/properties/detail/tabs/VisitasTab.tsx`: imports `import { QueOpinan } from '@/components/visitas/seccion/QueOpinan'`
  y `import { opinionesPorPropiedad } from '@/lib/visitas/opiniones'` (sacar `TEXTO_LLEGA_CON_LA_ENCUESTA`);
  reemplazar la `<section aria-labelledby="opinan-propiedad">…</section>` por

```tsx
      {estado.tipo === 'listo' && <QueOpinan opiniones={opinionesPorPropiedad(estado.visitas)} modo="propiedad" />}
```

  y actualizar el comentario del componente (ya no "llega con la encuesta").

  `app/(dashboard)/visits/page.tsx`: `<ComoVienen metricas={resumen.metricas} mostrarAsesor={verTodo} opiniones={resumen.opiniones} />`.

- [ ] **Paso 7: Correr y verlos pasar** — `npx vitest run --config vitest.visitas.config.ts` (la suite
  entera de visitas: estas pantallas las usan varios tests). Esperado: PASS. Más `tsc` y eslint sobre
  los archivos tocados. `grep -rn "TEXTO_LLEGA_CON_LA_ENCUESTA\|llega con la encuesta" app components lib`
  → sin resultados.

- [ ] **Paso 8: Commit** — `git add components/visitas/seccion/QueOpinan.tsx components/visitas/seccion/QueOpinan.test.tsx components/visitas/seccion/TarjetasVisitas.tsx components/visitas/seccion/TarjetasVisitas.test.tsx components/visitas/seccion/ComoVienen.tsx components/visitas/seccion/ComoVienen.test.tsx components/visitas/seccion/RequierenAccion.tsx components/visitas/seccion/RequierenAccion.test.tsx components/properties/detail/tabs/VisitasTab.tsx components/properties/detail/tabs/VisitasTab.test.tsx "app/(dashboard)/visits/page.tsx" lib/visitas/presentacion.ts`;
  mensaje `feat(visitas): "Qué opinan", embudo completo y encuestas pendientes en /visits y en la ficha`.

---

### Tarea 21: Borrar el cuestionario viejo (con grep de consumidores)

**Files:**
- Delete: `app/questionnaire/[token]/page.tsx`, `app/questionnaire/[token]/thanks/page.tsx`,
  `app/api/public/questionnaire/[token]/route.ts`, `app/api/visits/[id]/questionnaire/route.ts`,
  `app/api/visits/[id]/send-questionnaire/route.ts`,
  `lib/email/notifications/questionnaire-invite-client.ts`, `emails/QuestionnaireInviteClientEmail.tsx`
- Modify: `app/(dashboard)/layout.movil.test.ts`, `types/database.types.ts`

- [ ] **Paso 1: Grep de consumidores ANTES de borrar** —
  `grep -rn "questionnaire\|Questionnaire" app lib components emails types middleware.ts netlify scripts`.
  Esperado (y nada más): los siete archivos de arriba; `app/(dashboard)/layout.movil.test.ts` (2 líneas
  de la lista de `vh`→`dvh`); `types/database.types.ts` (el bloque `visit_questionnaires`);
  `lib/supabase/middleware.ts` y `lib/supabase/middleware.test.ts` (solo las menciones que dejó la
  Tarea 11). Si aparece cualquier otro consumidor, PARAR y agregarlo a esta tarea con su cambio.

- [ ] **Paso 2: Borrar** — `git rm` de los siete archivos (en llamadas separadas si el guardián lo
  pide).

- [ ] **Paso 3: Tests y tipos** — en `app/(dashboard)/layout.movil.test.ts`, sacar de `archivos` las
  líneas `'app/questionnaire/[token]/page.tsx',` y `'app/questionnaire/[token]/thanks/page.tsx',`. En
  `types/database.types.ts`, borrar el bloque completo de la tabla `visit_questionnaires: { Row: …, Insert: …, Update: …, Relationships: […] }`
  (desde la línea `visit_questionnaires: {` hasta su llave de cierre, antes de la tabla siguiente) y,
  si existe, el de `visit_questionnaire_tokens`.

- [ ] **Paso 4: Verificar** — el grep del Paso 1 ahora devuelve SOLO las menciones de
  `lib/supabase/middleware.ts` (comentario) y `lib/supabase/middleware.test.ts` (el `it` de "ya NO es
  pública"). `npx vitest run --config vitest.visitas.config.ts` y `npx tsc --noEmit -p tsconfig.visitas.json`
  en verde.

- [ ] **Paso 5: Commit** — `git add "app/(dashboard)/layout.movil.test.ts" types/database.types.ts` (más
  los `git rm` ya preparados); mensaje
  `chore(visitas): borra el cuestionario de mayo (0 filas, nunca funcionó), reemplazado por la encuesta`.

---

### Tarea 22: Verificación, auditoría y QA en la vista previa (Etapa 5 del protocolo)

**Files:** ninguno nuevo commiteado. Scripts de QA sin commitear con prefijo `_`
(`scripts/_qa-encuesta-*.ts`).

- [ ] **Paso 1: Suite completa, tipos y lint** — `npx vitest run --config vitest.visitas.config.ts`,
  `npx vitest run --config vitest.agente-prueba.config.ts` (el agente lee estados de visita),
  `npx tsc --noEmit -p tsconfig.visitas.json`,
  `npx eslint lib/visitas components/visitas components/encuesta components/properties/detail/tabs app/api/visits app/api/public/encuesta "app/api/properties/[id]/regalo" app/api/settings/encuesta-visitas app/api/cron/visit-reminders "app/(dashboard)/visits" "app/(dashboard)/settings/encuesta" app/encuesta lib/email/notifications/visit-survey-answered.ts lib/email/notifications/visit-survey-gift.ts emails/VisitSurveyAnsweredEmail.tsx emails/VisitSurveyGiftEmail.tsx lib/integrations/whatsapp/core.ts lib/integrations/whatsapp/log.ts middleware.ts lib/supabase/middleware.ts lib/nav/sections.ts`.
  Pegar el resumen de cada salida. Si iCloud cuelga algo, CLAUDE.md § iCloud.

- [ ] **Paso 2: Revisión adversarial + seguridad** — subagente `feature-dev:code-reviewer` sobre
  `git diff origin/main...HEAD`, pidiendo explícitamente: (a) página y API públicas: token validado por
  forma antes de la base, nada de datos de más (apellido, teléfono entero, email, asesor), honeypot,
  límite por link, reserva atómica del final, visita reabierta; (b) regalo: bucket privado, paths con
  regex exacta, existencia del objeto, descarga solo con encuesta completa, ninguna URL pública
  guardada; (c) WhatsApp: fail-closed en cada decisión, plantilla y botón/encabezado juntos, catálogo,
  `WHATSAPP_TEST_MODE`, origen `encuesta_visita`; (d) avisos: reservas, vencimientos sin reintento,
  límites de tiempo contra Netlify; (e) permisos de cada ruta nueva (abogado, asesor ajeno, coordinador
  en ajustes); (f) consumidores olvidados (`VisitaListado`, `Metricas`, `RequierenAccion`,
  `whatsapp_messages.origen`, `questionnaire`); (g) celular (criterio 25). Más `/security-review`
  (toca inputs de terceros, mensajes a clientes y archivos). Verificar cada hallazgo antes de aplicarlo;
  lo aplicado vuelve a su tarea con su prueba.

- [ ] **Paso 3: PR** — `gh api user -q .login` tiene que ser `sujupar` (si no, `gh auth switch --user sujupar`);
  `git push -u origin feat/visitas-encuesta`; `gh pr create --base main` con resumen, criterios 18–31,
  decisiones (tablas nuevas, lista de prueba propia, avisos en dos tiempos, botón en el flujo) y las
  dos variables de entorno nuevas. Esperar la vista previa (`gh pr checks <N>`).

- [ ] **Paso 4: Datos de prueba** — `scripts/_qa-encuesta-e3.ts` (sin commitear; clave de servicio;
  todo con `[TEST]`), modos: `crear` / `borrar`:
  - una propiedad `[TEST] Encuesta 123` (`status='approved'`, `commercial_status='disponible'`,
    `asking_price=150000`, `currency='USD'`, `garages=1`, una foto del bucket público
    `property-files`), asignada al usuario de pruebas;
  - tres visitas `[TEST]` de ayer, `scheduled`, en esa propiedad, con `client_phone` = un número de
    la lista de prueba (el de Julián o el de Diego, con su OK en el chat), y una cuarta con un
    teléfono inválido (`'123'`);
  - `borrar`: visitas `[TEST]` (sus encuestas caen en cascada), la fila del regalo, los archivos del
    bucket `visit-survey-gifts` bajo `properties/<id>/`, la propiedad, y vacía `telefonos_prueba`.
  Prender el modo prueba de email (`notification_settings.test_mode_enabled = true`) ANTES y apagarlo
  al terminar. Con `WHATSAPP_TEST_MODE` de la vista previa como esté: si está en `false`, solo se le
  escribe a los teléfonos de prueba (las tres visitas `[TEST]`), nunca a un cliente.

- [ ] **Paso 5: QA con el navegador de Claude** — `scripts/navegador-claude.sh abrir <preview>` +
  `node --env-file=../../../.env.local --import tsx scripts/navegador-claude-login.ts`. En cada
  página, sacar el "Netlify Drawer" (`document.querySelectorAll('iframe[title="Netlify Drawer"]').forEach(e => e.remove())`).
  Tabla criterio → cómo se probó → resultado (con captura por fila):

  | # | Criterio | Cómo |
  |---|---|---|
  | 26 | Regalo en la pestaña Visitas | Ficha de `[TEST] Encuesta 123` → Visitas: subir un PDF chico + portada, ver "Ver PDF" (abre la URL firmada), Reemplazar, Quitar (con confirmación) y volver a subir. `select title, file_path, cover_path from property_survey_gifts where property_id=…`. Rol abogado (`UPDATE profiles SET role='abogado' …`): sin pestaña Visitas y `fetch('/api/properties/<id>/regalo')` desde la consola → 403. Volver a `admin`. |
  | 30 | `/settings/encuesta` | Como admin: ver interruptores (todo apagado, "solo con regalo" prendido) y plantillas; cargar el teléfono de prueba y guardar; prender "Mandar la encuesta" pide confirmación → Cancelar (queda apagado). Rol coordinador: la pantalla dice "Solo admin y dueño…" y `PATCH` → 403. Volver a `admin`. |
  | 18 | "Se realizó" crea el link | Visita `[TEST]` con teléfono inválido → Se realizó → Alto: la ficha dice "Sin enviar (el teléfono no es un WhatsApp válido)"; con el teléfono de prueba QUITADO de la lista y el envío apagado, otra visita → "Sin enviar (envío apagado)"; "Copiar link" copia `https://inmodf.com.ar/encuesta/<22>` (verificar con `navigator.clipboard.readText()` o el campo de respaldo). `select token, send_status, send_skip_reason from visit_surveys …`. |
  | 19 | Llega al teléfono de prueba | Con el teléfono en la lista: Se realizó en la tercera visita. Antes de que Meta apruebe `encuesta_visita_v1`, la ficha muestra el rechazo en castellano ("Falló: la plantilla no existe o todavía no está aprobada") o "Sin enviar (WhatsApp en modo prueba)"; `select status, template_name, origen, error_code from whatsapp_messages order by created_at desc limit 3;`. La llegada REAL al teléfono se verifica en la Tarea 23, con la plantilla aprobada. |
  | 20 | La encuesta en el celular | Abrir el link con `emulate` `mobile,touch` a 390×844: nombre, foto, dirección, opciones con "La cochera" (garages=1), sin "x de y", "menos de un minuto"; con regalo, su portada y título; quitando el regalo, bienvenida neutra. |
  | 21 | Retomar | Responder 1 y 2, cerrar la pestaña, `select liked, most_liked_tags, last_step from visit_surveys …` (quedaron), reabrir → arranca en "¿Y lo que menos te gustó?". |
  | 22 | Terminar | Completar con email: gracias con "Descargar <título>"; `select completed_at, contact_phone, contact_email, team_notice_status, gift_email_status from visit_surveys …`; en `email_notifications_log`, UNA fila `visit_survey_answered` por destinatario (redirigidas por el modo prueba) y una `visit_survey_gift_client`. La ficha de la visita muestra "Respondida" y las respuestas; la pestaña de la propiedad y `/visits` (período que incluya ayer) muestran la opinión y la tarjeta. Doble toque: botón final con doble clic → una sola fila completada. |
  | 22b | Concurrencia (spec §8) | `scripts/_qa-encuesta-concurrencia.ts`: otra visita `[TEST]` con todas las respuestas cargadas por SQL; 20 `POST <preview>/api/public/encuesta/<token>` simultáneos + 20 `POST …/avisos` simultáneos → `completed_at` una vez y una sola fila `visit_survey_answered` por destinatario en `email_notifications_log`. |
  | 27 | Descarga | `GET <preview>/api/public/encuesta/<token-sin-terminar>/regalo` → 404; con la terminada → 302 a una URL firmada (`curl -sI`), con `cache-control: no-store`. |
  | 28 | Email del regalo | La fila `visit_survey_gift_client` del criterio 22 y el email en la casilla del modo prueba, con el botón "Descargar" que funciona. |
  | 29 | Regalo por WhatsApp | Con `regalo_por_whatsapp` apagado y un teléfono que NO es de prueba: la pantalla de gracias no dice "por WhatsApp" y `gift_whatsapp_status='no_corresponde'`. La llegada real va en la Tarea 23 (con `regalo_visita_v1` aprobada). |
  | 23 | Link vencido/inventado/reabierta | `/encuesta/AAAAAAAAAAAAAAAAAAAAAA` → "Este link no está disponible"; `update visit_surveys set expires_at = now() - interval '1 day' where …` → "Este link venció"; reabrir una visita realizada → el link dice "no está disponible". Ninguna muestra dirección ni nombre. |
  | 24 | Lighthouse | `lighthouse_audit` de chrome-devtools en modo celular sobre el link de una encuesta `[TEST]` sin terminar: rendimiento ≥ 90, accesibilidad ≥ 95, LCP < 2,5 s, CLS < 0,1. Pegar los números. (Ojo: Lighthouse marca "Abierta"; usar una encuesta descartable.) |
  | 25 | Nada superpuesto | En cada pantalla (bienvenida con y sin regalo, gusto, más/menos con "Otra cosa" abierta, precio, oferta, contacto con "Cambiar" abierto, gracias, link vencido) a 360×740, 390×844 y 430×932 con `emulate` `mobile,touch`: captura + el chequeo de abajo. Con "teclado abierto": enfocar el monto y el teléfono y achicar el alto al 55 % (`resize_page` a 390×460) para simular el teclado; captura + chequeo. |
  | 31 | Cifras contra la base | `/visits` con el período que incluye las visitas `[TEST]`: comparar tarjeta "Encuestas respondidas", embudo de 5 pasos, "Qué opinan" y "Encuestas sin responder hace más de 48 h" (poner `sent_at = now() - interval '3 days'` a una enviada sin responder) con `select v.status, s.sent_at, s.completed_at, s.offer_amount from property_visits v left join visit_surveys s on s.visit_id=v.id where v.client_name like '[TEST]%';`. |

  Chequeo automático de superposición (pegar en `evaluate_script`; tiene que devolver `[]`):

```js
() => {
  const vw = document.documentElement.clientWidth
  const visibles = [...document.querySelectorAll('h1,h2,h3,p,a,button,input,label,img,li,span,kbd,strong')]
    .filter(e => !e.closest('[aria-hidden="true"]'))
    .filter(e => { const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' })
    .map(e => ({ e, r: e.getBoundingClientRect() }))
    .filter(x => x.r.width > 0 && x.r.height > 0)
  const problemas = []
  for (const x of visibles) if (x.r.left < -1 || x.r.right > vw + 1) problemas.push(`se sale: ${x.e.tagName} ${x.e.textContent?.slice(0, 30)}`)
  const hojas = visibles.filter(x => !visibles.some(y => y !== x && x.e.contains(y.e)))
  for (let i = 0; i < hojas.length; i++) for (let j = i + 1; j < hojas.length; j++) {
    const a = hojas[i].r, b = hojas[j].r
    const ancho = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const alto = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    if (ancho > 2 && alto > 2 && !hojas[i].e.contains(hojas[j].e) && !hojas[j].e.contains(hojas[i].e)) {
      problemas.push(`${hojas[i].e.tagName}「${hojas[i].e.textContent?.slice(0, 20)}」 sobre ${hojas[j].e.tagName}「${hojas[j].e.textContent?.slice(0, 20)}」`)
    }
  }
  return problemas
}
```

  Además: consola sin errores (`list_console_messages`) y red sin 4xx/5xx inesperados
  (`list_network_requests`) en cada pantalla; la ficha de la visita y `/settings/encuesta` a 360 px
  (botones ≥ 44 px, nada cortado); menú colapsado mostrando "Encuesta de visitas". Al terminar:
  `scripts/_qa-encuesta-e3.ts borrar`, modo prueba de email apagado, `telefonos_prueba` vacía, rol del
  usuario de pruebas en `admin`. Un criterio en rojo vuelve a su tarea.

---

### Tarea 23: Despliegue y cierre (Etapa 6 del protocolo)

- [ ] **Paso 1: Puertas, en orden:**
  1. **Migración** aplicada y verificada (Tarea 1). Re-confirmar en `mncsnastmcjdjxrehdep`:
     `select count(*) from visit_surveys; select * from visit_survey_settings;` y que
     `select to_regclass('public.visit_questionnaires')` da `null`.
  2. **Variables de entorno** — pedirle al dueño que cargue en Netlify (todas las instancias):
     `WHATSAPP_TEMPLATE_ENCUESTA_VISITA=encuesta_visita_v1` y
     `WHATSAPP_TEMPLATE_REGALO_VISITA=regalo_visita_v1`. Con los interruptores apagados no cambian nada
     para los clientes (solo habilitan a los teléfonos de prueba). Esperar su confirmación.
  3. `git fetch origin` y `git diff --name-only origin/main feat/visitas-encuesta` → SOLO archivos de
     esta entrega (los del Mapa de archivos, los borrados de la Tarea 21 y los dos documentos). Si aparece
     algo ajeno, reconstruir la rama limpia. Merge con `gh pr merge <N> --merge` (lo hace Claude).
  4. Esperar el deploy (2–5 min; `curl -sI https://inmodf.com.ar/encuesta/AAAAAAAAAAAAAAAAAAAAAA` → 200
     sin redirección a `/login`, y la página dice "Este link no está disponible").
- [ ] **Paso 2: Plantillas** — `node --env-file=../../../.env.local --import tsx scripts/create-whatsapp-templates-encuesta-visita.ts`
  (estado) y `--create=encuesta` (OK del dueño dado el 2026-10-10, spec §10). Pedir el OK del dueño en
  el chat para `regalo_visita_v1` mostrándole el texto exacto («Hola {{1}}. Acá tenés el material de
  {{2}} que pediste.» + el PDF adjunto) y, con el OK, `--create=regalo --muestra=<url de un plano PDF
  del bucket público property-files>`. Volver a correr el estado hasta que digan APPROVED (minutos a
  1–2 días). Si alguna queda en MARKETING: NO usarla, avisar al dueño y rediseñar el texto (CLAUDE.md
  § Meta reclasifica). Con las dos aprobadas: `node --experimental-strip-types --env-file=../../../.env.local scripts/sincronizar-cuerpos-plantillas.ts`
  y commitear `lib/integrations/whatsapp/cuerpos-aprobados.ts` en una rama `chore/cuerpos-encuesta`
  con su PR (cambio de una línea de datos generados).
- [ ] **Paso 3: Verificación en producción (con las plantillas aprobadas)** — con un teléfono de prueba
  en `/settings/encuesta` y TODO lo demás apagado: crear una visita `[TEST]` (ayer) en una propiedad
  `[TEST]` con regalo y ese teléfono, marcar "Se realizó" → llega `encuesta_visita_v1` al teléfono con
  el link en el cuerpo y el botón (criterio 19); completarla desde el teléfono → gracias con descarga,
  email al equipo (modo prueba de email prendido) y, con el teléfono de prueba, el PDF por WhatsApp con
  `regalo_visita_v1` (criterio 29). `select status, template_name, origen from whatsapp_messages order by created_at desc limit 5;`.
  Borrar los datos `[TEST]`, vaciar `telefonos_prueba`, apagar el modo prueba de email.
- [ ] **Paso 4: Humo** con el navegador de Claude en `https://inmodf.com.ar`: `/visits` (tarjeta de
  encuestas, embudo, "Qué opinan"), una ficha de visita realizada (la tarjeta "Encuesta" con "Crear
  link"), la pestaña Visitas de una propiedad (tarjeta del regalo vacía), `/settings/encuesta`. Consola
  limpia. Sin crear datos reales.
- [ ] **Paso 5: Si algo salió mal:** `git revert -m 1 <merge>` + push (Netlify vuelve solo). La
  migración no se revierte: es aditiva para el código viejo (las tablas borradas no tenían filas ni
  consumidores vivos). No se parchea a mano.
- [ ] **Paso 6: Cerrar el navegador** — `scripts/navegador-claude.sh cerrar`.
- [ ] **Paso 7: Cerrar el ciclo** — en `CLAUDE.md`, sección nueva "Sistema de visitas — Entrega 3"
  (debajo de la de la Entrega 2): qué hay (encuesta pública, regalo por propiedad, `/settings/encuesta`,
  métricas conectadas); las decisiones (regalo por propiedad; envío fail-closed con lista de prueba
  PROPIA y por qué no `consulta_test_phones`; plantilla y botón/encabezado juntos con catálogo; avisos
  en dos tiempos + barrido en el cron del recordatorio; "Abierta" la marca el navegador; botón en el
  flujo por el teclado de iOS; link inválido si la visita se reabre); la detección
  (`select send_status, send_skip_reason, send_error from visit_surveys order by updated_at desc limit 20;`
  y avisos colgados: `select id from visit_surveys where 'enviando' in (team_notice_status, gift_whatsapp_status, gift_email_status) and updated_at < now() - interval '10 minutes';`);
  y que para estrenarlo con clientes hay que prender "Mandar la encuesta" en `/settings/encuesta` (con
  regalos cargados) y, cuando Meta apruebe `regalo_visita_v1`, "Mandar el regalo por WhatsApp".
  Memoria `sistema_visitas.md` actualizada. `git worktree remove` si no sigue otra entrega acá.
- [ ] **Paso 8: Reporte al dueño**, en castellano simple: qué se hizo, la tabla de criterios 18–31 con
  cómo se probó, qué tiene que hacer él (cargar los regalos de cada propiedad y prender el envío
  cuando quiera estrenarlo; prender el regalo por WhatsApp cuando Meta apruebe la plantilla) y qué
  quedó afuera (§11.9).

---

## Autorrevisión (hecha al escribir el plan)

- **Cobertura del spec (con la adenda §11):** regalo por propiedad → Tareas 5, 12, 13; encuesta
  pública §3.6/§11.3 → Tareas 2, 3, 5, 15, 16, 17; envío §3.7/§11.4 → Tareas 4, 7, 8; modelo de datos
  §11.5 → Tarea 1; rutas §11.6 → Tareas 8, 10, 11, 12, 14; guardado/final/avisos §4.10/§11.7 →
  Tareas 6, 9, 10, 11; WhatsApp §4.11/§11.8 → Tareas 4, 7, 23; configuración → Tarea 14; métricas
  §3.4/§3.5/§4.5 → Tareas 19, 20; ficha §3.3 → Tareas 8, 18; borrado de lo viejo → Tarea 21;
  criterios 18–31 → Tareas 22 y 23; §8 rendimiento → Tarea 19 (20.000 visitas) y Tarea 22
  (Lighthouse, concurrencia); §7 riesgos 5/6/7/8/11 y 15–20 → Tareas 1, 4, 7, 10, 11, 23.
- **Sin placeholders:** cada paso de código trae el código; los pasos de QA traen el comando, la
  consulta o el script de chequeo.
- **Tipos consistentes:** `EncuestaFila`, `EncuestaConVisita`, `EncuestaPublica`, `EncuestaParaFicha`,
  `RespuestasParaFicha`, `EnvioArmado`, `DecisionEnvio`, `RegaloVista`, `OpinionPropiedad`,
  `EncuestaListado`, `CanalAviso` se definen una vez y se usan con el mismo nombre; `filasDeRespuestas`
  la comparten la ficha y el email; `opcionesDeLaPropiedad` la comparten la página y la ruta.
- **Review Focus:** los cinco casos tienen su prueba en la tarea dueña (Tareas 3, 4, 5, 8, 15, 16, 17, 19).

