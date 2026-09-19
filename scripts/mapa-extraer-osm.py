"""
Extrae del archivo de OpenStreetMap de Argentina (Geofabrik, .osm.pbf) los
lugares del AMBA que usa el mapa propio de las descripciones, y los escribe en
JSONL (una fila por línea) para que `scripts/mapa-cargar-archivo.ts` los cargue.

POR QUÉ un archivo y no Overpass: la carga inicial contra los servidores
públicos de Overpass terminó con la IP bloqueada ("fetch failed" al instante) y
los espejos con 504 (2026-09-19). El archivo de Geofabrik se baja entero, sin
límites, y tiene los MISMOS datos.

Las reglas son las mismas que `lib/mapa/overpass-celda.ts` (mantener
sincronizado):
  - estación (railway=station) con nombre → sus líneas son las rutas de
    subte/tren que tienen como miembro a la estación o a un nodo de su mismo
    stop_area; subte si station=subway, la red dice "subte" o alguna ruta es subway;
  - parada (highway=bus_stop) → líneas de las rutas route=bus que la tienen de
    miembro, sin ramal ("24-1" → "24"); sin líneas no se guarda;
  - recorrido (tramo = way miembro de rutas route=bus) → su trazado completo y
    las líneas que pasan por él. Es lo que hace que "pasa a 400 m" dé lo mismo
    que la consulta en vivo (`rel(around:400)[route=bus]`): a muchas rutas les
    faltan las paradas en OpenStreetMap, pero nunca el trazado. La fila va a la
    celda de su primer punto dentro del AMBA;
  - plaza (leisure=park), colegio (amenity=school), universidad
    (amenity=college|university), hospital (amenity=hospital), con nombre, en su
    centro (centro de la caja, como el `center` de Overpass).

Correr: python3 scripts/mapa-extraer-osm.py <archivo.osm.pbf> <salida.jsonl>
"""
import json
import re
import sys

import osmium

# El AMBA: lib/mapa/celdas.ts (AMBA). Mantener igual.
SUR, OESTE, NORTE, ESTE = -35.25, -59.2, -34.3, -58.1
RUTAS_RIEL = {"subway", "train", "light_rail", "tram"}


def dentro(lat, lng):
    return SUR <= lat <= NORTE and OESTE <= lng <= ESTE


def linea_de_ruta(tags):
    """lib/mapa/normalizar.ts#lineaDeRuta"""
    nombre = (tags.get("name") or "").split(":")[0].strip()
    if nombre:
        return nombre
    ref = (tags.get("ref") or "").strip()
    return f"Línea {ref}" if ref else None


def linea_de_colectivo(tags):
    """lib/mapa/normalizar.ts#lineaDeColectivo"""
    m = re.match(r"^\d+", tags.get("ref") or "")
    if m:
        return str(int(m.group(0)))
    m = re.search(r"l[ií]nea\s+(\d+)", tags.get("name") or "", re.IGNORECASE)
    return str(int(m.group(1))) if m else None


def tipo_de_lugar(tags):
    amenity = tags.get("amenity")
    if amenity == "hospital":
        return "hospital"
    if amenity in ("university", "college"):
        return "universidad"
    if amenity == "school":
        return "colegio"
    if tags.get("leisure") == "park":
        return "plaza"
    return None


class Relaciones(osmium.SimpleHandler):
    """Primera pasada: solo relaciones (rutas y stop_areas)."""

    def __init__(self):
        super().__init__()
        self.lineas_riel = {}      # nodo → {(línea, es_subte)}
        self.stop_areas = []       # [set(nodos)]
        self.lineas_bus = {}       # nodo → {línea}
        self.tramos_bus = {}       # way → {línea}

    def relation(self, r):
        tags = {t.k: t.v for t in r.tags}
        nodos = [m.ref for m in r.members if m.type == "n"]
        ruta = tags.get("route")
        if ruta in RUTAS_RIEL:
            linea = linea_de_ruta(tags)
            if linea:
                for n in nodos:
                    self.lineas_riel.setdefault(n, set()).add((linea, ruta == "subway"))
        elif ruta == "bus":
            linea = linea_de_colectivo(tags)
            if linea:
                for n in nodos:
                    self.lineas_bus.setdefault(n, set()).add(linea)
                for m in r.members:
                    if m.type == "w":
                        self.tramos_bus.setdefault(m.ref, set()).add(linea)
        elif tags.get("public_transport") == "stop_area":
            self.stop_areas.append(set(nodos))


