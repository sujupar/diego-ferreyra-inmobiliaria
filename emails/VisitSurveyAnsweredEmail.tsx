import { Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr } from '@react-email/components'

export interface PropsEncuestaRespondida {
  direccion: string
  persona: string
  fechaVisita: string
  filas: Array<{ etiqueta: string; valor: string }>
  visitaUrl: string
}

/** Todo lo que viene de la persona se pasa como texto: React lo escapa. Nada de HTML armado a mano. */
export default function VisitSurveyAnsweredEmail(p: PropsEncuestaRespondida) {
  return (
    <Html>
      <Head />
      <Preview>{p.persona} respondió la encuesta de {p.direccion}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#fff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ fontSize: 20 }}>Respondieron la encuesta</Heading>
          <Text>{p.persona} contó qué le pareció la visita a {p.direccion} del {p.fechaVisita}.</Text>
          <Section style={{ backgroundColor: '#f0f4f8', padding: 16, borderRadius: 6 }}>
            {p.filas.map(f => (
              <Text key={f.etiqueta} style={{ margin: '4px 0' }}><strong>{f.etiqueta}:</strong> {f.valor}</Text>
            ))}
          </Section>
          <Section style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button href={p.visitaUrl} style={{ backgroundColor: '#2563eb', color: '#fff', padding: '12px 24px', borderRadius: 6 }}>
              Ver la visita
            </Button>
          </Section>
          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>El propietario no ve el nombre de quien respondió. Diego Ferreyra Inmobiliaria</Text>
        </Container>
      </Body>
    </Html>
  )
}
