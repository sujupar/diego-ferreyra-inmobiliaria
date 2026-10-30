/**
 * Cola de guardado de los videos, sin React (así se prueba en node).
 *
 * Tres reglas que el primer autoguardado no cumplía (revisión de la rama):
 * 1. Los cambios de un mismo video se mandan DE A UNO: dos pedidos en paralelo
 *    pueden llegar al revés y el viejo pisar al nuevo.
 * 2. Si un envío falla, sus cambios vuelven a quedar pendientes (debajo de lo que
 *    se haya escrito después): nada se pierde en silencio.
 * 3. `vaciar` espera lo que está en vuelo y tira un error si algo no se guardó,
 *    así "Programar" no sigue adelante con una descripción vieja.
 */
export type Campos = Record<string, unknown>

export class ColaDeGuardado {
  private pendientes = new Map<string, Campos>()
  private enVuelo = new Map<string, Promise<void>>()

  constructor(private readonly enviarAlServidor: (videoId: string, campos: Campos) => Promise<void>) {}

  agregar(videoId: string, campos: Campos): void {
    this.pendientes.set(videoId, { ...(this.pendientes.get(videoId) ?? {}), ...campos })
  }

  hayPendientes(): boolean {
    return this.pendientes.size > 0 || this.enVuelo.size > 0
  }

  /** Saca lo pendiente de un video sin mandarlo (para el envío de último momento al cerrar). */
  tomarPendiente(videoId: string): Campos | undefined {
    const campos = this.pendientes.get(videoId)
    this.pendientes.delete(videoId)
    return campos
  }

  idsPendientes(): string[] {
    return [...new Set([...this.pendientes.keys(), ...this.enVuelo.keys()])]
  }

  /** Manda lo pendiente de un video cuando termine su envío anterior. */
  enviar(videoId: string): Promise<void> {
    const tomar = () => {
      const campos = this.pendientes.get(videoId)
      this.pendientes.delete(videoId)
      return campos
    }
    const anterior = this.enVuelo.get(videoId)
    // Sin nada en vuelo, se manda lo que había AL PEDIRLO; con algo en vuelo, lo que
    // se haya juntado hasta que ese termine.
    const tomadoYa = anterior ? undefined : tomar()
    const este = (anterior ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const campos = anterior ? tomar() : tomadoYa
        if (!campos) return
        try {
          await this.enviarAlServidor(videoId, campos)
        } catch (e) {
          // Lo escrito después de este envío manda sobre lo que se repone.
          this.pendientes.set(videoId, { ...campos, ...(this.pendientes.get(videoId) ?? {}) })
          throw e
        }
      })
      .finally(() => {
        if (this.enVuelo.get(videoId) === este) this.enVuelo.delete(videoId)
      })
    this.enVuelo.set(videoId, este)
    return este
  }

  /** Manda todo lo pendiente y espera; tira si algo no se pudo guardar. */
  async vaciar(): Promise<void> {
    const ids = this.idsPendientes()
    const resultados = await Promise.allSettled(ids.map((id) => this.enviar(id)))
    if (resultados.some((r) => r.status === 'rejected') || this.pendientes.size > 0) {
      throw new Error('No se guardó el último cambio. Revisá la conexión y volvé a intentar.')
    }
  }
}
