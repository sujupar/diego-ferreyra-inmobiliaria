'use client'

/**
 * El campo de las palabras que activan la respuesta, igual en los tres diálogos.
 *
 * Muestra debajo, como etiquetas, la lista TAL COMO LA VA A ENTENDER el sistema
 * (sin repetidas ni vacías). Es la forma más directa de que el asesor vea que
 * "doblas, DOBLAS" es una sola palabra, o que una coma de más no hace nada,
 * antes de guardar y no después de que un comentario no reciba respuesta.
 *
 * La validación es la MISMA función que usa el servidor (`limpiarPalabras`),
 * así la pantalla no puede decir "bien" a algo que la ruta después rechaza.
 */
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { limpiarPalabras, separarPalabras } from '@/lib/social/reels/palabra-clave'

interface Props {
  id: string
  valor: string
  onCambiar: (valor: string) => void
  deshabilitado?: boolean
  /**
   * El reel lleva una descripción armada por nosotros (uno subido). En uno ya
   * publicado la descripción está en Instagram y no se toca, así que decir que
   * "la primera va en la descripción" sería falso.
   */
  conDescripcion?: boolean
}

/** Para que el diálogo apague "Guardar" con la misma regla que el servidor. */
export function palabrasSonValidas(valor: string): boolean {
  return limpiarPalabras(valor).ok
}

export function CampoPalabras({ id, valor, onCambiar, deshabilitado, conDescripcion = true }: Props) {
  const lista = separarPalabras(valor)
  const validacion = limpiarPalabras(valor)

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Palabras que activan la respuesta</Label>
      <Input
        id={id}
        value={valor}
        maxLength={500}
        disabled={deshabilitado}
        placeholder="parque rivadavia, doblas, info"
        aria-describedby={`${id}-ayuda`}
        aria-invalid={!validacion.ok}
        onChange={(e) => onCambiar(e.target.value)}
      />
      <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
        Separalas con coma.{' '}
        {conDescripcion && 'La primera es la que va en la descripción. '}
        Se responde a quien comente cualquiera de ellas, con o sin tilde.
      </p>

      {lista.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Palabras que se van a reconocer">
          {lista.map((palabra, i) => (
            <li key={palabra}>
              <Badge variant={i === 0 && conDescripcion ? 'default' : 'outline'} className="h-5 text-[10px]">
                {i === 0 && conDescripcion ? `${palabra.toLocaleUpperCase('es-AR')} · en la descripción` : palabra}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {!validacion.ok && (
        <p className="text-xs text-destructive" role="alert">{validacion.error}</p>
      )}
    </div>
  )
}
