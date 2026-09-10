# Proceso de desarrollo de la plataforma

Cómo se construye cualquier cosa en esta plataforma, desde que se decide hasta que
está andando en producción. Vale para una pantalla nueva, una integración, una
migración o un arreglo. Está escrito para dos lectores: el dueño (para saber qué
esperar en cada etapa) y las sesiones de Claude (para hacerlo siempre igual).

Herramientas que ya existen en el repo y que cada etapa usa: `docs/superpowers/specs`
y `docs/superpowers/plans` (definición y plan), `vitest` (pruebas), `scripts/*.probe.tsx`
y `scripts/*.ts` (verificaciones contra la base real), el navegador de Claude
(`scripts/navegador-claude.sh`), las vistas previas de Netlify por PR, y `CLAUDE.md`
(lecciones aprendidas).

---

## Etapa 1 — Definir QUÉ se va a hacer (antes de escribir código)

**Objetivo:** que las dos partes entiendan lo mismo antes de gastar tiempo en
construirlo. Acá se decide el alcance, no la técnica.

1. **Conversación corta, una pregunta por vez** (nada de formularios). Se aclara:
   quién lo usa, qué problema resuelve, qué pasa hoy sin eso, y qué NO entra.
2. **Se escribe un spec** en `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md` con:
   - El problema en una frase y el resultado esperado en una frase.
   - Qué ve el usuario (pantallas, botones, mensajes) y qué pasa por detrás.
   - Decisiones tomadas y por qué (para que no se rediscutan cada sesión).
   - Qué queda afuera explícitamente.
   - Cómo se va a comprobar que está terminado (criterios de aceptación, en
     lenguaje de negocio: "al registrar una consulta llega el WhatsApp al asesor").
3. **Chequeo de choques con lo existente** (la skill
   `anticipating-implementation-conflicts`): límite de tiempo de Netlify, RLS por
   rol, pg_cron, migraciones que deben ir antes del deploy, procesos que mandan
   emails o WhatsApp de verdad, campañas de Meta que gastan plata.
4. **El dueño aprueba el spec.** Recién ahí se pasa a la estructura.

**Señal de que esta etapa se hizo mal:** se construyó algo y al mostrarlo se
descubre que "no era eso" (pasó con las landings E1.7 y E1.8).

---

## Etapa 2 — Estructura (cómo se va a armar)

**Objetivo:** decidir dónde vive cada pieza y en qué orden se construye, para que
después el código sea chico, probable y no rompa lo que ya anda.

1. **Plan de implementación** en `docs/superpowers/plans/`, con tareas chicas y
   en orden. Cada tarea dice qué archivos toca y cómo se verifica.
2. **Reglas de estructura de este repo:**
   - La lógica va en **módulos puros** dentro de `lib/` (funciones sin red ni
     base de datos), que se prueban en milisegundos. Ejemplos:
     `lib/properties/commercial-status.ts`, `lib/links/short-link.ts`.
   - Las rutas de `app/api/` son finas: validan, llaman al módulo, persisten.
   - Los componentes de `components/` no traen datos por su cuenta si una ruta
     o el layout ya se los puede dar.
   - Una integración externa (Meta, ML, WhatsApp, OpenAI) tiene su carpeta en
     `lib/<area>/` y un modo de prueba que NO llama al servicio real.
   - **Nunca más de una llamada a IA dentro de un mismo request** (Netlify corta
     antes de los 60 s). Si hay varias etapas, se hace una por llamada y el
     cliente va mostrando progreso.
3. **Base de datos primero:** si hace falta una columna, tabla o función, la
   migración se escribe y se aplica ANTES del código que la usa. Se numera
   mirando el directorio `supabase/migrations` (ya hubo un prefijo duplicado).
   Toda FK a `profiles(id)` es `ON DELETE SET NULL`. Todo `upsert` con
   `onConflict` tiene su UNIQUE en la base.
4. **Una rama por trabajo** (`feat/...`, `fix/...`) desde `origin/main`. Como
   suelen correr varias sesiones a la vez sobre la misma carpeta, cada sesión
   trabaja en un **worktree** propio y en una ruta SIN acentos (Turbopack rompe
   con la "ó" de "Gestión").

---

## Etapa 3 — Buenas prácticas al escribir el código

**Objetivo:** que el código lo entienda y lo cambie cualquiera dentro de seis
meses, incluida una sesión que no vio nada de esto.

