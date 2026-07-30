# Sistema Visual + Motion + Librería de Templates — Landing Pages Premium de Propiedades
## Diego Ferreyra Inmobiliaria · Director de Arte + Frontend Eng · v1.0

Este documento define el diferenciador de calidad del proyecto: cómo pasar de una landing que "parece portal" a una landing de conversión nivel Awwwards, implementada como **datos/config** (no hardcode), con un motor de motion respetuoso de Core Web Vitals, y un sistema de diseño que se **deriva de la propiedad y del avatar**. Cubre los dos niveles pedidos: (1) arquitectura de templates como config, (2) máxima calidad visual.

---

## 0. Principio rector: una landing NO es una ficha

La regla de oro que gobierna TODO lo que sigue:

> **Un portal RESPONDE preguntas (informa). Una landing PROVOCA una acción (convierte).**
> El portal existe para que el usuario compare N propiedades. La landing existe para que el usuario tome UNA decisión sobre UNA propiedad. Cada elemento que no empuja hacia el CTA es ruido.

Corolario operativo para este proyecto: la landing y la descripción de portal **comparten insumo** (`getOrGenerateBridgedDescription`) pero tienen **objetivos opuestos**. La misma materia prima se sirve fría en el portal y caliente en la landing.

---

## 1. Diagnóstico: por qué la landing actual "parece portal"

Análisis concreto de `app/p/[slug]/page.tsx` + `components/landing/*` contra la anatomía de conversión.

### 1.1 Los 7 pecados de la landing actual

| # | Síntoma en el código actual | Por qué lo hace parecer portal | Qué hace una landing de conversión |
|---|---|---|---|
| 1 | **Hero débil**: `LandingHero` = `photos[0]` + precio + dirección apilados. Es una tarjeta de listado agrandada. | El portal muestra precio/dirección arriba porque el usuario **compara**. | Hero full-screen cinematográfico. El precio NO es el protagonista; el **deseo** lo es. Precio aparece más abajo, contextualizado. |
| 2 | **Demasiadas secciones informativas paralelas**: Hero → Features → Gallery → Video → Tour → Description → Map → Form. 8 bloques del mismo peso visual. | Es un **índice de datos**, exactamente la estructura de una ficha de ML/ZonaProp. | Narrativa con jerarquía: 1 promesa → 1 prueba → 1 deseo → 1 fricción resuelta → 1 CTA. Máx 5-6 momentos, no 8 bloques planos. |
| 3 | **Sin jerarquía de conversión**: `LandingFeatures` (ambientes/m²/amenities) tiene el mismo peso que el `LandingLeadForm`. | El portal trata todos los atributos como iguales (filtrables). | La landing subordina TODO al CTA. El form no es "otra sección"; es el destino de una pendiente. |
| 4 | **Múltiples CTAs difusos / ninguno dominante**: el form está al fondo; no hay CTA sticky, ni CTA en hero, ni repetición estratégica. | El portal no tiene oferta: tiene un botón "contactar" genérico igual al de 500 avisos. | UNA oferta, UN verbo de resultado, repetido en 3 anclas (hero, mitad, cierre) + barra sticky mobile. |
| 5 | **Cero motion / cero cinematografía**: render estático server-side, sin scroll-reveal, sin parallax, sin transiciones. | Los portales son estáticos por diseño (velocidad de scaneo). | La landing premium usa el scroll como dispositivo narrativo (scroll-triggered reveals, parallax, image-sequence). El movimiento comunica calidad. |
| 6 | **Sin message match**: la landing no sabe de qué ad vino el usuario. `funnelType="otro"` hardcodeado (bug línea 86). Headline genérico = descripción de portal. | El portal no tiene origen publicitario; la landing SÍ, y desperdiciarlo mata la conversión. | Headline que **repite la promesa del ad** (continuidad de mensaje). El avatar define el ángulo. |
| 7 | **Navegación/distracciones**: aunque sea `/p/[slug]`, comparte el layout mental de "una propiedad más del catálogo". Sin prueba social above-the-fold (CUCICBA, casos). | El portal ES navegación pura. | Cero links de salida. Prueba social (CUCICBA 8266, "X familias asesoradas") visible sin scroll. |

### 1.2 La anatomía objetivo (6 elementos, investigación jul-2026)

Toda landing generada, sin importar el template, DEBE cumplir estos 6 invariantes (validables automáticamente en un linter de conversión — ver §7.4):

1. **Headline específico con message match** (matchea el copy del ad Meta que trajo al usuario).
2. **UNA oferta visible** (registrarse / pedir video-recorrido / agendar visita — nunca las tres compitiendo).
3. **Form de 3 campos o multi-step** (multi-step rinde +20-40%, hasta +743% en casos extremos).
4. **Prueba social above-the-fold** (CUCICBA 8266, casos reales, "matrícula habilitante").
5. **CTA orientado a resultado** ("Quiero conocerla", "Reservá tu recorrido privado" — NUNCA "Enviar").
6. **CERO navegación que distraiga** (sin menú, sin links de salida, sin footer con 20 enlaces).

Benchmark: 2.7-3.6% es la mediana; 5-10% es el objetivo premium.

---

## 2. Arquitectura de templates como DATA/CONFIG (no hardcode)

Este es el nivel estructural. El requisito clave del usuario: **"ver la propiedad en varios diseños y quedarse con el que más guste; siempre el mismo enlace final aunque cambien el diseño"** + **editor drag-and-drop**. Esto obliga a un modelo **schema-driven**: el diseño es una configuración, no un componente.

