import { Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr } from '@react-email/components'

interface Props {
  advisorName: string
  propertyAddress: string
  scheduledAt: string
  clientName: string
  visitUrl: string
}

export default function VisitReminderAdvisorEmail(p: Props) {
  return (
    <Html>
      <Head />
      <Preview>¿Se realizó la visita de {p.propertyAddress}?</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#fff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ fontSize: 20 }}>Marcá el resultado de la visita</Heading>
          <Text>Hola {p.advisorName},</Text>
          <Text>Pasó la fecha de la siguiente visita y necesitamos saber si se realizó:</Text>
          <Section style={{ backgroundColor: '#f0f4f8', padding: 16, borderRadius: 6 }}>
            <Text style={{ margin: 0, fontWeight: 600 }}>{p.propertyAddress}</Text>
            <Text style={{ margin: '4px 0 0' }}>Cliente: {p.clientName}</Text>
            <Text style={{ margin: '4px 0 0' }}>Fecha: {p.scheduledAt}</Text>
          </Section>
          <Section style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button href={p.visitUrl} style={{ backgroundColor: '#2563eb', color: '#fff', padding: '12px 24px', borderRadius: 6 }}>
              Marcar resultado
            </Button>
          </Section>
          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>Diego Ferreyra Inmobiliaria</Text>
        </Container>
      </Body>
    </Html>
  )
}
