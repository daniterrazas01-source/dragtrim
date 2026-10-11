# Verificador estructural simple de MATLAB: bloques/end, paréntesis, comillas
import re, sys
OPEN = {'function','if','for','while','switch','try','parfor'}
def strip(line):
    out=''; i=0; q=False; prev=''
    while i < len(line):
        ch=line[i]
        if not q and ch=='%': break
        if ch=="'" and not q:
            # transpose if previous non-space is identifier/)/]/'/.
            if prev and (prev.isalnum() or prev in ")]}'_."): out+=ch; prev=ch; i+=1; continue
            q="'"; out+='S'; i+=1; continue
        if ch=='"' and not q: q='"'; out+='S'; i+=1; continue
        if q and ch==q:
            if i+1<len(line) and line[i+1]==q: i+=2; continue
            q=False; prev='S'; i+=1; continue
        if not q: out+=ch; prev=ch if not ch.isspace() else prev
        i+=1
    return out, q
for fn in sys.argv[1:]:
    depth=0; par=0; errs=[]; cont=False
    for n,raw in enumerate(open(fn,encoding='utf-8'),1):
        line,q = strip(raw.rstrip('\n'))
        if q: errs.append(f'{n}: comilla sin cerrar')
        # remove indexing 'end' inside parens/brackets
        buf=''; lvl=par
        toks=[]
        for m in re.finditer(r"[A-Za-z_]\w*|[()\[\]{}]", line):
            t=m.group(0)
            if t in '([{': lvl+=1
            elif t in ')]}': lvl-=1
            elif lvl==0 and not cont: toks.append(t)
            elif lvl==0: toks.append(t)
        par=lvl if line.rstrip().endswith('...') else 0
        if lvl<0 or (lvl!=0 and not line.rstrip().endswith('...')): errs.append(f'{n}: paréntesis desbalanceados ({lvl})')
        cont=line.rstrip().endswith('...')
        for t in toks:
            if t in OPEN: depth+=1
            elif t=='end': depth-=1
            if depth<0: errs.append(f'{n}: end de más'); depth=0
    print(fn, 'bloques abiertos al final:', depth, '|', 'OK' if not errs and depth in (0,) else errs[:8])
