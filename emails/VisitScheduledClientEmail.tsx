import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Link } from '@react-email/components'

interface Props {
  clientName: string
  propertyAddress: string
  propertyNeighborhood: string
  scheduledAt: string
  advisorName: string
  advisorPhone?: string
  advisorEmail: string
}

export default function VisitScheduledClientEmail(p: Props) {
  return (
    <Html>
      <Head />
      <Preview>Confirmación de visita: {p.propertyAddress}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ color: '#111', fontSize: 20 }}>Tu visita está confirmada</Heading>
          <Text>Hola {p.clientName},</Text>
          <Text>Te confirmamos la cita para visitar la siguiente propiedad:</Text>

          <Section style={{ backgroundColor: '#f0f4f8', padding: 16, borderRadius: 6, margin: '16px 0' }}>
            <Text style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{p.propertyAddress}</Text>
            <Text style={{ margin: '4px 0 0', color: '#555' }}>{p.propertyNeighborhood}</Text>
            <Hr style={{ margin: '12px 0' }} />
            <Text style={{ margin: 0 }}><strong>Fecha y hora:</strong> {p.scheduledAt}</Text>
          </Section>

          <Text>Tu asesor asignado es <strong>{p.advisorName}</strong>.</Text>
          <Text>
            Cualquier consulta o cambio, escribinos a <Link href={`mailto:${p.advisorEmail}`}>{p.advisorEmail}</Link>
            {p.advisorPhone ? <> o llamanos al {p.advisorPhone}</> : null}.
          </Text>

          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>Diego Ferreyra Inmobiliaria</Text>
        </Container>
      </Body>
    </Html>
  )
}
