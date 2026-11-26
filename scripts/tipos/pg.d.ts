// Tipos MÍNIMOS de `pg` para los scripts que lo usan y pasan por `tsc`
// (tsconfig.crm.json). `pg` se instala con `npm i --no-save pg` (no está en
// package.json) y no trae tipos; `@types/pg` tampoco está, y un `npm i --no-save`
// de los tipos borraría el `pg` instalado igual (npm poda lo que no está en el
// package.json). Solo declara lo que estos scripts usan. `scripts/` está fuera
// del tsconfig raíz, así que esto no afecta al build de Next.
declare module 'pg' {
  export interface QueryResult<R = Record<string, unknown>> {
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
    query<R = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<R>>
    end(): Promise<void>
  }
}
