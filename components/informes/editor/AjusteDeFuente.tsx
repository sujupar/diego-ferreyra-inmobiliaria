'use client'
/**
 * "Corregir a mano" de una fuente automática (pedido del dueño, 2026-10-29): los números de esa fuente, ya cargados
 * con lo que vale hoy (automático o corregido). Guardan con el mismo autoguardado del resto del informe.
 * Lo corregido lo aplica `lib/informes/ajustes.ts` al leer el informe.
 */
import type { Ajustes, Fuentes, NombreFuente } from '@/lib/informes/tipos'
import { CampoNumero, type AvisarPendiente } from './campos'

type CampoNum = { campo: string; etiqueta: string; valor: (f: Fuentes) => number | undefined }

const ok = <K extends NombreFuente>(f: Fuentes, k: K) => (f[k]?.estado === 'ok' ? f[k]?.datos ?? null : null)

/** Qué números se corrigen en cada fuente (la ficha de visitas no: sale de la encuesta a quien visitó). */
export const CAMPOS_DE_AJUSTE: Record<Exclude<NombreFuente, 'reserva'>, CampoNum[]> = {
  consultas: [
    { campo: 'zonaprop', etiqueta: 'Consultas por Zonaprop', valor: f => ok(f, 'consultas')?.porPortal.zonaprop },
    { campo: 'argenprop', etiqueta: 'Consultas por Argenprop', valor: f => ok(f, 'consultas')?.porPortal.argenprop },
    { campo: 'mercadolibre', etiqueta: 'Consultas por MercadoLibre', valor: f => ok(f, 'consultas')?.porPortal.mercadolibre },
    { campo: 'redes', etiqueta: 'Consultas por redes', valor: f => ok(f, 'consultas')?.porPortal.redes },
    { campo: 'otros', etiqueta: 'Otras consultas', valor: f => ok(f, 'consultas')?.porPortal.otros },
  ],
  visitas: [{ campo: 'realizadas', etiqueta: 'Visitas realizadas', valor: f => ok(f, 'visitas')?.realizadas }],
  mercadolibre: [
    { campo: 'visitas', etiqueta: 'Visitas al aviso', valor: f => ok(f, 'mercadolibre')?.visitas },
    { campo: 'interesados', etiqueta: 'Interesados', valor: f => ok(f, 'mercadolibre')?.contactos?.interesados },
    { campo: 'preguntas', etiqueta: 'Preguntas', valor: f => ok(f, 'mercadolibre')?.contactos?.preguntas },
    { campo: 'whatsapp', etiqueta: 'WhatsApp', valor: f => ok(f, 'mercadolibre')?.contactos?.whatsapp },
    { campo: 'llamadas', etiqueta: 'Llamadas', valor: f => ok(f, 'mercadolibre')?.contactos?.llamadas },
    { campo: 'vistasTelefono', etiqueta: 'Vieron el teléfono', valor: f => ok(f, 'mercadolibre')?.vistasTelefono ?? undefined },
  ],
  meta: [
    { campo: 'alcance', etiqueta: 'Alcance', valor: f => ok(f, 'meta')?.alcance },
    { campo: 'impresiones', etiqueta: 'Impresiones', valor: f => ok(f, 'meta')?.impresiones },
    { campo: 'resultados', etiqueta: 'Clientes potenciales', valor: f => ok(f, 'meta')?.resultados },
    { campo: 'gasto', etiqueta: 'Inversión', valor: f => ok(f, 'meta')?.gasto },
  ],
  instagram: [
    { campo: 'reproducciones', etiqueta: 'Reproducciones', valor: f => sumaReels(f, 'reproducciones') },
    { campo: 'alcance', etiqueta: 'Alcance', valor: f => sumaReels(f, 'alcance') },
    { campo: 'meGusta', etiqueta: 'Me gusta', valor: f => sumaReels(f, 'meGusta') },
    { campo: 'comentarios', etiqueta: 'Comentarios', valor: f => sumaReels(f, 'comentarios') },
  ],
}

function valorAjustado(a: Ajustes | undefined, fuente: NombreFuente, campo: string): number | undefined {
  const v = (a?.[fuente] as Record<string, unknown> | undefined)?.[campo]
  return typeof v === 'number' ? v : undefined
}

function sumaReels(f: Fuentes, k: 'reproducciones' | 'alcance' | 'meGusta' | 'comentarios'): number | undefined {
  const reels = ok(f, 'instagram')?.reels
  return reels?.length ? reels.reduce((s, r) => s + r[k], 0) : undefined
}

export function AjusteDeFuente({ nombre, automaticas, ajustes, deshabilitado, onCambiar, onPendiente }: {
  nombre: NombreFuente
  /**
   * Lo que trajo la plataforma. Cada campo arranca con lo corregido si lo hay y si no con esto: se arma con lo que
   * ya está en memoria, sin esperar la recarga (si no, "Volver al automático" mostraba el número viejo).
   */
  automaticas: Fuentes
  ajustes: Ajustes | undefined
  deshabilitado: boolean
  /** Guarda un campo del ajuste de esta fuente (`undefined` = vacío). */
  onCambiar: (campo: string, valor: number | boolean | string | null | undefined) => void
  onPendiente?: AvisarPendiente
}) {
  if (nombre === 'reserva') {
    const r = ok(automaticas, 'reserva')
    const reservada = ajustes?.reserva?.reservada ?? r?.reservada ?? false
    const fecha = ajustes?.reserva?.fecha ?? r?.fecha?.slice(0, 10) ?? ''
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={reservada} disabled={deshabilitado}
            onChange={e => onCambiar('reservada', e.target.checked)} />
          Se reservó en el período
        </label>
        {reservada ? (
          <label className="flex flex-col gap-1 text-sm">
            <span>Fecha de la reserva</span>
            <input type="date" className="h-11 rounded-md border bg-background px-3" defaultValue={fecha} disabled={deshabilitado}
              onChange={e => onCambiar('fecha', e.target.value || null)} />
          </label>
        ) : null}
      </div>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CAMPOS_DE_AJUSTE[nombre].map(c => (
        <CampoNumero key={c.campo} id={`ajuste-${nombre}-${c.campo}`} etiqueta={c.etiqueta} deshabilitado={deshabilitado}
          valor={valorAjustado(ajustes, nombre, c.campo) ?? c.valor(automaticas)} alTipear onPendiente={onPendiente} onGuardar={v => onCambiar(c.campo, v)} />
      ))}
    </div>
  )
}
