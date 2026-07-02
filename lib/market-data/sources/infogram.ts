import type { StockComposition, SourceResult } from '../types'

export const INFOGRAM_EMBED_URL = 'https://e.infogram.com/09008d4a-dcf6-4acf-aebe-18cb3cfc2f5c?src=embed'

export type InfogramComposition = Pick<StockComposition, 'tipos' | 'antiguedad' | 'vendedor' | 'antPublicacion' | 'totalInmuebles'>

/**
 * FUENTE DIFERIDA — ver .superpowers/sdd/task-4-report.md para el discovery completo.
 *
 * Task 4 se planeó originalmente para parsear la composición del stock desde
 * `window.infographicData` embebido en el HTML del embed de Infogram (mismo
 * mecanismo con el que Task 3 capturó `__fixtures__/infogram.html`). El
 * discovery (2026-07-01) probó que ese plan no puede funcionar tal como está
 * planteado:
 *
 * - El HTML del embed SÍ trae `window.infographicData`, y ahí SÍ hay 24
 *   entidades `type === 'CHART'` en `elements.content.content.entities`
 *   (objeto keyed por uuid, no array) con títulos identificables (ej.
 *   "A013-18 TIPO DE VENDEDOR", "A013-17 ANTIGUEDAD DE LA PUBLICACION").
 * - PERO el campo `chartData.data` de las 24 entidades viene SIEMPRE vacío:
 *   `[[[]]]`. No es un fixture viejo/roto — un fetch fresco contra
 *   `INFOGRAM_EMBED_URL` el mismo día (2026-07-01) devuelve exactamente el
 *   mismo patrón (HTML idéntico en tamaño, `updatedAt` reciente).
 * - La razón estructural: son charts "live" (`chartData.custom.live.provider
 *   === 'atlas_google_drive'`) conectados a una hoja de Google Sheets. Cada
 *   chart trae `chartData.custom.live.key` (el id de la hoja/rango) pero el
 *   HTML estático NUNCA contiene los datos — Infogram los hidrata client-side
 *   después de que la página carga en un browser real, vía el bundle
 *   `embed_flex_viewer-*-webpack.js` (cargado async con `delaysrc`).
 * - Ese bundle expone el endpoint real: `GET https://e.infogram.com/api/v1/atlas/getLiveData?id={live.key}`
 *   (config `liveDataURL: "/api/v1/atlas/getLiveData?id="` encontrada en el
 *   bundle). Se probó ese endpoint en vivo (2026-07-01) con cookies de la
 *   sesión del embed + header `Referer` + `X-Requested-With` — responde
 *   **HTTP 401** de todas formas. No es un problema de selector/parseo: la
 *   API de datos vivos exige auth de sesión del viewer que un `fetch()` plano
 *   (server-side, sin browser) no puede reproducir.
 *
 * Los 4 `live.key` relevantes para las series de esta interfaz (título → key,
 * capturados del fixture 2026-07-01, para cuando alguien retome esto):
 *   - 'A013-18 TIPO DE VENDEDOR'            → 3f665f2e-6a58-4ad2-a7a5-a2ff68537ab0   (vendedor)
 *   - 'A013-23 ANTIGUEDAD PUBLICACION'      → a9a442a0-9733-444f-a6ec-6b8a01f3e4c2   (antPublicacion)
 *   - 'A013-13 STOCK TOTAL'                 → fa039991-b320-43e9-abdd-95528af15c00   (candidato a tipos/totalInmuebles)
 *   - 'A013-17 ANTIGUEDAD DE LA PUBLICACION'→ 22f6d719-e689-4f73-81af-80505f447065   (antPublicacion, variante)
 *
 * El sistema fue DISEÑADO para tolerar que una fuente falle: el ingest
 * (Task 7) hace merge fail-soft por fuente (estado `'partial'` visible en el
 * panel de Config si esta fuente devuelve `ok:false`) y la sección Stock del
 * PDF cae al override manual (imagen subida a mano) cuando no hay
 * composición fresca. Por eso la decisión de ingeniería correcta ahora es
 * este stub chico y honesto: mantiene el contrato exacto que Task 7 importa,
 * SIEMPRE devuelve `ok:false` con un motivo accionable, y NUNCA fabrica
 * datos — ni golpea la red para intentarlo (ya se probó que 401).
 *
 * Caminos de desbloqueo futuro (fuera de scope de este stub):
 *   1. ScraperAPI con `render=true` (el mismo proxy que ya usa el repo para
 *      otros scrapers vía `SCRAPER_API_KEY`) — ejecuta el JS del embed antes
 *      de devolver el HTML, lo que debería poblar `chartData.data` o permitir
 *      capturar el request real a `getLiveData` con sus headers/cookies
 *      válidos de sesión.
 *   2. Acceso directo del autor: cada chart "live" apunta a una hoja de
 *      Google Sheets (`atlas_google_drive`). Si Daniel Bryn (daniel@bryn.com.ar,
 *      dueño de la cuenta / monitor inmobiliario) comparte o publica esas
 *      hojas, se podría leer el CSV directamente — más estable a largo plazo
 *      que depender del render de Infogram.
 */
export async function fetchInfogramComposition(): Promise<SourceResult<InfogramComposition>> {
    return {
        ok: false,
        error: 'infogram: composición del stock DIFERIDA — los charts son live-data (getLiveData devuelve 401 sin sesión del viewer). La sección Stock del PDF usa la imagen del override manual. Desbloqueos posibles: ScraperAPI render=true o acceso directo del autor (daniel@bryn.com.ar). Ver lib/market-data/sources/infogram.ts para el detalle técnico.',
    }
}
