"""Herramienta (1 nov 2026) con la que se armó style.css con dos carátulas: se le dio la hoja de la 0.7.4 (Original) y la
del rediseño completo (2026) y escribió cada regla de la 2026 junto a su original. Para una tercera carátula: hacer su
hoja completa a partir de la Original pura (style.css sin las reglas [data-caratula="2026"] y sin los
:where(:not([data-caratula="2026"])) ) y fusionarla igual con su nombre; luego revisar las dos (Ajustes → Apariencia).

Junta dos hojas de estilo completas en una con carátulas: la ORIGINAL queda como está y cada regla de la otra
(NUEVA) que cambia, se agrega o se quita se escribe junto a su regla original, limitada a esa carátula con :where()
(no cambia la especificidad) para que cada carátula se comporte exactamente como su hoja completa.

Uso: fusionar.py original.css nueva.css nombre_caratula salida.css
- Regla igual en las dos: queda igual.
- Regla cambiada: la original queda; si la nueva ya no pone alguna de sus propiedades, la original se apaga en esta
  carátula (:where(:not([data-caratula=X]))). Justo después va la nueva completa, solo para la carátula X.
- Regla que la nueva quita: la original se apaga en la carátula X.
- Regla nueva: se pone en su lugar, solo para la carátula X.
"""
import re, sys, difflib

def saltar(t, i):
    """salta espacios y comentarios desde i"""
    n = len(t)
    while i < n:
        if t[i].isspace(): i += 1
        elif t.startswith('/*', i): i = t.index('*/', i) + 2
        else: break
    return i

def fin_bloque(t, i):
    """i apunta a '{'; devuelve el índice justo después de su '}'"""
    prof, n = 0, len(t)
    while i < n:
        c = t[i]
        if t.startswith('/*', i): i = t.index('*/', i) + 2; continue
        if c in '"\'':
            j = i + 1
            while t[j] != c: j += 2 if t[j] == '\\' else 1
            i = j + 1; continue
        if c == '{': prof += 1
        elif c == '}':
            prof -= 1
            if prof == 0: return i + 1
        i += 1
    raise ValueError('bloque sin cerrar')

def hasta_llave(t, i):
    n = len(t)
    while i < n:
        if t.startswith('/*', i): i = t.index('*/', i) + 2; continue
        if t[i] in '"\'':
            c = t[i]; j = i + 1
            while t[j] != c: j += 2 if t[j] == '\\' else 1
            i = j + 1; continue
        if t[i] in '{;': return i
        i += 1
    return n

ANIDADAS = ('@media', '@supports', '@layer', '@container')

def leer(t, a=0, b=None):
    """nodos de t[a:b]: dict(tipo, pre (texto), ini, fin, ini_bloque, hijos, lead_ini)"""
    b = len(t) if b is None else b
    nodos, i = [], a
    while True:
        lead = i
        i = saltar(t, i)
        if i >= b: break
        j = hasta_llave(t, i)
        if j >= b or t[j] == ';':   # at-rule sin bloque
            nodos.append(dict(tipo='suelta', pre=t[i:j].strip(), ini=i, fin=j + 1, lead=lead)); i = j + 1; continue
        f = fin_bloque(t, j)
        pre = t[i:j].strip()
        nd = dict(pre=pre, ini=i, fin=f, ini_bloque=j, lead=lead)
        if pre.startswith(ANIDADAS):
            nd['tipo'] = 'anidada'; nd['hijos'] = leer(t, j + 1, f - 1)
        elif pre.startswith('@'):
            nd['tipo'] = 'opaca'
        else:
            nd['tipo'] = 'regla'
        nodos.append(nd); i = f
    return nodos

norm = lambda s: re.sub(r'\s+', ' ', re.sub(r'/\*.*?\*/', '', s, flags=re.S)).strip()

def decls(t, nd):
    cuerpo = re.sub(r'/\*.*?\*/', '', t[nd['ini_bloque'] + 1:nd['fin'] - 1], flags=re.S)
    partes, prof, act, q = [], 0, '', None
    for c in cuerpo:
        if q:
            act += c
            if c == q: q = None
            continue
        if c in '"\'': q = c
        elif c == '(': prof += 1
        elif c == ')': prof -= 1
        if c == ';' and prof == 0: partes.append(act); act = ''
        else: act += c
    partes.append(act)
    out = []
    for p in partes:
        if ':' in p and p.strip():
            k, v = p.split(':', 1); out.append((k.strip().lower(), norm(v)))
    return out

def separar_selectores(pre):
    sel, prof, act = [], 0, ''
    for c in pre:
        if c in '([': prof += 1
        elif c in ')]': prof -= 1
        if c == ',' and prof == 0: sel.append(act.strip()); act = ''
        else: act += c
    sel.append(act.strip())
    return [s for s in sel if s]

def limitar(pre, cond):
    """cond: '[data-caratula="2026"]' (solo esa) o ':not([data-caratula="2026"])' (todas menos esa)"""
    out = []
    for s in separar_selectores(pre):
        m = re.match(r'^(:root|html)(?![\w-])', s)
        if m: out.append(m.group(1) + f':where({cond})' + s[m.end():])
        else: out.append(f':where(:root{cond}) ' + s)
    return ', '.join(out)

def clave(t, nd):
    return (nd['tipo'], norm(nd['pre']))

