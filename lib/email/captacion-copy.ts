/**
 * Texto de los mails de captación (N8A al asesor, N8B al equipo) — módulo puro.
 *
 * POR QUÉ existe: hasta 2026-08-09 las dos piezas afirmaban que la
 * documentación estaba aprobada ("Se aprobó toda la documentación legal",
 * "Toda la documentación quedó aprobada"), porque era la única forma de llegar
 * a una captación. Ahora una propiedad se capta con fotos y sin papeles: esos
 * mails saldrían diciendo algo FALSO sobre propiedades sin documentación
 * revisada. Es el mismo error que ya tenía documentado el proyecto con
 * "Solicitud de tasación" ≠ "Tasación agendada": reusar una pieza parecida
 * hace que el email afirme cosas que no pasaron.
 *
 * Pure a propósito (sin 'server-only', sin React): así el texto se verifica con
 * vitest en vez de mirando una casilla de correo.
 */

export interface EntradaCopyCaptacion {
  /** `legal_status === 'approved'` al momento de captar. */
  documentacionAprobada: boolean
  /** Nombre del abogado que aprobó, si lo hubo. */
  nombreAbogado: string | null
  direccion: string
}

export interface CopyCaptacion {
  /** Título del bloque destacado (N8A) / encabezado (N8B). */
  titulo: string
  /** Frase que describe QUÉ pasó. Nunca afirma una aprobación que no existió. */
  fraseEstado: string
  /** Asunto del mail al asesor. */
  asuntoAsesor: string
  /** Asunto del mail al equipo. */
  asuntoEquipo: (nombreAsesor: string) => string
  /** Primer próximo paso. Con papeles pendientes, el recordatorio va primero. */
  proximosPasos: string[]
  /** Preheader del mail al asesor. */
  cierreAsesor: string
}

export function copyCaptacion(i: EntradaCopyCaptacion): CopyCaptacion {
  if (i.documentacionAprobada) {
    const quien = i.nombreAbogado ? `${i.nombreAbogado} aprobó` : 'Se aprobó'
    return {
      titulo: 'Nueva captación confirmada',
      fraseEstado: `${quien} toda la documentación legal. La propiedad está captada al 100% y lista para publicar.`,
      asuntoAsesor: `¡Lograste una nueva captación! — ${i.direccion}`,
      asuntoEquipo: (asesor) => `Nueva captación al 100% — ${i.direccion} (${asesor})`,
      proximosPasos: [
        'Publicá la propiedad en los portales desde la plataforma.',
        'Activá el seguimiento comercial con el propietario.',
      ],
      cierreAsesor: 'Ya podés publicarla.',
    }
  }

  // Sin documentación aprobada. El mail dice exactamente lo que pasó —
  // hay fotos cargadas — y deja el trámite legal como pendiente, no como hecho.
  return {
    titulo: 'Nueva captación',
    fraseEstado:
      'La propiedad ya tiene fotos cargadas y quedó captada: se puede publicar y difundir. ' +
      'La documentación legal todavía no está revisada — no es obligatoria para captar, pero conviene completarla.',
    asuntoAsesor: `¡Lograste una nueva captación! — ${i.direccion}`,
    asuntoEquipo: (asesor) => `Nueva captación — ${i.direccion} (${asesor}, documentación pendiente)`,
    proximosPasos: [
      'Cuando tengas la documentación, subila y enviala al abogado.',
      'Publicá la propiedad en los portales desde la plataforma.',
      'Activá el seguimiento comercial con el propietario.',
    ],
    cierreAsesor: 'Ya podés publicarla; la documentación queda pendiente.',
  }
}
