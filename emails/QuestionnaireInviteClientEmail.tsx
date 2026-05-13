import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components'

interface Props {
  clientName: string
  propertyAddress: string
  questionnaireUrl: string
  advisorName: string
}

export default function QuestionnaireInviteClientEmail(p: Props) {
  return (
    <Html>
      <Head />
      <Preview>Tu opinión sobre {p.propertyAddress}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#fff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ fontSize: 20 }}>¿Qué te pareció la propiedad?</Heading>
          <Text>Hola {p.clientName},</Text>
          <Text>Gracias por visitar <strong>{p.propertyAddress}</strong>. Tu feedback es muy valioso — son solo 5 preguntas rápidas.</Text>
          <Section style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button href={p.questionnaireUrl} style={{ backgroundColor: '#2563eb', color: '#fff', padding: '12px 24px', borderRadius: 6 }}>
              Responder cuestionario
            </Button>
          </Section>
          <Text>Saludos,<br/>{p.advisorName} - Diego Ferreyra Inmobiliaria</Text>
          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>El enlace expira en 14 días.</Text>
        </Container>
      </Body>
    </Html>
  )
}