class Lugares(osmium.SimpleHandler):
    """Segunda pasada: nodos con ubicación y áreas (ways cerrados y multipolígonos)."""

    def __init__(self, rel, salida):
        super().__init__()
        self.rel = rel
        self.salida = salida
        self.cuenta = {}
        # nodo → stop_areas que lo contienen (para sumar las líneas de sus andenes)
        self.area_de_nodo = {}
        for i, sa in enumerate(rel.stop_areas):
            for n in sa:
                self.area_de_nodo.setdefault(n, []).append(i)

    def escribir(self, fila):
        self.cuenta[fila["tipo"]] = self.cuenta.get(fila["tipo"], 0) + 1
        self.salida.write(json.dumps(fila, ensure_ascii=False) + "\n")

    def node(self, n):
        if not n.location.valid():
            return
        lat, lng = n.location.lat, n.location.lon
        if not dentro(lat, lng):
            return
        tags = {t.k: t.v for t in n.tags}
        nombre = (tags.get("name") or "").strip()

        if tags.get("railway") == "station" and nombre:
            lineas = set(self.rel.lineas_riel.get(n.id, set()))
            for i in self.area_de_nodo.get(n.id, []):
                for m in self.rel.stop_areas[i]:
                    lineas |= self.rel.lineas_riel.get(m, set())
            es_subte = tags.get("station") == "subway" or "subte" in (tags.get("network") or "").lower() or any(s for _, s in lineas)
            nombres = sorted({l for l, _ in lineas})
            self.escribir({"osm_id": f"n{n.id}", "tipo": "subte" if es_subte else "tren", "nombre": nombre, "lineas": nombres, "lat": lat, "lng": lng})
            return

        if tags.get("highway") == "bus_stop":
            lineas = self.rel.lineas_bus.get(n.id)
            if lineas:
                ordenadas = sorted(lineas, key=lambda x: int(x))
                self.escribir({"osm_id": f"n{n.id}", "tipo": "parada", "nombre": "", "lineas": ordenadas, "lat": lat, "lng": lng})
            return

        tipo = tipo_de_lugar(tags)
        if tipo and nombre:
            self.escribir({"osm_id": f"n{n.id}", "tipo": tipo, "nombre": nombre, "lineas": [], "lat": lat, "lng": lng})

    def way(self, w):
        lineas = self.rel.tramos_bus.get(w.id)
        if not lineas:
            return
        # [lng, lat], el orden de GeoJSON y de WKT.
        trazo = [[round(n.location.lon, 7), round(n.location.lat, 7)] for n in w.nodes if n.location.valid()]
        if len(trazo) < 2:
            return
        primero = next((p for p in trazo if dentro(p[1], p[0])), None)
        if not primero:
            return
        ordenadas = sorted(lineas, key=lambda x: int(x))
        self.escribir({"osm_id": f"w{w.id}", "tipo": "recorrido", "nombre": "", "lineas": ordenadas, "lat": primero[1], "lng": primero[0], "trazo": trazo})

    def area(self, a):
        tags = {t.k: t.v for t in a.tags}
        tipo = tipo_de_lugar(tags)
        nombre = (tags.get("name") or "").strip()
        if not tipo or not nombre:
            return
        lats, lngs = [], []
        for anillo in a.outer_rings():
            for nr in anillo:
                if nr.location.valid():
                    lats.append(nr.location.lat)
                    lngs.append(nr.location.lon)
        if not lats:
            return
        # Centro de la caja: lo mismo que el `out center` de Overpass.
        lat, lng = (min(lats) + max(lats)) / 2, (min(lngs) + max(lngs)) / 2
        if not dentro(lat, lng):
            return
        prefijo = "w" if a.from_way() else "r"
        self.escribir({"osm_id": f"{prefijo}{a.orig_id()}", "tipo": tipo, "nombre": nombre, "lineas": [], "lat": lat, "lng": lng})


def main():
    archivo, destino = sys.argv[1], sys.argv[2]
    rel = Relaciones()
    rel.apply_file(archivo)
    print(f"rutas de riel en {len(rel.lineas_riel)} nodos · {len(rel.stop_areas)} stop_areas · rutas de colectivo en {len(rel.lineas_bus)} nodos y {len(rel.tramos_bus)} tramos", flush=True)
    with open(destino, "w", encoding="utf-8") as salida:
        lugares = Lugares(rel, salida)
        lugares.apply_file(archivo, locations=True, idx="flex_mem")
    print("filas por tipo:", json.dumps(lugares.cuenta, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
