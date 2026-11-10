"""Thư viện nhỏ vẽ sơ đồ theo hệ thiết kế diagram-design (skin mặc định).

Mọi toạ độ do người gọi đặt trên lưới 4px; thư viện chỉ sinh markup đúng quy ước
(mask node, đường nối vuông góc bo r=8, nhãn có mask, legend dưới đáy).
"""
from xml.sax.saxutils import escape as _e

PAPER, INK, MUTED, SOFT, ACCENT, LINK = '#f5f5f5', '#2d3142', '#4f5d75', '#5a6580', '#bf4520', '#2e5aa8'
ACCENT_TINT = 'rgba(191,69,32,0.08)'
SANS = "'Geist', system-ui, sans-serif"
MONO = "'Geist Mono', ui-monospace, monospace"

TREAT = {  # node type -> (fill, stroke, dash)
    'focal': (ACCENT_TINT, ACCENT, None),
    'backend': ('#ffffff', INK, None),
    'store': ('rgba(45,49,66,0.05)', MUTED, None),
    'external': ('rgba(45,49,66,0.03)', 'rgba(45,49,66,0.30)', None),
    'input': ('rgba(79,93,117,0.10)', SOFT, None),
    'optional': ('rgba(45,49,66,0.02)', 'rgba(45,49,66,0.20)', '4,3'),
    'security': ('rgba(191,69,32,0.05)', 'rgba(191,69,32,0.50)', '4,4'),
}


def esc(s):
    return _e(str(s))


