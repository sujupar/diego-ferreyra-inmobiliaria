import { bloquesDeTexto } from '@/lib/landing/texto-con-formato'

/**
 * Dibuja una descripción respetando `### título` y `**negrita**` en vez de
 * mostrar los símbolos. Server component, sin HTML crudo.
 */
export function TextoConFormato({ texto }: { texto: string }) {
  return (
    <>
      {bloquesDeTexto(texto).map((b, i) =>
        b.tipo === 'titulo' ? (
          <h3 key={i} className="pt-2 text-xl md:text-2xl font-medium text-foreground">
            {b.texto}
          </h3>
        ) : (
          <p key={i}>
            {b.tramos.map((t, j) =>
              t.negrita ? (
                <strong key={j} className="font-semibold text-foreground">{t.texto}</strong>
              ) : (
                <span key={j}>{t.texto}</span>
              ),
            )}
          </p>
        ),
      )}
    </>
  )
}
