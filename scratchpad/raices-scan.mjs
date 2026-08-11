// Busca RAÍCES DE RETORNO (lo primero que devuelve un `return`) con `mx-auto`
// y sin ancho definido. Es el patrón que deja la caja en `fit-content` y le
// filtra el min-content de lo que lleva adentro al panel de contenido.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '..')

function archivos(dir, out = []) {
  for (const nombre of readdirSync(dir)) {
    const abs = path.join(dir, nombre)
    if (statSync(abs).isDirectory()) archivos(abs, out)
    else if (/\.tsx$/.test(nombre) && !/\.test\.tsx$/.test(nombre)) out.push(abs)
  }
  return out
}

// `return (` + salto + `<tag className="…"`  |  `return <tag className="…"`
const RE = /return\s*\(?\s*\n?\s*<[A-Za-z][\w.]*\s+className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g

const hallazgos = []
for (const abs of archivos(path.join(raiz, 'app/(dashboard)'))) {
  const src = readFileSync(abs, 'utf8')
  for (const m of src.matchAll(RE)) {
    const clases = m[1] ?? m[2] ?? m[3] ?? ''
    if (!/\bmx-auto\b/.test(clases)) continue
    if (/\bw-full\b|\bw-auto\b|\bw-\[/.test(clases)) continue
    const linea = src.slice(0, m.index).split('\n').length
    hallazgos.push(`${path.relative(raiz, abs)}:${linea}  ${clases.trim().slice(0, 110)}`)
  }
}

console.log(hallazgos.length ? hallazgos.join('\n') : 'sin hallazgos')
