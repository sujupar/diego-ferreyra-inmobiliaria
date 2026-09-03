'use client'

import { normalizarPrecioTexto, rangoInvertido } from '@/lib/filters/rango-precio'
import { useBorradorConEspera } from './use-borrador-con-espera'

export interface ValorRangoPrecio {
    min: string
    max: string
}

interface Props {
    value: ValorRangoPrecio
    onChange: (rango: ValorRangoPrecio) => void
    esperaMs?: number
}

/**
 * Rango de precio de los listados.
 *
 * Dice "US$" en el rótulo a propósito: la comparación se hace contra el número
 * guardado, así que solo tiene sentido dentro de una misma moneda. Hoy las 41
 * tasaciones y las 34 propiedades están en dólares, pero el rótulo tiene que
 * decir la verdad igual el día que entre una en pesos.
 *
 * Si el "desde" queda por encima del "hasta" NO se corrigen los valores dados
 * vuelta —sería aplicar un filtro distinto del que la persona escribió, sin
 * decírselo—: se avisa, que es lo que responde la pregunta real ("¿por qué no
 * aparece nada?").
 */
export function RangoPrecio({ value, onChange, esperaMs }: Props) {
    // Cada punta tiene su propia espera. El `onChange` se rearma en cada
    // render, así que la punta que NO se tocó siempre viaja con su valor
    // vigente (el hook lee el callback más reciente al disparar).
    const min = useBorradorConEspera({
        value: value.min,
        onChange: v => onChange({ min: v, max: value.max }),
        normalizar: normalizarPrecioTexto,
        esperaMs,
    })
    const max = useBorradorConEspera({
        value: value.max,
        onChange: v => onChange({ min: value.min, max: v }),
        normalizar: normalizarPrecioTexto,
        esperaMs,
    })

    const invertido = rangoInvertido(value.min, value.max)

    const claseCampo =
        'h-9 w-28 rounded-md border border-input bg-background px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring'

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Precio (US$)</span>
            <input
                // `inputMode` numérico levanta el teclado de números en el
                // celular; el tipo sigue siendo texto porque acá se acepta
                // "150.000" y un `type=number` lo rechazaría.
                inputMode="numeric"
                aria-label="Precio desde"
                placeholder="Desde"
                value={min.borrador}
                onChange={e => min.escribir(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); min.aplicarYa() } }}
                className={claseCampo}
            />
            <span className="text-sm text-muted-foreground">—</span>
            <input
                inputMode="numeric"
                aria-label="Precio hasta"
                placeholder="Hasta"
                value={max.borrador}
                onChange={e => max.escribir(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); max.aplicarYa() } }}
                className={claseCampo}
            />
            {/* SIEMPRE montada, y lo que cambia es el texto. Una región viva
                que aparece junto con su contenido muchos lectores de pantalla
                no la anuncian: entra al árbol de accesibilidad ya poblada, así
                que no hay cambio que leer. Vacía va en `sr-only` para no dejar
                un hueco en la barra. Mismo criterio que el aviso de filtro de
                las dos pantallas. */}
            {/* `aria-live` SIN `role="status"` a propósito: el rol también
                marcaría esto como región viva y las pantallas ya tienen la
                suya (el aviso de filtro rechazado), así que habría DOS y las
                pruebas —y los lectores— no sabrían cuál es cuál. `aria-live`
                solo anuncia igual. */}
            <span
                aria-live="polite"
                className={invertido ? 'text-xs text-destructive' : 'sr-only'}
            >
                {invertido ? 'El precio desde es mayor que el hasta: así no puede haber resultados.' : ''}
            </span>
        </div>
    )
}
