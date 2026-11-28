// Piezas puras de la programación con launchd (sin tocar disco ni launchctl): se prueban solas.

export const ETIQUETA = 'ar.inmodf.radar-referencias'

export interface DatosPlist {
  home: string
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** launchd arranca con un PATH mínimo: sin esto no encuentra node, git ni el CLI `claude`. */
export function pathDeLaunchd(home: string): string {
  return ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', `${home}/.local/bin`].join(':')
}

/** Rellena la plantilla del plist. Falla si queda algún {{MARCADOR}} sin resolver. */
export function renderPlist(plantilla: string, { home }: DatosPlist): string {
  const base = `${home}/.radar-referencias`
  const valores: Record<string, string> = {
    LABEL: ETIQUETA,
    SCRIPT: `${base}/app/radar/correr-diario.sh`,
    PATH: pathDeLaunchd(home),
    HOME: home,
    LOG: `${base}/logs/launchd.log`,
  }
  const out = plantilla.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in valores)) throw new Error(`Marcador desconocido en el plist: ${k}`)
    return esc(valores[k])
  })
  return out
}

/** `instalar [--rama X]` → rama a seguir (por defecto main). */
export function parseRama(args: string[]): string {
  const i = args.indexOf('--rama')
  if (i >= 0) {
    const v = args[i + 1]
    if (!v || v.startsWith('--')) throw new Error('--rama necesita un nombre de rama')
    return validarRama(v)
  }
  const ig = args.find((a) => a.startsWith('--rama='))
  return ig ? validarRama(ig.slice('--rama='.length)) : 'main'
}

export function validarRama(rama: string): string {
  if (!/^[A-Za-z0-9._\/-]+$/.test(rama) || rama.startsWith('-') || rama.includes('..')) {
    throw new Error(`Nombre de rama no válido: ${rama}`)
  }
  return rama
}

/** Del .env.local del repo, SOLO las dos claves que el radar necesita (nunca el resto). */
export function extraerEnvRadar(envLocal: string): string | null {
  const claves = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  const lineas: string[] = []
  for (const k of claves) {
    const m = envLocal.match(new RegExp(`^${k}=(.*)$`, 'm'))
    if (!m || !m[1].trim()) return null
    lineas.push(`${k}=${m[1].trim()}`)
  }
  return lineas.join('\n') + '\n'
}