### 2.1 Modelo mental: Template = Preset + Theme + Section Tree

```
Landing (por propiedad, 1:1, slug estable)
├── template_id        → elige el PRESET (orden de secciones + comportamiento)
├── theme              → tokens de diseño derivados (paleta, tipografía, motion profile)
├── sections[]         → árbol EDITABLE (drag&drop) de bloques + props
├── content            → copy/imágenes/avatar (compartido entre templates)
└── utm_base           → estructura UTM (se crea con la landing, alimenta Meta)
```

**Clave de UX que pide el usuario:** cambiar `template_id` **re-mapea** `sections[]` a un nuevo preset pero **preserva `content`, `slug` y `utm_base`**. El enlace nunca cambia. El asesor "prueba diseños" = cambia `template_id` y ve el mismo contenido reflowado.

### 2.2 Nuevas columnas / tablas (SQL a correr en Dashboard — CLI no conecta)

No existen columnas `landing_*` hoy. Propuesta mínima, respetando que `properties.public_slug` ya es la fuente del enlace:

```sql
-- migración 20260710000001_landing_pages_builder.sql (correr a mano en Dashboard)
create table if not exists property_landings (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties(id) on delete cascade,
  template_id   text not null default 'editorial-directo',
  theme         jsonb not null default '{}'::jsonb,   -- tokens derivados (§6)
  sections      jsonb not null default '[]'::jsonb,   -- árbol editable (§2.4)
  content       jsonb not null default '{}'::jsonb,   -- copy/media/avatar snapshot
  avatar        jsonb,                                 -- avatar + mapa de empatía (§8)
  utm_base      jsonb not null default '{}'::jsonb,   -- estructura UTM (§9)
  status        text not null default 'draft'
                check (status in ('draft','ready','published')),
  published_at  timestamptz,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (property_id)          -- 1 landing por propiedad
);
alter table property_landings enable row level security;
-- políticas por rol siguiendo 20260505000001_rls_per_role_safe.sql
```

> **Decisión de esquema:** una sola fila por propiedad (`unique(property_id)`). Los "varios diseños" NO son filas distintas: son el mismo `content` re-renderizado bajo distintos `template_id` en el **preview**. Solo se persiste el elegido. Esto garantiza "mismo enlace final" por construcción y evita drift de contenido entre variantes.

> **Gate de deploy (skill anticipating-implementation-conflicts):** el `INSERT`/lectura de `property_landings` en la ruta de la landing debe tolerar que la tabla no exista todavía (patrón `try/catch` best-effort, como `syncPortalPropertyMap`) hasta que la migración corra en el Dashboard. Sin eso, `app/p/[slug]` rompe en prod. El `status='published'` es requisito para servir la landing (hoy el gate es `properties.status='approved'`; mantener AMBOS o migrar el gate).

### 2.3 Registry de templates (código, versionado, no en DB)

Los templates viven en código (revisables, type-safe), la DB solo guarda el `template_id` elegido y overrides. Patrón:

```
lib/landing/templates/
  registry.ts                → TEMPLATES: Record<TemplateId, TemplateDef>
  types.ts                   → TemplateDef, SectionDef, ThemeTokens, MotionProfile
  presets/
    cinematic-estate.ts
    warm-family.ts
    editorial-directo.ts
    lifestyle-video.ts
  sections/                  → componentes de sección, agnósticos del template
    HeroCinematic.tsx  HeroSplit.tsx  HeroVideoFull.tsx
    ProofBar.tsx  StorySection.tsx  GalleryMasonry.tsx
    GallerySequenceScroll.tsx  VideoShowcase.tsx  Tour3D.tsx
    ValueStack.tsx  LocationCinematic.tsx  LeadCapture.tsx  StickyCTA.tsx
```

```ts
// types.ts (esencia)
export interface TemplateDef {
  id: TemplateId;
  name: string;                    // "Cinemático · Estate"
  bestFor: string;                 // criterio de auto-sugerencia
  minPriceUsd?: number;            // heurística de recomendación
  requiresVideo?: boolean;         // false → adapta con image-sequence
  defaultSections: SectionDef[];   // preset inicial (editable después)
  themePreset: Partial<ThemeTokens>;
  motion: MotionProfile;           // §5.4
}

export interface SectionDef {
  key: string;                     // id estable para dnd-kit
  type: SectionType;               // 'hero' | 'proof' | 'story' | 'gallery' | ...
  variant: string;                 // 'cinematic' | 'split' | 'video-full'
  props: Record<string, unknown>;  // editable en el builder
  visible: boolean;
  motion?: SectionMotion;          // override por sección
}
```

**Por qué en código y no full-DB:** las secciones son componentes React con motion y CWV budget. Un JSON arbitrario en DB no puede renderizar `<HeroCinematic>` sin un mapa `type→component`. El editor drag&drop manipula el **árbol de `SectionDef`** (reordena, toggle `visible`, edita `props`), pero SIEMPRE contra un catálogo cerrado de secciones registradas. Esto da libertad al asesor SIN permitir romper el diseño ni inyectar HTML (seguridad + coherencia de marca).

### 2.4 Editor drag-and-drop (@dnd-kit ya instalado)

Reutilizar el stack que ya existe para fotos (`@dnd-kit/core+sortable+utilities`, mismo patrón que la galería de multimedia):