- **TypeScript estricto y sin `any`.** Se verifica con `npx tsc --noEmit -p` un
  tsconfig acotado a lo que se tocó (el raíz se cuelga por iCloud).
- **ESLint** con la config de Next (`eslint.config.mjs`): `npm run lint` limpio
  en los archivos tocados.
- **Nombres en castellano para lo del negocio** (`armarLinkRespuesta`;
  en la base se sigue la convención de columnas existente) y
  comentarios que explican el POR QUÉ, no el qué. Si algo está raro a propósito,
  el comentario dice qué se rompe si se "arregla".
- **Sin secretos en el código.** Todo por variables de entorno; en Netlify se
  cargan a mano. Un nombre de variable nuevo se anota en el spec.
- **Seguridad por defecto:** validar en el servidor todo lo que viene del
  navegador o de un tercero (URLs `https://`, permutaciones de fotos, hosts
  exactos en redirecciones), RLS por rol en toda tabla nueva, y nunca
  interpolar texto de terceros dentro de un `<script>`.
- **Fallos ruidosos, nunca silenciosos:** un parser que no entiende el formato
  falla y lo registra; un cron que decide no hacer nada deja escrito por qué.
- **Commits chicos con mensaje que explica el cambio**, autor
  `Sujupar <redstyle50@gmail.com>` (si no, Netlify no deploya).

---

## Etapa 4 — Pruebas (las escribe quien escribe el código)

**Objetivo:** que cada regla de negocio quede protegida por una prueba que corra
sola, rápido, y que grite si alguien la rompe después.

1. **Primero la prueba, después el código** (TDD) para toda la lógica de `lib/`:
   se escribe el test que describe el comportamiento, se ve fallar, se
   implementa lo mínimo, se ve pasar, se limpia.
2. **Qué se prueba con qué:**
   - Lógica pura → `vitest` en entorno node. Corre en ~0,5 s con una config
     acotada (`include` de las carpetas tocadas). Hay 800+ archivos de prueba.
   - Componentes → `vitest` + happy-dom (`.test.tsx`). Lento en esta Mac la
     primera vez (más de un minuto en frío); después ~55 s.
   - Render de páginas y PDFs → scripts `scripts/*.probe.tsx` con
     `renderToStaticMarkup` (estructura, textos, que nada quede con `opacity:0`).
   - Contra la base y las APIs reales → scripts `node --env-file=.env.local
     --import tsx scripts/<algo>.ts`, siempre con modo de prueba activado
     (`WHATSAPP_TEST_MODE`, modo prueba de email, guard de título `[TEST`).
3. **Lo que las pruebas automáticas NO atrapan** y hay que mirar en el
   navegador: pasar un ícono de servidor a cliente (pantalla en blanco), menús
   colapsados, superposiciones de texto en imágenes, el visor de PDF en vivo.
   Por eso existe la etapa 5.
4. **Regla de honestidad:** nunca decir "las pruebas pasan" sin haberlas corrido
   en esta sesión y pegado el resultado.

---

## Etapa 5 — QA (control de calidad, antes de tocar producción)

**Objetivo:** encontrar los errores en un lugar donde no le cuesten nada al
negocio. Tres capas, en este orden:

1. **Revisión adversarial del código** por un revisor aparte (`/code-review` o
   un subagente revisor): busca bugs, huecos de seguridad, casos borde,
   consumidores olvidados (`grep` de todo lo que lee lo que se cambió).
   Cada hallazgo se verifica antes de aplicarlo; no se acepta a ciegas.
2. **Vista previa en Netlify.** Al abrir el PR, Netlify construye la rama en
   `https://deploy-preview-<N>--inmobiliariadiegoferreyra.netlify.app`. Es la
   plataforma real, con el código nuevo, sin tocar `main`. Ahí se hace el QA
   de UI, no en localhost (Turbopack no arranca local) ni en producción.
3. **QA en la UI con el navegador de Claude** (ver sección al final): recorrer
   el flujo completo como lo haría el asesor, con estos chequeos mínimos:
   - Cada pantalla tocada carga y se ve como el spec (captura de pantalla).
   - Consola sin errores; pedidos de red sin 4xx/5xx inesperados.
   - Los roles que importan para esa pantalla (asesor, coordinador,
     abogado si aplica) ven lo que corresponde y no más.
   - Menú colapsado y celular (viewport angosto) si se tocó navegación.
   - Después de una migración: consultar la base y confirmar que la columna,
     el trigger o el job existen EN EL PROYECTO CORRECTO de Supabase.
   - Lo que se creó para probar se limpia o queda marcado `[TEST`.

