/**
 * Publicaciones — probe de render estático de PasoRitmo y FilaRevision, SIN navegador
 * (Turbopack no corre en esta carpeta). Verifica que las 6 tarjetas estén, que la
 * frase del calendario aparezca, que los 4 íconos de redes tengan aria-pressed y
 * que nada arranque invisible (opacity:0) esperando al JS.
 * Correr: node --env-file=.env.local --import tsx scripts/publicaciones-ui.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { PasoRitmo } from '@/components/publicaciones/PasoRitmo'
import { FilaRevision } from '@/components/publicaciones/FilaRevision'
import { EstadoRedes } from '@/components/publicaciones/EstadoRedes'
import type { VideoVista } from '@/lib/publicaciones/tipos'

const HORARIOS = { '1': ['19:00'], '2': ['12:30', '19:00'], '3': ['09:00', '13:00', '19:00'], semana: ['19:00'] }

function exigir(c: unknown, m: string) {
  if (!c) throw new Error('FALLA: ' + m)
  console.log('✓', m)
}

const ritmo = renderToStaticMarkup(
  React.createElement(PasoRitmo, {
    cantidad: 20,
    ritmoInicial: { tipo: 'por_dia', cantidad: 1 },
    inicioInicial: '2099-10-30',
    soloHabilesInicial: false,
    horarios: HORARIOS,
    guardando: false,
    onConfirmar: () => {},
  }),
)
for (const t of ['Todos ya', '1 por día', '2 por día', '3 por día', '1 por semana', 'A mi manera']) {
  exigir(ritmo.includes(t), `tarjeta "${t}"`)
}
exigir((ritmo.match(/role="radio"/g) ?? []).length === 6, '6 tarjetas como radio')
exigir(ritmo.includes('20 videos, 1 por día a las 19:00 → del'), 'frase del calendario')
exigir(ritmo.includes('¿Cómo querés repartir estos 20 videos?'), 'título con la cantidad')
// El <input aria-hidden> del Switch de Radix es invisible a propósito: no es contenido.
const sinInputsOcultos = ritmo.replace(/<input[^>]*aria-hidden="true"[^>]*>/g, '')
exigir(!/opacity:\s*0[;"]/.test(sinInputsOcultos), 'nada arranca con opacity:0')

const video: VideoVista = {
  id: 'v1', tanda_id: 't1', orden: 0, origen: 'subida', drive_file_id: null,
  nombre_archivo: '[TEST] clip.mp4', tamano_bytes: 1000, video_path: 'tandas/t1/v1/video.mp4',
  miniatura_path: null, audio_path: null, duracion_seg: 200, etapa: 'listo', error_etapa: null,
  ultimo_error: 'sin_voz', transcripcion: [], descripcion: '', descripcion_editada: false,
  titulo_youtube: '', redes: ['instagram', 'youtube'], programado_para: '2099-10-30T22:00:00.000Z',
  hora_manual: true, pausado: false, archivo_borrado_at: null, titulo_editado: false,
  created_at: '', updated_at: '', miniatura_url: null, video_url: null,
}
const fila = renderToStaticMarkup(React.createElement(FilaRevision, { video, editable: true, onCambio: () => {} }))
exigir((fila.match(/aria-pressed=/g) ?? []).length === 4, '4 íconos de red con aria-pressed')
exigir((fila.match(/aria-pressed="true"/g) ?? []).length === 2, '2 redes encendidas')
exigir(fila.includes('Sin voz: escribí la descripción'), 'aviso de sin voz')
exigir(fila.includes('va como video común, no como Short'), 'aviso de YouTube > 3 min')
exigir(fila.includes('hora manual'), 'badge de hora manual')
exigir(fila.includes('value="2099-10-30"') && fila.includes('value="19:00"'), 'día y hora en hora argentina')
const envioBase = {
  video_id: 'v1', etapa: null, ids_externos: {}, intentos: 0, proximo_intento: null, ultimo_error: null,
  enlace: null, created_at: '', updated_at: '2026-10-30T15:00:00Z',
}
const estados = renderToStaticMarkup(
  React.createElement(EstadoRedes, {
    envios: [
      { ...envioBase, id: 'e1', plataforma: 'instagram', estado: 'publicado', enlace: 'https://www.instagram.com/reel/abc/' },
      { ...envioBase, id: 'e2', plataforma: 'facebook', estado: 'fallido', ultimo_error: 'Meta rechazó la publicación: x' },
    ],
    video: { programado_para: '2020-01-01T00:00:00Z' },
    automatica: true,
    onReintentar: () => {},
  }),
)
exigir(estados.includes('href="https://www.instagram.com/reel/abc/"') && estados.includes('Ver en Instagram'), 'enlace al post publicado')
exigir(estados.includes('Meta rechazó la publicación: x') && estados.includes('Reintentar'), 'motivo y Reintentar del fallido')
const apagado = renderToStaticMarkup(
  React.createElement(EstadoRedes, {
    envios: [{ ...envioBase, id: 'e3', plataforma: 'instagram', estado: 'programado' }],
    video: { programado_para: '2020-01-01T00:00:00Z' },
    automatica: false,
  }),
)
exigir(apagado.includes('Esperando: publicación automática apagada'), 'esperando con el interruptor apagado (criterio 10)')
const largo = renderToStaticMarkup(
  React.createElement(FilaRevision, { video: { ...video, duracion_seg: 103, redes: ['facebook'] }, editable: true, onCambio: () => {} }),
)
exigir(largo.includes('Facebook: va como video normal'), 'aviso de Facebook para más de 90 s')
console.log('\nOK probe UI publicaciones')
