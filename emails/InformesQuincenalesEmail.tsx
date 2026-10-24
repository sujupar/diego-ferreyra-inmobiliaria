import { Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr, Link } from '@react-email/components'

export interface PropsInformesQuincenales {
  /** "del 16 al 31 de octubre de 2026" */
  periodo: string
  informes: Array<{ direccion: string; url: string }>
  listadoUrl: string
}

/**
 * Aviso a la coordinación cuando el ciclo del 1 o el 16 terminó de juntar los datos. UNO por tanda, con la lista:
 * un email por propiedad serían ~36 el mismo día. Las direcciones vienen de la base: React las escapa.
 */
export default function InformesQuincenalesEmail(p: PropsInformesQuincenales) {
  const cuantos = p.informes.length
  return (
    <Html>
      <Head />
      <Preview>{`${cuantos} ${cuantos === 1 ? 'informe quincenal listo' : 'informes quincenales listos'} para completar`}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#fff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ fontSize: 20 }}>Informes quincenales listos para completar</Heading>
          <Text>
            La plataforma armó {cuantos === 1 ? 'el informe' : `los ${cuantos} informes`} {p.periodo}, con las consultas, las visitas, MercadoLibre,
            Meta e Instagram. Al abrir cada uno se escriben los textos y se buscan las competidoras.
          </Text>
          <Text>Falta cargar los números de Zonaprop y Argenprop, revisar y marcarlo como listo.</Text>
          <Section style={{ backgroundColor: '#f0f4f8', padding: 16, borderRadius: 6 }}>
            {p.informes.map(i => (
              <Text key={i.url} style={{ margin: '4px 0' }}><Link href={i.url}>{i.direccion}</Link></Text>
            ))}
          </Section>
          <Section style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button href={p.listadoUrl} style={{ backgroundColor: '#2563eb', color: '#fff', padding: '12px 24px', borderRadius: 6 }}>
              Ver los informes
            </Button>
          </Section>
          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>Diego Ferreyra Inmobiliaria</Text>
        </Container>
      </Body>
    </Html>
  )
}
