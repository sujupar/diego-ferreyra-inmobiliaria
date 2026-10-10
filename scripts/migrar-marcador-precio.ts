/**
 * Limpieza de datos del Grupo A (spec 2026-10-03, A3): pasa al marcador {precio}
 * los precios viejos que quedaron escritos en las frases de fábrica de
 * `report_edits.analysisText` / `strategyPriceText`.
 *
 * No es requisito para que el informe se vea bien: el render ya normaliza
 * (`textoConPrecio`). Sirve para que el editor muestre {precio} en vez de un
 * número viejo. Solo toca esas dos frases (ver `conMarcadorDePrecio`).
 *
 * Uso:
 *   node --env-file=<.env.local> --import tsx scripts/migrar-marcador-precio.ts listar
 *   node --env-file=<.env.local> --import tsx scripts/migrar-marcador-precio.ts aplicar
 */
import { createClient } from '@supabase/supabase-js'
import { normalizarEdiciones, type ReportEdits } from '../lib/types/report-edits'

const modo = process.argv[2]
if (modo !== 'listar' && modo !== 'aplicar') {
    console.error('Uso: migrar-marcador-precio.ts listar|aplicar')
    process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !clave) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
// Hay más de un proyecto en el Dashboard: este script solo corre contra el de la app.
if (!url.includes('mncsnastmcjdjxrehdep')) throw new Error(`Proyecto inesperado: ${url}`)

const supabase = createClient(url, clave, { auth: { persistSession: false } })

async function main() {
    const { data, error } = await supabase
        .from('appraisals')
        .select('id, property_title, report_edits')
        .not('report_edits', 'is', null)
    if (error) throw error

    const cambios = (data ?? []).flatMap(fila => {
        const antes = fila.report_edits as ReportEdits
        const despues = normalizarEdiciones(antes)
        const cambia = antes.analysisText !== despues.analysisText || antes.strategyPriceText !== despues.strategyPriceText
        return cambia ? [{ fila, antes, despues }] : []
    })

    for (const { fila, antes, despues } of cambios) {
        console.log(`\n${fila.id.slice(0, 8)}  ${fila.property_title}`)
        if (antes.analysisText !== despues.analysisText) {
            console.log(`  análisis:   ${antes.analysisText?.split('\n')[0]}`)
            console.log(`           → ${despues.analysisText?.split('\n')[0]}`)
        }
        if (antes.strategyPriceText !== despues.strategyPriceText) {
            console.log(`  estrategia: ${antes.strategyPriceText?.split('\n')[0]}`)
            console.log(`           → ${despues.strategyPriceText?.split('\n')[0]}`)
        }
    }
    console.log(`\n${cambios.length} tasaciones con textos a normalizar (de ${data?.length ?? 0} con ediciones).`)

    if (modo === 'listar') return
    for (const { fila, despues } of cambios) {
        // Solo report_edits: no toca precios, updated_at lo maneja la base.
        const { error: e } = await supabase.from('appraisals').update({ report_edits: despues }).eq('id', fila.id)
        if (e) throw new Error(`${fila.id}: ${e.message}`)
    }
    console.log(`Aplicado en ${cambios.length} tasaciones.`)
}

main().catch(e => { console.error(e); process.exit(1) })
