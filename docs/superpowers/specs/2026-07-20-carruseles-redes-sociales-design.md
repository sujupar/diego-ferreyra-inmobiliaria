# Sistema de Carruseles para Redes Sociales — Design Doc

**Fecha:** 2026-07-20
**Estado:** Fase 0 aprobada (dirección visual + estructura + pipeline). Fase 1 pendiente de referencias.
**Storyboard de referencia:** artifact `e9d94c6e-741f-4bf1-ab79-a2721c4c9c79`

---

## 1. Contexto y objetivo

Nueva sección de la plataforma — **"Redes Sociales"** — para generar carruseles de Instagram/Meta con
identidad de marca y estructura estratégica. Dos usos:

1. **Campañas publicitarias** (CTA de conversión: "Solicitá tu tasación profesional").
2. **Orgánico en Instagram** (CTA de comentario: "Comentá TASACIÓN").

El sistema se construye en dos fases deliberadas:

- **Fase 0 (ahora, en el chat):** sentar las bases conceptuales generando 2–3 carruseles completos
  aprobados a mano. Estos quedan como **referencia base** (few-shot) del sistema.
- **Fase 1 (después):** sección interna en el dashboard que, a partir de un input (tema + plantilla +
  tipo de CTA), genera carruseles con la voz e identidad de marca ya entrenadas.

Motor de IA: **API de OpenAI** (texto + imagen). NO usar Gemini para esto (el codebase ya usa Gemini para
las piezas de Meta Ads; este sistema es paralelo y con OpenAI por decisión del usuario).

## 2. Alcance

### En alcance
- Arquitectura de generación híbrida por capas (escena IA + texto determinístico).
- Sistema de marca portable (tokens de color/tipografía/formato).
- Biblioteca de estructuras narrativas ("plantillas"), empezando por **Aversión a la pérdida**.
- El primer carrusel completo: 5 slides, concepto "casi pierde USD 16.000".
- Anatomía del prompt por imagen, con bloque de preservación facial de Diego.
- Pipeline técnico Fase 0 (scripts de generación en el repo).

### Fuera de alcance (Fase 0)
- La UI de la sección "Redes Sociales" (es Fase 1).
- Publicación automática en Instagram/Meta (se exporta PNG; la publicación es manual por ahora).
- Video / reels (solo carruseles estáticos).

### No hacer
- NO hornear el texto dentro de la imagen de IA (perdería el control tipográfico — ver §3).
- NO hardcodear la API key en el código ni commitearla (solo env vars).
- NO inventar testimonios con cliente real nombrado (política de Meta — ver §10).

## 3. Arquitectura de generación (decisión central)

**Híbrido por capas.** Los modelos de imagen escriben mal el texto, no respetan la tipografía de marca ni
los hex exactos ni los márgenes de Instagram, y drifteán la cara. Por eso separamos:

```
CAPA 2  Texto / tipografía / color / márgenes / logo / CTA   → determinística (satori→resvg→PNG)
CAPA 1  Escena fotográfica CON Diego                          → IA (gpt-image-1 + foto de referencia)
────────────────────────────────────────────────────────────────────────────────────────────────
Composición final 1080×1350 (4:5)                            → sharp
```

- **Diego se genera por IA** con su foto como referencia (opción elegida: más variedad de poses/contextos)
  + una sección de prompt anti-alteración facial (§7). Fidelidad esperada ~90%; se descarta y regenera el
  slide si la cara driftea.
- **El texto NUNCA lo genera la IA.** Se compone encima con satori usando Montserrat/Lato reales.

Esto entrega las dos exigencias simultáneas del usuario: **escena fotográfica realista de Diego** +
**control absoluto de texto/tipografía/márgenes/colores**.

## 4. Sistema de marca (tokens)

Tomado de la landing de Tasación en producción (`Landing Tasación.md`).

| Token | Hex | Uso |
|-------|-----|-----|
| Navy primario | `#0D2D49` | Fondo de slides oscuros, títulos sobre claro |
| Navy profundo | `#071B2E` | Degradados de fondo |
| Verde CTA | `#00BF63` | Botones, acentos, números clave |
| Off-white | `#F6F8FA` | Fondo de slides claros |
| Tinta | `#12212F` | Texto sobre claro |

- **Tipografías:** Montserrat (600–800, títulos) + Lato (400–700, cuerpo). Se embeben como woff2/ttf
  locales para satori (no CDN).
- **Formato:** 4:5 · **1080×1350** (óptimo para feed de IG y Meta). Zona segura ~72px de margen.
- **Gramática de ritmo:** slides con Diego = fondo oscuro (navy); slides de texto/idea = fondo claro.
  Alternancia oscuro/claro/oscuro/claro/oscuro para dar aire y sinergia.
- **Constantes de coherencia entre slides:** mismo color grade, mismo vestuario de Diego (saco navy +
  camisa blanca), misma posición de logo (footer izq.) y paginador (`0X / 05`, arriba der.), misma
  señal de swipe.

## 5. Estructura narrativa — biblioteca de plantillas

Cada carrusel sigue una estructura reutilizable. En Fase 1 será un selector de plantilla.