- **Canvas central**: preview live de la landing (iframe o render directo con `content` de draft). Toggle **Desktop / Mobile** (breakpoint 390px) — requisito explícito del usuario.
- **Panel izquierdo — Secciones**: lista sortable (`SortableContext`) del árbol `sections[]`. Cada item: drag handle, toggle `visible`, botón duplicar/eliminar. Reordenar = mutar array (mismo patrón "read-modify-write" de `properties.photos`, aceptando la limitación conocida de no-atomicidad — un asesor por landing).
- **Panel derecho — Inspector**: edita `props` de la sección seleccionada (texto inline, swap de imagen desde `properties.photos`, elegir video `video_url`/`video_file_url`, CTA copy, motion on/off). Los campos editables se declaran por sección (schema de props) → el inspector se genera solo, no se hardcodea por template.
- **Bloques disponibles**: "+ Agregar sección" abre un catálogo (las secciones registradas). Añadir/quitar elementos = requisito del usuario, cubierto por el catálogo cerrado.
- **Autosave**: `PATCH /api/properties/[id]/landing` (debounced) → `property_landings.sections/content`. Igual que el draft ML: usar `status='draft'`, NUNCA un estado que dispare publicación automática (lección `property_listings` `pending` vs `draft`).

> **No instalar Puck ni Craft.js.** El requisito ("añadir/quitar/reordenar secciones, editar texto/imagen/video, desktop+mobile") se cubre con `@dnd-kit` (ya instalado) + un inspector schema-driven. Puck/Craft.js aportan un editor de layout arbitrario que **contradice** el objetivo de "coherencia de marca y templates de alta conversión" — dan demasiada libertad para romper la conversión. Menos superficie, menos peso de bundle, cero dependencia nueva. Si en el futuro se quiere edición free-form, reevaluar Puck; hoy es sobre-ingeniería.

### 2.5 Preview de variantes ("elegir entre diseños, mismo enlace")

Flujo: pantalla **"Elegí el diseño"** con 3-4 tarjetas (thumbnail live de cada `template_id` aplicado al `content` real de ESTA propiedad). El asesor hace click → se aplica el preset (`defaultSections` del template mapeado sobre `content`) → cae en el editor. Cambiar de template después reflowa `content` al nuevo preset (con un diff no-destructivo: el copy editado se conserva por `type`, lo que no matchea queda en un "bloque huérfano" recuperable). El `slug` y `utm_base` nunca se tocan.

---

## 3. LIBRERÍA DE TEMPLATES (4 presets de alta conversión)

Cuatro templates, cada uno con un perfil de propiedad/avatar, orden de secciones, tratamiento visual y hook de conversión. Todos cumplen los 6 invariantes de §1.2. Todos adaptan CON/SIN video (§4).

---

### 3.1 `cinematic-estate` — "Cinemático · Estate"

**Para qué sirve:** propiedades de **alto valor** (USD ≥ 250k aprox — heurística `minPriceUsd`), pisos premium, casas con vista, unidades de pozo de categoría. Avatar: comprador aspiracional / inversor sofisticado. Es el buque insignia visual.

**Hook de conversión:** *deseo antes que dato*. El usuario cae en una experiencia cinematográfica; el precio y los m² aparecen recién cuando ya está emocionalmente comprado. CTA: **"Reservá tu recorrido privado"** (exclusividad).

**Orden de secciones:**
1. **HeroVideoFull / HeroCinematic** — full-screen. CON video: video de fondo muteado en loop (poster = `photos[0]`), overlay con headline message-match + CTA. SIN video: `photos[0]` en Ken Burns lento (scale 1.0→1.08, 20s) + parallax. Precio ausente aquí.
2. **ProofBar** — franja fina bajo el hero: "CUCICBA 8266 · Matrícula habilitante · Diego Ferreyra" + 1 métrica ("+120 familias asesoradas"). Above-the-fold parcial.
3. **StorySection ("El primer momento")** — copy emocional derivado del avatar (dolor→sueño). Foto grande a sangre, texto editorial. Scroll-reveal.
4. **GallerySequenceScroll** — la joya técnica: image-sequence tipo Apple AirPods. Las fotos de la propiedad se recorren scrolleando (pinned canvas), como una cámara que camina el ambiente. SIN video, ES el sustituto del video.
5. **ValueStack** — AQUÍ aparece el precio, contextualizado como "valor", junto a los 3-4 atributos-killer (no una tabla de 12 features: solo los que venden). Contra-tabla al portal.
6. **LocationCinematic** — mapa oscuro estilizado (no el pin de portal) + 3 pills de lifestyle del barrio (café, colegio, subte) derivadas del avatar.
7. **VideoShowcase / Tour3D** (si existen) — recorrido embebido, encuadrado como "viví el espacio".
8. **LeadCapture (multi-step)** — cierre. Paso 1: "¿Cuándo te gustaría conocerla?" (baja fricción). Paso 2: contacto. CTA de resultado.
9. **StickyCTA** (mobile) — barra inferior persistente "Reservá tu recorrido".

**Tratamiento visual:** tipografía display serif (Editorial New / Fraunces) para titulares + grotesque neutra (Inter/Söhne) para cuerpo. Paleta oscura derivada de las fotos (§6), acentos metálicos. Mucho aire, layouts a sangre, ritmo lento. Cursor custom opcional en desktop.

---

### 3.2 `warm-family` — "Cálido · Familiar"

**Para qué sirve:** **depto medio / casa de barrio / PH** para familias. Avatar: pareja joven buscando primer hogar, familia que agranda. El más "humano" y accesible.

