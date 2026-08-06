#!/usr/bin/env tsx
/**
 * Renderiza el Manual de Gestión Operativa a PDF.
 *
 * Filosofía: sistema semi-autónomo con supervisión humana. Cada acción marcada
 * como AUTOMATIZADO, REVISIÓN HUMANA o HÍBRIDO para dejar claro qué ejecuta
 * el sistema (Claude Code / Claude Cowork + APIs) y qué queda al humano.
 *
 * Tratamiento visual: editorial (mismo motor que informe Meta Ads 27 May).
 * Font primario: Inter (cache local en /tmp).
 * Fallback: Helvetica si la descarga falla.
 *
 * Salida: ./manual-gestion-campanas-2026-07-10.pdf
 */
import React from 'react'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Document, Page, Text, View, StyleSheet, Font, renderToFile } from '@react-pdf/renderer'

// ============================================================================
// FONT REGISTRATION
// ============================================================================

const INTER_BASE = 'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files/'
const INTER_FILES = {
  400: 'inter-latin-400-normal.ttf',
  500: 'inter-latin-500-normal.ttf',
  700: 'inter-latin-700-normal.ttf',
  900: 'inter-latin-900-normal.ttf',
} as const

let FONT_FAMILY: 'Inter' | 'Helvetica' = 'Helvetica'

