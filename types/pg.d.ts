// `pg` no publica tipos propios y no hay @types/pg instalado (CLAUDE.md: sin dependencias
// nuevas en package.json). Shim mínimo con la forma real que usan los scripts
// `scripts/apply-*-pg.ts` (conexión directa a Postgres vía el pooler de Supabase).
declare module 'pg' {
  // `any` acá replica la forma real de @types/pg (`[column: string]: any`): una fila de SQL
  // dinámico no tiene forma fija, y los scripts que la leen la validan campo por campo con
  // comparaciones (`=== false`, `.includes(...)`), el mismo patrón ya aceptado en
  // lib/visitas/datos.ts para filas sin tipar del cliente de Supabase.
  export interface QueryResultRow {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [columna: string]: any
  }

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    rows: R[]
    rowCount: number | null
  }

  export interface ClientConfig {
    host?: string
    port?: number
    user?: string
    password?: string
    database?: string
    ssl?: boolean | { rejectUnauthorized?: boolean }
  }

  export class Client {
    constructor(config?: ClientConfig)
    connect(): Promise<void>
    query<R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<QueryResult<R>>
    end(): Promise<void>
  }
}