class D:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.back, self.mid, self.front = [], [], []  # zones / arrows+labels / nodes

    # ---------------- shapes ----------------
    def zone(self, x, y, w, h, label=None, dashed=True):
        d = ' stroke-dasharray="4,4"' if dashed else ''
        self.back.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="rgba(45,49,66,0.02)" stroke="rgba(45,49,66,0.22)" stroke-width="1"{d}/>')
        if label:
            self.back.append(f'<text x="{x + 12}" y="{y + 18}" fill="{MUTED}" font-size="8" font-family="{MONO}" letter-spacing="0.16em">{esc(label.upper())}</text>')

    def lane(self, x, y, w, h, label, first=False):
        if not first:
            self.back.append(f'<line x1="{x}" y1="{y}" x2="{x + w}" y2="{y}" stroke="rgba(45,49,66,0.12)" stroke-width="1"/>')
        self.back.append(f'<text x="{x + 8}" y="{y + 20}" fill="{MUTED}" font-size="8" font-family="{MONO}" letter-spacing="0.16em">{esc(label.upper())}</text>')

    def node(self, x, y, w, h, name, sub=None, kind='backend', tag=None, rx=6):
        fill, stroke, dash = TREAT[kind]
        dd = f' stroke-dasharray="{dash}"' if dash else ''
        o = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{PAPER}"/>',
             f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="1"{dd}/>']
        lines = name if isinstance(name, list) else [name]
        top = 0
        if tag:
            tw = max(28, int(len(tag) * 5.6 + 12) // 4 * 4 + 4)
            tc = ACCENT if kind == 'focal' else MUTED
            o.append(f'<rect x="{x + 8}" y="{y + 6}" width="{tw}" height="12" rx="2" fill="transparent" stroke="{tc}" stroke-opacity="0.45" stroke-width="0.8"/>')
            o.append(f'<text x="{x + 8 + tw / 2}" y="{y + 15}" fill="{tc}" font-size="7" font-family="{MONO}" text-anchor="middle" letter-spacing="0.08em">{esc(tag)}</text>')
            top = 8
        n = len(lines) + (1 if sub else 0)
        cy = y + top / 2 + h / 2 - (n - 1) * 7.5 + 4
        for i, ln in enumerate(lines):
            o.append(f'<text x="{x + w / 2}" y="{cy + i * 15}" fill="{INK}" font-size="12" font-weight="600" font-family="{SANS}" text-anchor="middle">{esc(ln)}</text>')
        if sub:
            o.append(f'<text x="{x + w / 2}" y="{cy + len(lines) * 15}" fill="{MUTED}" font-size="9" font-family="{MONO}" text-anchor="middle">{esc(sub)}</text>')
        self.front += o

    def diamond(self, cx, cy, w, h, lines, kind='backend'):
        fill, stroke, _ = TREAT[kind]
        pts = f'{cx},{cy - h / 2} {cx + w / 2},{cy} {cx},{cy + h / 2} {cx - w / 2},{cy}'
        o = [f'<polygon points="{pts}" fill="{PAPER}"/>', f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="1"/>']
        lines = lines if isinstance(lines, list) else [lines]
        y0 = cy + 4 - (len(lines) - 1) * 7
        for i, ln in enumerate(lines):
            o.append(f'<text x="{cx}" y="{y0 + i * 14}" fill="{INK}" font-size="11" font-weight="600" font-family="{SANS}" text-anchor="middle">{esc(ln)}</text>')
        self.front += o

    def merge(self, cx, cy):
        pts = f'{cx},{cy - 10} {cx + 10},{cy} {cx},{cy + 10} {cx - 10},{cy}'
        self.front.append(f'<polygon points="{pts}" fill="#ffffff" stroke="{INK}" stroke-width="1"/>')

    def start(self, cx, cy):
        self.front.append(f'<circle cx="{cx}" cy="{cy}" r="7" fill="{INK}"/>')

    def end(self, cx, cy):
        self.front.append(f'<circle cx="{cx}" cy="{cy}" r="9" fill="{PAPER}" stroke="{INK}" stroke-width="1.2"/>')
        self.front.append(f'<circle cx="{cx}" cy="{cy}" r="5" fill="{INK}"/>')

    def oval(self, x, y, w, h, lines, kind='external'):
        self.node(x, y, w, h, lines, kind=kind, rx=20)

    def state(self, x, y, w, h, name, sub=None, kind='backend'):
        self.node(x, y, w, h, name, sub=sub, kind=kind, rx=8)

    @staticmethod
    def ey(cy, rx, ry, cx, x, top=True):
        import math
        v = ry * math.sqrt(max(0.0, 1 - ((x - cx) / rx) ** 2))
        return cy - v if top else cy + v

    def usecase(self, cx, cy, rx, ry, lines, kind='backend', code=None, sub=None):
        fill, stroke, _ = TREAT[kind]
        o = [f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{PAPER}"/>',
             f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}" stroke="{stroke}" stroke-width="1"/>']
        lines = lines if isinstance(lines, list) else [lines]
        n = len(lines) + (1 if code else 0) + (1 if sub else 0)
        y0 = cy + 4 - (n - 1) * 7
        k = 0
        if code:
            o.append(f'<text x="{cx}" y="{y0}" fill="{ACCENT if kind == "focal" else MUTED}" font-size="8" font-family="{MONO}" text-anchor="middle" letter-spacing="0.1em">{esc(code)}</text>')
            k = 1
        for i, ln in enumerate(lines):
            o.append(f'<text x="{cx}" y="{y0 + (i + k) * 14}" fill="{INK}" font-size="11.5" font-weight="600" font-family="{SANS}" text-anchor="middle">{esc(ln)}</text>')
        if sub:
            o.append(f'<text x="{cx}" y="{y0 + (len(lines) + k) * 14}" fill="{MUTED}" font-size="9" font-family="{MONO}" text-anchor="middle">{esc(sub)}</text>')
        self.front += o

    def actor(self, cx, top, label_lines, kind='backend'):
        s = ACCENT if kind == 'focal' else INK
        o = [f'<circle cx="{cx}" cy="{top + 10}" r="9" fill="{PAPER}" stroke="{s}" stroke-width="1.2"/>',
             f'<line x1="{cx}" y1="{top + 19}" x2="{cx}" y2="{top + 44}" stroke="{s}" stroke-width="1.2"/>',
             f'<line x1="{cx - 14}" y1="{top + 28}" x2="{cx + 14}" y2="{top + 28}" stroke="{s}" stroke-width="1.2"/>',
             f'<line x1="{cx}" y1="{top + 44}" x2="{cx - 12}" y2="{top + 62}" stroke="{s}" stroke-width="1.2"/>',
             f'<line x1="{cx}" y1="{top + 44}" x2="{cx + 12}" y2="{top + 62}" stroke="{s}" stroke-width="1.2"/>']
        lines = label_lines if isinstance(label_lines, list) else [label_lines]
        for i, ln in enumerate(lines):
            o.append(f'<text x="{cx}" y="{top + 80 + i * 14}" fill="{INK}" font-size="11.5" font-weight="600" font-family="{SANS}" text-anchor="middle">{esc(ln)}</text>')
        self.front += o

    def boundary(self, x, y, w, h, label):
        self.back.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="rgba(45,49,66,0.02)" stroke="rgba(45,49,66,0.30)" stroke-width="1"/>')
        self.back.append(f'<text x="{x + 16}" y="{y + 22}" fill="{MUTED}" font-size="8" font-family="{MONO}" letter-spacing="0.16em">{esc(label.upper())}</text>')

    def callout(self, x, y, lines, w=None):
        lines = lines if isinstance(lines, list) else [lines]
        o = []
        for i, ln in enumerate(lines):
            o.append(f'<text x="{x}" y="{y + i * 17}" fill="{MUTED}" font-size="13" font-style="italic" font-family="\'Noto Serif\', serif">{esc(ln)}</text>')
        self.front += o

    # ---------------- connectors ----------------
    def path(self, pts, color=MUTED, dashed=False, arrow=True, width=1.2, marker=None, r=8):
        d = f'M {pts[0][0]} {pts[0][1]}'
        for i in range(1, len(pts) - 1):
            (x0, y0), (x1, y1), (x2, y2) = pts[i - 1], pts[i], pts[i + 1]
            def toward(a, b, dist):
                dx, dy = b[0] - a[0], b[1] - a[1]
                L = max(abs(dx), abs(dy))
                return (a[0] + dx / L * dist, a[1] + dy / L * dist)
            rr = min(r, max(abs(x1 - x0), abs(y1 - y0)) / 2, max(abs(x2 - x1), abs(y2 - y1)) / 2)
            p1 = toward((x1, y1), (x0, y0), rr)
            p2 = toward((x1, y1), (x2, y2), rr)
            cross = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1)
            sweep = 1 if cross > 0 else 0
            d += f' L {p1[0]:g} {p1[1]:g} A {rr:g} {rr:g} 0 0 {sweep} {p2[0]:g} {p2[1]:g}'
        d += f' L {pts[-1][0]} {pts[-1][1]}'
        dash = ' stroke-dasharray="5,4"' if dashed else ''
        if marker is None:
            marker = {ACCENT: 'arrow-accent', LINK: 'arrow-link'}.get(color, 'arrow')
        mk = f' marker-end="url(#{marker})"' if arrow else ''
        self.mid.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}"{dash}{mk}/>')

    def label(self, cx, cy, text, color=None, anchor='middle', upper=True):
        """cx,cy = tâm mask. Nhãn mono 8px, mặc định IN HOA."""
        t = text.upper() if upper else text
        w = int(len(t) * 5.6 + 10)
        w += (4 - w % 4) % 4
        x = cx - w / 2 if anchor == 'middle' else (cx if anchor == 'start' else cx - w)
        tx = x + w / 2
        col = color or MUTED
        self.mid.append(f'<rect x="{x:g}" y="{cy - 6}" width="{w}" height="12" rx="2" fill="{PAPER}"/>')
        self.mid.append(f'<text x="{tx:g}" y="{cy + 3}" fill="{col}" font-size="8" font-family="{MONO}" text-anchor="middle" letter-spacing="0.06em">{esc(t)}</text>')

    # ---------------- sequence ----------------
    def lifeline(self, cx, top, bottom):
        self.back.append(f'<line x1="{cx}" y1="{top}" x2="{cx}" y2="{bottom}" stroke="rgba(45,49,66,0.22)" stroke-width="1" stroke-dasharray="3,3"/>')

    def activation(self, cx, top, h):
        self.back.append(f'<rect x="{cx - 4}" y="{top}" width="8" height="{h}" fill="rgba(45,49,66,0.06)" stroke="{MUTED}" stroke-width="0.8"/>')

    def msg(self, x1, x2, y, text, kind='call', color=None):
        col = color or (LINK if kind == 'link' else MUTED)
        dashed = kind in ('return', 'async')
        marker = 'arrow-open' if kind == 'async' else None
        if kind == 'accent':
            col = ACCENT
        self.path([(x1, y), (x2, y)], color=col, dashed=dashed, marker=marker, width=1.4 if kind == 'accent' else 1.2)
        self.label((x1 + x2) / 2, y - 14, text, color=col if col != MUTED else MUTED)

    def selfmsg(self, cx, y, text, w=40, h=24):
        self.path([(cx + 4, y), (cx + w, y), (cx + w, y + h), (cx + 4, y + h)])
        self.label(cx + w + 12, y + h / 2, text, anchor='start')

    def fragment(self, x, y, w, h, op, guards, dividers=()):
        self.back.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="rgba(45,49,66,0.02)" stroke="rgba(45,49,66,0.22)" stroke-width="1"/>')
        self.back.append(f'<rect x="{x}" y="{y}" width="40" height="16" rx="2" fill="{PAPER}" stroke="rgba(45,49,66,0.22)" stroke-width="1"/>')
        self.back.append(f'<text x="{x + 20}" y="{y + 12}" fill="{MUTED}" font-size="8" font-family="{MONO}" text-anchor="middle" letter-spacing="0.12em">{op}</text>')
        for (gy, g) in guards:
            self.back.append(f'<text x="{x + 12}" y="{gy}" fill="{MUTED}" font-size="8.5" font-family="{MONO}" letter-spacing="0.04em">{esc(g)}</text>')
        for dy in dividers:
            self.back.append(f'<line x1="{x + 8}" y1="{dy}" x2="{x + w - 8}" y2="{dy}" stroke="rgba(45,49,66,0.20)" stroke-width="1" stroke-dasharray="4,3"/>')

    def note(self, x, y, w, h, lines):
        self.front.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="2" fill="#ffffff" stroke="rgba(45,49,66,0.30)" stroke-width="0.8"/>')
        lines = lines if isinstance(lines, list) else [lines]
        for i, ln in enumerate(lines):
            self.front.append(f'<text x="{x + w / 2}" y="{y + 15 + i * 13}" fill="{INK}" font-size="10" font-family="{SANS}" text-anchor="middle">{esc(ln)}</text>')

    # ---------------- legend & output ----------------
    def legend(self, y, items):
        o = [f'<line x1="40" y1="{y}" x2="{self.w - 40}" y2="{y}" stroke="rgba(45,49,66,0.10)" stroke-width="0.8"/>',
             f'<text x="40" y="{y + 16}" fill="{MUTED}" font-size="8" font-family="{MONO}" letter-spacing="0.18em">CHÚ GIẢI</text>']
        x = 40
        yy = y + 36
        for kind, text in items:
            if kind == 'focal':
                o.append(f'<rect x="{x}" y="{yy - 8}" width="16" height="11" rx="2" fill="{ACCENT_TINT}" stroke="{ACCENT}" stroke-width="1"/>')
            elif kind == 'node':
                o.append(f'<rect x="{x}" y="{yy - 8}" width="16" height="11" rx="2" fill="#ffffff" stroke="{INK}" stroke-width="1"/>')
            elif kind == 'state':
                o.append(f'<rect x="{x}" y="{yy - 8}" width="16" height="11" rx="4" fill="#ffffff" stroke="{INK}" stroke-width="1"/>')
            elif kind == 'store':
                o.append(f'<rect x="{x}" y="{yy - 8}" width="16" height="11" rx="2" fill="rgba(45,49,66,0.05)" stroke="{MUTED}" stroke-width="1"/>')
            elif kind == 'external':
                o.append(f'<rect x="{x}" y="{yy - 8}" width="16" height="11" rx="2" fill="rgba(45,49,66,0.03)" stroke="rgba(45,49,66,0.30)" stroke-width="1"/>')
            elif kind == 'decision':
                o.append(f'<polygon points="{x},{yy - 3} {x + 8},{yy - 9} {x + 16},{yy - 3} {x + 8},{yy + 3}" fill="#ffffff" stroke="{INK}" stroke-width="1"/>')
            elif kind == 'startend':
                o.append(f'<circle cx="{x + 4}" cy="{yy - 3}" r="4" fill="{INK}"/><circle cx="{x + 14}" cy="{yy - 3}" r="5" fill="{PAPER}" stroke="{INK}" stroke-width="1"/><circle cx="{x + 14}" cy="{yy - 3}" r="2.5" fill="{INK}"/>')
            elif kind == 'usecase':
                o.append(f'<ellipse cx="{x + 8}" cy="{yy - 3}" rx="9" ry="5" fill="#ffffff" stroke="{INK}" stroke-width="1"/>')
            elif kind == 'actor':
                o.append(f'<circle cx="{x + 8}" cy="{yy - 8}" r="3" fill="none" stroke="{INK}" stroke-width="1"/><line x1="{x + 8}" y1="{yy - 5}" x2="{x + 8}" y2="{yy + 1}" stroke="{INK}"/><line x1="{x + 3}" y1="{yy - 3}" x2="{x + 13}" y2="{yy - 3}" stroke="{INK}"/>')
            elif kind == 'fragment':
                o.append(f'<rect x="{x}" y="{yy - 10}" width="22" height="14" rx="2" fill="rgba(45,49,66,0.02)" stroke="rgba(45,49,66,0.22)" stroke-width="1"/><text x="{x + 11}" y="{yy}" fill="{MUTED}" font-size="6.5" font-family="{MONO}" text-anchor="middle">ALT</text>')
            elif kind in ('arrow', 'dashed', 'accent-arrow', 'link', 'async', 'include'):
                col = {'accent-arrow': ACCENT, 'link': LINK}.get(kind, MUTED)
                dash = ' stroke-dasharray="5,4"' if kind in ('dashed', 'async', 'include') else ''
                mk = {'accent-arrow': 'arrow-accent', 'link': 'arrow-link', 'async': 'arrow-open', 'include': 'arrow-open'}.get(kind, 'arrow')
                o.append(f'<line x1="{x}" y1="{yy - 3}" x2="{x + 24}" y2="{yy - 3}" stroke="{col}" stroke-width="1.2"{dash} marker-end="url(#{mk})"/>')
            elif kind == 'line':
                o.append(f'<line x1="{x}" y1="{yy - 3}" x2="{x + 24}" y2="{yy - 3}" stroke="{INK}" stroke-width="1"/>')
            elif kind == 'gen':
                o.append(f'<line x1="{x}" y1="{yy - 3}" x2="{x + 18}" y2="{yy - 3}" stroke="{INK}" stroke-width="1"/><polygon points="{x + 18},{yy - 8} {x + 27},{yy - 3} {x + 18},{yy + 2}" fill="{PAPER}" stroke="{INK}" stroke-width="1"/>')
            o.append(f'<text x="{x + 32}" y="{yy}" fill="{MUTED}" font-size="9.5" font-family="{SANS}">{esc(text)}</text>')
            x += 32 + int(len(text) * 5.4) + 28
        self.front += o

    def html(self, slug, eyebrow, title, desc):
        defs = f'''<defs>
<marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{MUTED}"/></marker>
<marker id="arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{ACCENT}"/></marker>
<marker id="arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{LINK}"/></marker>
<marker id="arrow-open" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polyline points="0 0, 8 3, 0 6" fill="none" stroke="{MUTED}" stroke-width="1.2"/></marker>
<marker id="arrow-gen" markerWidth="12" markerHeight="10" refX="11" refY="5" orient="auto"><polygon points="0 0, 11 5, 0 10" fill="{PAPER}" stroke="{INK}" stroke-width="1"/></marker>
</defs>'''
        svg = (f'<svg viewBox="0 0 {self.w} {self.h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="{slug}-title {slug}-desc" style="min-width:{self.w}px">'
               f'<title id="{slug}-title">{esc(title)}</title><desc id="{slug}-desc">{esc(desc)}</desc>{defs}'
               f'<rect width="100%" height="100%" fill="{PAPER}"/>'
               + '\n'.join(self.back + self.mid + self.front) + '</svg>')
        return f'''<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&family=Noto+Serif:ital@0;1&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: 'Geist', system-ui, sans-serif; background: {PAPER}; color: {INK}; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 3rem 2rem; }}
    .frame {{ max-width: {self.w + 40}px; width: 100%; }}
    .diagram-container {{ width: 100%; overflow-x: auto; }}
    .eyebrow {{ font-family: 'Geist Mono', ui-monospace, monospace; font-size: 0.66rem; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: {MUTED}; margin-bottom: 0.5rem; }}
    h1 {{ font-family: 'Noto Serif', serif; font-size: clamp(1.4rem, 2vw + 0.75rem, 1.9rem); font-weight: 400; letter-spacing: -0.01em; line-height: 1.2; margin-bottom: 1.5rem; }}
    svg {{ width: 100%; display: block; }}
    @media print {{ .diagram-container {{ overflow-x: visible; }} svg {{ min-width: 0 !important; }} }}
  </style>
</head>
<body>
  <div class="frame">
    <p class="eyebrow">{esc(eyebrow)}</p>
    <h1>{esc(title)}</h1>
    <div class="diagram-container">
{svg}
    </div>
  </div>
</body>
</html>
'''