async function setupFonts(): Promise<void> {
  const cacheDir = path.join(os.tmpdir(), 'inter-fonts-cache-v1')
  try {
    fs.mkdirSync(cacheDir, { recursive: true })
    for (const [, name] of Object.entries(INTER_FILES)) {
      const dst = path.join(cacheDir, name)
      if (!fs.existsSync(dst) || fs.statSync(dst).size < 50_000) {
        const res = await fetch(INTER_BASE + name)
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${name}`)
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 50_000) throw new Error(`Truncated TTF ${name} (${buf.length} bytes)`)
        fs.writeFileSync(dst, buf)
      }
    }
    Font.register({
      family: 'Inter',
      fonts: [
        { src: path.join(cacheDir, INTER_FILES[400]), fontWeight: 400 },
        { src: path.join(cacheDir, INTER_FILES[500]), fontWeight: 500 },
        { src: path.join(cacheDir, INTER_FILES[700]), fontWeight: 700 },
        { src: path.join(cacheDir, INTER_FILES[900]), fontWeight: 900 },
      ],
    })
    FONT_FAMILY = 'Inter'
  } catch (e) {
    console.warn(`  ! Inter no disponible, usando Helvetica: ${(e as Error).message}`)
    FONT_FAMILY = 'Helvetica'
  }
}

// ============================================================================
// COLORS
// ============================================================================

const c = {
  bg: '#FAFAF7',
  surface: '#FFFFFF',
  fg: '#0A0A0A',
  muted: '#5C5C5C',
  mutedSoft: '#8A8A8A',
  line: '#E8E8E3',
  lineSoft: '#F0EFEA',
  zebra: '#F4F2EB',
  accent: '#C2410C',
  accentBg: '#F7E9DF',
  good: '#15803D',
  goodBg: '#DCFCE7',
  warn: '#B45309',
  warnBg: '#FEF3C7',
  bad: '#991B1B',
  badBg: '#FEE2E2',
  info: '#1E40AF',
  infoBg: '#DBEAFE',
  watermark: '#ECECE5',
}

// ============================================================================
// STYLES
// ============================================================================

function buildStyles() {
  const F = FONT_FAMILY

  return StyleSheet.create({
    page: {
      paddingTop: 48,
      paddingBottom: 44,
      paddingHorizontal: 50,
      fontFamily: F,
      fontWeight: 400,
      fontSize: 9.5,
      color: c.fg,
      backgroundColor: c.bg,
      lineHeight: 1.4,
    },

    coverPage: {
      paddingTop: 48,
      paddingBottom: 44,
      paddingHorizontal: 50,
      fontFamily: F,
      fontWeight: 400,
      fontSize: 9.5,
      color: c.fg,
      backgroundColor: c.bg,
    },

    eyebrow: {
      fontSize: 8,
      fontFamily: F,
      fontWeight: 500,
      color: c.muted,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    coverEyebrow: {
      fontSize: 9,
      fontFamily: F,
      fontWeight: 500,
      color: c.accent,
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginBottom: 30,
    },
    coverTitle: {
      fontSize: 46,
      fontFamily: F,
      fontWeight: 900,
      color: c.fg,
      letterSpacing: -1,
      lineHeight: 1.02,
      marginBottom: 10,
    },
    coverSubtitle: {
      fontSize: 14,
      fontFamily: F,
      fontWeight: 400,
      color: c.muted,
      lineHeight: 1.35,
      marginBottom: 6,
    },
    coverWatermark: {
      position: 'absolute',
      fontSize: 240,
      fontFamily: F,
      fontWeight: 900,
      color: c.watermark,
      top: 100,
      left: 210,
    },
    h1: {
      fontSize: 26,
      fontFamily: F,
      fontWeight: 900,
      color: c.fg,
      letterSpacing: -0.5,
      lineHeight: 1.08,
      marginBottom: 4,
    },
    h2: {
      fontSize: 13.5,
      fontFamily: F,
      fontWeight: 700,
      color: c.fg,
      letterSpacing: -0.3,
      lineHeight: 1.2,
      marginTop: 14,
      marginBottom: 4,
    },
    h3: {
      fontSize: 10.5,
      fontFamily: F,
      fontWeight: 700,
      color: c.fg,
      lineHeight: 1.25,
      marginTop: 10,
      marginBottom: 3,
    },
    body: {
      fontSize: 9.5,
      fontFamily: F,
      fontWeight: 400,
      color: c.fg,
      lineHeight: 1.42,
      marginBottom: 4,
    },
    caption: {
      fontSize: 8.5,
      fontFamily: F,
      fontWeight: 400,
      color: c.muted,
      lineHeight: 1.4,
    },
    micro: {
      fontSize: 7.5,
      fontFamily: F,
      fontWeight: 400,
      color: c.muted,
      lineHeight: 1.4,
    },
    bold: { fontFamily: F, fontWeight: 700 },
    medium: { fontFamily: F, fontWeight: 500 },

    pageHeader: { position: 'absolute', top: 36, left: 50, right: 50 },
    pageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 8 },
    pageHeaderRule: { borderBottomWidth: 0.5, borderBottomColor: c.line },
    pageFooter: { position: 'absolute', bottom: 36, left: 50, right: 50 },
    pageFooterRule: { borderTopWidth: 0.5, borderTopColor: c.line, marginBottom: 8 },
    pageFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    runningTitle: { fontSize: 8, fontFamily: F, fontWeight: 400, color: c.muted },
    pageNumber: { fontSize: 12, fontFamily: F, fontWeight: 400, color: c.fg },

    // Chip system for AUTOMATIZADO / REVISIÓN HUMANA / HÍBRIDO
    chip: {
      fontSize: 6.5,
      fontFamily: F,
      fontWeight: 700,
      letterSpacing: 0.6,
      paddingHorizontal: 5,
      paddingVertical: 2,
      borderRadius: 2,
      marginRight: 6,
      marginBottom: 2,
    },
    chipAuto: { color: c.good, backgroundColor: c.goodBg },
    chipHuman: { color: c.info, backgroundColor: c.infoBg },
    chipHybrid: { color: c.accent, backgroundColor: c.accentBg },

    chipRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' },
    chipInline: {
      fontSize: 6.5,
      fontFamily: F,
      fontWeight: 700,
      letterSpacing: 0.6,
      paddingHorizontal: 4,
      paddingVertical: 1.5,
      borderRadius: 2,
    },

    // Tables
    table: { marginVertical: 4, borderTopWidth: 1, borderTopColor: c.fg },
    trHead: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.75, borderBottomColor: c.fg },
    tr: { flexDirection: 'row', paddingVertical: 3.5, borderBottomWidth: 0.25, borderBottomColor: c.lineSoft, alignItems: 'flex-start' },
    trZebra: { flexDirection: 'row', paddingVertical: 3.5, backgroundColor: c.zebra, borderBottomWidth: 0.25, borderBottomColor: c.lineSoft, alignItems: 'flex-start' },
    trLast: { flexDirection: 'row', paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: c.line, alignItems: 'flex-start' },
    th: {
      fontSize: 7,
      fontFamily: F,
      fontWeight: 500,
      color: c.muted,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      paddingHorizontal: 4,
    },
    td: { fontSize: 8.5, fontFamily: F, fontWeight: 400, color: c.fg, paddingHorizontal: 4, lineHeight: 1.32 },
    tdNum: { fontSize: 9, fontFamily: F, fontWeight: 500, color: c.fg, paddingHorizontal: 4, textAlign: 'right', lineHeight: 1.3 },

    // Bullets
    bullet: { flexDirection: 'row', marginBottom: 3 },
    bulletMark: { width: 10, fontSize: 9.5, color: c.fg, lineHeight: 1.4 },
    bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.4 },

    // Callout
    callout: { borderLeftWidth: 2, borderLeftColor: c.fg, paddingLeft: 12, paddingVertical: 6, marginVertical: 8 },
    calloutAccent: { borderLeftWidth: 2, borderLeftColor: c.accent, paddingLeft: 12, paddingVertical: 6, marginVertical: 8 },
    calloutTitle: { fontSize: 9.5, fontFamily: F, fontWeight: 700, color: c.fg, marginBottom: 3 },
    calloutBody: { fontSize: 9, fontFamily: F, fontWeight: 400, color: c.fg, lineHeight: 1.4 },

    // Section card (for major sections like Rituals)
    card: { borderWidth: 0.5, borderColor: c.line, padding: 12, marginBottom: 8, backgroundColor: c.surface },
    cardTitle: { fontSize: 10, fontFamily: F, fontWeight: 700, color: c.fg, marginBottom: 6 },

    // Table of contents entry
    tocRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6, borderBottomWidth: 0.25, borderBottomColor: c.line, paddingBottom: 4 },
    tocSection: { fontSize: 9, fontFamily: F, fontWeight: 500, color: c.muted, letterSpacing: 1, marginRight: 12, minWidth: 24 },
    tocTitle: { fontSize: 10.5, fontFamily: F, fontWeight: 500, color: c.fg, flex: 1 },
    tocPage: { fontSize: 10, fontFamily: F, fontWeight: 400, color: c.fg, minWidth: 20, textAlign: 'right' },

    // Architecture diagram
    archBlock: {
      borderWidth: 0.5,
      borderColor: c.fg,
      padding: 10,
      marginBottom: 6,
      backgroundColor: c.surface,
    },
    archBlockTitle: { fontSize: 9, fontFamily: F, fontWeight: 700, color: c.fg, marginBottom: 4 },
    archArrow: { alignSelf: 'center', fontSize: 14, color: c.mutedSoft, marginVertical: -2 },
  })
}

let s: ReturnType<typeof buildStyles>

// ============================================================================
// PRIMITIVES
// ============================================================================

function PageChrome({ runningTitle, eyebrow, pageNumber }: { runningTitle: string; eyebrow: string; pageNumber: number }) {
  return (
    <>
      <View style={s.pageHeader} fixed>
        <View style={s.pageHeaderRow}>
          <Text style={s.eyebrow}>{eyebrow}</Text>
          <Text style={s.runningTitle}>{runningTitle}</Text>
        </View>
        <View style={s.pageHeaderRule} />
      </View>
      <View style={s.pageFooter} fixed>
        <View style={s.pageFooterRule} />
        <View style={s.pageFooterRow}>
          <Text style={s.runningTitle}>Manual Operativo · Diego Ferreyra Inmobiliaria · Jul 2026</Text>
          <Text style={s.pageNumber}>{String(pageNumber).padStart(2, '0')}</Text>
        </View>
      </View>
    </>
  )
}

function Chip({ kind, small = false }: { kind: 'auto' | 'human' | 'hybrid'; small?: boolean }) {
  const label = kind === 'auto' ? 'AUTOMATIZADO' : kind === 'human' ? 'HUMANO' : 'HÍBRIDO'
  const style = kind === 'auto' ? s.chipAuto : kind === 'human' ? s.chipHuman : s.chipHybrid
  return (
    <Text style={[small ? s.chipInline : s.chip, style]}>{label}</Text>
  )
}

function ChipLegend() {
  return (
    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Chip kind="auto" />
        <Text style={s.caption}>Lo ejecuta el sistema</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Chip kind="human" />
        <Text style={s.caption}>Lo ejecuta el equipo</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Chip kind="hybrid" />
        <Text style={s.caption}>El sistema sugiere, el equipo decide</Text>
      </View>
    </View>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.bullet}>
      <Text style={s.bulletMark}>·</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  )
}

function Callout({ title, children, accent = false }: { title?: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <View style={accent ? s.calloutAccent : s.callout}>
      {title ? <Text style={s.calloutTitle}>{title}</Text> : null}
      <Text style={s.calloutBody}>{children}</Text>
    </View>
  )
}

// ============================================================================
// PAGE 1 — COVER
// ============================================================================

function CoverPage() {
  return (
    <Page size="A4" style={s.coverPage}>
      <Text style={s.coverWatermark}>M</Text>
      <View style={{ marginTop: 100 }}>
        <Text style={s.coverEyebrow}>Diego Ferreyra Inmobiliaria · Julio 2026</Text>
        <Text style={s.coverTitle}>Manual de Gestión{'\n'}Operativa</Text>
        <Text style={[s.coverSubtitle, { marginTop: 18 }]}>
          Campañas Meta Ads · Sistema semi-autónomo{'\n'}con supervisión humana
        </Text>
      </View>

      <View style={{ position: 'absolute', bottom: 100, left: 50, right: 50 }}>
        <View style={{ borderTopWidth: 1, borderTopColor: c.fg, paddingTop: 14, flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>Alcance</Text>
            <Text style={[s.body, { marginTop: 3, fontWeight: 700 }]}>4 campañas</Text>
            <Text style={s.caption}>Tasación · Alto Valor · Clase · Remarketing</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>Rituales</Text>
            <Text style={[s.body, { marginTop: 3, fontWeight: 700 }]}>Diario · Semanal · Mensual</Text>
            <Text style={s.caption}>~7 h humanas al mes</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>Automatización objetivo</Text>
            <Text style={[s.body, { marginTop: 3, fontWeight: 700 }]}>~90%</Text>
            <Text style={s.caption}>Claude Code / Claude Cowork</Text>
          </View>
        </View>
      </View>

      <View style={{ position: 'absolute', bottom: 40, left: 50, right: 50 }}>
        <Text style={s.micro}>Versión 1.0 · Preparado por el equipo de Marketing · Basado en auditoría feb–may 2026</Text>
      </View>
    </Page>
  )
}

// ============================================================================
// PAGE 2 — TABLE OF CONTENTS
// ============================================================================

function TocPage() {
  const entries: [string, string, string][] = [
    ['A', 'Filosofía operativa', '03'],
    ['B', 'Las 4 campañas activas', '04'],
    ['C', 'Ritual Diario', '05'],
    ['D', 'Ritual Semanal', '07'],
    ['E', 'Ritual Mensual', '09'],
    ['F.1', 'Playbook — Tasación Directa', '11'],
    ['F.2', 'Playbook — Alto Valor', '12'],
    ['F.3', 'Playbook — Clase Gratuita', '13'],
    ['F.4', 'Playbook — Remarketing', '14'],
    ['G', 'Protocolos transversales', '15'],
    ['H', 'Arquitectura de automatización', '17'],
    ['I', 'Baseline maestra', '19'],
    ['J', 'Responsabilidades y cierre', '20'],
  ]
  return (
    <Page size="A4" style={s.page}>
      <PageChrome eyebrow="Índice" runningTitle="Manual Operativo" pageNumber={2} />
      <View style={{ marginTop: 20 }}>
        <Text style={s.h1}>Índice</Text>
        <Text style={s.caption}>Cómo leer este manual · qué ejecuta el sistema y qué queda al equipo humano</Text>

        <View style={{ marginTop: 24 }}>
          {entries.map(([n, t, p]) => (
            <View style={s.tocRow} key={n}>
              <Text style={s.tocSection}>{n}</Text>
              <Text style={s.tocTitle}>{t}</Text>
              <Text style={s.tocPage}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 40 }}>
          <Text style={s.h3}>Convención de etiquetas</Text>
          <ChipLegend />
          <Text style={[s.caption, { marginTop: 8 }]}>
            Cada acción de este manual está marcada con la etiqueta correspondiente. La distinción es
            operativa: la automatización se ejecuta sin intervención; los ítems humanos son responsabilidad
            del equipo; los híbridos son el sistema proponiendo y el equipo decidiendo.
          </Text>
        </View>
      </View>
    </Page>
  )
}

// ============================================================================
// PAGE 3 — SECTION A: FILOSOFÍA
// ============================================================================

function SectionA() {
  return (
    <Page size="A4" style={s.page}>
      <PageChrome eyebrow="Sección A · Filosofía" runningTitle="Manual Operativo" pageNumber={3} />
      <View style={{ marginTop: 20 }}>
        <Text style={s.h1}>Filosofía operativa</Text>
        <Text style={s.caption}>Cómo pensamos la gestión de las campañas</Text>

        <Text style={s.h2}>El principio</Text>
        <Text style={s.body}>
          No optimizamos por inercia ni por intuición. Optimizamos por proceso. Cada ritual (diario,
          semanal, mensual) tiene métricas específicas, umbrales concretos basados en nuestra propia
          baseline, y acciones predefinidas.
        </Text>
        <Text style={s.body}>
          Este manual está diseñado bajo el supuesto de que el <Text style={s.bold}>~90% del trabajo repetitivo
          se automatiza</Text> con Claude Code y Claude Cowork. La lectura de datos, el cálculo de KPIs, la
          detección de umbrales, la generación de alertas y de reportes son ejecuciones del sistema.
          El equipo humano interviene solo donde importa juicio: decisiones estratégicas, producción
          creativa y conversaciones con el cliente.
        </Text>

        <Text style={s.h2}>Los 3 tipos de acción</Text>

        <View style={{ marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ width: 90 }}><Chip kind="auto" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.body}>
                <Text style={s.bold}>El sistema ejecuta sin intervención.</Text> Corre solo, respeta la cadencia,
                genera outputs (reportes, alertas, drafts). El equipo lo consulta cuando quiere o cuando
                una alerta se dispara.
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ width: 90 }}><Chip kind="human" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.body}>
                <Text style={s.bold}>Requiere criterio humano.</Text> Producción de videos, aprobación de
                campañas nuevas, conversaciones con el cliente, decisiones estratégicas de marca.
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
            <View style={{ width: 90 }}><Chip kind="hybrid" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.body}>
                <Text style={s.bold}>El sistema sugiere; el equipo decide.</Text> El sistema detecta el
                patrón y prepara el output (ejemplo: propuesta de rotación creativa); el humano aprueba
                o modifica y firma la ejecución.
              </Text>
            </View>
          </View>
        </View>

        <Callout title="Consecuencia práctica" accent>
          Con la automatización desplegada, los 3 rituales combinados requieren menos de 4 horas humanas
          al mes. Todo lo demás — extracción, cálculo, reporte, alertas — corre sin nosotros. Nuestro
          tiempo se reasigna a producción creativa y decisiones que solo un humano puede tomar.
        </Callout>
      </View>
    </Page>
  )
}

// ============================================================================
// PAGE 4 — SECTION B: LAS 4 CAMPAÑAS
// ============================================================================

function SectionB() {
  return (
    <Page size="A4" style={s.page}>
      <PageChrome eyebrow="Sección B · Campañas" runningTitle="Manual Operativo" pageNumber={4} />
      <View style={{ marginTop: 20 }}>
        <Text style={s.h1}>Las 4 campañas activas</Text>
        <Text style={s.caption}>Objetivo, perfil, presupuesto y peso de cada una en el sistema</Text>

        <View style={s.table}>
          <View style={s.trHead}>
            <Text style={[s.th, { width: '20%' }]}>Campaña</Text>
            <Text style={[s.th, { width: '30%' }]}>Objetivo</Text>
            <Text style={[s.th, { width: '25%' }]}>Perfil</Text>
            <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>Presupuesto/mes</Text>
            <Text style={[s.th, { width: '10%', textAlign: 'right' }]}>Peso</Text>
          </View>

          <View style={s.tr}>
            <Text style={[s.td, { width: '20%', fontWeight: 700 }]}>Tasación Directa</Text>
            <Text style={[s.td, { width: '30%' }]}>Captar propietarios que quieren tasar en CABA</Text>
            <Text style={[s.td, { width: '25%' }]}>Adulto propietario, 35–65 años, CABA amplio</Text>
            <Text style={[s.tdNum, { width: '15%' }]}>$300–420K</Text>
            <Text style={[s.tdNum, { width: '10%' }]}>60–70%</Text>
          </View>
          <View style={s.trZebra}>
            <Text style={[s.td, { width: '20%', fontWeight: 700 }]}>Alto Valor</Text>
            <Text style={[s.td, { width: '30%' }]}>Captar propietarios de propiedades USD 400K+</Text>
            <Text style={[s.td, { width: '25%' }]}>40–65 años, 8 barrios premium CABA + Norte GBA</Text>
            <Text style={[s.tdNum, { width: '15%' }]}>$60–135K</Text>
            <Text style={[s.tdNum, { width: '10%' }]}>15–20%</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, { width: '20%', fontWeight: 700 }]}>Clase Gratuita</Text>
            <Text style={[s.td, { width: '30%' }]}>Top of funnel educacional que alimenta el pipeline</Text>
            <Text style={[s.td, { width: '25%' }]}>Adulto propietario abierto a aprender</Text>
            <Text style={[s.tdNum, { width: '15%' }]}>$75–90K</Text>
            <Text style={[s.tdNum, { width: '10%' }]}>10–15%</Text>
          </View>
          <View style={s.trLast}>
            <Text style={[s.td, { width: '20%', fontWeight: 700 }]}>Remarketing</Text>
            <Text style={[s.td, { width: '30%' }]}>Convertir 35K personas tibias ya construidas</Text>
            <Text style={[s.td, { width: '25%' }]}>75–95% video viewers + landing sin registro</Text>
            <Text style={[s.tdNum, { width: '15%' }]}>$105K</Text>
            <Text style={[s.tdNum, { width: '10%' }]}>10–15%</Text>
          </View>
        </View>

        <Text style={s.h2}>Cómo se relacionan entre ellas</Text>
        <Text style={s.body}>
          <Text style={s.bold}>Tasación Directa</Text> es el motor del volumen. Su presupuesto define el ritmo
          del negocio. <Text style={s.bold}>Alto Valor</Text> agrega ticket promedio: menos leads pero cada
          uno vale mucho más. <Text style={s.bold}>Clase Gratuita</Text> alimenta el sistema de contenido
          y genera audiencias que después usa Remarketing. <Text style={s.bold}>Remarketing</Text> cierra
          el ciclo: convierte a las tibias que las otras 3 generaron.
        </Text>

        <Text style={s.h2}>Regla estructural</Text>
        <Callout>
          Ninguna campaña se ejecuta en aislamiento. El sistema mide impacto cruzado (por ejemplo:
          Remarketing depende de que Clase Gratuita alimente sus audiencias). Cuando se toma una
          decisión sobre una campaña, el sistema calcula automáticamente el impacto esperado sobre
          las otras 3 y lo reporta antes de ejecutar el cambio.
        </Callout>
      </View>
    </Page>
  )
}

// ============================================================================
// PAGE 5–6 — SECTION C: RITUAL DIARIO
// ============================================================================

function SectionC() {
  return (
    <>
      <Page size="A4" style={s.page}>
        <PageChrome eyebrow="Sección C · Ritual Diario" runningTitle="Manual Operativo" pageNumber={5} />
        <View style={{ marginTop: 20 }}>
          <Text style={s.h1}>Ritual Diario</Text>
          <Text style={s.caption}>Detección temprana de deterioros · lunes a viernes</Text>

          <View style={s.chipRow}>
            <Chip kind="auto" /><Text style={s.caption}>Ejecución diaria automática · ~2 min efectivos humanos</Text>
          </View>

          <Text style={s.h2}>Qué ejecuta el sistema</Text>
          <Text style={s.body}>
            Cada mañana, el sistema extrae los 7 KPIs por campaña del día anterior, los compara contra
            los umbrales de este manual, y envía un digest al equipo con las alertas del día. Si no hay
            alertas, el mail dice "todo dentro de rango" y no requiere acción.
          </Text>

          <Text style={s.h3}>Métricas monitoreadas · 7 por campaña × 4 campañas</Text>
          <View style={s.table}>
            <View style={s.trHead}>
              <Text style={[s.th, { width: '25%' }]}>Métrica</Text>
              <Text style={[s.th, { width: '30%' }]}>Fuente automática</Text>
              <Text style={[s.th, { width: '20%' }]}>Cálculo</Text>
              <Text style={[s.th, { width: '25%' }]}>Uso primario</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '25%' }]}>Spend</Text>
              <Text style={[s.td, { width: '30%' }]}>Meta Marketing API</Text>
              <Text style={[s.td, { width: '20%' }]}>Directo</Text>
              <Text style={[s.td, { width: '25%' }]}>Base de todos los KPIs</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '25%' }]}>Leads</Text>
              <Text style={[s.td, { width: '30%' }]}>Meta API + plataforma interna</Text>
              <Text style={[s.td, { width: '20%' }]}>Cross-check</Text>
              <Text style={[s.td, { width: '25%' }]}>Volumen y detección de integración rota</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '25%' }]}>CPL</Text>
              <Text style={[s.td, { width: '30%' }]}>Derivado</Text>
              <Text style={[s.td, { width: '20%' }]}>spend / leads</Text>
              <Text style={[s.td, { width: '25%' }]}>Eficiencia principal</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '25%' }]}>LPV</Text>
              <Text style={[s.td, { width: '30%' }]}>Meta Marketing API</Text>
              <Text style={[s.td, { width: '20%' }]}>Directo</Text>
              <Text style={[s.td, { width: '25%' }]}>Tráfico efectivo a landing</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '25%' }]}>Cost per LPV</Text>
              <Text style={[s.td, { width: '30%' }]}>Derivado</Text>
              <Text style={[s.td, { width: '20%' }]}>spend / LPV</Text>
              <Text style={[s.td, { width: '25%' }]}>Leading indicator (se mueve antes que CPL)</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '25%' }]}>Frecuencia</Text>
              <Text style={[s.td, { width: '30%' }]}>Meta Marketing API</Text>
              <Text style={[s.td, { width: '20%' }]}>Directo</Text>
              <Text style={[s.td, { width: '25%' }]}>Detección de saturación</Text>
            </View>
            <View style={s.trLast}>
              <Text style={[s.td, { width: '25%' }]}>CTR</Text>
              <Text style={[s.td, { width: '30%' }]}>Meta Marketing API</Text>
              <Text style={[s.td, { width: '20%' }]}>Directo</Text>
              <Text style={[s.td, { width: '25%' }]}>Vigor del creativo</Text>
            </View>
          </View>

          <Text style={[s.caption, { marginTop: 4 }]}>
            La extracción ocurre a las 6:00 AM Argentina. El digest llega al mail antes del 9:00 AM.
          </Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <PageChrome eyebrow="Sección C · Ritual Diario" runningTitle="Manual Operativo" pageNumber={6} />
        <View style={{ marginTop: 20 }}>
          <Text style={s.h2}>Umbrales de alerta roja · acción inmediata mismo día</Text>
          <View style={s.chipRow}>
            <Chip kind="hybrid" /><Text style={s.caption}>El sistema detecta y propone; el equipo aplica</Text>
          </View>

          <View style={s.table}>
            <View style={s.trHead}>
              <Text style={[s.th, { width: '22%' }]}>Campaña</Text>
              <Text style={[s.th, { width: '18%' }]}>Métrica</Text>
              <Text style={[s.th, { width: '22%' }]}>Umbral rojo</Text>
              <Text style={[s.th, { width: '38%' }]}>Acción propuesta por el sistema</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '22%' }]}>Tasación Directa</Text>
              <Text style={[s.td, { width: '18%' }]}>Frecuencia</Text>
              <Text style={[s.td, { width: '22%' }]}>&gt; 2,8 en 24 hs</Text>
              <Text style={[s.td, { width: '38%' }]}>Rotar: pausar ad con más frecuencia, activar backup del pipeline</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '22%' }]}>Tasación Directa</Text>
              <Text style={[s.td, { width: '18%' }]}>CPL</Text>
              <Text style={[s.td, { width: '22%' }]}>&gt; $18.000 (2× baseline)</Text>
              <Text style={[s.td, { width: '38%' }]}>Verificar landing OK · revisar mix de creativos activos</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '22%' }]}>Tasación Directa</Text>
              <Text style={[s.td, { width: '18%' }]}>Cost per LPV</Text>
              <Text style={[s.td, { width: '22%' }]}>&gt; $1.200 (2× baseline)</Text>
              <Text style={[s.td, { width: '38%' }]}>Posible cheap-traffic trap · aplicar Playbook 1</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '22%' }]}>Alto Valor</Text>
              <Text style={[s.td, { width: '18%' }]}>CPL</Text>
              <Text style={[s.td, { width: '22%' }]}>&gt; $40.000</Text>
              <Text style={[s.td, { width: '38%' }]}>Pausar temporalmente hasta revisar calidad de leads</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '22%' }]}>Alto Valor</Text>
              <Text style={[s.td, { width: '18%' }]}>LPV rate</Text>
              <Text style={[s.td, { width: '22%' }]}>&lt; 25%</Text>
              <Text style={[s.td, { width: '38%' }]}>Pausar hasta análisis de targeting</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '22%' }]}>Clase Gratuita</Text>
              <Text style={[s.td, { width: '18%' }]}>CPL</Text>
              <Text style={[s.td, { width: '22%' }]}>&gt; $10.000 (2× baseline)</Text>
              <Text style={[s.td, { width: '38%' }]}>Fatiga acelerada · priorizar refresh creativo</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '22%' }]}>Remarketing</Text>
              <Text style={[s.td, { width: '18%' }]}>Frecuencia</Text>
              <Text style={[s.td, { width: '22%' }]}>&gt; 4 en 7 días</Text>
              <Text style={[s.td, { width: '38%' }]}>Ampliar audiencia o pausar hasta refresh de piezas</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '22%' }]}>Remarketing</Text>
              <Text style={[s.td, { width: '18%' }]}>CTR</Text>
              <Text style={[s.td, { width: '22%' }]}>&lt; 3%</Text>
              <Text style={[s.td, { width: '38%' }]}>Creativos gastados · cambiar mix</Text>
            </View>
            <View style={s.trLast}>
              <Text style={[s.td, { width: '22%', fontWeight: 700 }]}>TODAS</Text>
              <Text style={[s.td, { width: '18%', fontWeight: 700 }]}>Leads = 0</Text>
              <Text style={[s.td, { width: '22%', fontWeight: 700 }]}>3 días consecutivos</Text>
              <Text style={[s.td, { width: '38%', fontWeight: 700 }]}>Pausar campaña completa hasta revisión técnica</Text>
            </View>
          </View>

          <Text style={s.h2}>Verificación de integración</Text>
          <View style={s.chipRow}>
            <Chip kind="auto" /><Text style={s.caption}>Cross-check diario Meta ↔ plataforma interna</Text>
          </View>
          <Text style={s.body}>
            El sistema compara diariamente los leads que reporta Meta con los que llegaron a nuestra
            plataforma interna. Si la desviación es mayor al 20%, dispara alerta técnica: es señal de
            que la integración se cortó (como pasó con GHL antes de la reparación de julio).
          </Text>

          <Text style={s.h2}>Lo que el equipo humano hace efectivamente</Text>
          <View style={s.chipRow}>
            <Chip kind="human" /><Text style={s.caption}>~2 minutos diarios</Text>
          </View>
          <Bullet>Leer el digest matinal. Si dice "todo dentro de rango", no hace nada.</Bullet>
          <Bullet>Ante alerta roja: aprobar la acción propuesta (con un click) o modificarla.</Bullet>
          <Bullet>Ante alerta técnica de integración: escalar al desarrollador.</Bullet>

          <Callout title="Prohibido en el ritual diario">
            Cambiar presupuestos, pausar creativos por corazonada, modificar targeting. Todo eso es
            semanal. El sistema no permite esas ediciones desde el digest diario para forzar la
            disciplina.
          </Callout>
        </View>
      </Page>
    </>
  )
}

// ============================================================================
// PAGE 7–8 — SECTION D: RITUAL SEMANAL
// ============================================================================

function SectionD() {
  return (
    <>
      <Page size="A4" style={s.page}>
        <PageChrome eyebrow="Sección D · Ritual Semanal" runningTitle="Manual Operativo" pageNumber={7} />
        <View style={{ marginTop: 20 }}>
          <Text style={s.h1}>Ritual Semanal</Text>
          <Text style={s.caption}>Decisiones tácticas · sábados 6:00 AM</Text>

          <View style={s.chipRow}>
            <Chip kind="hybrid" /><Text style={s.caption}>El sistema arma todo; el equipo decide en 15–20 minutos</Text>
          </View>

          <Text style={s.h2}>Qué prepara el sistema para ese sábado</Text>
          <View style={s.chipRow}><Chip kind="auto" /></View>
          <Bullet><Text style={s.bold}>Reporte semanal por email</Text> — dos tablas de embudo (por origen, en ARS/USD), llega el sábado a las 6:00 AM.</Bullet>
          <Bullet><Text style={s.bold}>Comparativa rolling 4-week</Text> — cada KPI vs las 4 semanas anteriores; deltas resaltados.</Bullet>
          <Bullet><Text style={s.bold}>Ranking automático de creativos</Text> — por CPL, LPV rate y frecuencia acumulada; con recomendación de mantener/rotar/apagar.</Bullet>
          <Bullet><Text style={s.bold}>Propuesta de ajuste de presupuesto</Text> — por campaña, con el racional cuantificado.</Bullet>
          <Bullet><Text style={s.bold}>Alerta de pipeline creativo vacío</Text> — si en algún adset quedan menos de 2 backups listos para rotar en las próximas 3 semanas.</Bullet>

          <Text style={s.h2}>Los 4 bloques del ritual</Text>

          <View style={s.card}>
            <Text style={s.cardTitle}>Bloque 1 — Consolidación · 5 min (antes: 10 min)</Text>
            <View style={s.chipRow}><Chip kind="auto" small /></View>
            <Text style={s.caption}>El sistema entrega el reporte y las comparativas listas. El equipo solo lo abre.</Text>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Bloque 2 — Análisis por campaña · 5 min (antes: 20 min)</Text>
            <View style={s.chipRow}><Chip kind="hybrid" small /></View>
            <Text style={s.caption}>Cada campaña ya tiene sus 5 preguntas respondidas por el sistema con evidencia
              numérica. El equipo revisa las respuestas y las valida o refuta.</Text>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Bloque 3 — Decisiones tácticas · 8 min (antes: 10 min)</Text>
            <View style={s.chipRow}><Chip kind="human" small /></View>
            <Text style={s.caption}>El equipo aprueba las propuestas del sistema (ajustes de presupuesto, rotaciones,
              producción). El sistema ejecuta los cambios aprobados en Meta Business Manager.</Text>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Bloque 4 — Reporte y comunicación · 2 min (antes: 5 min)</Text>
            <View style={s.chipRow}><Chip kind="auto" small /></View>
            <Text style={s.caption}>El sistema arma el resumen a Diego con las decisiones tomadas y lo envía. El
              equipo solo firma.</Text>
          </View>

          <Callout title="Total humano" accent>
            20 minutos efectivos por semana, contra 45 minutos del manual pre-automatización. El equipo
            se lleva un beneficio de 25 min semanales que se reasignan a producción creativa.
          </Callout>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <PageChrome eyebrow="Sección D · Ritual Semanal" runningTitle="Manual Operativo" pageNumber={8} />
        <View style={{ marginTop: 20 }}>
          <Text style={s.h2}>Reglas de escalación de presupuesto</Text>
          <Text style={s.caption}>El sistema aplica automáticamente las reglas verdes y amarillas; las rojas requieren aprobación humana.</Text>

          <View style={s.table}>
            <View style={s.trHead}>
              <Text style={[s.th, { width: '18%' }]}>Situación</Text>
              <Text style={[s.th, { width: '38%' }]}>Condición cumplida</Text>
              <Text style={[s.th, { width: '30%' }]}>Acción</Text>
              <Text style={[s.th, { width: '14%', textAlign: 'right' }]}>Ejecuta</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '18%', color: c.good, fontWeight: 700 }]}>Subir</Text>
              <Text style={[s.td, { width: '38%' }]}>CPL ≤ baseline por 2 semanas + LPV rate ≥ 50% + Freq ≤ 2,0 + reach estable o creciente</Text>
              <Text style={[s.td, { width: '30%' }]}>+15 a +25% para la próxima semana</Text>
              <Text style={[s.td, { width: '14%', textAlign: 'right' }]}><Chip kind="auto" small /></Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '18%', color: c.warn, fontWeight: 700 }]}>Bajar</Text>
              <Text style={[s.td, { width: '38%' }]}>CPL &gt; 1,5× baseline por 2 semanas + Freq &gt; 2,5 sostenida</Text>
              <Text style={[s.td, { width: '30%' }]}>-20 a -30% mientras se produce creativo nuevo</Text>
              <Text style={[s.td, { width: '14%', textAlign: 'right' }]}><Chip kind="auto" small /></Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '18%', fontWeight: 700 }]}>Mantener</Text>
              <Text style={[s.td, { width: '38%' }]}>Todo dentro de rango</Text>
              <Text style={[s.td, { width: '30%' }]}>Sin cambio · ejecutar rotación creativa habitual</Text>
              <Text style={[s.td, { width: '14%', textAlign: 'right' }]}><Chip kind="auto" small /></Text>
            </View>
            <View style={s.trLast}>
              <Text style={[s.td, { width: '18%', color: c.bad, fontWeight: 700 }]}>Cambio grande</Text>
              <Text style={[s.td, { width: '38%' }]}>Movimiento &gt; 30% en una semana o &gt; 50% acumulado en el mes</Text>
              <Text style={[s.td, { width: '30%' }]}>Requiere reunión de revisión con Diego</Text>
              <Text style={[s.td, { width: '14%', textAlign: 'right' }]}><Chip kind="human" small /></Text>
            </View>
          </View>

          <Text style={s.h2}>Las 5 preguntas por campaña que el sistema responde</Text>
          <Text style={s.caption}>Con evidencia numérica extraída del reporte semanal. El equipo valida.</Text>

          <View style={{ marginTop: 6 }}>
            <Bullet><Text style={s.bold}>1.</Text> ¿El CPL de la semana está dentro de la baseline? — comparación automática con la tabla.</Bullet>
            <Bullet><Text style={s.bold}>2.</Text> ¿Cuál fue el mejor y peor creativo de la semana? — ranking automático por CPL y LPV rate.</Bullet>
            <Bullet><Text style={s.bold}>3.</Text> ¿La frecuencia acumulada de los ads top es sostenible? — regla: pausar los que llevan más de 3 semanas al aire con frecuencia sobre 2,5.</Bullet>
            <Bullet><Text style={s.bold}>4.</Text> ¿La calidad de leads que reporta el equipo comercial es la esperada? — el sistema pregunta al equipo comercial vía formulario simple.</Bullet>
            <Bullet><Text style={s.bold}>5.</Text> ¿Falta creativo fresco en el pipeline para las próximas 2 semanas? — inventario automático de piezas listas.</Bullet>
          </View>

          <Callout title="Nota sobre la pregunta 4" accent>
            La calidad de leads no se puede medir con la API de Meta. El sistema envía un formulario
            simple al equipo comercial una vez por semana (los viernes) con 3 preguntas de escala 1–5.
            El resultado agregado alimenta el reporte del sábado.
          </Callout>
        </View>
      </Page>
    </>
  )
}

// ============================================================================
// PAGE 9–10 — SECTION E: RITUAL MENSUAL
// ============================================================================

function SectionE() {
  return (
    <>
      <Page size="A4" style={s.page}>
        <PageChrome eyebrow="Sección E · Ritual Mensual" runningTitle="Manual Operativo" pageNumber={9} />
        <View style={{ marginTop: 20 }}>
          <Text style={s.h1}>Ritual Mensual</Text>
          <Text style={s.caption}>Análisis estratégico · primer sábado del mes</Text>

          <View style={s.chipRow}>
            <Chip kind="hybrid" /><Text style={s.caption}>El sistema entrega análisis completo; el equipo toma decisiones estratégicas</Text>
          </View>

          <Text style={s.h2}>Qué prepara el sistema para el primer sábado</Text>
          <View style={s.chipRow}><Chip kind="auto" /></View>
          <Bullet><Text style={s.bold}>Reporte mensual formal por email</Text> — dos tablas embudo por origen, con moneda dual ARS/USD.</Bullet>
          <Bullet><Text style={s.bold}>Comparativa rolling 3-month</Text> — cada KPI vs 3 meses anteriores, con trend line.</Bullet>
          <Bullet><Text style={s.bold}>Ranking mensual de creativos</Text> — clasificados automáticamente: escalar / mantener / rotar / apagar.</Bullet>
          <Bullet><Text style={s.bold}>Diagnóstico de audiencias</Text> — tamaño, salud, cuáles se están agotando (reach cae 3 meses seguidos).</Bullet>
          <Bullet><Text style={s.bold}>Propuesta de refresh de lookalikes</Text> — automática cada 90 días con source actualizado a los últimos convertidores.</Bullet>
          <Bullet><Text style={s.bold}>Recalibración de baseline</Text> — si algún KPI salió del rango baseline por 3 meses consecutivos, el sistema propone actualizar la baseline maestra.</Bullet>
          <Bullet><Text style={s.bold}>Borrador de reporte a Diego</Text> — 1–2 páginas con los 3 hechos del mes y las decisiones propuestas.</Bullet>

          <Text style={s.h2}>Los 5 bloques del ritual</Text>

          <View style={s.card}>
            <Text style={s.cardTitle}>Bloque 1 — Reporte del mes cerrado · 5 min (antes: 20 min)</Text>
            <View style={s.chipRow}><Chip kind="auto" small /></View>
            <Text style={s.caption}>Sistema entrega reporte + comparativas rolling. Equipo lo lee.</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Bloque 2 — Análisis de creativos · 8 min (antes: 30 min)</Text>
            <View style={s.chipRow}><Chip kind="hybrid" small /></View>
            <Text style={s.caption}>Ranking automático con clasificación en 4 categorías. Equipo revisa
              casos de frontera (creativos entre "mantener" y "rotar") y decide.</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Bloque 3 — Análisis de audiencias · 5 min (antes: 20 min)</Text>
            <View style={s.chipRow}><Chip kind="auto" small /></View>
            <Text style={s.caption}>Sistema detecta audiencias agotadas, regenera lookalikes vencidos,
              propone 1–2 audiencias nuevas para testear. Equipo aprueba.</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Bloque 4 — Decisiones estratégicas · 8 min (antes: 30 min)</Text>
            <View style={s.chipRow}><Chip kind="human" small /></View>
            <Text style={s.caption}>Cambios de mix entre campañas · producción creativa · activación de
              audiencias nuevas · baseline · reunión con Diego si corresponde.</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Bloque 5 — Reporte a Diego · 4 min (antes: 20 min)</Text>
            <View style={s.chipRow}><Chip kind="hybrid" small /></View>
            <Text style={s.caption}>Sistema entrega borrador de 1–2 páginas. Equipo lo revisa, ajusta si
              hace falta, firma y envía.</Text>
          </View>

          <Callout title="Total humano">
            30 minutos efectivos por mes, contra 2 horas del manual pre-automatización. El resto lo
            corre el sistema en background durante los primeros días del mes.
          </Callout>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <PageChrome eyebrow="Sección E · Ritual Mensual" runningTitle="Manual Operativo" pageNumber={10} />
        <View style={{ marginTop: 20 }}>
          <Text style={s.h2}>Clasificación automática de creativos</Text>
          <Text style={s.caption}>El sistema aplica estas 4 reglas y clasifica cada creativo activo del mes.</Text>

          <View style={s.table}>
            <View style={s.trHead}>
              <Text style={[s.th, { width: '18%' }]}>Clasificación</Text>
              <Text style={[s.th, { width: '52%' }]}>Regla</Text>
              <Text style={[s.th, { width: '30%' }]}>Acción del sistema</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '18%', color: c.good, fontWeight: 700 }]}>Escalar</Text>
              <Text style={[s.td, { width: '52%' }]}>CPL debajo de baseline + LPV rate top del mes + menos de 8 semanas activo</Text>
              <Text style={[s.td, { width: '30%' }]}>Propone +30% de presupuesto en su adset</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '18%', fontWeight: 700 }]}>Mantener</Text>
              <Text style={[s.td, { width: '52%' }]}>CPL en rango + performance estable + frecuencia sostenible</Text>
              <Text style={[s.td, { width: '30%' }]}>Sin cambio</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '18%', color: c.warn, fontWeight: 700 }]}>Rotar</Text>
              <Text style={[s.td, { width: '52%' }]}>Frecuencia acumulada &gt; 3 · o más de 12 semanas activo · o CPL &gt; 1,5× baseline</Text>
              <Text style={[s.td, { width: '30%' }]}>Propone pausar + activar backup</Text>
            </View>
            <View style={s.trLast}>
              <Text style={[s.td, { width: '18%', color: c.bad, fontWeight: 700 }]}>Apagar</Text>
              <Text style={[s.td, { width: '52%' }]}>Cero leads en 15+ días con más de $10K de gasto</Text>
              <Text style={[s.td, { width: '30%' }]}>Propone pausar definitivamente</Text>
            </View>
          </View>

          <Text style={s.h2}>Salud de audiencias</Text>
          <Text style={s.caption}>El sistema monitorea automáticamente estas señales.</Text>

          <Bullet><Text style={s.bold}>Tamaño</Text> — Meta reporta rango; el sistema anota la evolución mes a mes.</Bullet>
          <Bullet><Text style={s.bold}>Agotamiento</Text> — reach cae 3 meses seguidos con presupuesto estable = audiencia agotada.</Bullet>
          <Bullet><Text style={s.bold}>Vencimiento</Text> — cada audiencia custom tiene retención (30/90/180/365 días); el sistema regenera antes del vencimiento.</Bullet>
          <Bullet><Text style={s.bold}>Exclusiones</Text> — el sistema mantiene actualizada la lista de convertidores para excluir (evita repetir a quien ya cerró).</Bullet>

          <Text style={s.h2}>Baseline maestra recalibrada</Text>
          <View style={s.chipRow}>
            <Chip kind="hybrid" /><Text style={s.caption}>El sistema propone; el equipo aprueba el cambio de baseline</Text>
          </View>
          <Text style={s.body}>
            La baseline maestra (Sección I) se actualiza únicamente si un KPI salió del rango baseline
            por 3 meses consecutivos. En ese caso el sistema propone un nuevo rango y guarda el histórico.
            El cambio requiere aprobación humana explícita para evitar que la baseline "flote hacia abajo"
            en un mal período.
          </Text>

          <Callout title="Regla de oro de la baseline" accent>
            Un mal mes no cambia la baseline. Tres malos meses consecutivos, sí. Y tres buenos meses
            también: si mejoramos, la baseline sube y el estándar de exigencia se corre.
          </Callout>
        </View>
      </Page>
    </>
  )
}

// ============================================================================
// PAGE 11–14 — SECTION F: PLAYBOOKS
// ============================================================================

interface PlaybookRow { situacion: string; diagnostico: string; accion: string; ejecuta: 'auto' | 'human' | 'hybrid' }
interface PlaybookKPI { kpi: string; baseline: string; saludable: string; alerta: string }

function PlaybookPage({ nombre, pageNum, subtitle, kpis, presupuesto, reglasEspecificas, situaciones, notaCierre }: {
  nombre: string
  pageNum: number
  subtitle: string
  kpis: PlaybookKPI[]
  presupuesto: string[]
  reglasEspecificas: string[]
  situaciones: PlaybookRow[]
  notaCierre?: string
}) {
  return (
    <Page size="A4" style={s.page}>
      <PageChrome eyebrow={`Sección F · Playbook — ${nombre}`} runningTitle="Manual Operativo" pageNumber={pageNum} />
      <View style={{ marginTop: 20 }}>
        <Text style={s.h1}>{nombre}</Text>
        <Text style={s.caption}>{subtitle}</Text>

        <Text style={s.h2}>KPIs primarios</Text>
        <View style={s.table}>
          <View style={s.trHead}>
            <Text style={[s.th, { width: '30%' }]}>KPI</Text>
            <Text style={[s.th, { width: '25%' }]}>Baseline nuestra</Text>
            <Text style={[s.th, { width: '25%' }]}>Rango saludable</Text>
            <Text style={[s.th, { width: '20%' }]}>Alerta</Text>
          </View>
          {kpis.map((k, i) => {
            const isLast = i === kpis.length - 1
            const style = isLast ? s.trLast : (i % 2 === 1 ? s.trZebra : s.tr)
            return (
              <View style={style} key={i}>
                <Text style={[s.td, { width: '30%' }]}>{k.kpi}</Text>
                <Text style={[s.td, { width: '25%' }]}>{k.baseline}</Text>
                <Text style={[s.td, { width: '25%' }]}>{k.saludable}</Text>
                <Text style={[s.td, { width: '20%', color: c.bad }]}>{k.alerta}</Text>
              </View>
            )
          })}
        </View>

        <Text style={s.h3}>Baseline económica</Text>
        {presupuesto.map((p, i) => <Bullet key={i}>{p}</Bullet>)}

        <Text style={s.h3}>Reglas específicas</Text>
        {reglasEspecificas.map((r, i) => <Bullet key={i}>{r}</Bullet>)}

        <Text style={s.h2}>Playbook de intervención</Text>
        <View style={s.table}>
          <View style={s.trHead}>
            <Text style={[s.th, { width: '25%' }]}>Situación</Text>
            <Text style={[s.th, { width: '30%' }]}>Diagnóstico probable</Text>
            <Text style={[s.th, { width: '32%' }]}>Acción</Text>
            <Text style={[s.th, { width: '13%', textAlign: 'right' }]}>Ejecuta</Text>
          </View>
          {situaciones.map((sit, i) => {
            const isLast = i === situaciones.length - 1
            const style = isLast ? s.trLast : (i % 2 === 1 ? s.trZebra : s.tr)
            return (
              <View style={style} key={i}>
                <Text style={[s.td, { width: '25%' }]}>{sit.situacion}</Text>
                <Text style={[s.td, { width: '30%' }]}>{sit.diagnostico}</Text>
                <Text style={[s.td, { width: '32%' }]}>{sit.accion}</Text>
                <Text style={[s.td, { width: '13%', textAlign: 'right' }]}><Chip kind={sit.ejecuta} small /></Text>
              </View>
            )
          })}
        </View>

        {notaCierre && <Callout accent>{notaCierre}</Callout>}
      </View>
    </Page>
  )
}

function PlaybookTasacion() {
  return PlaybookPage({
    nombre: 'Tasación Directa',
    pageNum: 11,
    subtitle: 'Campaña principal · motor del volumen · ~60–70% del sistema',
    kpis: [
      { kpi: 'Leads/mes', baseline: '26–34', saludable: '25–40', alerta: '<20 por 2 sem' },
      { kpi: 'CPL', baseline: '$8.500–$12.000', saludable: '$8K–$14K', alerta: '>$18K' },
      { kpi: 'LPV rate', baseline: '40–73%', saludable: '≥45%', alerta: '<35%' },
      { kpi: 'CTR', baseline: '6–8%', saludable: '≥6%', alerta: '<5%' },
      { kpi: 'Frecuencia mensual', baseline: '1,4–2,1', saludable: '≤2,3', alerta: '>2,6' },
      { kpi: 'Cost per LPV', baseline: '$558–$700', saludable: '≤$700', alerta: '>$1.000' },
    ],
    presupuesto: [
      'Presupuesto óptimo: $10–14K/día ($300–420K/mes).',
      'Costo estimado por captación: ~$60K de spend por 1 captación (bottleneck comercial, no de Meta).',
    ],
    reglasEspecificas: [
      'Máximo 3 videos activos en simultáneo por adset.',
      'Ninguno más de 8 semanas al aire sin refresh.',
      'Producir al menos 2 videos nuevos por mes.',
      'Formato ganador confirmado: comparativo (hoja perdiendo vs ganando dinero).',
    ],
    situaciones: [
      { situacion: 'CPL > $18K por 5 días', diagnostico: 'Cheap-traffic trap post-hero', accion: 'Pausar 2 peores creativos, dejar top 2', ejecuta: 'hybrid' },
      { situacion: 'LPV rate < 35%', diagnostico: 'Landing lenta o creativo desalineado', accion: 'Verificar landing técnicamente + revisar copy', ejecuta: 'human' },
      { situacion: 'Frecuencia > 2,6', diagnostico: 'Saturación de audiencia', accion: 'Ampliar targeting o activar Remarketing capa nueva', ejecuta: 'hybrid' },
      { situacion: '0 leads 3 días con spend', diagnostico: 'Problema de tracking / audiencia', accion: 'Verificar integración plataforma interna + pixel', ejecuta: 'auto' },
      { situacion: 'Reach cayendo 3 semanas', diagnostico: 'Audiencia agotada', accion: 'Refrescar lookalikes + crear audiencia nueva', ejecuta: 'auto' },
    ],
  })
}

function PlaybookAltoValor() {
  return PlaybookPage({
    nombre: 'Alto Valor',
    pageNum: 12,
    subtitle: 'Propietarios USD 400K+ · menos volumen pero mayor ticket · nueva campaña julio 2026',
    kpis: [
      { kpi: 'Leads/mes', baseline: '8–15 (targeting acotado)', saludable: '8–18', alerta: '<6 por 2 sem' },
      { kpi: 'CPL', baseline: '<$25.000', saludable: '$15K–$25K', alerta: '>$35K' },
      { kpi: 'LPV rate', baseline: '≥40%', saludable: '≥40%', alerta: '<30%' },
      { kpi: 'CTR', baseline: '≥6%', saludable: '≥6%', alerta: '<5%' },
      { kpi: 'Calidad post-llamada', baseline: '≥30% ICP', saludable: '≥30%', alerta: '<20%' },
    ],
    presupuesto: [
      'Presupuesto piloto: $2K/día ($60K/mes).',
      'Presupuesto óptimo post-aprendizaje: $4.5K/día ($135K/mes).',
      'Justificación de CPL alto: LTV ~10× superior a Tasación normal, tolera CPL hasta $25K.',
    ],
    reglasEspecificas: [
      'Solo se escala presupuesto si la calidad post-llamada (medida por el equipo comercial) es ≥30% del perfil ICP.',
      'Volumen bajo es NORMAL — no comparar leads/mes contra Tasación Directa Principal.',
      'Refresh creativo cada 8–10 semanas (audiencia más chica, mejor tolerancia a repetición si el mensaje es relevante).',
    ],
    situaciones: [
      { situacion: 'CPL > $35K', diagnostico: 'Oferta no resuena o comparable desalineado', accion: 'Revisar comparable usado (¿es realmente USD 600K+?)', ejecuta: 'human' },
      { situacion: 'LPV rate < 30%', diagnostico: 'Ubicaciones incorrectas', accion: 'Revisar radios geográficos, excluir barrios no premium', ejecuta: 'hybrid' },
      { situacion: 'Calidad post-llamada < 20%', diagnostico: 'Perfil erróneo', accion: 'Ajustar Lookalike source o filtros de edad', ejecuta: 'hybrid' },
      { situacion: 'Volumen 0 con budget consumido', diagnostico: 'Problema de atribución', accion: 'Verificar integración con plataforma interna', ejecuta: 'auto' },
      { situacion: 'Leads llegan pero no cierran', diagnostico: 'Bottleneck comercial', accion: 'Elevar a Diego — no es problema de Meta', ejecuta: 'human' },
    ],
  })
}

function PlaybookClase() {
  return PlaybookPage({
    nombre: 'Clase Gratuita',
    pageNum: 13,
    subtitle: 'Top of funnel autosostenido · alimenta audiencias para Remarketing',
    kpis: [
      { kpi: 'Leads/mes', baseline: '15–24', saludable: '15–25', alerta: '<12 por 3 sem' },
      { kpi: 'CPL', baseline: '$3.800–$5.700', saludable: '$4K–$6K', alerta: '>$8K' },
      { kpi: 'LPV rate', baseline: '≥41%', saludable: '≥40%', alerta: '<32%' },
      { kpi: 'CTR', baseline: '5–8%', saludable: '≥5%', alerta: '<4%' },
      { kpi: 'Frecuencia mensual', baseline: '1,2–1,6', saludable: '≤1,8', alerta: '>2,2' },
    ],
    presupuesto: [
      'Presupuesto óptimo: $2.5–3K/día ($75–90K/mes).',
      'Comportamiento: corre autosostenida — el error típico es olvidarse hasta que se degrada.',
    ],
    reglasEspecificas: [
      'Refresh creativo obligatorio cada 60–90 días. Sin excepción.',
      'Si no se refresca, entra en fatiga silenciosa: CPL sube 30% cada mes sin que nadie note.',
      'El sistema dispara alerta automática al día 55 si no hay creativo nuevo en pipeline.',
    ],
    situaciones: [
      { situacion: 'CPL > $8K sostenido', diagnostico: 'Fatiga creativa clásica', accion: 'Producir 1 video nuevo formato presentación', ejecuta: 'human' },
      { situacion: 'Leads llegan pero no avanzan a Tasación', diagnostico: 'Falta secuencia post-clase', accion: 'Elevar: sumar automatización post-clase', ejecuta: 'auto' },
      { situacion: 'CTR < 4%', diagnostico: 'Creativo saturado', accion: 'Rotar prioridad, refrescar la pieza más vieja', ejecuta: 'hybrid' },
      { situacion: 'Frecuencia > 2,2', diagnostico: 'Audiencia agotada', accion: 'Refrescar lookalike + revisar exclusiones', ejecuta: 'auto' },
    ],
    notaCierre: 'Clase Gratuita también alimenta las audiencias custom que después usa Remarketing (75% y 95% de video). Es un activo doble: leads directos + audiencia para reciclar.',
  })
}

function PlaybookRemarketing() {
  return PlaybookPage({
    nombre: 'Remarketing de Tasación',
    pageNum: 14,
    subtitle: 'Trabaja las ~35K personas tibias · CPL objetivo 40–50% inferior a fría',
    kpis: [
      { kpi: 'Leads/mes', baseline: '20–40', saludable: '20–40', alerta: '<15 por 2 sem' },
      { kpi: 'CPL caliente', baseline: '<$5.000', saludable: '<$5K', alerta: '>$8K' },
      { kpi: 'CPL tibio', baseline: '<$7.000', saludable: '<$7K', alerta: '>$12K' },
      { kpi: 'CTR caliente / tibio', baseline: '≥6% / ≥5%', saludable: 'Igual', alerta: '<3%' },
      { kpi: 'Frecuencia semanal', baseline: '≤3 en 7 días', saludable: '≤3', alerta: '>4 en 7d' },
      { kpi: 'Costo por LPV', baseline: '<$400 / <$500', saludable: 'Igual', alerta: '>$700' },
    ],
    presupuesto: [
      'Presupuesto total: $3.500/día ($105K/mes).',
      'Distribución: $2.000 caliente + $1.500 tibio.',
      'Frequency cap OBLIGATORIO: 3 impresiones cada 7 días por persona.',
    ],
    reglasEspecificas: [
      'Los creativos deben ser distintos a los usados en Tasación Directa fría. Si se reutilizan, quemamos audiencia en menos de 2 semanas.',
      'Refresh creativo cada 4–6 semanas (audiencias más chicas se saturan más rápido).',
      'Nunca subir el frequency cap sobre 3/7d. Si un adset no rinde, se cambia el creativo, no la frecuencia.',
    ],
    situaciones: [
      { situacion: 'CPL caliente > $8K', diagnostico: 'Creativos saturados en esa audiencia', accion: 'Producir 1–2 piezas nuevas, rotar', ejecuta: 'human' },
      { situacion: 'CTR < 3%', diagnostico: 'Creativos agotados', accion: 'Refrescar según categoría (gancho/testimonio/objeción)', ejecuta: 'human' },
      { situacion: 'Frecuencia > 4 semanal', diagnostico: 'Frequency cap mal o audiencia se achicó', accion: 'Verificar cap + tamaño audiencia', ejecuta: 'auto' },
      { situacion: 'Caliente < 5K personas', diagnostico: 'Retención vs incorporación desbalanceada', accion: 'Trabajar en enganchar desde campaña fría', ejecuta: 'hybrid' },
      { situacion: 'Tibia no convierte', diagnostico: 'Objeción específica no resuelta', accion: 'Cambiar mensaje: probar otra objeción', ejecuta: 'hybrid' },
    ],
  })
}

// ============================================================================
// PAGE 15–16 — SECTION G: PROTOCOLOS TRANSVERSALES
// ============================================================================

function SectionG() {
  return (
    <>
      <Page size="A4" style={s.page}>
        <PageChrome eyebrow="Sección G · Protocolos transversales" runningTitle="Manual Operativo" pageNumber={15} />
        <View style={{ marginTop: 20 }}>
          <Text style={s.h1}>Protocolos transversales</Text>
          <Text style={s.caption}>Aplican a las 4 campañas · disciplina del sistema completo</Text>

          <Text style={s.h2}>Protocolo 1 — Rotación creativa disciplinada</Text>
          <View style={s.chipRow}><Chip kind="hybrid" /></View>
          <Text style={s.body}>
            Regla base: ningún creativo corre más de 8 semanas sin refresh. Excepción documentada: si un
            creativo mantiene CPL bajo baseline y frecuencia menor a 2,5, puede extenderse hasta 12 semanas
            — pero cada mes se decide explícitamente si continúa.
          </Text>
          <Text style={s.h3}>Cadencia de producción sugerida (mensual)</Text>
          <View style={s.table}>
            <View style={s.trHead}>
              <Text style={[s.th, { width: '40%' }]}>Campaña</Text>
              <Text style={[s.th, { width: '30%' }]}>Piezas nuevas/mes</Text>
              <Text style={[s.th, { width: '30%' }]}>Cadencia</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '40%' }]}>Tasación Directa</Text>
              <Text style={[s.td, { width: '30%' }]}>2 videos</Text>
              <Text style={[s.td, { width: '30%' }]}>Cada 15 días</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '40%' }]}>Alto Valor</Text>
              <Text style={[s.td, { width: '30%' }]}>1 video / 6–8 semanas</Text>
              <Text style={[s.td, { width: '30%' }]}>Cadencia baja pero constante</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '40%' }]}>Clase Gratuita</Text>
              <Text style={[s.td, { width: '30%' }]}>1 video / 60–90 días</Text>
              <Text style={[s.td, { width: '30%' }]}>Refresh de sostén</Text>
            </View>
            <View style={s.trLast}>
              <Text style={[s.td, { width: '40%' }]}>Remarketing</Text>
              <Text style={[s.td, { width: '30%' }]}>2–3 piezas / 4–6 semanas</Text>
              <Text style={[s.td, { width: '30%' }]}>Alta cadencia (audiencias chicas)</Text>
            </View>
          </View>
          <Text style={s.caption}>Total mensual estimado: 5–7 piezas nuevas al mes en promedio. El sistema mantiene el inventario del pipeline y alerta cuando falta stock.</Text>

          <Text style={s.h2}>Protocolo 2 — Manejo de fatiga creativa</Text>
          <View style={s.chipRow}><Chip kind="auto" /></View>
          <Text style={s.h3}>Leading indicators que el sistema monitorea</Text>
          <Bullet>Cost per LPV sube 20% en 7 días sin cambio de spend.</Bullet>
          <Bullet>CTR cae 15% en 7 días.</Bullet>
          <Bullet>Frecuencia sube 0,3 puntos en 7 días.</Bullet>

          <Text style={s.h3}>Acción cuando aparecen 2 de 3 señales</Text>
          <View style={s.chipRow}><Chip kind="hybrid" /></View>
          <Bullet>Sistema propone: pausar el creativo con peor CTR de la semana.</Bullet>
          <Bullet>Sistema activa creativo backup del pipeline (siempre debe haber uno esperando).</Bullet>
          <Bullet>Sistema alerta al equipo para iniciar producción de la próxima pieza.</Bullet>

          <Callout title="Si no hay backup en pipeline">
            El sistema escala automáticamente a Diego. Eso es un fallo del proceso, no del creativo. La
            regla del pipeline vacío es no-negociable: siempre debe haber al menos 1 pieza lista para
            rotar por adset.
          </Callout>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <PageChrome eyebrow="Sección G · Protocolos transversales" runningTitle="Manual Operativo" pageNumber={16} />
        <View style={{ marginTop: 20 }}>
          <Text style={s.h2}>Protocolo 3 — Escalación de presupuesto</Text>
          <View style={s.chipRow}><Chip kind="auto" /> <Chip kind="human" /></View>
          <View style={s.table}>
            <View style={s.trHead}>
              <Text style={[s.th, { width: '55%' }]}>Movimiento</Text>
              <Text style={[s.th, { width: '30%' }]}>Requiere</Text>
              <Text style={[s.th, { width: '15%', textAlign: 'right' }]}>Ejecuta</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '55%' }]}>Hasta +25% en una semana</Text>
              <Text style={[s.td, { width: '30%' }]}>Regla verde cumplida</Text>
              <Text style={[s.td, { width: '15%', textAlign: 'right' }]}><Chip kind="auto" small /></Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '55%' }]}>Hasta +50% acumulado en un mes</Text>
              <Text style={[s.td, { width: '30%' }]}>Rolling 4-week verde</Text>
              <Text style={[s.td, { width: '15%', textAlign: 'right' }]}><Chip kind="auto" small /></Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '55%' }]}>Movimiento &gt; 30% en una semana</Text>
              <Text style={[s.td, { width: '30%' }]}>Aprobación Diego</Text>
              <Text style={[s.td, { width: '15%', textAlign: 'right' }]}><Chip kind="human" small /></Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '55%' }]}>Duplicar presupuesto de una campaña</Text>
              <Text style={[s.td, { width: '30%' }]}>Aprobación Diego</Text>
              <Text style={[s.td, { width: '15%', textAlign: 'right' }]}><Chip kind="human" small /></Text>
            </View>
            <View style={s.trLast}>
              <Text style={[s.td, { width: '55%' }]}>Activar una campaña nueva</Text>
              <Text style={[s.td, { width: '30%' }]}>Reunión y presupuesto</Text>
              <Text style={[s.td, { width: '15%', textAlign: 'right' }]}><Chip kind="human" small /></Text>
            </View>
          </View>

          <Text style={s.h2}>Protocolo 4 — Refresh de audiencias</Text>
          <View style={s.chipRow}><Chip kind="auto" /></View>
          <Bullet><Text style={s.bold}>Lookalikes:</Text> regenerar cada 90 días con source actualizado.</Bullet>
          <Bullet><Text style={s.bold}>Custom Audiences:</Text> verificar mensualmente que ninguna esté desactualizada (más de 90 días sin uso).</Bullet>
          <Bullet><Text style={s.bold}>Exclusiones en TODOS los adsets:</Text> convertidores 180d + agentes inmobiliarios + LISTA 100.</Bullet>
          <Bullet><Text style={s.bold}>Nuevas audiencias para testear:</Text> cada mes el sistema propone 1–2 audiencias nuevas basadas en performance de las actuales; el equipo aprueba.</Bullet>

          <Text style={s.h2}>Protocolo 5 — Verificación de integración</Text>
          <View style={s.chipRow}><Chip kind="auto" /></View>
          <Bullet>Diaria: cross-check Meta ↔ plataforma interna. Si desvío &gt; 20% → alerta técnica automática.</Bullet>
          <Bullet>Post-eliminación de GHL: este check se elimina y todo se lee directo de nuestra plataforma. La eliminación de GHL es un objetivo del sistema; el check queda como salvaguarda mientras coexistan.</Bullet>

          <Text style={s.h2}>Protocolo 6 — Respuesta a cambios de Meta</Text>
          <View style={s.chipRow}><Chip kind="hybrid" /></View>
          <Text style={s.body}>
            Meta cambia políticas y APIs sin previo aviso. Cuando aparece un error:
          </Text>
          <Bullet>Sistema loguea el error exacto + código en la tabla de errores conocidos.</Bullet>
          <Bullet>Sistema consulta CLAUDE.md del proyecto (contiene los errores conocidos y sus fixes).</Bullet>
          <Bullet>Si es un error nuevo, el sistema abre un ticket para el desarrollador con el contexto completo.</Bullet>
          <Bullet>El humano investiga y documenta el fix en CLAUDE.md para la próxima vez.</Bullet>

          <Callout accent>
            Nunca inventar workarounds sin verificar. El manual crece con cada error resuelto: cada
            situación nueva termina como playbook automatizable.
          </Callout>
        </View>
      </Page>
    </>
  )
}

// ============================================================================
// PAGE 17–18 — SECTION H: ARQUITECTURA DE AUTOMATIZACIÓN
// ============================================================================

function SectionH() {
  return (
    <>
      <Page size="A4" style={s.page}>
        <PageChrome eyebrow="Sección H · Arquitectura" runningTitle="Manual Operativo" pageNumber={17} />
        <View style={{ marginTop: 20 }}>
          <Text style={s.h1}>Arquitectura de automatización</Text>
          <Text style={s.caption}>Componentes del sistema · qué corre solo y por qué</Text>

          <Text style={s.h2}>Los 5 componentes del sistema</Text>

          <View style={s.archBlock}>
            <Text style={s.archBlockTitle}>1 · Extractor de datos</Text>
            <View style={s.chipRow}><Chip kind="auto" small /></View>
            <Text style={s.caption}>Meta Marketing API v21.0 + plataforma interna (Supabase). Pulls
              programados: diario 6:00 AM (7 KPIs por campaña), semanal (sábados) y mensual (primer
              sábado). Output: JSON estructurado en storage.</Text>
          </View>

          <View style={s.archBlock}>
            <Text style={s.archBlockTitle}>2 · Motor de reglas y umbrales</Text>
            <View style={s.chipRow}><Chip kind="auto" small /></View>
            <Text style={s.caption}>Aplica la baseline maestra a los datos extraídos. Detecta alertas
              (verdes / amarillas / rojas). Clasifica creativos (escalar / mantener / rotar / apagar).
              Ejecuta las reglas de presupuesto verdes automáticamente; escala las rojas a humano.</Text>
          </View>

          <View style={s.archBlock}>
            <Text style={s.archBlockTitle}>3 · Generador de reportes</Text>
            <View style={s.chipRow}><Chip kind="auto" small /></View>
            <Text style={s.caption}>Renderiza los 4 reportes (diario, semanal, quincenal, mensual) con
              formato editorial (Helvetica, tablas limpias, dos tablas de embudo por origen, moneda
              dual ARS/USD). Envío vía Resend a la lista de suscriptores.</Text>
          </View>

          <View style={s.archBlock}>
            <Text style={s.archBlockTitle}>4 · Ejecutor de decisiones aprobadas</Text>
            <View style={s.chipRow}><Chip kind="hybrid" small /></View>
            <Text style={s.caption}>Cuando el humano aprueba una acción (pausar creativo, cambiar
              presupuesto, activar audiencia), el sistema ejecuta directamente en Meta Business Manager
              vía API. Elimina el paso manual de "abrir el ads manager y hacer click".</Text>
          </View>

          <View style={s.archBlock}>
            <Text style={s.archBlockTitle}>5 · Registro y auditoría</Text>
            <View style={s.chipRow}><Chip kind="auto" small /></View>
            <Text style={s.caption}>Cada decisión ejecutada (automática o aprobada por humano) queda
              loggeada con contexto: KPIs previos, motivo, resultado esperado, resultado real medido
              a 7 y 14 días. Alimenta la recalibración mensual de baseline.</Text>
          </View>

          <Callout title="Punto de integración con Claude Code / Claude Cowork" accent>
            Los componentes 2, 3 y 5 son ejecutables por Claude Code / Cowork sin infraestructura
            adicional. El componente 1 requiere credenciales configuradas (Meta API + Supabase). El
            componente 4 requiere permisos de escritura en Meta Business Manager.
          </Callout>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <PageChrome eyebrow="Sección H · Arquitectura" runningTitle="Manual Operativo" pageNumber={18} />
        <View style={{ marginTop: 20 }}>
          <Text style={s.h2}>Cadencia de ejecución del sistema</Text>

          <View style={s.table}>
            <View style={s.trHead}>
              <Text style={[s.th, { width: '18%' }]}>Cuándo</Text>
              <Text style={[s.th, { width: '35%' }]}>Qué corre</Text>
              <Text style={[s.th, { width: '32%' }]}>Output</Text>
              <Text style={[s.th, { width: '15%' }]}>Trigger</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '18%' }]}>Diario 6:00 AM</Text>
              <Text style={[s.td, { width: '35%' }]}>Extracción de KPIs + evaluación de alertas</Text>
              <Text style={[s.td, { width: '32%' }]}>Digest diario por email</Text>
              <Text style={[s.td, { width: '15%' }]}>Cron</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '18%' }]}>Sábado 6:00 AM</Text>
              <Text style={[s.td, { width: '35%' }]}>Consolidación semanal + rolling 4-week + ranking creativos</Text>
              <Text style={[s.td, { width: '32%' }]}>Reporte semanal editorial</Text>
              <Text style={[s.td, { width: '15%' }]}>Cron</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '18%' }]}>Domingo par 6:00 AM</Text>
              <Text style={[s.td, { width: '35%' }]}>Consolidación quincenal por origen</Text>
              <Text style={[s.td, { width: '32%' }]}>Reporte quincenal editorial</Text>
              <Text style={[s.td, { width: '15%' }]}>Cron</Text>
            </View>
            <View style={s.trZebra}>
              <Text style={[s.td, { width: '18%' }]}>1º sábado del mes</Text>
              <Text style={[s.td, { width: '35%' }]}>Análisis mensual + baseline check + audiencias</Text>
              <Text style={[s.td, { width: '32%' }]}>Reporte mensual + borrador a Diego</Text>
              <Text style={[s.td, { width: '15%' }]}>Cron</Text>
            </View>
            <View style={s.tr}>
              <Text style={[s.td, { width: '18%' }]}>Continuo</Text>
              <Text style={[s.td, { width: '35%' }]}>Cross-check Meta ↔ plataforma interna</Text>
              <Text style={[s.td, { width: '32%' }]}>Alerta técnica si desvío &gt; 20%</Text>
              <Text style={[s.td, { width: '15%' }]}>Cada 4 hs</Text>
            </View>
            <View style={s.trLast}>
              <Text style={[s.td, { width: '18%' }]}>Sobre demanda</Text>
              <Text style={[s.td, { width: '35%' }]}>Auditoría profunda para reuniones o eventos</Text>
              <Text style={[s.td, { width: '32%' }]}>Informe personalizado</Text>
              <Text style={[s.td, { width: '15%' }]}>Humano</Text>
            </View>
          </View>

          <Text style={s.h2}>Qué NO automatiza el sistema (por diseño)</Text>
          <Text style={s.caption}>La lista de decisiones que quedan siempre en el humano.</Text>

          <Bullet><Text style={s.bold}>Producción creativa</Text> — grabar y editar videos, generar copy, imágenes originales.</Bullet>
          <Bullet><Text style={s.bold}>Aprobación de campañas nuevas</Text> — activar una campaña que no existía.</Bullet>
          <Bullet><Text style={s.bold}>Cambios de mensaje o marca</Text> — la oferta, el positioning, el tono.</Bullet>
          <Bullet><Text style={s.bold}>Conversaciones con Diego</Text> — la relación con el dueño no se delega al sistema.</Bullet>
          <Bullet><Text style={s.bold}>Interpretación cualitativa</Text> — cuando el equipo comercial dice "los leads son de peor calidad", eso se conversa entre humanos.</Bullet>
          <Bullet><Text style={s.bold}>Recalibración de baseline</Text> — el sistema propone; el humano firma.</Bullet>

          <Callout accent>
            El objetivo no es eliminar el rol humano. Es reasignar el 90% del tiempo humano de tareas
            repetitivas (extraer datos, calcular KPIs, hacer reportes) hacia las 6 áreas de arriba,
            donde el juicio y el gusto realmente importan.
          </Callout>
        </View>
      </Page>
    </>
  )
}

// ============================================================================
// PAGE 19 — SECTION I: BASELINE MAESTRA
// ============================================================================

function SectionI() {
  return (
    <Page size="A4" style={s.page}>
      <PageChrome eyebrow="Sección I · Baseline" runningTitle="Manual Operativo" pageNumber={19} />
      <View style={{ marginTop: 20 }}>
        <Text style={s.h1}>Baseline maestra</Text>
        <Text style={s.caption}>Referencia definitiva contra la cual se comparan los KPIs · versión julio 2026</Text>

        <View style={s.chipRow}>
          <Chip kind="hybrid" /><Text style={s.caption}>El sistema propone actualizaciones; el equipo firma los cambios</Text>
        </View>

        <View style={s.table}>
          <View style={s.trHead}>
            <Text style={[s.th, { width: '26%' }]}>Campaña</Text>
            <Text style={[s.th, { width: '20%' }]}>CPL benchmark</Text>
            <Text style={[s.th, { width: '13%' }]}>LPV rate</Text>
            <Text style={[s.th, { width: '10%' }]}>CTR</Text>
            <Text style={[s.th, { width: '15%' }]}>Frecuencia</Text>
            <Text style={[s.th, { width: '16%' }]}>Cost / LPV</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, { width: '26%', fontWeight: 700 }]}>Tasación Directa</Text>
            <Text style={[s.td, { width: '20%' }]}>$8.500–$12.000</Text>
            <Text style={[s.td, { width: '13%' }]}>≥45%</Text>
            <Text style={[s.td, { width: '10%' }]}>≥6%</Text>
            <Text style={[s.td, { width: '15%' }]}>≤2,3 mensual</Text>
            <Text style={[s.td, { width: '16%' }]}>≤$700</Text>
          </View>
          <View style={s.trZebra}>
            <Text style={[s.td, { width: '26%', fontWeight: 700 }]}>Alto Valor</Text>
            <Text style={[s.td, { width: '20%' }]}>&lt;$25.000</Text>
            <Text style={[s.td, { width: '13%' }]}>≥40%</Text>
            <Text style={[s.td, { width: '10%' }]}>≥6%</Text>
            <Text style={[s.td, { width: '15%' }]}>≤2,5 mensual</Text>
            <Text style={[s.td, { width: '16%' }]}>≤$1.000</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, { width: '26%', fontWeight: 700 }]}>Clase Gratuita</Text>
            <Text style={[s.td, { width: '20%' }]}>$3.800–$5.700</Text>
            <Text style={[s.td, { width: '13%' }]}>≥40%</Text>
            <Text style={[s.td, { width: '10%' }]}>≥5%</Text>
            <Text style={[s.td, { width: '15%' }]}>≤1,8 mensual</Text>
            <Text style={[s.td, { width: '16%' }]}>≤$500</Text>
          </View>
          <View style={s.trZebra}>
            <Text style={[s.td, { width: '26%', fontWeight: 700 }]}>Remarketing caliente</Text>
            <Text style={[s.td, { width: '20%' }]}>&lt;$5.000</Text>
            <Text style={[s.td, { width: '13%' }]}>—</Text>
            <Text style={[s.td, { width: '10%' }]}>≥6%</Text>
            <Text style={[s.td, { width: '15%' }]}>≤3 semanal</Text>
            <Text style={[s.td, { width: '16%' }]}>&lt;$400</Text>
          </View>
          <View style={s.trLast}>
            <Text style={[s.td, { width: '26%', fontWeight: 700 }]}>Remarketing tibio</Text>
            <Text style={[s.td, { width: '20%' }]}>&lt;$7.000</Text>
            <Text style={[s.td, { width: '13%' }]}>—</Text>
            <Text style={[s.td, { width: '10%' }]}>≥5%</Text>
            <Text style={[s.td, { width: '15%' }]}>≤3 semanal</Text>
            <Text style={[s.td, { width: '16%' }]}>&lt;$500</Text>
          </View>
        </View>

        <Text style={s.h2}>Origen de los números</Text>
        <Bullet><Text style={s.bold}>Tasación Directa:</Text> promedio de marzo–abril 2026 (mes 3–4 de análisis, previo a la fatiga terminal de VID10).</Bullet>
        <Bullet><Text style={s.bold}>Alto Valor:</Text> estimación conservadora basada en corrida HNWI de mayo 2026 (CTR 7%, LPV rate 45%). Se recalibra en 90 días con datos reales.</Bullet>
        <Bullet><Text style={s.bold}>Clase Gratuita:</Text> promedio del período estable febrero–abril 2026.</Bullet>
        <Bullet><Text style={s.bold}>Remarketing:</Text> estimación basada en fundamentos + estructura de audiencias vigente. Se recalibra en 60 días.</Bullet>

        <Text style={s.h2}>Cuándo se actualiza la baseline</Text>
        <Bullet>Si un valor sale del rango baseline por 3 meses consecutivos, se reajusta.</Bullet>
        <Bullet>Cambios estructurales (nueva campaña, cambio de mercado): recalibrar al mes siguiente.</Bullet>
        <Bullet>Mejoras sostenidas (3 meses seguidos por encima del rango): la baseline sube y el estándar se corre hacia arriba.</Bullet>

        <Callout title="La baseline no flota hacia abajo" accent>
          Un mal mes no cambia la baseline. Tres malos meses sí — pero requieren aprobación humana
          explícita. Esto evita normalizar mala performance.
        </Callout>
      </View>
    </Page>
  )
}

// ============================================================================
// PAGE 20 — SECTION J: RESPONSABILIDADES Y CIERRE
// ============================================================================

function SectionJ() {
  return (
    <Page size="A4" style={s.page}>
      <PageChrome eyebrow="Sección J · Responsabilidades" runningTitle="Manual Operativo" pageNumber={20} />
      <View style={{ marginTop: 20 }}>
        <Text style={s.h1}>Responsabilidades y cierre</Text>
        <Text style={s.caption}>Quién hace qué · cadencia de mantenimiento del manual</Text>

        <Text style={s.h2}>Matriz de responsabilidades</Text>

        <View style={s.table}>
          <View style={s.trHead}>
            <Text style={[s.th, { width: '30%' }]}>Ritual</Text>
            <Text style={[s.th, { width: '22%' }]}>Cadencia</Text>
            <Text style={[s.th, { width: '18%' }]}>Sistema</Text>
            <Text style={[s.th, { width: '18%' }]}>Equipo humano</Text>
            <Text style={[s.th, { width: '12%', textAlign: 'right' }]}>Tiempo</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, { width: '30%' }]}>Ritual diario</Text>
            <Text style={[s.td, { width: '22%' }]}>Lun–vie</Text>
            <Text style={[s.td, { width: '18%' }]}>Extrae, evalúa, alerta</Text>
            <Text style={[s.td, { width: '18%' }]}>Lee alertas rojas</Text>
            <Text style={[s.tdNum, { width: '12%' }]}>~2 min</Text>
          </View>
          <View style={s.trZebra}>
            <Text style={[s.td, { width: '30%' }]}>Ritual semanal</Text>
            <Text style={[s.td, { width: '22%' }]}>Sábados</Text>
            <Text style={[s.td, { width: '18%' }]}>Reporte + propuestas</Text>
            <Text style={[s.td, { width: '18%' }]}>Aprueba tácticas</Text>
            <Text style={[s.tdNum, { width: '12%' }]}>~20 min</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, { width: '30%' }]}>Ritual quincenal</Text>
            <Text style={[s.td, { width: '22%' }]}>Dom. par</Text>
            <Text style={[s.td, { width: '18%' }]}>Reporte por origen</Text>
            <Text style={[s.td, { width: '18%' }]}>Revisa</Text>
            <Text style={[s.tdNum, { width: '12%' }]}>~10 min</Text>
          </View>
          <View style={s.trZebra}>
            <Text style={[s.td, { width: '30%' }]}>Ritual mensual</Text>
            <Text style={[s.td, { width: '22%' }]}>1º sábado</Text>
            <Text style={[s.td, { width: '18%' }]}>Análisis + borrador</Text>
            <Text style={[s.td, { width: '18%' }]}>Decisiones estratégicas</Text>
            <Text style={[s.tdNum, { width: '12%' }]}>~30 min</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, { width: '30%' }]}>Producción creativa</Text>
            <Text style={[s.td, { width: '22%' }]}>Continua</Text>
            <Text style={[s.td, { width: '18%' }]}>Alerta pipeline vacío</Text>
            <Text style={[s.td, { width: '18%' }]}>Grabar, editar, aprobar</Text>
            <Text style={[s.tdNum, { width: '12%' }]}>Variable</Text>
          </View>
          <View style={s.trLast}>
            <Text style={[s.td, { width: '30%' }]}>Revisión con Diego</Text>
            <Text style={[s.td, { width: '22%' }]}>Mensual o ad-hoc</Text>
            <Text style={[s.td, { width: '18%' }]}>Prepara reporte</Text>
            <Text style={[s.td, { width: '18%' }]}>Reunión con Diego</Text>
            <Text style={[s.tdNum, { width: '12%' }]}>~45 min</Text>
          </View>
        </View>

        <Text style={s.h2}>Mantenimiento del manual</Text>
        <View style={s.chipRow}>
          <Chip kind="hybrid" /><Text style={s.caption}>Documento vivo · revisión trimestral</Text>
        </View>
        <Bullet><Text style={s.bold}>Trimestral:</Text> revisión completa. Se corrigen baselines, se ajustan umbrales según lo aprendido, se agregan playbooks para situaciones nuevas.</Bullet>
        <Bullet><Text style={s.bold}>Ante cambios estructurales:</Text> nueva campaña, eliminación de una campaña, cambio grande de estrategia comercial.</Bullet>
        <Bullet><Text style={s.bold}>Ante errores repetidos:</Text> si un problema se repitió en menos de 6 meses, se agrega al playbook correspondiente.</Bullet>

        <Text style={s.h2}>Log de cambios</Text>
        <Bullet><Text style={s.bold}>v1.0 — Julio 2026:</Text> Creación inicial. Documenta las 4 campañas activas y establece los primeros baselines basados en análisis de 4 meses (feb–may 2026). Diseño desde el principio para operación semi-autónoma con Claude Code / Claude Cowork.</Bullet>

        <Callout title="Fin del manual" accent>
          Este documento es la especificación operativa del sistema publicitario de Diego Ferreyra
          Inmobiliaria. El objetivo es que su ejecución sea 90% automática y que el 10% humano se
          reserve para las decisiones que solo el juicio puede tomar.
        </Callout>
      </View>
    </Page>
  )
}

// ============================================================================
// DOCUMENT
// ============================================================================

function ManualDoc() {
  return (
    <Document title="Manual de Gestión Operativa · Diego Ferreyra Inmobiliaria" author="Equipo de Marketing">
      <CoverPage />
      <TocPage />
      <SectionA />
      <SectionB />
      <SectionC />
      <SectionD />
      <SectionE />
      <PlaybookTasacion />
      <PlaybookAltoValor />
      <PlaybookClase />
      <PlaybookRemarketing />
      <SectionG />
      <SectionH />
      <SectionI />
      <SectionJ />
    </Document>
  )
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('-> Setup de fuentes...')
  await setupFonts()
  s = buildStyles()

  console.log('-> Renderizando manual...')
  const outPath = path.resolve('marketing-assets/manual-operativo/manual-gestion-campanas.pdf')
  await renderToFile(<ManualDoc />, outPath)

  const stat = fs.statSync(outPath)
  console.log(`OK · PDF generado: ${outPath}`)
  console.log(`   Tamaño: ${(stat.size / 1024).toFixed(1)} KB`)
}

main().catch(e => {
  console.error('FAILED:', e)
  process.exit(1)
})