**Hook de conversión:** *proyección de vida*. No vende metros, vende el domingo con mate en el balcón. CTA: **"Quiero conocerla con mi familia"** / **"Pedí el video-recorrido"**.

**Orden de secciones:**
1. **HeroSplit** — 60/40: foto luminosa a la izquierda, a la derecha headline cálido + CTA + micro-prueba social. Menos cinematográfico, más directo y contenido.
2. **ProofBar** — CUCICBA + "Financiación / escrituración asesorada".
3. **StorySection ("Tu próxima etapa")** — 3 momentos de vida ilustrados con fotos (living, cocina, exterior), copy en segunda persona.
4. **GalleryMasonry** — galería cálida, luz natural, reveal escalonado (stagger). CON video: card de video intercalada. SIN video: masonry pleno.
5. **ValueStack** — precio + expensas + m² + ambientes en tarjetas amables (iconografía redondeada). Transparencia = confianza para este avatar.
6. **LocationCinematic (variant "friendly")** — mapa claro + "a X cuadras de: colegios, plaza, subte" (relevante a familia).
7. **VideoShowcase** (si hay).
8. **LeadCapture (multi-step, 2 pasos)** — "¿Buscás para vivir o invertir?" → contacto.
9. **StickyCTA**.

**Tratamiento visual:** tipografía humanista cálida (Recoleta / Fraunces soft para títulos, Inter para cuerpo). Paleta clara y cálida (beige/terracota/verde derivados de las fotos si son luminosas). Bordes suaves, sombras difusas, sensación acogedora. Motion suave (nada agresivo).

---

### 3.3 `editorial-directo` — "Editorial · Directo" (DEFAULT)

**Para qué sirve:** **conversión rápida / oportunidad / propiedad estándar** donde importa velocidad de decisión y volumen de leads. Es el default (`template_id` inicial). El más "landing de performance".

**Hook de conversión:** *fricción mínima, oferta clarísima*. Menos poesía, más "esta es la oportunidad, acá está el botón". CTA arriba y repetido. CTA: **"Quiero más info ahora"** / **"Registrate para ver el recorrido"**.

**Orden de secciones:**
1. **HeroSplit (variant "punchy")** — foto + headline con el gancho más fuerte (precio/oportunidad si es competitivo) + CTA visible sin scroll + form corto embebido o botón que abre modal.
2. **ProofBar** — CUCICBA + urgencia sutil ("consultas en las últimas 24h" si hay dato real; si no, matrícula).
3. **ValueStack (arriba, no al fondo)** — los 3 datos que cierran la decisión, temprano.
4. **GalleryMasonry (compacta)** — 6-8 fotos, reveal rápido. CON video: video primero.
5. **StorySection (corta, 1 bloque)** — un solo argumento de deseo, no tres.
6. **LocationCinematic (simple)**.
7. **LeadCapture** — form directo de 3 campos (o multi-step de 2). Segundo CTA.
8. **StickyCTA** (desktop + mobile — este template lo usa en ambos).

**Tratamiento visual:** tipografía grotesque potente (Inter / Söhne / Aeonik), alto contraste, títulos grandes y directos. Paleta con 1 acento vibrante derivado de la foto para el CTA (que el botón "grite"). Ritmo rápido, secciones más cortas, densidad de información controlada. Motion mínimo y funcional (no distrae del CTA).

---

### 3.4 `lifestyle-video` — "Lifestyle · Video-first"

**Para qué sirve:** propiedades **con video de calidad** (archivo `video_file_url` o `video_url`) o tour 3D. Avatar: cualquiera, pero la pieza fuerte es el video. Es el template que exprime el activo audiovisual.

**Hook de conversión:** *inmersión audiovisual*. El video es el héroe absoluto. CTA: **"Agendá tu visita"** / **"Viví el recorrido completo"**.

**Orden de secciones:**
1. **HeroVideoFull** — video a pantalla completa como protagonista (autoplay muted loop, click-to-play con sonido — patrón click-to-play ya en memoria `optimizacion_landings_analytics`). Headline overlay + CTA. Si NO hay video → este template NO se sugiere (o cae a `cinematic-estate` con image-sequence).
2. **ProofBar**.
3. **VideoShowcase** — el video completo con sonido, encuadrado. Si es `video_file_url` (archivo) → `<video>` nativo con controles custom; si es `video_url` → embed. **Fix pendiente:** la landing hoy NO renderiza `video_file_url` — este template lo requiere (ver §4.3).
4. **StorySection**.
5. **GallerySequenceScroll o Masonry** — complemento visual.
6. **Tour3D** (si hay) — iframe embebido.
7. **ValueStack**.
8. **LocationCinematic**.
9. **LeadCapture (multi-step)**.
10. **StickyCTA**.

**Tratamiento visual:** dark cinematográfico, tipografía condensada elegante, controles de video custom (barra de progreso fina, botón mute), transiciones tipo corte de cine entre secciones. Paleta derivada del frame del video (poster).

---

### 3.5 Matriz de decisión (auto-sugerencia del template)

El sistema **sugiere** (no impone) un template al crear la landing, según señales de la propiedad:

