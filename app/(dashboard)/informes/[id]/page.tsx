'use client'
import { useParams } from 'next/navigation'
import { EditorInforme } from '@/components/informes/editor/EditorInforme'

/** Pantalla de un informe quincenal. Quién lo ve lo decide la ruta (`cargarInforme`), no el menú. */
export default function InformePage() {
  const { id } = useParams<{ id: string }>()
  return <EditorInforme key={id} informeId={id} />
}
