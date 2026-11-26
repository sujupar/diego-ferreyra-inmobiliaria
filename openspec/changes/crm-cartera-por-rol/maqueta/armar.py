#!/usr/bin/env python3
"""Arma la maqueta en UN solo archivo autocontenido.

    python3 armar.py [carpeta_maqueta] [archivo_de_salida]

Toma shell.html y:
  - reemplaza el <link> a base.css por un <style> con base.css + pantallas/*.css  (marcador <!-- ESTILOS -->)
  - inserta pantallas/*.html donde dice <!-- PANTALLAS -->
  - reemplaza <script src="base.js"> por base.js + pantallas/*.js en línea        (marcador <!-- SCRIPTS -->)
Orden: inicio, ficha, tareas, estados y después el resto por nombre.
Por defecto escribe index.html en la misma carpeta.
"""
import os
import sys

ORDEN = ['indice', 'cartera', 'estados-lista', 'decisiones', 'inicio', 'ficha', 'tareas']


def leer(ruta):
    with open(ruta, encoding='utf-8') as f:
        return f.read()


def main():
    base = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    salida = sys.argv[2] if len(sys.argv) > 2 else os.path.join(base, 'index.html')
    carpeta = os.path.join(base, 'pantallas')

    nombres = sorted({os.path.splitext(f)[0] for f in os.listdir(carpeta) if f.endswith(('.html', '.css', '.js'))}) if os.path.isdir(carpeta) else []
    nombres.sort(key=lambda n: (ORDEN.index(n) if n in ORDEN else len(ORDEN), n))

    def juntar(ext, envoltorio):
        partes = []
        for n in nombres:
            ruta = os.path.join(carpeta, n + ext)
            if os.path.isfile(ruta):
                partes.append(envoltorio(n, leer(ruta)))
        return '\n'.join(partes)

    html = juntar('.html', lambda n, t: '<!-- pantalla: %s -->\n%s' % (n, t))
    css = juntar('.css', lambda n, t: '/* pantalla: %s */\n%s' % (n, t))
    js = juntar('.js', lambda n, t: '<script>\n/* pantalla: %s */\n%s\n</script>' % (n, t.replace('</script', '<\\/script')))

    doc = leer(os.path.join(base, 'shell.html'))
    for marca in ('<link rel="stylesheet" href="base.css">', '<!-- ESTILOS -->', '<!-- PANTALLAS -->', '<script src="base.js"></script>', '<!-- SCRIPTS -->'):
        if doc.count(marca) != 1:
            sys.exit('shell.html: se esperaba exactamente una vez: ' + marca)
    doc = doc.replace('<link rel="stylesheet" href="base.css">', '<style>\n' + leer(os.path.join(base, 'base.css')) + '\n</style>')
    doc = doc.replace('<!-- ESTILOS -->', '<style>\n' + css + '\n</style>' if css else '')
    doc = doc.replace('<!-- PANTALLAS -->', html)
    doc = doc.replace('<script src="base.js"></script>', '<script>\n' + leer(os.path.join(base, 'base.js')).replace('</script', '<\\/script') + '\n</script>')
    doc = doc.replace('<!-- SCRIPTS -->', js)

    with open(salida, 'w', encoding='utf-8') as f:
        f.write(doc)
    print('OK %s (%d KB) · pantallas: %s' % (salida, len(doc.encode('utf-8')) // 1024, ', '.join(nombres) or 'ninguna'))


if __name__ == '__main__':
    main()
