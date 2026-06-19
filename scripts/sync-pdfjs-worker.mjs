// Copia el worker de pdfjs-dist a public/ para que su versión SIEMPRE coincida con la
// del paquete instalado (el worker y el módulo principal deben ser la misma versión, o
// pdfjs falla en runtime). Se corre en postinstall. Es no-fatal: si algo falla, queda el
// worker commiteado (que coincide con la versión pineada) como fallback.
import { mkdirSync, copyFileSync } from 'node:fs'

try {
    mkdirSync('public/pdfjs', { recursive: true })
    copyFileSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/pdfjs/pdf.worker.min.mjs')
    console.log('[sync-pdfjs-worker] worker sincronizado')
} catch (e) {
    console.warn('[sync-pdfjs-worker] skip:', e instanceof Error ? e.message : e)
}
