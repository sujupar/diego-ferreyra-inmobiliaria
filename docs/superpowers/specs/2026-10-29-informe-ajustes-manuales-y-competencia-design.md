# Informe quincenal — corregir a mano los datos automáticos y competidoras más baratas por m²

Pedido del dueño (2026-10-29), dos ajustes al generador de informes quincenales.

## 1. Corregir a mano un dato que la plataforma trajo en cero (o no pudo traer)

**Problema:** si la plataforma trae un dato en cero, sin datos o con error (por ejemplo, visitas que no se cargaron
en el sistema, o Meta que no respondió), hoy no hay forma de corregirlo antes de la vista previa: el PDF sale con ese
cero o sin esa sección.

**Resultado:** cada fuente automática se puede corregir a mano, y lo corregido vale en todo el informe.

### Qué ve el usuario
- En "Lo que juntó la plataforma", cada fila (Consultas, Visitas, Reserva, MercadoLibre, Meta, Instagram) tiene
  **"Corregir a mano"**. Al tocarlo aparecen los números de esa fuente, ya cargados con lo que trajo la plataforma
  (o vacíos si no trajo nada):
  - **Consultas:** por portal (Zonaprop, Argenprop, MercadoLibre, Redes, Otros). El total es la suma.
  - **Visitas:** visitas realizadas. (La ficha de visitas sale de la encuesta y no se edita.)
  - **Reserva:** si se reservó y la fecha.
  - **MercadoLibre:** visitas, interesados, preguntas, WhatsApp, llamadas y vieron el teléfono.
  - **Meta:** alcance, impresiones, clientes potenciales e inversión.
  - **Instagram:** reproducciones, alcance, me gusta y comentarios (en total).
- Se guarda solo, con el mismo autoguardado del resto del informe.
- Una fila corregida dice **"Cargado a mano"** y muestra al lado lo que había traído la plataforma ("automático: 0").
  Tiene **"Volver al automático"**.
- Volver a traer la fuente NO borra lo cargado a mano.
- Mismos roles que hoy: quien puede editar el informe puede corregir.

### Qué pasa por detrás
- Lo corregido se guarda dentro del `manual` del informe (`manual.ajustes`), no pisa lo que trajo la plataforma.
- Al leer el informe, una sola función pura aplica los ajustes sobre los datos automáticos. Desde ahí lo usan el
  resumen ("vieron", "entraron", consultas, ✅/❌), los textos que escribe la plataforma, las páginas del PDF y los
  faltantes. Una fuente con error o sin datos que se corrigió a mano cuenta como dato.
- Los textos ya escritos no se reescriben solos: la pantalla avisa "Corregiste datos: tocá Volver a escribir".

### Criterios de aceptación
1. Con Visitas en 0, "Corregir a mano" → 3 visitas → la vista previa del PDF muestra 3 visitas y el resumen las cuenta.
2. Con Meta en error, cargar alcance e impresiones a mano → la página de Meta sale en el PDF con esos números.
3. La fila dice "Cargado a mano (automático: 0)"; "Volver al automático" restituye el 0 y el PDF vuelve a mostrar 0.
4. "Volver a traer" la fuente no borra lo cargado a mano.
5. Cerrar la pestaña con un número a medio cargar lo guarda igual (autoguardado).

## 2. Competidoras: solo las que valen MENOS por m² que la nuestra

**Problema:** la búsqueda propone propiedades parecidas, pero algunas valen más por m² que la nuestra, y esas no
sirven para el argumento del informe.

**Resultado:** las candidatas que busca la plataforma tienen todas un valor del m² menor al de nuestra propiedad.

### Qué ve el usuario
- La lista "Encontradas por la plataforma" muestra solo candidatas con valor del m² menor al nuestro.
- Cada una dice cuánto más barata es: "USD 1.950/m² (la nuestra: USD 2.128/m²)".
- Arriba de la lista: "Se muestran solo las que valen menos por m² que la nuestra (USD 2.128/m²)" y cuántas se
  descartaron por valer más.
- Si NO se puede calcular el valor del m² nuestro (falta precio o m² en la ficha), no se filtra y se avisa:
  "No se pudo comparar el precio por m²: falta el precio o los m² en la ficha de la propiedad".
- Una competidora que se pega a mano con el link no se filtra (es elección de quien arma el informe), pero si vale
  más por m² que la nuestra, la tarjeta lo marca.

### Supuestos
- Se compara solo en la misma moneda. Una candidata en otra moneda, o sin precio o sin m², no se puede comparar y
  queda afuera (hoy ya quedaban al fondo de la lista).
- "Menor" es estrictamente menor; una que vale igual queda afuera.
- Las demás reglas de parecido (barrio, ambientes, m², antigüedad, disposición, estado) siguen igual.

### Criterios de aceptación
6. En un informe de una propiedad con valor del m² conocido, ninguna candidata de la lista vale lo mismo o más por m².
7. La lista dice cuántas se descartaron por valer más por m².
8. Sin precio o sin m² en la ficha, la lista muestra todas y el aviso de que no se pudo comparar.

## Qué queda afuera
- Corregir a mano la ficha de visitas (gustó / precio / ofertas): sale de la encuesta a quien visitó.
- Corregir a mano las capturas o los números de Zonaprop y Argenprop: ya son manuales.

## Riesgos (pre-flight)
- Sin migración: `manual` es jsonb y se valida con zod (`sanear.ts`); hay que sumar `ajustes` al esquema y al CHECK
  de tamaño si lo hubiera.
- Muchos lectores de `fuentes` (resumen, redacción, PDF, faltantes, editor): por eso los ajustes se aplican en UN
  lugar al leer, y el editor recibe además lo automático original para mostrarlo.
- Los informes viejos sin `ajustes` funcionan igual.