### Plantilla "Aversión a la pérdida" (la primera)

| # | Tiempo | Rol | Qué hace |
|---|--------|-----|----------|
| 1 | Gancho | Atención | Número/escena que frena el scroll y abre un bucle |
| 2 | Reencuadre | Tensión | Rompe la creencia central |
| 3 | Desarrollo | Prueba | Dónde se fuga la plata, en concreto → sensación de método |
| 4 | Testimonio | Confianza | Caso representativo con cifras |
| 5 | Llamado | Acción | Una sola acción; cierra el bucle del slide 1 |

Otras plantillas previstas (Fase 1, no especificadas aún): "Objeción", "Caso real con números",
"Educativo / mito vs dato".

## 6. El primer carrusel — copy y escena por slide

Concepto: **el precio de venta no importa; importa cuánta plata te queda en la mano.** Cifra ilustrativa
USD 16.000. Testimonio representativo (rotulado como tal).

### Slide 1 — Gancho (oscuro, Diego presente)
- Eyebrow: `LO QUE NADIE TE CUENTA AL VENDER`
- Número ancla: `USD 16.000`
- Título: "Casi los regala en la venta de su departamento."
- Bajada: "Y no fue por el precio de venta."
- Footer: logo + `Deslizá →` · paginador `01 / 05`
- **Escena IA:** Diego a cámara, gesto de preocupación/seriedad contenida, oficina inmobiliaria
  desenfocada, luz lateral suave. Espacio negativo a la izquierda para el texto.

### Slide 2 — Reencuadre (claro, sin Diego)
- Eyebrow: `EL ERROR MÁS CARO`
- Título: "El precio de venta no es lo que importa." + "Importa cuánto te queda en la mano." (2ª línea verde)
- Cuerpo: "Podés vender 'caro' y aun así perder. Del precio de cierre salen comisiones, impuestos, gastos
  de escritura y honorarios. Lo único que cuenta es tu neto."
- **Escena IA:** ninguna (fondo claro de marca). Opcional: textura sutil / gráfico de flechas.

### Slide 3 — Desarrollo (oscuro, sin Diego o Diego chico)
- Eyebrow: `DÓNDE SE VAN LOS USD 16.000`
- Título: "No se pierden en el precio. Se pierden acá:"
- Lista (4):
  1. No saber a cuánto **cierra** tu manzana (no a cuánto se publica).
  2. Aceptar la primera oferta por apuro o miedo.
  3. No blindar la escritura, los impuestos y el boleto.
  4. Vender contra el reloj, sin estrategia de timing.
- **Escena IA:** fondo navy con textura arquitectónica sutil (opcional).

### Slide 4 — Testimonio (claro)
- Eyebrow: `LO QUE CAMBIA CON ESTRATEGIA`
- Cita: "Iba a aceptar USD 184.000. Me dijeron: esperá. Cerré en USD 200.000, con la escritura limpia y
  sin negociar contra el reloj."
- Atribución: "Propietario en CABA · caso representativo"
- **Escena IA:** ninguna (tarjeta de cita). Opcional: retrato genérico difuminado (no cliente real).

### Slide 5 — Llamado (oscuro, Diego presente)
- Eyebrow: `ANTES DE VENDER`
- Título: "Sabé cuánto te queda **realmente** en la mano."
- Bajada: "Análisis de precio estratégico con Diego Ferreyra."
- Botón: **Solicitá tu tasación profesional** (verde). Variante orgánica: "Comentá TASACIÓN".
- Footer: logo `DIEGO FERREYRA · INMOBILIARIA` · paginador `05 / 05`
- **Escena IA:** Diego a cámara, gesto de confianza/apertura (sonrisa sobria), luz cálida, oficina.
  Espacio negativo para texto + botón.

## 7. Anatomía del prompt por imagen (Capa 1)

Cada escena se genera con un prompt de **8 secciones fijas**:

1. **Escena y contexto** — qué pasa y dónde; define la emoción del tiempo narrativo.
2. **Sujeto (Diego)** — foto de referencia + pose y gesto corporal según el slide.
3. **Encuadre + zona de texto** — reserva el espacio negativo donde va la Capa 2 (clave para la sinergia).
4. **Luz y estilo fotográfico** — lente, dirección de luz, profundidad; editorial, sobrio, premium.
5. **Paleta / color grade** — armoniza con navy + verde; consistente en los 5 slides.
6. **Preservación facial — CRÍTICO** (ver bloque abajo).
7. **Negativos** — sin texto en la imagen, sin logos, sin deformaciones, sin manos/dedos extra.
8. **Técnicos** — relación de aspecto, resolución, zona segura de Instagram.

### Bloque 6 — Preservación de identidad (verbatim, no negociable)

```
El sujeto es Diego Ferreyra (provisto en la imagen de referencia).
Reproducí EXACTAMENTE su rostro, sin alterar ningún rasgo: misma estructura ósea,
misma forma y separación de ojos, misma nariz, misma boca y sonrisa, mismas cejas,
mismo mentón, misma línea de nacimiento del pelo y mismo peinado, mismo tono y
textura de piel.
NO rejuvenecer, NO adelgazar, NO cambiar la edad, NO idealizar, NO suavizar rasgos,
NO cambiar el color de ojos ni de pelo.
La persona debe ser reconocible al 100% como la de la foto de referencia.
Mantené el saco azul marino y la camisa blanca.
Cambiá SOLO la pose, el gesto corporal y el entorno según la escena — nunca la cara.
```

