'use client'
/**
 * Pantallas de la encuesta (spec §3.6 + adenda §11.3). Componentes de MÓDULO, nunca declarados
 * dentro de otro (CLAUDE.md: un componente declarado en el render se remonta en cada cambio de
 * estado y se pierde el toque). Celular primero: opciones de ≥ 48 px, inputs de 16 px, botón de
 * cada paso EN EL FLUJO (no fijo: con el teclado abierto en iOS quedaría encima del campo).
 * Las letras A/B/C y "presioná Enter ↵" solo se ven con mouse (@media hover:hover).
 */
import Image from 'next/image'
import { useState, type ReactNode, type RefObject } from 'react'
import { ArrowLeft, Check, Download, Gift, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { atajosDeOferta, textoMonto } from '@/lib/visitas/encuesta/oferta'
import { OTRA, type OpcionEncuesta } from '@/lib/visitas/encuesta/opciones'
import type { EncuestaPublica } from '@/lib/visitas/encuesta/publica'
import { emailEscritoValido, telefonoEscritoValido, type ContactoBorrador } from '@/lib/visitas/encuesta/reproductor'

export const LETRAS = 'ABCDEFGH'
type Titulo = RefObject<HTMLHeadingElement | null>

const OPCION = 'flex min-h-12 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-base transition-colors hover:border-brand disabled:opacity-60'
const OPCION_ELEGIDA = 'border-brand bg-brand-soft text-foreground'
const CAMPO = 'min-h-12 w-full min-w-0 rounded-xl border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-brand'
const BOTON = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 text-base font-semibold text-brand-foreground disabled:opacity-60 sm:w-auto'
const SECUNDARIO = 'inline-flex min-h-12 w-full items-center justify-center rounded-xl border px-5 text-base font-medium disabled:opacity-60 sm:w-auto'

function TituloPaso({ tituloRef, children }: { tituloRef: Titulo; children: ReactNode }) {
  return <h1 ref={tituloRef} tabIndex={-1} className="break-words text-2xl font-semibold leading-snug outline-none">{children}</h1>
}

function Letra({ i }: { i: number }) {
  return (
    <span aria-hidden="true" className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold [@media(hover:hover)]:inline-flex">
      {LETRAS[i]}
    </span>
  )
}

function PistaEnter() {
  return <span className="hidden text-sm text-muted-foreground [@media(hover:hover)]:inline">presioná <kbd className="font-sans font-semibold">Enter ↵</kbd></span>
}

export function BarraDeAvance({ valor }: { valor: number }) {
  const pct = Math.round(valor * 100)
  return (
    <div role="progressbar" aria-label="Avance de la encuesta" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-brand transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function BotonAtras({ onAtras, deshabilitado }: { onAtras: () => void; deshabilitado: boolean }) {
  return (
    <button type="button" onClick={onAtras} disabled={deshabilitado} aria-label="Volver a la pregunta anterior"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted disabled:opacity-60">
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  )
}

export function Bienvenida({ encuesta, tituloRef, onEmpezar }: { encuesta: EncuestaPublica; tituloRef: Titulo; onEmpezar: () => void }) {
  const lugar = encuesta.barrio ? `${encuesta.direccion}, ${encuesta.barrio}` : encuesta.direccion
  return (
    <div className="flex flex-col gap-5">
      {encuesta.foto && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
          <Image src={encuesta.foto} alt={`Foto de ${encuesta.direccion}`} fill priority sizes="(max-width: 640px) 100vw, 576px" className="object-cover" />
        </div>
      )}
      <p className="text-sm font-medium text-muted-foreground">Visitaste {lugar}</p>
      {encuesta.regalo ? (
        <>
          <div className="flex items-center gap-4 rounded-2xl border bg-card p-4">
            {encuesta.regalo.portada ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL firmada de un bucket privado: no pasa por el optimizador
              <img src={encuesta.regalo.portada} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-brand-soft"><Gift className="h-7 w-7 text-brand" aria-hidden="true" /></span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tu regalo</p>
              <p className="break-words font-semibold">{encuesta.regalo.titulo}</p>
            </div>
          </div>
          <TituloPaso tituloRef={tituloRef}>{encuesta.nombre ? `${encuesta.nombre}, este regalo es tuyo.` : 'Este regalo es tuyo.'}</TituloPaso>
          <p className="text-base text-muted-foreground">Contanos qué te pareció la visita y es tuyo al instante. Te lleva menos de un minuto.</p>
          <div className="flex flex-wrap items-center gap-3"><button type="button" className={BOTON} onClick={onEmpezar}>Quiero mi regalo</button><PistaEnter /></div>
        </>
      ) : (
        <>
          <TituloPaso tituloRef={tituloRef}>
            {encuesta.nombre ? `${encuesta.nombre}, ¿qué te pareció ${encuesta.direccion}?` : `¿Qué te pareció ${encuesta.direccion}?`}
          </TituloPaso>
          <p className="text-base text-muted-foreground">Te lleva menos de un minuto.</p>
          <div className="flex flex-wrap items-center gap-3"><button type="button" className={BOTON} onClick={onEmpezar}>Empezar</button><PistaEnter /></div>
        </>
      )}
    </div>
  )
}

export function PreguntaUnica<T extends string | boolean>({ titulo, opciones, elegida, onElegir, tituloRef, ocupado }: {
  titulo: string
  opciones: ReadonlyArray<{ valor: T; etiqueta: string }>
  elegida: T | null
  onElegir: (v: T) => void
  tituloRef: Titulo
  ocupado: boolean
}) {
  return (
    <div className="flex flex-col gap-5">
      <TituloPaso tituloRef={tituloRef}>{titulo}</TituloPaso>
      <div role="radiogroup" aria-label={titulo} className="flex flex-col gap-3">
        {opciones.map((o, i) => (
          <button key={String(o.valor)} type="button" role="radio" aria-checked={elegida === o.valor} disabled={ocupado}
            onClick={() => onElegir(o.valor)} className={cn(OPCION, elegida === o.valor && OPCION_ELEGIDA)}>
            <Letra i={i} />
            <span className="min-w-0 break-words">{o.etiqueta}</span>
            {elegida === o.valor && (ocupado ? <Loader2 className="ml-auto h-5 w-5 shrink-0 animate-spin" aria-hidden="true" /> : <Check className="ml-auto h-5 w-5 shrink-0" aria-hidden="true" />)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function PreguntaVarias({ id, titulo, opciones, elegidas, otra, onAlternar, onOtra, onOk, puedeOk, tituloRef, ocupado }: {
  id: string
  titulo: string
  opciones: OpcionEncuesta[]
  elegidas: string[]
  otra: string | null
  onAlternar: (clave: string) => void
  onOtra: (texto: string) => void
  onOk: () => void
  puedeOk: boolean
  tituloRef: Titulo
  ocupado: boolean
}) {
  return (
    <form className="flex flex-col gap-5" onSubmit={e => { e.preventDefault(); if (puedeOk && !ocupado) onOk() }}>
      <TituloPaso tituloRef={tituloRef}>{titulo}</TituloPaso>
      <p className="text-sm text-muted-foreground">Podés elegir varias.</p>
      <div role="group" aria-label={titulo} className="flex flex-col gap-3">
        {opciones.map((o, i) => {
          const marcada = elegidas.includes(o.clave)
          return (
            <button key={o.clave} type="button" aria-pressed={marcada} disabled={ocupado} onClick={() => onAlternar(o.clave)} className={cn(OPCION, marcada && OPCION_ELEGIDA)}>
              <Letra i={i} />
              <span className="min-w-0 break-words">{o.etiqueta}</span>
              {marcada && <Check className="ml-auto h-5 w-5 shrink-0" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      {elegidas.includes(OTRA) && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`otra-${id}`} className="text-sm font-medium">¿Qué otra cosa?</label>
          <input id={`otra-${id}`} type="text" className={CAMPO} maxLength={280} value={otra ?? ''} onChange={e => onOtra(e.target.value)} enterKeyHint="next" autoComplete="off" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={BOTON} disabled={!puedeOk || ocupado}>
          {ocupado ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}OK
        </button>
        <PistaEnter />
      </div>
    </form>
  )
}

export function PreguntaOferta({ encuesta, texto, onTexto, onAtajo, onDeclinar, onOk, puedeOk, tituloRef, ocupado }: {
  encuesta: EncuestaPublica
  texto: string
  onTexto: (t: string) => void
  onAtajo: (monto: number) => void
  onDeclinar: () => void
  onOk: () => void
  puedeOk: boolean
  tituloRef: Titulo
  ocupado: boolean
}) {
  const atajos = atajosDeOferta(encuesta.precio, encuesta.moneda)
  return (
    <form className="flex flex-col gap-5" onSubmit={e => { e.preventDefault(); if (puedeOk && !ocupado) onOk() }}>
      <TituloPaso tituloRef={tituloRef}>Si fueras a comprarla, ¿cuánto ofertarías?</TituloPaso>
      <div className="flex flex-col gap-1">
        <label htmlFor="oferta" className="text-sm font-medium">Tu oferta en {encuesta.moneda === 'USD' ? 'dólares' : 'pesos'}</label>
        <div className="flex min-h-12 items-center gap-2 rounded-xl border bg-background px-3 focus-within:ring-2 focus-within:ring-brand">
          <span aria-hidden="true" className="text-base text-muted-foreground">{encuesta.moneda === 'USD' ? 'US$' : '$'}</span>
          <input id="oferta" inputMode="numeric" enterKeyHint="next" autoComplete="off" placeholder="0"
            className="min-h-11 w-full min-w-0 bg-transparent text-base outline-none" value={texto} onChange={e => onTexto(e.target.value)} />
        </div>
      </div>
      {atajos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {atajos.map(a => (
            <button key={a.etiqueta} type="button" disabled={ocupado} onClick={() => onAtajo(a.monto)} className="min-h-11 rounded-full border px-4 text-sm">
              {a.etiqueta}: {textoMonto(a.monto, encuesta.moneda)}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-muted-foreground">El propietario no ve tu nombre.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" className={BOTON} disabled={!puedeOk || ocupado}>
          {ocupado ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}OK
        </button>
        <button type="button" className={SECUNDARIO} disabled={ocupado} onClick={onDeclinar}>Prefiero no decirlo</button>
      </div>
    </form>
  )
}

export function PasoContacto({ encuesta, contacto, onCambio, onEnviar, puedeEnviar, tituloRef, ocupado }: {
  encuesta: EncuestaPublica
  contacto: ContactoBorrador
  onCambio: (c: Partial<ContactoBorrador>) => void
  onEnviar: () => void
  puedeEnviar: boolean
  tituloRef: Titulo
  ocupado: boolean
}) {
  // "Tocado" recién al SALIR del campo (ronda 1, hallazgo 4): nadie necesita ver el error mientras
  // todavía está escribiendo — eso sería peor que el botón apagado sin explicación que vinimos a arreglar.
  const [telTocado, setTelTocado] = useState(false)
  const [emailTocado, setEmailTocado] = useState(false)
  const telInvalido = telTocado && !telefonoEscritoValido(contacto.telefono)
  const emailInvalido = emailTocado && !emailEscritoValido(contacto.email)
  return (
    <form className="relative flex flex-col gap-5" onSubmit={e => { e.preventDefault(); if (puedeEnviar && !ocupado) onEnviar() }}>
      <TituloPaso tituloRef={tituloRef}>{encuesta.regalo ? 'Confirmá tus datos para recibirlo' : 'Último paso: confirmá tus datos'}</TituloPaso>
      {encuesta.regalo && <p className="text-base">Tu regalo: <strong className="break-words">{encuesta.regalo.titulo}</strong></p>}
      <div className="flex flex-col gap-1">
        {encuesta.telefonoEnmascarado && !contacto.cambiarTelefono ? (
          <>
            <span className="text-sm font-medium">Tu WhatsApp</span>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3">
              <span className="text-base">{encuesta.telefonoEnmascarado}</span>
              <button type="button" className="min-h-11 px-2 text-sm font-medium text-brand" onClick={() => onCambio({ cambiarTelefono: true })}>Cambiar</button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="telefono" className="text-sm font-medium">Tu WhatsApp</label>
            <input id="telefono" type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next" placeholder="11 5823-4521"
              className={CAMPO} value={contacto.telefono} onChange={e => onCambio({ telefono: e.target.value })}
              onBlur={() => setTelTocado(true)} aria-invalid={telInvalido} aria-describedby={telInvalido ? 'telefono-ayuda' : undefined}
              // Enter en el teléfono NO manda el formulario (faltaría el email): pasa al siguiente campo.
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('email')?.focus() } }} />
            {telInvalido && <p id="telefono-ayuda" className="text-sm text-red-700">El teléfono tiene que tener al menos 8 números.</p>}
          </>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">Tu email (opcional)</label>
        <input id="email" type="email" inputMode="email" autoComplete="email" enterKeyHint="send"
          className={CAMPO} value={contacto.email} onChange={e => onCambio({ email: e.target.value })}
          onBlur={() => setEmailTocado(true)} aria-invalid={emailInvalido} aria-describedby={emailInvalido ? 'email-ayuda' : undefined} />
        {emailInvalido && <p id="email-ayuda" className="text-sm text-red-700">Revisá el email, o dejalo vacío.</p>}
      </div>
      <label className="flex min-h-11 items-start gap-3 text-base">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[color:var(--brand)]" checked={contacto.similares} onChange={e => onCambio({ similares: e.target.checked })} />
        <span>Avisame si entra una propiedad parecida</span>
      </label>
      {/* Honeypot: fuera de la pantalla, sin tab y sin autocompletar. Una persona no lo ve; un robot
          lo llena. Nombre/id sin sentido A PROPÓSITO: con "empresa" Chrome autocompletaba el campo
          (lo reconoce como "company") y una persona real quedaba marcada como robot. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-px w-px overflow-hidden">
        <label htmlFor="hp_campo_x">No completar este campo</label>
        <input id="hp_campo_x" name="hp_campo_x" tabIndex={-1} autoComplete="off" value={contacto.hp_campo_x} onChange={e => onCambio({ hp_campo_x: e.target.value })} />
      </div>
      <button type="submit" className={BOTON} disabled={!puedeEnviar || ocupado}>
        {ocupado ? 'Enviando…' : encuesta.regalo ? 'Quiero mi regalo' : 'Enviar'}
      </button>
    </form>
  )
}

export function Gracias({ encuesta, descarga, dejoEmail, tituloRef }: { encuesta: EncuestaPublica; descarga: string | null; dejoEmail: boolean; tituloRef: Titulo }) {
  const canales = [dejoEmail ? 'a tu email' : null, encuesta.regaloPorWhatsapp ? 'por WhatsApp' : null].filter((c): c is string => c !== null)
  return (
    <div className="flex flex-col gap-5">
      <TituloPaso tituloRef={tituloRef}>{encuesta.nombre ? `¡Gracias, ${encuesta.nombre}!` : '¡Gracias!'}</TituloPaso>
      {encuesta.regalo && descarga && (
        <>
          <p className="text-base">Acá tenés tu regalo:</p>
          {/* Un título de regalo largo (120 caracteres) no tiene por qué entrar en una línea: sin
              estas clases desbordaba el ancho de un celular de 360 px (CLAUDE.md § celular). */}
          <div className="min-w-0">
            <a href={descarga} className={cn(BOTON, 'h-auto min-w-0 whitespace-normal break-words')}>
              <Download className="h-5 w-5 shrink-0" aria-hidden="true" />Descargar {encuesta.regalo.titulo}
            </a>
          </div>
          {canales.length > 0 && <p className="text-sm text-muted-foreground">También te lo mandamos {canales.join(' y ')}.</p>}
        </>
      )}
      <p className="text-base text-muted-foreground">Si querés volver a verla o hacer una oferta, respondé el WhatsApp de la visita.</p>
    </div>
  )
}
