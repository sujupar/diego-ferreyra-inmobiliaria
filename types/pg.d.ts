/**
 * `pg` no trae sus propios tipos y en este repo se instala con `npm i --no-save pg`
 * (nunca entra a package.json: CLAUDE.md § Supabase). Los `scripts/apply-*-pg.ts`
 * nunca pasan por una verificación de tipos acotada porque viven bajo `scripts/`,
 * que el tsconfig raíz excluye entero — pero `tsconfig.visitas.json` SÍ necesita
 * revisar `scripts/apply-cron-visit-reminders-pg.ts` (está en su `include` y su
 * propio `exclude` no vuelve a excluir `scripts`). Sin este shim, `tsc` falla con
 * TS7016 porque ninguna de las dos entradas de `exports` de `pg` trae `.d.ts`.
 * Mínimo a propósito: solo lo que usan esos scripts (`new Client(config).connect()
 * / .query() / .end()`), sin `any`.
 */
declare module 'pg' {
  export interface ConfiguracionCliente {
    host?: string
    port?: number
    user?: string
    password?: string
    database?: string
    ssl?: { rejectUnauthorized?: boolean } | boolean
  }

  export interface ResultadoConsulta<Fila = Record<string, unknown>> {
    rows: Fila[]
    rowCount: number | null
  }

  export class Client {
    constructor(config?: ConfiguracionCliente)
    connect(): Promise<void>
    end(): Promise<void>
    query<Fila = Record<string, unknown>>(
      texto: string,
      parametros?: readonly unknown[],
    ): Promise<ResultadoConsulta<Fila>>
  }
}
