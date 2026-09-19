# Descripciones con el método de Diego — Plan de implementación

> Ejecución: inline en la sesión que lo escribió (executing-plans), tarea por tarea,
> con TDD en todo `lib/`. Pasos con casillas `- [ ]`.

**Objetivo:** reemplazar el generador de descripciones de un solo paso por el método de
Diego en tres pasos (fotos → zona → escritura), disparado desde la ficha con la
propiedad ya cargada, sin volver a preguntar lo que ya se contestó en la visita o en la
landing.

**Arquitectura:** módulos PUROS en `lib/descripcion/` (prompts, armado de entradas,
respuestas conocidas, requisitos, firmas de caché, lectura del mapa, controles del
texto) + un servicio con IO (`lib/descripcion/servicio.ts`) + dos rutas finas
(`/api/properties/[id]/descripcion` y `.../descripcion/guardar`) + un panel de cliente
que encadena las etapas (una llamada de IA por pedido). Caché en
`properties.descripcion_ia` (jsonb).

**Stack:** Next 16 / React 19 / TS estricto; OpenAI Responses API por `fetch` plano
(`gpt-4.1`: visión, `web_search`, salida con esquema JSON); OpenStreetMap (Nominatim vía
el geocodificador existente + Overpass); Supabase; vitest (node) + probes tsx.

**Spec:** `docs/superpowers/specs/2026-09-19-descripciones-metodo-diego-design.md`

## Restricciones globales

