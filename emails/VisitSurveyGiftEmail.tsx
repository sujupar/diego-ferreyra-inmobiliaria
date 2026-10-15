import { Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr } from '@react-email/components'

export interface PropsRegaloEncuesta { nombre: string; direccion: string; titulo: string; urlDescarga: string }

export default function VisitSurveyGiftEmail(p: PropsRegaloEncuesta) {
  return (
    <Html>
      <Head />
      <Preview>{p.titulo}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#fff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ fontSize: 20 }}>{p.titulo}</Heading>
          <Text>{p.nombre ? `Hola ${p.nombre}, gracias` : 'Gracias'} por contarnos qué te pareció {p.direccion}.</Text>
          <Text>Acá tenés el material que pediste:</Text>
          <Section style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button href={p.urlDescarga} style={{ backgroundColor: '#2563eb', color: '#fff', padding: '12px 24px', borderRadius: 6 }}>
              Descargar
            </Button>
          </Section>
          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>Si querés volver a verla o hacer una oferta, respondé el WhatsApp de la visita. Diego Ferreyra Inmobiliaria</Text>
        </Container>
      </Body>
    </Html>
  )
}