**Regla:** si en el QA aparece un error, se vuelve a la etapa 3 o 4, se
arregla, y se repite el QA. No se "arregla en producción".

---

## Etapa 6 — Despliegue y después

**Objetivo:** que lo que se aprobó llegue a producción sin sorpresas, y que lo
aprendido quede escrito.

1. **Orden de puerta (gates), siempre el mismo:**
   1. Migraciones aplicadas y verificadas en Supabase (`mncsnastmcjdjxrehdep`).
   2. Variables de entorno nuevas cargadas en Netlify.
   3. Merge del PR a `main` → Netlify deploya solo (2–5 min).
   4. Jobs de `pg_cron` que apuntan a rutas nuevas: DESPUÉS del deploy.
2. **Chequeo post-deploy (humo):** abrir producción con el navegador de Claude
   y repetir el camino principal del cambio. Confirmar en la base que los
   crons siguen escribiendo (`max(date)` de las tablas que alimentan).
3. **Si algo salió mal:** `git revert` del merge y push (Netlify vuelve solo).
   No se parchea a mano sobre producción.
4. **Cerrar el ciclo:** cada error no obvio o trampa de una API se documenta en
   `CLAUDE.md` (formato Síntoma / Causa / Fix / Detección) y lo que sirve para
   futuras sesiones va a la memoria del proyecto.

---

## Cómo prueba Claude en la UI: el navegador de Claude

Es un Chrome aparte, con **su propio perfil** (`~/.cache/claude-browser`), donde
queda guardada la sesión de la plataforma, y con el puerto de depuración
`9222` abierto. Todas las sesiones de Claude se conectan a **ese mismo**
navegador, así que ninguna choca con otra (con el perfil por defecto de la
herramienta, la segunda sesión falla con "the browser is already running").

**Piezas:**
- `scripts/navegador-claude.sh abrir|cerrar|estado` — lo abre (si no está),
  lo cierra o dice qué pestañas tiene (verificado 2026-09-10).
- La herramienta `chrome-devtools` de Claude configurada con
  `--browserUrl http://127.0.0.1:9222` (verificado: se conecta, lista las
  pestañas y opera sobre ellas). Se configura una vez con:
  `claude mcp remove chrome-devtools -s local; claude mcp add chrome-devtools -s local -- npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222`

**Ciclo de vida (decisión del dueño, 2026-09-10):** el navegador se abre al
empezar el QA de un desarrollo y se cierra cuando ese desarrollo ya está
desplegado en producción y verificado. No queda abierto de forma permanente.

**Con eso, en cada cambio Claude puede:** navegar a la vista previa del PR o a
producción, tocar botones, llenar formularios, leer la consola y la red, sacar
capturas, y comparar contra el spec. Los errores se ven ANTES del merge.

**Con qué usuario entra:** el usuario dedicado **"Claude · pruebas"** (rol
admin), creado con `scripts/crear-usuario-claude-qa.ts` (se puede correr las
veces que sea; no duplica). Sus datos de acceso viven en `.env.local`, fuera de
git. Todo lo que Claude hace en la plataforma queda a nombre de ese usuario, no
de una persona real. Para entrar sin tipear nada:
`scripts/navegador-claude-login.ts` genera un enlace de acceso de un solo uso y
lo abre en el navegador de Claude.

**Quién publica:** el push, el PR y el merge a `main` los hace Claude, nunca el
dueño. Requisito pendiente: la cuenta con la que `gh` está logueado
(`Sujupar97`) no es colaboradora del repo, así que hoy no puede abrir PRs (y sin
PR no hay vista previa). Es un ajuste único del dueño en GitHub.

**Límites que hay que saber:**
- **No hay base de datos de staging.** La vista previa de Netlify usa el MISMO
  Supabase de producción. Todo lo que Claude cree en el QA es un registro real:
  se marca `[TEST` y se borra al terminar, y las integraciones que mandan
  cosas (WhatsApp, email, Meta, portales) se prueban con sus modos de prueba.
  Si el volumen de pruebas crece, el paso siguiente es un proyecto Supabase
  de staging conectado a la vista previa.
- Lo único que Claude no puede verificar por vos: gastos reales (presupuesto
  en Meta Ads) y lo que llega a un celular real (WhatsApp).