| Señal | Template sugerido |
|---|---|
| Precio USD ≥ ~250k, pocas fotos pero HD, o "pozo premium" | `cinematic-estate` |
| Tipo = PH/casa/depto ≤ 3 amb, barrio residencial, fotos luminosas | `warm-family` |
| Precio competitivo / "oportunidad", muchas fotos, foco en volumen de leads | `editorial-directo` (default seguro) |
| Tiene `video_file_url` o `video_url` de calidad, o `tour_3d_url` | `lifestyle-video` |

El asesor SIEMPRE puede overridear en la pantalla "Elegí el diseño". El avatar (§8) afina la sugerencia: un avatar "inversor" empuja a `cinematic`, uno "primera vivienda" a `warm-family`.

---

## 4. Adaptación CON video / SIN video (automática)

Requisito duro del usuario. La regla se resuelve en el **section-mapper** (al aplicar un template): cada sección declara `mediaRequirements` y el mapper elige la `variant` según lo disponible en la propiedad.

### 4.1 Fuentes de media disponibles (del scouting)
- `properties.photos[]` — siempre (el orden es la verdad; `photos[0]` = portada).
- `properties.video_url` — embed externo (YouTube/Vimeo). HOY se renderiza en `LandingVideoEmbed`.
- `properties.video_file_url` — **archivo subido, HOY NO renderizado en la landing** (gap conocido en el scouting). Los templates video-first lo requieren.
- `properties.tour_3d_url` — iframe (validado `https://` server-side, anti-XSS).

### 4.2 Regla de adaptación por sección

| Sección | CON video | SIN video |
|---|---|---|
| **Hero** | `HeroVideoFull` (video muted loop, poster=`photos[0]`) | `HeroCinematic` (Ken Burns + parallax sobre `photos[0]`) |
| **Recorrido** | `VideoShowcase` (archivo `<video>` o embed) | `GallerySequenceScroll` (image-sequence pinned = "video sintético" con las fotos) |
| **Galería** | `GalleryMasonry` (video como card destacada) | `GalleryMasonry` full / `GallerySequenceScroll` |
| **Tour 3D** | `Tour3D` si `tour_3d_url` | oculta si no hay |

**Insight clave:** SIN video, la técnica **image-sequence scroll** (canvas que dibuja fotos secuenciales al scrollear, técnica Apple AirPods documentada en `scroll_animation_stack.md`) da la sensación cinematográfica que da el video, usando solo `photos[]`. Es el gran igualador: una propiedad sin video igual se ve premium.

### 4.3 Gap a cerrar (implementación)
`components/landing/` debe ganar `VideoShowcase` que soporte `video_file_url` con `<video>` nativo (hoy solo hay `LandingVideoEmbed` para `video_url`). Poster = `photos[0]`, `preload="none"` (CWV), click-to-play para sonido (patrón ya en memoria). Sin esto, `lifestyle-video` y el hero-video no funcionan con archivos subidos.

---

## 5. STACK DE MOTION

### 5.1 Qué instalar (concreto, sin sobre-ingeniería)

Alineado a la memoria `scroll_animation_stack.md`:

```bash
npm i gsap lenis   # framer-motion 12 ya está
```