- UNA llamada de IA por pedido HTTP; techo propio de 22 s por etapa con error legible.
- Las distancias SOLO salen del mapa; la web nunca aporta distancias.
- Nunca al prompt: `reason_for_sale`, `sale_timeframe`. La objeción solo como guarda.
- Contenido de terceros (web, respuestas, notas) va delimitado con « » y saneado.
- Disclaimer literal: el de `GPT Portales/Estructuras para tipologia con ejemplos.docx`.
- Voseo (`RIOPLATENSE_STYLE`), léxico argentino.
- Commits: autor `Sujupar <redstyle50@gmail.com>`, mensaje en castellano.
- Tests: `npx vitest run --config vitest.descripcion.config.ts`.
  Tipos: `npx tsc --noEmit -p tsconfig.descripcion.json`.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20260919000001_property_descripcion_ia.sql` | columna `descripcion_ia jsonb` |
| `scripts/apply-descripcion-ia-pg.ts` | aplica y verifica la migración |
| `lib/descripcion/tipos.ts` | tipos compartidos (`InventarioFotos`, `LugarCercano`, `ZonaInvestigada`, `DescripcionIA`, `TextoGenerado`) |
| `lib/descripcion/requisitos.ts` | qué falta para generar (puro) |
| `lib/descripcion/firmas.ts` | firmas de caché de fotos y dirección (puro) |
| `lib/descripcion/respuestas.ts` | junta respuestas conocidas de 3 fuentes y calcula pendientes (puro) |
| `lib/descripcion/zona-mapa.ts` | consulta Overpass + parser a lugares con metros/cuadras (parser puro) |
| `lib/descripcion/metodo-diego.ts` | prompt de escritura desde los 5 documentos + 3 ejemplos, disclaimer, adjetivos |
| `lib/descripcion/prompts-investigacion.ts` | prompt + esquema JSON de fotos; prompt de zona web |
| `lib/descripcion/entradas.ts` | arma el mensaje de datos del paso 3 (puro) |
| `lib/descripcion/controles.ts` | controles post-IA: disclaimer, prohibidos, partes, largos (puro) |
| `lib/descripcion/limpiar-web.ts` | saneo del texto de la web: sin links, sin « », recorte (puro) |
| `lib/ai/openai-responses.ts` | cliente mínimo de la Responses API (texto, imágenes, web_search, esquema, timeout) |
| `lib/descripcion/servicio.ts` | IO: leer contexto, etapas, estado, guardar |
| `app/api/properties/[id]/descripcion/route.ts` | GET estado · POST una etapa |
| `app/api/properties/[id]/descripcion/guardar/route.ts` | POST guardar |
| `lib/descripcion/flujo-panel.ts` | qué hace el panel después de cada etapa (puro) |
| `components/properties/descripcion/GenerarDescripcionPanel.tsx` | el panel (diálogo) |
| `components/properties/descripcion/BotonGenerarDescripcion.tsx` | botón + estado de requisitos, abre el panel |
| `scripts/descripcion-probar.ts` | corrida real sin guardar (mide tiempos, audita) |
| `vitest.descripcion.config.ts`, `tsconfig.descripcion.json` | verificación acotada |

Modifica: `components/properties/detail/tabs/OverviewTab.tsx`,
`app/(dashboard)/properties/new/page.tsx` (+ su `page.test.tsx`),
`components/properties/wizards/ml/steps/StepDescription.tsx`,
`components/properties/wizards/ap/steps/StepDescription.tsx`, `CLAUDE.md`.

Borra: `components/properties/alta/GenerarDescripcion.tsx` (+test),
`app/api/properties/generate-description/` (ruta + test),
`lib/properties/descripcion-desde-alta.ts` (+test),
`components/properties/GenerarDescripcionButton.tsx`,
`components/properties/GenerateDescriptionCard.tsx`,
`app/api/properties/[id]/generate-description/route.ts`,
`scripts/generar-descripcion.probe.tsx`.
Se mantiene `lib/marketing/portal-descriptions/*` (lo usa `portal-description-bridge.ts`).

---

### Tarea 1: Base de datos + configuración de verificación

**Archivos:** migración, script de aplicación, `vitest.descripcion.config.ts`,
`tsconfig.descripcion.json`.

- [ ] Migración aditiva:
  ```sql
  ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS descripcion_ia jsonb;
  COMMENT ON COLUMN public.properties.descripcion_ia IS 'Caché del generador de descripciones (método de Diego): inventario de fotos, zona, notas del asesor y respaldo de descripciones reemplazadas. Shape: DescripcionIA en lib/descripcion/tipos.ts';
  ```
- [ ] Script `apply-descripcion-ia-pg.ts` (patrón `apply-location-insights-migration-pg.ts`):
  cuenta propiedades antes/después, verifica la columna en `information_schema`, aborta
  si algo no cuadra.
- [ ] Aplicar (`npm i --no-save pg` + `node --env-file=.env.local --import tsx ...`) y
  verificar con `select descripcion_ia from properties limit 1` vía REST.
- [ ] Configs acotadas (include: `lib/descripcion/**`, `lib/ai/openai-responses*`,
  rutas nuevas, componentes nuevos y modificados).
- [ ] Commit.

### Tarea 2: Tipos, requisitos y firmas (puros)

**Produce:**
```ts
// requisitos.ts
export const MIN_FOTOS = 5
export function faltanParaGenerar(p: {
  photos?: string[] | null; property_type?: string | null; address?: string | null
  neighborhood?: string | null; rooms?: number | null; covered_area?: number | null
  asking_price?: number | null
}): string[]   // ej. ['fotos (tiene 2, mínimo 5)', 'precio']
// firmas.ts
export function firmaFotos(fotos: string[]): string        // estable, cambia si cambia cualquier URL u orden
export function firmaDireccion(p: { address?: string|null; neighborhood?: string|null; city?: string|null }): string // normaliza mayúsculas/espacios/tildes
```
**Tests** (`requisitos.test.ts`, `firmas.test.ts`): propiedad completa → `[]`; 4 fotos →
mensaje con "tiene 4, mínimo 5"; `photos` null → "tiene 0"; precio 0 → falta precio;
dirección solo espacios → falta; firma de fotos igual con mismo array, distinta si
cambia el orden o una URL, estable con array vacío; firma de dirección igual para
"Díaz Colodrero 2327" vs "  díaz colodrero  2327" y NFD vs NFC; distinta si cambia el
barrio.

- [ ] Test rojo → implementar → verde → commit.

### Tarea 3: Respuestas conocidas y pendientes (puro)

**Produce:**
```ts
export type TemaPregunta = 'comprador' | 'diferencial' | 'objecion' | 'barrio'
export interface RespuestaConocida { tema: TemaPregunta | null; pregunta: string; respuesta: string; fuente: 'visita' | 'landing' | 'ficha' }
export interface PreguntaPendiente { id: 'q1'|'q2'|'q3'|'q4'; tema: TemaPregunta; pregunta: string; ayuda: string }
export function clasificarPregunta(texto: string): TemaPregunta | null
export function juntarRespuestas(e: {
  barrio: string | null
  landingAnswers: unknown        // properties.landing_answers (q1..q4 fijas)
  visitaLanding: unknown         // deals.visit_data.landing (q1..q4 fijas)
  wizardState: unknown           // property_landings.wizard_state ({questions, answers})
}): { conocidas: RespuestaConocida[]; pendientes: PreguntaPendiente[] }
```
Reglas: q1..q4 fijas mapean por id (q1 comprador, q2 diferencial, q3 objeción, q4
barrio); `landing_answers` gana sobre la visita del proceso (misma pregunta); las del
wizard de landing se clasifican por texto (barrio/entorno/zona → barrio;
comprador/público/perfil/interesados → comprador; objeción/duda/frena → objeción;
diferencial/atractivo/destac → diferencial) y cuentan como contestadas; respuestas
vacías o de solo espacios no cuentan; pendientes = temas sin respuesta, con el texto de
`preguntasFijasLanding(barrio)`.
**Tests:** sin nada → 4 pendientes con los textos fijos; `landing_answers` completas →
0 pendientes, fuente 'visita'; wizard de Díaz Colodrero (textos reales del relevamiento)
→ 0 pendientes, fuente 'landing'; wizard con preguntas en `null` (a4f1d221) → 4
pendientes; q1 solo en la visita del proceso → pendientes q2..q4; `clasificarPregunta`
con las preguntas reales del relevamiento (una por tema, más "¿Qué características del
barrio de Tristán Suárez pueden atraer…?" → barrio, no comprador).

- [ ] Rojo → verde → commit.

### Tarea 4: Lectura del mapa (parser puro + fetch)

**Produce:**
```ts
export function distanciaMetros(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number
export function consultaOverpass(lat: number, lng: number): string
export function lugaresDesdeOverpass(json: unknown, origen: {lat:number;lng:number}): LugarCercano[]
export async function buscarLugaresCercanos(lat: number, lng: number, signal: AbortSignal): Promise<LugarCercano[] | null> // null = falló
```
Consulta: estaciones de subte y tren a 1.500 m (con las relaciones de ruta para saber
la línea), plazas/parques con nombre a 800 m, colegios/universidades a 600 m, hospitales
a 500 m. Parser: descarta `railway=proposed`/`construction`, dedupe por nombre+tipo
(queda el más cercano), `cuadras = round(metros/100)`, tope por tipo (3 estaciones de
subte, 2 de tren, 3 plazas, 4 colegios, 1 hospital), orden por distancia.
**Tests** con un JSON fijo armado del relevamiento de Perón 4227: Hospital Italiano 91 m
primero de su tipo; estación proyectada excluida; duplicados de nombre deduplicados;
línea tomada de la relación; JSON inválido → `[]`; distancia conocida entre dos puntos
(±1 %).
- [ ] Verificar la consulta real una vez con `scripts/descripcion-probar.ts` (Tarea 9)
  para confirmar que las relaciones traen "Línea B".
- [ ] Rojo → verde → commit.

### Tarea 5: Método de Diego (prompt de escritura) + entradas + controles (puros)

**Produce:**
```ts
// metodo-diego.ts
export const DISCLAIMER: string                // literal del documento
export const ADJETIVOS_PERMITIDOS: readonly string[]
export const ADJETIVOS_PROHIBIDOS: readonly string[]
export function promptEscritura(): string      // system prompt completo
// entradas.ts
export interface EntradaEscritura {
  propiedad: { property_type: string; operation_type?: string|null; address: string; neighborhood: string; city?: string|null
    asking_price: number; currency: string; expensas?: number|null; rooms?: number|null; bedrooms?: number|null; bathrooms?: number|null
    garages?: number|null; covered_area?: number|null; total_area?: number|null; floor?: number|null; age?: number|null; amenities?: unknown }
  visita: SaleVisitData | null
  portalData: unknown
  respuestas: RespuestaConocida[]
  inventario: InventarioFotos | null
  zona: ZonaInvestigada | null
  comprador: string | null
  notas: string | null
}
export function tipologiaDiego(tipo: string): 'CASA' | 'DEPARTAMENTO' | 'PH'
export function armarEntradaEscritura(e: EntradaEscritura): string
// controles.ts
export function controlarTexto(t: TextoGenerado): { texto: TextoGenerado; problemas: string[] }
```
Prompt: personalidad y léxico del documento Tono; adjetivos permitidos/prohibidos y
sustitutos; titular/subtitular; estructura por tipología al pie de la letra; los tres
ejemplos de Diego completos, rotulados "ejemplo de ESTILO, no copies sus datos"; reglas
anti-invención (solo lo que está en las entradas; distancias solo del bloque MAPA con la
forma "a N cuadras"; bloque sin datos se omite entero; si datos cargados y fotos se
contradicen, gana lo cargado; objeción = guarda, nunca se menciona; no afirmar cómo se
conectan ambientes si no está en fotos ni datos; no describir muebles de fotos
ambientadas como incluidos); RIOPLATENSE_STYLE; salida JSON `{title, subtitle, body}`;
body en texto plano con saltos de línea, sin markdown (`**`, `###`).
Entradas: bloques rotulados en el orden del Checklist; piso 0 → "Planta baja";
visita sin `reason_for_sale`/`sale_timeframe`; estado de conservación y calidad
traducidos a palabras; `portal_data.ml` Sí/No → lista "Tiene: balcón, ascensor…";
respuestas y notas y web delimitadas con « » (sacando « » internas); zona MAPA como
líneas "Subte Línea B – Estación Medrano: 600 m (a unas 6 cuadras)".
Controles: si el body no termina con el DISCLAIMER literal, se quita cualquier variante
del final (desde "La presente publicación") y se agrega el literal; problemas: adjetivo
prohibido (sin distinguir mayúsculas ni tildes), rótulos de partes ("Primera parte",
"Recorrido:", "Ubicación:", "Conexión emocional"), markdown, titular > 10 palabras,
subtitular > 50.
**Tests:** `tipologiaDiego` (casa, departamento, ph, terreno→CASA, oficina→DEPARTAMENTO);
entrada con visita completa NO contiene el motivo de venta; piso 0 → "Planta baja";
respuestas con « » adentro quedan saneadas; zona sin mapa → texto de modo prudente
("NO menciones distancias"); `controlarTexto` repone el disclaimer cuando viene
parafraseado (caso Doblas 248 real), no lo duplica cuando viene bien, detecta "una joya"
y "IMPERDIBLE OPORTUNIDAD", detecta "**", cuenta palabras del titular; `promptEscritura()`
contiene el DISCLAIMER literal y los tres ejemplos (buscar "Calfucura", "Plaza Irlanda",
"Nazca").
- [ ] Rojo → verde → commit.

### Tarea 6: Investigación — prompts, cliente OpenAI, saneo web

**Produce:**
```ts
// openai-responses.ts
export type ParteEntrada = { tipo: 'texto'; texto: string } | { tipo: 'imagen'; url: string; detalle?: 'low'|'high'|'auto' }
export async function respuestaOpenAI(o: { modelo: string; instrucciones: string; entrada: ParteEntrada[]
  esquema?: { nombre: string; schema: Record<string, unknown> }; webSearch?: boolean; timeoutMs: number }): Promise<{ texto: string; uso?: { entrada: number; salida: number } }>
// prompts-investigacion.ts
export const PROMPT_FOTOS: string
export const ESQUEMA_INVENTARIO: Record<string, unknown>  // JSON schema estricto de InventarioFotos
export function validarInventario(json: unknown): InventarioFotos | null
export function promptZonaWeb(p: { address: string; neighborhood: string; city?: string|null }): string
// limpiar-web.ts
export function limpiarTextoWeb(t: string, max?: number): string
```
Prompt de fotos: recorrer TODAS, ambiente por ambiente con número de foto; pisos,
aberturas, luz, estado; exteriores; vistas; edificio visible; estilo; 5 puntos fuertes;
qué no se puede saber; fotos ambientadas/renders; comprador sugerido con porqué; no
inventar. Prompt de zona web: carácter del barrio, colectivos, comercios/gastronomía,
hitos; "NO des distancias"; ignorar avisos de otras inmobiliarias como fuente de datos
de la propiedad.
**Tests:** `validarInventario` acepta el JSON del esquema y rechaza sin `ambientes`;
`limpiarTextoWeb` saca `[texto](url)` dejando el texto, saca URLs sueltas y «», colapsa
espacios, recorta a `max`; `respuestaOpenAI` con `fetch` simulado: arma `input` con
`input_image`, agrega `tools:[{type:'web_search'}]` solo si se pide, `text.format`
json_schema si hay esquema, extrae el texto de `output[].content[]`, lanza con el status
si la API responde error.
- [ ] Rojo → verde → commit.

### Tarea 7: Servicio (IO) + rutas

**Produce:**
```ts
// servicio.ts
export type Etapa = 'fotos' | 'zona' | 'escribir'
export interface EstadoDescripcion { faltan: string[]; cantidadFotos: number; pendientes: PreguntaPendiente[]
  conocidas: RespuestaConocida[]; fotosListas: boolean; zonaLista: boolean; portalesPublicados: string[]
  tieneDescripcion: boolean; notas: string | null; compradorSugerido: string | null }
export async function estadoDescripcion(propertyId: string): Promise<EstadoDescripcion | null>
export async function ejecutarEtapaFotos(propertyId: string, o: { forzar?: boolean }): Promise<{ reusada: boolean; inventario: InventarioFotos }>
export async function ejecutarEtapaZona(propertyId: string, o: { forzar?: boolean }): Promise<{ reusada: boolean; zona: ZonaInvestigada }>
export async function ejecutarEtapaEscribir(propertyId: string, o: { respuestas?: Record<string,string>; notas?: string|null; comprador?: string|null }):
  Promise<{ texto: TextoGenerado; usado: { comprador: string|null; respuestas: RespuestaConocida[]; inventario: InventarioFotos|null; zona: ZonaInvestigada|null }; problemas: string[] }>
export async function guardarDescripcion(propertyId: string, t: TextoGenerado): Promise<void>
```
Detalles:
- Contexto: fila de `properties`, último deal con `property_id` (su `visit_data`),
  `property_landings.wizard_state`, `property_listings` publicados.
- Fotos: reusa si `firmaFotos` coincide y no `forzar`; si hay > 30 fotos, usa las
  primeras 30 (las 3 primeras son la portada; el recorte se mide con Doblas 248 y se
  ajusta en esta tarea si entra el total). Persiste en `descripcion_ia.fotos`.
- Zona: coords de la fila o `geocodePropertyBestEffort` y relectura; mapa y web en
  paralelo (`Promise.allSettled`), cada uno con su techo; persiste en
  `descripcion_ia.zona` aunque uno falle; si fallan los dos, error.
- Escribir: respuestas nuevas del panel saneadas (`sanearRespuestasLanding`) y
  mezcladas en `properties.landing_answers` SOLO en claves vacías; notas en
  `descripcion_ia.notas`; comprador = panel → q1 conocida → sugerido; una llamada; si
  `controlarTexto` reporta prohibidos/partes/markdown, UNA segunda llamada con los
  problemas listados, y si persisten se devuelven como `problemas` (se muestran, no se
  bloquea).
- Guardar: update `title` + `description` (`subtitle\n\nbody`), respaldo del anterior
  en `descripcion_ia.anterior` (últimos 3).
- Rutas: `requireAuth`; roles admin/dueno/coordinador/asesor; `puedeDifundir(...,
  'difundir')`; Zod (`etapa` enum, `forzar` bool, `respuestas` record ≤ 2.000 chars c/u,
  `notas` ≤ 2.000, `comprador` ≤ 500; guardar: title ≤ 200, subtitle ≤ 1.000, body ≤
  8.000); corte por tiempo → 504 JSON "tardó demasiado"; `faltan` no vacío → 409 con la
  lista.
**Verificación:** tsc acotado; prueba real en Tarea 9.
- [ ] Implementar → tsc → commit.

### Tarea 8: Panel, botón y pantallas

**Produce:**
```ts
// flujo-panel.ts
export type PasoPanel = 'fotos' | 'zona' | 'preguntas' | 'escribir' | 'vista'
export function siguientePaso(actual: PasoPanel, e: { pendientes: number; zonaFallo: boolean }): PasoPanel
```
Reglas: fotos → zona; zona → preguntas si hay pendientes, si no escribir; preguntas →
escribir; escribir → vista. **Tests** de las cuatro transiciones y de "zona falló" (sigue
igual, el panel muestra el aviso).
- [ ] `BotonGenerarDescripcion` (props `propertyId`, `tieneDescripcion`, `onGuardado(t:
  TextoGenerado)`): pide `GET .../descripcion`, muestra "Generar"/"Regenerar
  descripción", deshabilitado con "Falta: …".
- [ ] `GenerarDescripcionPanel` (Dialog): tres pasos con estado; preguntas pendientes +
  recuadro "Lo que no se ve en las fotos" (q1 precargada con el comprador sugerido);
  vista previa editable (titular, subtitular, cuerpo) + "Qué tuvo en cuenta"; aviso de
  portales publicados; "Guardar", "Volver a escribir", "Analizar todo de nuevo",
  "Reintentar" por paso. Respuestas leídas con `readJson` tolerante.
- [ ] `OverviewTab`: descripción arriba (si hay) y botón SIEMPRE (menos abogado).
- [ ] Alta: sacar `GenerarDescripcion` y su estado `generandoDescripcion`; texto de ayuda.
  Actualizar `page.test.tsx` (sacar el mock).
- [ ] Wizards ML/AP: con `draft.description` no vacío al entrar → textarea editable + la
  línea "Tomada de la ficha…", sin botón; vacío → `BotonGenerarDescripcion` y, al
  guardar, `onChange({ title: t.title.slice(0, max), description: subtitle+body })`.
- [ ] Borrar los archivos viejos listados arriba; `grep -rn` de cada nombre borrado =
  0 resultados.
- [ ] Probe de render (`scripts/descripcion-panel.probe.tsx`, `renderToStaticMarkup`):
  el botón con faltantes muestra "Falta:"; el paso del wizard con descripción NO
  contiene "Generar".
- [ ] tsc + eslint en lo tocado → commit.

### Tarea 9: Corrida real sin guardar + medición

- [ ] `scripts/descripcion-probar.ts <propertyId> [--sin-cache]`: corre las tres
  etapas con los módulos reales contra la base y OpenAI, SIN escribir `description` ni
  `title` (y con `--sin-cache` tampoco `descripcion_ia` ni coordenadas), e imprime:
  tiempo de cada etapa, tokens, inventario, lugares del mapa, texto de la web, texto
  final y problemas de control.
- [ ] Correr sobre Perón 4227 (`--sin-cache`, para dejarle al dueño la corrida
  completa), Díaz Colodrero (con respuestas de landing → sin preguntas) y Doblas 248
  (48 fotos → medir la etapa de fotos). Cada etapa < 20 s; si no, ajustar (tandas o
  menos fotos) y volver a medir.
- [ ] Auditar los tres textos frase por frase contra datos/fotos/mapa. Ajustar prompts
  hasta que no haya invenciones. Commit de los ajustes.

### Tarea 10: Revisión, QA, deploy, documentación

- [ ] Revisión adversarial (`feature-dev:code-reviewer`) + `/security-review` (entra
  contenido de terceros al prompt). Verificar cada hallazgo; aplicar → volver a Tarea 4-8.
- [ ] `CLAUDE.md`: sección nueva (arquitectura, las 3 fuentes de respuestas, por qué
  las distancias salen del mapa, qué no va nunca al prompt, cómo probar).
- [ ] Push + PR. QA en la vista previa con el navegador de Claude (usuario "Claude ·
  pruebas"): criterios 1–4, 7, 9–13 sobre Díaz Colodrero (sin guardar) y una propiedad
  `[TEST`; consola y red limpias; abogado sin botón (cambiando el rol del usuario de
  pruebas y volviendo a admin). NO correr sobre Perón 4227.
- [ ] Merge a `main`, deploy, verificación en producción (la ruta GET responde,
  el botón aparece).
- [ ] Avisar al dueño para que corra Perón 4227; al recibir su aviso, auditar
  `descripcion_ia` y el texto guardado (criterios 5, 6, 8, 14, 15) y reportar la tabla
  criterio → cómo se probó → resultado.