## 8. Pipeline técnico — Fase 0

### Dependencias (ya en package.json)
`satori`, `@resvg/resvg-js`, `sharp`. Se agrega el SDK de OpenAI (`openai`) si no está.

### Assets
- Foto de referencia de Diego: `public/pdf-assets/photos/Foto Diego.png` (headshot) y
  `fondo y foto diego/Foto Diego sin fondo.png` (recorte sin fondo).
- Fuentes: Montserrat (600/700/800) + Lato (400/700) como woff2/ttf en `assets/fonts/` (o Storage).

### Flujo
1. **Copy → prompts de escena.** Los del §6 (Fase 0 hardcodeados; Fase 1 los genera OpenAI text).
2. **Capa 1 (escena).** `POST /v1/images/edits` con `model: gpt-image-1`, la foto de referencia de Diego,
   el prompt de 8 secciones, `size: 1024x1536` (2:3, se recorta/ajusta a 4:5). Fallback: si la cara
   driftea → regenerar. Solo slides 1 y 5 usan escena con Diego; 2/3/4 son fondo de marca (sin costo IA).
3. **Capa 2 (texto).** satori renderiza el layout del slide (JSX con las fuentes embebidas) → SVG →
   resvg → PNG con fondo transparente (o con la escena de Capa 1 como background).
4. **Composición.** sharp fusiona Capa 1 + Capa 2 a 1080×1350 → PNG final por slide.
5. **Salida.** 5 PNG en `scratchpad` / carpeta de salida para revisión.

### Scripts (propuestos)
- `scripts/carousel/generate-scene.ts` — llama a OpenAI images para una escena.
- `scripts/carousel/render-slide.tsx` — satori/resvg del layout de un slide.
- `scripts/carousel/build-carousel.ts` — orquesta los 5 slides de un carrusel.
- Correr con `node --env-file=.env.local --import tsx`.

### Variables de entorno
- **Netlify + `.env.local`:** `OPENAI_API_KEY` (obligatoria).
- Opcionales (con default en código): `OPENAI_IMAGE_MODEL=gpt-image-1`, `OPENAI_TEXT_MODEL=gpt-4.1`.

## 9. Fase 1 — Sección "Redes Sociales" en la plataforma (visión)

Boceto, se especifica en su propio doc cuando haya referencias aprobadas.

- **Entrada del dashboard** ("Redes Sociales" / "Social Media") en `DashboardNav.tsx`.
- **Flujo:** elegir plantilla → tema (input) → tipo de CTA (campaña / orgánico) → generar.
- **Motor:** OpenAI text escribe el copy con la voz de marca (system prompt = marca + plantilla +
  few-shot de los carruseles aprobados en Fase 0). OpenAI image genera escenas. satori/resvg compone.
- **UI:** preview de los 5 slides, edición inline del copy, regenerar slide, exportar PNG/ZIP.
- **Persistencia:** tablas para carruseles generados + assets (patrón `property_ad_assets`).
- **Netlify:** la generación pesada va en función/route con `maxDuration` alto (patrón existente).

## 10. Seguridad y cumplimiento

- **API key:** la key que el usuario pegó en el chat quedó EXPUESTA → debe revocarse y rotarse. La nueva
  va solo en env vars (Netlify + `.env.local`), nunca en código ni git.
- **Meta / testimonios:** los testimonios van rotulados como "representativo"; no se presenta un cliente
  real nombrado sin autorización. Cifras ilustrativas presentadas como ejemplo, no como caso documentado.
- **Imagen de Diego:** uso autorizado (es la marca personal). El bloque de preservación facial evita
  representaciones que lo desfiguren.

## 11. Riesgos y decisiones abiertas

- **Drift facial de gpt-image-1:** riesgo real con "Diego por IA". Mitigación: regenerar; si es
  recurrente, evaluar fallback a compositar el recorte real (la opción "Diego real" del brainstorming).
- **satori no soporta todo CSS** (grid limitado, sin algunas props). El layout se diseña con flexbox.
- **Costo OpenAI image:** ~USD 0.02–0.19 por imagen según tamaño/calidad; 2 escenas/carrusel → bajo.
- **Consistencia de color grade entre escenas:** se controla vía sección 5 del prompt + post en sharp.

## 12. Criterios de aceptación (Fase 0)

- [ ] 5 PNG a 1080×1350 con el copy exacto del §6, tipografía Montserrat/Lato y hex de marca correctos.
- [ ] Diego reconocible al 100% en slides 1 y 5 (sin alteración facial).
- [ ] Coherencia visual entre los 5 (color grade, footer, paginador, vestuario).
- [ ] CTA correcto según uso (campaña vs orgánico).
- [ ] Aprobación del usuario → se repite para 2–3 carruseles → base de referencia para Fase 1.