- **framer-motion 12 (ya instalado)** → micro-interacciones, reveals declarativos por componente (`whileInView`, `AnimatePresence`), hover del CTA, transiciones del editor. Es el 70% del motion.
- **GSAP + ScrollTrigger (instalar)** → SOLO para lo que framer no hace bien: **scroll-pinned image-sequence** (canvas), **parallax multicapa** con scrub, **timelines complejas** ancladas al scroll. GSAP es gratis para uso comercial estándar desde 2024 (Webflow lo liberó) — confirmar licencia vigente antes de commit.
- **Lenis (instalar)** → smooth-scroll de una sola línea que hace que TODO se sienta premium (el "peso" del scroll tipo Apple). Se integra con ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)`).
- **NO instalar** R3F/Three/Spline por ahora. El 3D real (memoria `scroll_animation_stack`) es Fase futura; para landings de propiedades el image-sequence + parallax ya da nivel Awwwards sin el costo de bundle/CWV de WebGL. Reevaluar solo para el template `cinematic-estate` de propiedades ultra-premium.

### 5.2 ¿Skill de motion graphics?

**Recomendación: NO instalar un skill de motion nuevo.** El proyecto ya tiene `frontend-design` (Skill disponible) para la calidad de código frontend, y la memoria `scroll_animation_stack.md` ya documenta el stack. Las skills de video (`remotion`, `Higgsfield`, Premiere MCP) son para **producir video**, no para animar el DOM de una landing — fuera de scope. Usar `frontend-design` skill al implementar las secciones, y `webquality-core-web-vitals` / `cognymkt-cwv-audit` como skill de verificación de performance. Cero skill nuevo.

### 5.3 Animaciones concretas por sección

| Sección | Animación | Herramienta | Trigger |
|---|---|---|---|
| **Hero (foto)** | Ken Burns lento (scale 1→1.08, 20s ease-linear) + parallax del texto (y: 0→-60 en scroll) | GSAP scrub + CSS | scroll |
| **Hero (video)** | fade-in del overlay + CTA con `spring`; video `object-cover` con leve parallax | framer + GSAP | mount + scroll |
| **ProofBar** | slide-up sutil al entrar; el número de métrica **cuenta** (0→120) | framer `whileInView` + count-up | in-view |
| **StorySection** | reveal por líneas (mask/clip-path, stagger 0.08s); foto con parallax opuesto al texto | GSAP SplitText-like + scrub | scroll |
| **GallerySequenceScroll** | **image-sequence pinned**: canvas dibuja frame N según progreso del scroll (técnica AirPods) | GSAP ScrollTrigger pin + scrub, canvas 2d | scroll |
| **GalleryMasonry** | reveal escalonado (opacity 0→1, y 24→0, stagger 0.06); hover zoom 1.03 | framer `staggerChildren` | in-view |
| **ValueStack** | tarjetas entran con stagger; precio con count-up + subrayado que se dibuja | framer + GSAP draw | in-view |
| **LocationCinematic** | mapa fade + pills que aparecen en cascada; línea que "viaja" al pin | framer + GSAP | in-view |
| **VideoShowcase** | scale-in del frame (0.96→1) al entrar; scrim que se disuelve al play | framer | in-view + click |
| **LeadCapture** | multi-step con transición horizontal (`AnimatePresence`); barra de progreso animada | framer | interacción |
| **StickyCTA** | aparece tras pasar el hero (translateY spring); pulso sutil del botón cada 8s | framer + `useScroll` | scroll threshold |
| **Global** | smooth-scroll con inercia | Lenis | siempre |

### 5.4 Motion profiles (config por template)

El motion es config, no hardcode. Cada template declara un `MotionProfile`:

```ts
interface MotionProfile {
  intensity: 'subtle' | 'balanced' | 'cinematic';
  smoothScroll: boolean;          // Lenis on/off
  imageSequence: boolean;         // habilita el pinned canvas
  parallax: 'off' | 'light' | 'multi';
  revealStyle: 'fade' | 'slide' | 'mask';
  staggerBase: number;            // s
}
```

- `cinematic-estate` → `cinematic`, smoothScroll on, imageSequence on, parallax multi, reveal mask.
- `warm-family` → `balanced`, smoothScroll on, parallax light, reveal slide.
- `editorial-directo` → `subtle`, smoothScroll off (velocidad de conversión > estética), parallax off, reveal fade.
- `lifestyle-video` → `cinematic`, smoothScroll on, parallax light, reveal fade (el video ya aporta el movimiento).

### 5.5 Presupuesto de performance (no negociable)

Objetivos: **LCP < 2.5s, INP < 200ms, CLS < 0.1, 60fps** en scroll. Reglas de implementación:

1. **SSR + hydrate**: la landing es Server Component (como hoy). El contenido crítico (hero headline, foto LCP, CTA, ProofBar) se **server-rendea**; el motion **hidrata después**. SEO intacto (el texto está en el HTML inicial).
2. **LCP = foto del hero**: `next/image` con `priority`, `fetchpriority=high`, formato AVIF/WebP, `sizes` correcto. El video del hero **nunca** es el LCP (`preload="none"`, poster server-rendered es lo que pinta primero).
3. **GSAP/Lenis cargan lazy**: `dynamic(() => import(...), { ssr: false })` para los componentes con motion pesado; ScrollTrigger se registra client-side post-hydrate. El bundle de motion NO bloquea el first paint.
4. **image-sequence**: precargar frames en `requestIdleCallback`, dibujar en canvas (no N `<img>` en DOM), throttle al `rAF`. Degradar a galería estática en conexiones lentas (`navigator.connection.saveData`).
5. **CLS**: toda imagen/video con `width`/`height` o `aspect-ratio` reservado. Fuentes con `font-display: swap` + `size-adjust` para evitar reflow.
6. **`prefers-reduced-motion`**: fallback obligatorio. Con reduced-motion → sin parallax, sin image-sequence (galería estática), reveals reducidos a fade instantáneo, Lenis off. Un solo hook `useMotionAllowed()` que todas las secciones consultan.
7. **INP**: nada de layout thrashing en scroll handlers; todo scroll-driven pasa por ScrollTrigger (batch/rAF interno) o `useScroll` de framer (composited). CTA y form responden < 200ms (sin trabajo pesado en el click).
8. **Verificación real solo en navegador** (lección PDFViewer del CLAUDE.md: tsc/build no detectan crashes de runtime). Correr Lighthouse + `webquality-core-web-vitals` skill sobre una landing real antes de declarar hecho.

---

## 6. SISTEMA DE DISEÑO DERIVADO DE LA PROPIEDAD

El diferenciador "cada landing se siente hecha a mano" sin trabajo manual: los tokens se **derivan** de las fotos y del avatar.

### 6.1 Extracción de paleta desde las fotos

- **Cuándo**: al crear/actualizar la landing (server-side, cacheado en `property_landings.theme`).
- **Cómo**: sobre `photos[0]` (portada) + 2-3 fotos clave, extraer paleta dominante. Opciones de implementación:
  - **Ligera (recomendada)**: `node-vibrant` o quantización propia (median-cut) en una Netlify Function / route al crear la landing. Cachear el resultado. Barato, sin costo de IA.
  - **Con IA (opcional, ya hay Gemini Vision en el pipeline)**: pedir a Vision "extraé 5 colores de marca y el mood (cálido/frío/neutro/lujoso)". Más caro; usar solo si se quiere el "mood" semántico.
- **Salida** (`theme.palette`): `{ dominant, accent, neutralDark, neutralLight, ctaColor }`. Reglas:
  - Fondo: derivado del neutral dominante (oscuro para `cinematic`/`lifestyle`, claro para `warm`/`editorial`).
  - Acento/CTA: el color más saturado y **con contraste AA garantizado** (validar WCAG 2.2; skill `webquality-accessibility`). Si el color extraído no pasa contraste, ajustar luminancia hasta que pase — el CTA SIEMPRE legible.
  - Guardarraíl: la paleta derivada modula pero NO reemplaza la **marca Diego Ferreyra** (§6.4). Los acentos de marca siempre presentes en logo/ProofBar.

### 6.2 Tipografía por perfil de avatar

El pairing tipográfico se elige según el `template_id` (que a su vez deriva del avatar):

| Perfil / template | Display (títulos) | Cuerpo | Sensación |
|---|---|---|---|
| `cinematic-estate` (aspiracional/inversor) | Serif editorial (Fraunces / Editorial New) | Grotesque neutra (Inter / Söhne) | Lujo, exclusividad |
| `warm-family` (familia/primera vivienda) | Humanista suave (Recoleta / Fraunces soft) | Inter | Calidez, confianza |
| `editorial-directo` (conversión rápida) | Grotesque potente (Aeonik / Söhne / Inter Display) | Inter | Claridad, urgencia |
| `lifestyle-video` (inmersivo) | Condensada elegante (Anton controlada / Fraunces) | Inter | Cine, ritmo |

Implementación: fuentes vía `next/font` (self-host, cero request externo, `font-display: swap`, subsetting latin). Tokens `theme.typography = { displayFamily, bodyFamily, scale }`. Escala tipográfica fluida con `clamp()` (responsive desktop↔mobile sin breakpoints duros).

### 6.3 Tokens como capa única (Tailwind 4)

Tailwind 4 usa CSS-first config (`@theme`). Los tokens derivados se inyectan como **CSS variables** en el `<html>` de la landing (server-side, desde `property_landings.theme`):

```html
<html style="--ld-bg:#0e0d0c; --ld-accent:#c9a15a; --ld-cta:#c9a15a; --ld-fg:#f5f2ec; ...">
```

Las secciones usan `var(--ld-*)` vía utilidades Tailwind (`bg-[var(--ld-bg)]`). Un solo punto de verdad; cambiar template/paleta = cambiar variables, sin recompilar. Compatible con el reset mínimo y con dark/light. Esto también aísla la landing del theme del dashboard (no contamina).

### 6.4 Coherencia de marca Diego Ferreyra (invariante)

Sobre la paleta derivada, elementos de marca que NUNCA cambian:
- **Logo Diego Ferreyra** en hero (esquina) — versión clara/oscura según fondo.
- **CUCICBA 8266** siempre visible (ProofBar) — es prueba social Y requisito legal de credibilidad.
- **Firma del asesor**: foto + nombre del asesor asignado (`assigned_to`) en LeadCapture (humaniza, aumenta conversión). Ya existe `advisorPhotoUrl` en el pipeline PDF — reutilizable.
- **Tono de voz**: derivado del "GPT Portales" system prompt existente, pero recalibrado a conversión (imperativo, segunda persona, beneficio > feature). El copy lo genera el mismo `chatCompletion` que la descripción, con un system prompt de landing (no de portal).
- **Grid/espaciado base** compartido (ritmo de 8px) para que las 4 plantillas se sientan de la misma casa.

---

## 7. Integración con el sistema existente (puentes, no reescritura)

### 7.1 La descripción de portal como insumo
`getOrGenerateBridgedDescription()` (`portal-description-bridge.ts`) alimenta el `content` de la landing (title/subtitle/body). Pero la landing NO muestra la descripción cruda (eso la haría parecer portal): el generador de landing **reescribe** ese insumo en (a) headline message-match, (b) copy de StorySection según avatar, (c) ValueStack de 3-4 killers. Mismo motor `chatCompletion`, distinto system prompt ("GPT Landing Conversión" vs "GPT Portales"). El mismo insumo sirve a landing Y campaña (requisito).

### 7.2 Slug estable (mismo enlace siempre)
`ensurePublicSlug()` ya asigna `public_slug` atómicamente. Hoy solo se dispara al publicar en portal / admin. **Nuevo disparo**: al pasar la landing a `status='ready'`, llamar `ensurePublicSlug()`. El slug es del `properties`, independiente del `template_id` → cambiar diseño jamás cambia el enlace. `/p/[slug]` sirve la landing publicada leyendo `property_landings` + `properties`.

### 7.3 Fix del bug `funnelType="otro"`
`LandingVisitTracker` (línea 86) hardcodea `funnelType="otro"`. La landing debe pasar el `funnel_type` real (derivado del `utm_base` o de la campaña asociada) para atribución correcta. Trivial pero afecta métricas de embudo.

### 7.4 Linter de conversión (gate de calidad)
Antes de permitir `status='ready'`, un validador chequea los 6 invariantes de §1.2: ¿hay exactamente 1 oferta/CTA dominante? ¿headline no vacío y ≠ descripción cruda? ¿form ≤ 3 campos o multi-step? ¿ProofBar con CUCICBA presente? ¿cero links de salida? ¿imagen LCP con priority? Si falla, warning en el editor. Esto codifica "no vuelvas a parecer portal".

---

## 8. Avatar + Mapa de Empatía (co-creación, Fase 1)

El avatar actual (`buyer-avatar-generator.ts`) es básico (sin empathy map). Extensión requerida:

```ts
interface BuyerAvatarV2 extends BuyerAvatar {
  empathyMap: {
    says: string[];     // qué dice ("busco algo luminoso para mis hijos")
    thinks: string[];   // qué piensa ("¿me alcanzará el crédito?")
    feels: string[];    // qué siente (ilusión, ansiedad, urgencia)
    does: string[];     // qué hace (visita portales de noche, compara)
  };
  pains: string[];      // dolores (fricción, miedo, incertidumbre)
  gains: string[];      // ganancias (el sueño, el alivio, el status)
}
```

**Co-creación (no la IA sola):** flujo de preguntas. La IA lee la propiedad (fotos + descripción + barrio + precio) y **propone** un avatar + empathy map, luego **pregunta al asesor** 2-4 cosas concretas ("¿es más para vivir o invertir?", "¿qué te dicen los interesados que más valoran?"). Con las respuestas refina (reutiliza `optimize-avatar` que ya existe). El avatar aprobado se persiste en `property_landings.avatar` y **alimenta**: (a) elección de template, (b) tono del copy, (c) ángulo del headline, (d) en Fase 2, el targeting/copy de Meta. **Un solo avatar, creado en la landing, reutilizado en la campaña** — resuelve la duplicación actual (el wizard Meta hoy genera avatares aparte).

---

## 9. Base estructural de UTMs (creada con la landing, conectada a Meta)

Requisito: al crear la landing se crea la **estructura UTM** que Meta consume. Hoy las UTM se construyen en `meta-campaign-builder.ts:395-409` al montar la campaña. Se invierte el orden:

- Al crear la landing → persistir `utm_base` en `property_landings`:
  ```json
  {
    "source": "meta", "medium": "paid_social",
    "campaign": "propiedad_<slug>",
    "content_macro": "{{ad.id}}", "term_macro": "{{placement}}",
    "landing_url": "{APP_URL}/p/<slug>"
  }
  ```
- El wizard Meta (Fase 2) **lee** `utm_base` de la landing en vez de construirlo → una sola fuente de verdad, imposible desincronizar landing↔ad. El smoke-test previo a activar (builder:800) verifica la landing publicada.
- `landing_page_visits` (ya existe) captura las UTM resueltas; atribución first-touch (`lib/funnel/attribution.ts`) intacta. Cierra el loop: ad → UTM → landing → lead → CRM.

---

## 10. Cómo esto habilita la Fase 2 (gate landing→campaña)

Consecuencia directa del diseño: **la campaña Meta requiere landing publicada**. El router `.../marketing/meta-ads/page.tsx` chequea `property_landings.status='published'`; si no existe → bloquea y manda a `/marketing/landing`. El avatar y las UTM ya están (creados en la landing) → el wizard v2 se simplifica: selección de avatar = elegir el ya creado (ajustar / ver propuestas), UTM = leídas, y solo quedan imágenes (gpt-image-2) + geo + presupuesto. Esto también arregla el bug de presupuesto (confirm/route.ts:272 debe pasar `dailyBudgetArs` sin re-multiplicar antes de builder:664 — el blindaje "un cero de más" se valida en el linter del wizard, no en este documento de diseño, pero el flujo resumable de la landing establece el patrón de guardado incremental que la Fase 2 replica).

---

## 11. Resumen de entregables de implementación (orden sugerido)

1. **SQL**: `property_landings` (correr en Dashboard antes de deploy; gate best-effort en la ruta).
2. **Registry de templates** (`lib/landing/templates/`): 4 presets + catálogo de secciones + tipos.
3. **Secciones nuevas/refactor** (`components/landing/`): `HeroCinematic`, `HeroVideoFull`, `HeroSplit`, `ProofBar`, `StorySection`, `GallerySequenceScroll`, `GalleryMasonry`, `ValueStack`, `LocationCinematic`, `VideoShowcase` (con soporte `video_file_url`), `LeadCapture` (multi-step), `StickyCTA`.
4. **Motion**: instalar `gsap` + `lenis`; `useMotionAllowed()`; wrappers `dynamic()`; motion profiles por template.
5. **Design system**: extracción de paleta (server, cacheada en `theme`), `next/font` pairings, tokens como CSS vars.
6. **Editor drag&drop** (`@dnd-kit`): canvas preview desktop/mobile + panel secciones + inspector schema-driven + autosave `status='draft'`.
7. **Puentes**: bridge de descripción → copy de landing; `ensurePublicSlug` al `ready`; fix `funnelType`; `utm_base`; avatar V2 con empathy map.
8. **Gates**: linter de conversión (6 invariantes) + verificación CWV real en navegador (Lighthouse) antes de `published`.

**Verificación (no negociable):** el motion y CWV solo se validan en navegador real (lección PDFViewer). Correr Lighthouse sobre una landing publicada real y confirmar LCP<2.5s / INP<200ms / CLS<0.1 antes de declarar hecho. Commits como `Sujupar <redstyle50@gmail.com>`.

---

**Archivos ancla (rutas absolutas) para implementar:**
- `/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria/app/p/[slug]/page.tsx` (landing pública — fix `funnelType`, leer `property_landings`)
- `.../components/landing/` (secciones — refactor a catálogo)
- `.../lib/landing/templates/` (registry NUEVO)
- `.../lib/landing/slug.ts` + `assign-slug.ts` (slug estable — nuevo disparo en `ready`)
- `.../lib/marketing/portal-description-bridge.ts` (insumo de copy)
- `.../lib/marketing/buyer-avatar-generator.ts` (extender a `BuyerAvatarV2` + empathy map)
- `.../lib/marketing/meta-campaign-builder.ts:395-409` (UTM → leer de `utm_base`)
- Migración NUEVA `supabase/migrations/20260710000001_landing_pages_builder.sql` (correr en Dashboard)