def fusionar(tO, tN, X):
    SOLO, MENOS = f'[data-caratula="{X}"]', f':not([data-caratula="{X}"])'
    cambios = []   # (posición en tO, 'reemplazar_pre' | 'insertar', texto, (ini, fin))
    informe = {'cambiadas': [], 'apagadas': [], 'nuevas': []}

    def texto_nuevo(nd, lead=True):
        """la regla de la nueva limitada a la carátula X (con su comentario de antes si lo trae)"""
        com = ''
        if lead:
            previo = tN[nd['lead']:nd['ini']]
            cs = re.findall(r'/\*.*?\*/', previo, flags=re.S)
            if cs: com = '\n'.join(cs) + '\n'
        if nd['tipo'] == 'regla':
            return com + limitar(nd['pre'], SOLO) + ' ' + tN[nd['ini_bloque']:nd['fin']]
        if nd['tipo'] == 'anidada':
            hijos = '\n'.join(texto_nuevo(h) for h in nd['hijos'])
            return com + nd['pre'] + ' {\n' + hijos + '\n}'
        raise ValueError('no se puede limitar a una carátula: ' + nd['pre'])

    def recorrer(nO, nN, ctx):
        kO = [clave(tO, n) for n in nO]; kN = [clave(tN, n) for n in nN]
        sm = difflib.SequenceMatcher(a=kO, b=kN, autojunk=False)
        pares, borrados, insertados = [], [], []   # insertados: (índice en O antes del cual va, nodo N)
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op == 'equal':
                pares += list(zip(nO[i1:i2], nN[j1:j2]))
            else:
                # dentro del tramo, empareja las que tienen la misma clave (en orden)
                usadosN = set()
                for a in range(i1, i2):
                    par = next((b for b in range(j1, j2) if b not in usadosN and kN[b] == kO[a]), None)
                    if par is None: borrados.append(nO[a])
                    else: usadosN.add(par); pares.append((nO[a], nN[par]))
                for b in range(j1, j2):
                    if b not in usadosN: insertados.append((i2, b, nN[b]))
        # insertados: van después del nodo O emparejado que les precede en N, si lo hay; si no, antes de O[i2]
        posN = {id(nn): k for k, nn in enumerate(nN)}
        parN = {id(b): a for a, b in pares}
        for i2, b, nd in insertados:
            ancla = None
            for k in range(b - 1, -1, -1):
                if id(nN[k]) in parN: ancla = parN[id(nN[k])]; break
            if ancla is not None: pos = ancla['fin']
            elif i2 < len(nO): pos = nO[i2]['lead']
            else: pos = nO[-1]['fin'] if nO else None
            cambios.append((pos, 'insertar', '\n' + texto_nuevo(nd), b))
            informe['nuevas'].append(ctx + [norm(nd['pre'])])
        for a, b in pares:
            if a['tipo'] == 'anidada':
                recorrer(a['hijos'], b['hijos'], ctx + [norm(a['pre'])]); continue
            if a['tipo'] == 'opaca':
                if norm(tO[a['ini']:a['fin']]) != norm(tN[b['ini']:b['fin']]):
                    raise ValueError('cambió una regla que no se puede limitar: ' + a['pre'])
                continue
            dO, dN = decls(tO, a), decls(tN, b)
            if dO == dN: continue
            if not {k for k, _ in dO} <= {k for k, _ in dN}:
                cambios.append((a['ini'], 'pre', limitar(a['pre'], MENOS), a['ini_bloque']))
                informe['apagadas'].append(ctx + [norm(a['pre'])] + ['(cambia y quita propiedades)'])
            cambios.append((a['fin'], 'insertar', '\n' + texto_nuevo(b, lead=False), posN[id(b)]))
            informe['cambiadas'].append(ctx + [norm(a['pre'])])
        for a in borrados:
            if a['tipo'] == 'regla':
                cambios.append((a['ini'], 'pre', limitar(a['pre'], MENOS), a['ini_bloque']))
                informe['apagadas'].append(ctx + [norm(a['pre'])])
            elif a['tipo'] == 'anidada':
                for h in a['hijos']:
                    if h['tipo'] == 'regla':
                        cambios.append((h['ini'], 'pre', limitar(h['pre'], MENOS), h['ini_bloque']))
                informe['apagadas'].append(ctx + [norm(a['pre'])])
            else:
                raise ValueError('se quitó una regla que no se puede limitar: ' + a['pre'])

    recorrer(leer(tO), leer(tN), [])
    # aplicar de atrás hacia adelante; en el mismo punto, las inserciones en el orden de la hoja nueva
    out = tO
    pre_cambios = sorted([c for c in cambios if c[1] == 'pre'], key=lambda c: -c[0])
    ins = sorted([c for c in cambios if c[1] == 'insertar'], key=lambda c: (c[0], c[3]))
    # primero los selectores (no mueven posiciones de lo que está después si vamos de atrás hacia adelante)
    todos = [(c[0], 'pre', c) for c in pre_cambios] + [(c[0], 'ins', c) for c in ins]
    # orden: de atrás hacia adelante; en la misma posición, inserciones en orden inverso para que queden en orden
    todos.sort(key=lambda x: (x[0], 1 if x[1] == 'ins' else 0, x[2][3] if x[1] == 'ins' else 0), reverse=True)
    for pos, tipo, c in todos:
        if tipo == 'pre':
            out = out[:c[0]] + c[2] + ' ' + out[c[3]:]
        else:
            out = out[:pos] + c[2] + out[pos:]
    return out, informe

if __name__ == '__main__':
    o, n, X, sal = sys.argv[1:5]
    tO, tN = open(o, encoding='utf-8').read(), open(n, encoding='utf-8').read()
    out, inf = fusionar(tO, tN, X)
    open(sal, 'w', encoding='utf-8').write(out)
    for k, v in inf.items():
        print(f'--- {k}: {len(v)}')
        for x in v: print('   ', ' » '.join(x))
