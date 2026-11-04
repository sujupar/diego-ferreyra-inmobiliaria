/** Sonda (no se commitea): lista la carpeta de Drive del dueño con el mismo código del servidor. No escribe nada. */
import { listarDrive } from '@/lib/publicaciones/servidor/drive'

async function main() {
  const r = await listarDrive(process.argv[2] ?? '')
  console.log('carpeta:', r.nombre, '· subcarpetas:', r.subcarpetas)
  for (const a of r.archivos) console.log(`- ${a.nombre} · ${(a.tamano / 1048576).toFixed(1)} MB · ${a.apto ? 'se puede traer' : a.motivo}`)
}
main().catch((e) => console.error('FALLÓ:', e instanceof Error ? e.message : e))
