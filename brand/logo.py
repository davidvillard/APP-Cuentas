"""Logo de Tilo (concepto B, «lo que compartís»): dos anillos, dos vidas; lo que se solapa es una hoja.

Genera los SVG de la marca. Uso: `python brand/logo.py` desde la raíz del proyecto.
- public/tilo-simbolo.svg       símbolo verde, fondo transparente (cabecera de la app)
- public/favicon.svg            símbolo blanco sobre cuadrado verde redondeado (pestaña, iconos)
- brand/tilo-logo.svg           símbolo + «tilo» (README, presentaciones)
- brand/tilo-icono.svg          el icono de app a 512, para sacar los PNG

Hay dos cortes del símbolo: el grande (icono de app, logo) con anillos finos, y el pequeño (favicon y
cabecera) con anillos más gruesos, porque a 16–32 px un trazo fino se pierde.
"""
import math
import os

GREEN, NAVY, WHITE = '#0f7a5c', '#1d2a44', '#fff'
HERE = os.path.dirname(os.path.abspath(__file__))
WORD = open(os.path.join(HERE, 'wordmark.d')).read()  # «tilo» en Schibsted Grotesk ExtraBold, a trazo


def f(v):
    return f'{v:.2f}'.rstrip('0').rstrip('.')


def symbol(ink, R, D, T):
    """Símbolo en un lienzo de 256. R radio de los anillos, D media distancia entre centros, T grosor."""
    c = D / math.sqrt(2)
    centers = [(128 - c, 128 + c), (128 + c, 128 - c)]  # abajo-izquierda, arriba-derecha
    out, inn = R + T / 2, R - T / 2

    def circle(cx, cy, r):
        return f'M {f(cx - r)} {f(cy)} a {f(r)} {f(r)} 0 1 0 {f(2 * r)} 0 a {f(r)} {f(r)} 0 1 0 {f(-2 * r)} 0 Z'

    rings = ''.join(f'<path fill="{ink}" fill-rule="evenodd" d="{circle(cx, cy, out)} {circle(cx, cy, inn)}"/>'
                    for cx, cy in centers)
    # La hoja: la intersección de los dos círculos (por el centro del trazo), con punta en el eje NO–SE.
    p = math.sqrt(R * R - D * D) / math.sqrt(2)
    a, b = (128 - p, 128 - p), (128 + p, 128 + p)
    leaf = f'M {f(a[0])} {f(a[1])} A {R} {R} 0 0 1 {f(b[0])} {f(b[1])} A {R} {R} 0 0 1 {f(a[0])} {f(a[1])} Z'
    return rings + f'<path fill="{ink}" fill-rule="evenodd" d="{leaf}"/>'


def big(ink):
    return symbol(ink, R=66, D=38, T=14)


def small(ink):
    return symbol(ink, R=63, D=35, T=24)


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{f(w)}" height="{f(h)}" viewBox="0 0 {f(w)} {f(h)}" role="img">'
            f'<title>{title}</title>{body}</svg>\n')


def tile(sym, size=256):
    """Icono de app: cuadrado verde redondeado con el símbolo blanco al 78 %."""
    k = 0.78
    off = 128 * (1 - k)
    body = (f'<rect width="256" height="256" rx="56" fill="{GREEN}"/>'
            f'<g transform="translate({f(off)} {f(off)}) scale({k})">{sym}</g>')
    return svg(size, size, f'<svg viewBox="0 0 256 256" width="{size}" height="{size}">{body}</svg>', 'Tilo')


def lockup():
    S = 0.78  # el wordmark mide 186 de ascendente a base; así queda en 145
    gap = 22
    tx, ty = 256 + gap - 4.38 * S, 206 - 227.6 * S
    word = f'<path fill="{NAVY}" transform="translate({f(tx)} {f(ty)}) scale({S})" d="{WORD}"/>'
    return svg(256 + gap + 342.5 * S, 256, big(GREEN) + word, 'tilo')


def write(path, text):
    with open(os.path.join(HERE, '..', path), 'w', encoding='utf-8') as fh:
        fh.write(text)


write('public/tilo-simbolo.svg', svg(256, 256, small(GREEN), 'Tilo'))
write('public/favicon.svg', tile(small(WHITE)))
write('brand/tilo-logo.svg', lockup())
write('brand/tilo-icono.svg', tile(big(WHITE), 512))
print('ok')
