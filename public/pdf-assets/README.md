# Assets Requeridos para PDF de Tasación

## Instrucciones
Coloca los archivos en las rutas exactas indicadas abajo. Los archivos que tienen ✅ ya están generados/extraídos.

## 📁 `/public/pdf-assets/logos/`

### Logos Institucionales (de la portada del PDF):
- `cucicba.png` - Logo CUCICBA (escala de grises)
- `cia.png` - Logo Cámara Inmobiliaria Argentina (escala de grises)  
- `ici.png` - Logo ICI Capacitación (escala de grises)
- `diego-ferreyra-logo.png` - Logo principal "DIEGO FERREYRA" (azul)

**Instrucción**: Recorta estos logos de tu PDF original (página 1) y guárdalos como PNG transparentes.

---

## 📁 `/public/pdf-assets/photos/`

### Fotos de Diego:
- `diego-full-body.png` - Foto de cuerpo completo (para portada, páginas 5, 10, 12)
- `diego-circular.png` - Foto circular/recorte (para contraportada página 13)

**Instrucción**: Usa las fotos originales de Diego que están en tu PDF.

---

## 📁 `/public/pdf-assets/graphics/`

### Elementos gráficos:
- ✅ `traffic-light.png` - Semáforo 3D (ya generado, revisar si prefieres el tuyo)
- ✅ `wave-decoration.png` - Forma de onda decorativa (ya generado)
- `building-background.jpg` - Fondo de edificio azul (páginas 5 y 10)

**Instrucción**: El fondo de edificio azul sácalo de las páginas 5 o 10 de tu PDF.

---

## 📁 `/public/pdf-assets/monthly-data/`

### Gráficos de mercado (actualizados mensualmente):

**CABA General (páginas 3):**
- `stock-caba.png` - Infografía de stock de departamentos en CABA (tabla + gráfico circular + gauges)
- `escrituras-caba.png` - Gráfico de línea de escrituras últimos 12 meses

**Por Barrio (página 4) - ejemplo para Caballito:**
- `caballito/heatmap.png` - Mapa de calor de CABA con datos de Caballito
- `caballito/tipos-propiedades.png` - Gráfico circular de tipos de propiedades

**Instrucción**: 
1. Recorta estos gráficos de las páginas 3 y 4 de tu PDF
2. Para otros barrios, crea carpetas: `palermo/`, `belgrano/`, etc. con sus respectivos gráficos

---

## 🎯 Próximos Pasos

**OPCIÓN A - Más rápido:**
1. Sube TODOS los archivos a `/public/pdf-assets/` siguiendo la estructura
2. Yo procedo con la implementación completa

**OPCIÓN B - Por fases:**
1. Solo sube los logos y fotos de Diego ahora
2. Implemento el PDF con placeholders para los gráficos mensuales
3. Después agregas los gráficos y los conectamos

**¿Cuál opción prefieres?** Mientras tanto, puedo empezar a implementar la estructura base del PDF usando las imágenes que ya generé.
