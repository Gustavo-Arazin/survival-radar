#!/usr/bin/env python3
"""Bases oficiais -> blocos estáticos de 0,5° para o app.

CNES (Ministério da Saúde): hospitais, prontos-socorros e UPAs com tipo, plantão 24 h,
maternidade, UTI neonatal e indício de atendimento pediátrico (pelo nome).
SGB (Serviço Geológico do Brasil): setores de risco geológico alto e muito alto (polígonos).
Leitos (Ministério da Saúde, Hospitais e Leitos): UTI pediátrica e UTI neonatal por estabelecimento.
SNISB (ANA): barragens cadastradas com categoria de risco, dano potencial associado, altura, volume e PAE.

Uso: python3 pipeline/build-official.py dist/data
"""
import csv, io, json, math, os, re, sys, time, urllib.request, urllib.parse, zipfile
from datetime import datetime, timezone

OUT = sys.argv[1] if len(sys.argv) > 1 else 'dist/data'
TILE = 0.5
UA = {'User-Agent': 'survival-radar/1.0 (+https://github.com/Gustavo-Arazin/survival-radar)'}


def key(lat, lon):
    return f"{math.floor((lat + 90) / TILE)}_{math.floor((lon + 180) / TILE)}"


def get(url, tries=4, timeout=300):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            print(f'  tentativa {i + 1} falhou: {e}', flush=True)
            time.sleep(10 * (i + 1))
    raise RuntimeError(f'falha ao baixar {url}')


def write_tiles(folder, tiles, meta):
    d = os.path.join(OUT, folder)
    os.makedirs(d, exist_ok=True)
    for k, rows in tiles.items():
        with open(os.path.join(d, f'{k}.json'), 'w', encoding='utf-8') as f:
            json.dump(rows, f, ensure_ascii=False, separators=(',', ':'))
    meta['tiles'] = sorted(tiles)
    meta['built'] = datetime.now(timezone.utc).isoformat()
    with open(os.path.join(d, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False)


# ---------------------------------------------------------------- CNES
TIPOS = {5: 'Hospital geral', 7: 'Hospital especializado', 15: 'Unidade mista', 20: 'Pronto-socorro geral',
         21: 'Pronto-socorro especializado', 73: 'Pronto atendimento'}
PED = re.compile(r'INFANTIL|CRIAN[CÇ]A|PEDIATR|INF[AÂ]NCIA|MENINO JESUS|SABAR[AÁ]|MATERNO.INFANTIL', re.I)


def num(s):
    try:
        return float(str(s).replace(',', '.'))
    except ValueError:
        return None


def leitos():
    """CNES (int) -> [uti_ped, uti_neo, leitos_total] da competência mais recente de cada unidade."""
    out, comp = {}, {}
    for ano in (datetime.now().year, datetime.now().year - 1):
        try:
            raw = get(f'https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/Leitos_SUS/Leitos_csv_{ano}.zip', tries=2)
        except Exception as e:  # noqa: BLE001
            print(f'Leitos {ano}: indisponível ({e})', flush=True)
            continue
        z = zipfile.ZipFile(io.BytesIO(raw))
        name = [n for n in z.namelist() if n.lower().endswith('.csv')][0]
        for r in csv.DictReader(io.TextIOWrapper(z.open(name), encoding='latin-1'), delimiter=';'):
            try:
                c = int(r.get('CNES') or 0)
            except ValueError:
                continue
            k = r.get('COMP') or ''
            if c in comp and comp[c] >= k:
                continue
            if (r.get('MOTIVO_DESABILITACAO') or '').strip():
                out.pop(c, None); comp[c] = k
                continue
            iv = lambda f: int(float(r.get(f) or 0))  # noqa: E731
            out[c] = [iv('UTI_PEDIATRICO_EXIST'), iv('UTI_NEONATAL_EXIST'), iv('LEITOS_EXISTENTES')]
            comp[c] = k
        if out:
            print(f'Leitos {ano}: {len(out)} estabelecimentos', flush=True)
            break
    return out


def cnes():
    try:
        LEITOS = leitos()
    except Exception as e:  # noqa: BLE001
        print(f'Leitos: falhou ({e}); segue sem leitos', flush=True)
        LEITOS = {}
    print('CNES: baixando…', flush=True)
    raw = get('https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_csv.zip')
    z = zipfile.ZipFile(io.BytesIO(raw))
    name = [n for n in z.namelist() if n.lower().endswith('.csv')][0]
    reader = csv.DictReader(io.TextIOWrapper(z.open(name), encoding='latin-1'), delimiter=';')
    tiles, n, kept = {}, 0, 0
    for r in reader:
        n += 1
        if (r.get('CO_MOTIVO_DESAB') or '').strip():
            continue
        try:
            tp = int(float(r.get('TP_UNIDADE') or 0))
        except ValueError:
            continue
        if tp not in TIPOS:
            continue
        lat, lon = num(r.get('NU_LATITUDE')), num(r.get('NU_LONGITUDE'))
        if lat is None or lon is None or not (-34.5 < lat < 5.8 and -74.5 < lon < -28.5):
            continue
        nome = (r.get('NO_FANTASIA') or r.get('NO_RAZAO_SOCIAL') or '').strip().title()
        turno = (r.get('DS_TURNO_ATENDIMENTO') or '').upper()
        flags = 0
        if '24 HORAS' in turno: flags |= 1
        if num(r.get('ST_CENTRO_OBSTETRICO')) == 1: flags |= 2
        if num(r.get('ST_CENTRO_NEONATAL')) == 1: flags |= 4
        if PED.search(nome) or PED.search(r.get('NO_RAZAO_SOCIAL') or ''): flags |= 8
        if (r.get('CO_AMBULATORIAL_SUS') or '').strip().upper() == 'SIM': flags |= 16
        try:
            lt = LEITOS.get(int(r.get('CO_CNES') or 0))
        except ValueError:
            lt = None
        if lt and lt[0] > 0: flags |= 32
        if lt and lt[1] > 0: flags |= 64
        addr = ', '.join(x.strip().title() for x in [r.get('NO_LOGRADOURO'), r.get('NU_ENDERECO'), r.get('NO_BAIRRO')] if x and x.strip())
        tiles.setdefault(key(lat, lon), []).append([round(lat, 5), round(lon, 5), nome, (r.get('NU_TELEFONE') or '').strip(), addr, tp, flags, (r.get('CO_CNES') or '').strip(), lt or []])
        kept += 1
    write_tiles('cnes', tiles, {'source': 'CNES — Ministério da Saúde (cnes_estabelecimentos_csv.zip)', 'tipos': TIPOS,
                                'flags': {'1': '24 horas', '2': 'centro obstétrico', '4': 'UTI/centro neonatal', '8': 'pediátrico (pelo nome)', '16': 'atende SUS', '32': 'UTI pediátrica (leitos CNES)', '64': 'UTI neonatal (leitos CNES)'},
                                'leitos': len(LEITOS),
                                'count': kept})
    print(f'CNES: {n} registros lidos, {kept} unidades de urgência e hospitais, {len(tiles)} blocos', flush=True)


# ---------------------------------------------------------------- SGB
SGB = 'https://geoportal.sgb.gov.br/server/rest/services/gestaoterritorial/risco/MapServer/0/query'


def sgb():
    tiles, off, total, page = {}, 0, 0, 1000
    while True:
        q = urllib.parse.urlencode({'where': '1=1', 'outFields': 'grau_risco,tipolo_g1,tipolo_g2,munic,uf,local,num_setor',
                                    'returnGeometry': 'true', 'outSR': '4326', 'maxAllowableOffset': '0.00005',
                                    'resultOffset': off, 'resultRecordCount': page, 'orderByFields': 'objectid', 'f': 'geojson'})
        data = json.loads(get(f'{SGB}?{q}', timeout=180))
        feats = data.get('features', [])
        for f in feats:
            g, p = f.get('geometry') or {}, f.get('properties') or {}
            polys = [g['coordinates']] if g.get('type') == 'Polygon' else g.get('coordinates', []) if g.get('type') == 'MultiPolygon' else []
            rings = [[[round(y, 5), round(x, 5)] for x, y in poly[0]] for poly in polys if poly and poly[0]]
            if not rings:
                continue
            ks = {key(lat, lon) for ring in rings for lat, lon in ring}
            tipo = ' / '.join(t for t in [p.get('tipolo_g1'), p.get('tipolo_g2')] if t)
            row = [p.get('grau_risco') or '', tipo, (p.get('local') or '')[:140], f"{p.get('munic') or ''}-{p.get('uf') or ''}", p.get('num_setor') or '', rings]
            for k in ks:
                tiles.setdefault(k, []).append(row)
        total += len(feats)
        print(f'SGB: {total} setores…', flush=True)
        if len(feats) < page:
            break
        off += page
    write_tiles('sgb', tiles, {'source': 'Serviço Geológico do Brasil — Setorização de Risco (geoportal.sgb.gov.br)', 'count': total})
    print(f'SGB: {total} setores em {len(tiles)} blocos', flush=True)


# ---------------------------------------------------------------- SNISB
SNISB = 'https://www.snirh.gov.br/arcgis/rest/services/IG/SNISB/FeatureServer/0/query'
SNISB_F = ['BAR_CD_SNISB', 'BAR_NM_NOME', 'BAR_NM_SECUNDARIO', 'BAR_NU_LATITUDE', 'BAR_NU_LONGITUDE', 'CATEGORIA_RISCO',
           'DANO_POTENCIAL', 'NIVEL_PERIGO', 'BAR_NU_ALT_MAX_NIVEL_TERRENO', 'BAR_NU_ALT_MAX_BASE_FUNDACAO',
           'BAR_NU_CAP_TOTAL_RESERV', 'USO_PRINCIPAL', 'POSSUI_PAE', 'ING_NM_MUNICIPIO', 'ING_SG_UFMUNICIPIO',
           'NM_EMPREENDEDOR', 'ORG_NM_ORGANIZACAO', 'ING_NM_TRECHO', 'FASE_DE_VIDA', 'REGULADA_PELO_PNSB']


def clean(v):
    if v is None:
        return ''
    v = str(v).strip()
    return '' if v.upper() in ('NULL', 'NONE', 'NÃO INFORMADO', 'NAO INFORMADO', '-') else v


def fnum(v):
    try:
        x = float(v)
        return round(x, 2) if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def snisb():
    tiles, off, total, kept, page = {}, 0, 0, 0, 2000
    while True:
        q = urllib.parse.urlencode({'where': '1=1', 'outFields': ','.join(SNISB_F), 'returnGeometry': 'true', 'outSR': '4326',
                                    'resultOffset': off, 'resultRecordCount': page, 'orderByFields': 'BAR_CD_SNISB', 'f': 'json'})
        data = json.loads(get(f'{SNISB}?{q}', timeout=180))
        if 'error' in data:
            raise RuntimeError(data['error'])
        feats = data.get('features', [])
        for f in feats:
            a, g = f.get('attributes') or {}, f.get('geometry') or {}
            lat, lon = fnum(g.get('y')), fnum(g.get('x'))
            if lat is None or lon is None:
                lat, lon = fnum(a.get('BAR_NU_LATITUDE')), fnum(a.get('BAR_NU_LONGITUDE'))
            if lat is None or lon is None or not (-34.5 < lat < 5.8 and -74.5 < lon < -28.5):
                continue
            g5 = lambda x: round(float(x), 5)  # noqa: E731
            nome = clean(a.get('BAR_NM_NOME')) or clean(a.get('BAR_NM_SECUNDARIO'))
            alt = fnum(a.get('BAR_NU_ALT_MAX_NIVEL_TERRENO')) or fnum(a.get('BAR_NU_ALT_MAX_BASE_FUNDACAO'))
            row = [g5(lat), g5(lon), nome.title() if nome.isupper() else nome, clean(a.get('CATEGORIA_RISCO')), clean(a.get('DANO_POTENCIAL')),
                   alt, fnum(a.get('BAR_NU_CAP_TOTAL_RESERV')), clean(a.get('USO_PRINCIPAL')), clean(a.get('POSSUI_PAE')),
                   f"{clean(a.get('ING_NM_MUNICIPIO')).title()}-{clean(a.get('ING_SG_UFMUNICIPIO'))}".strip('-'),
                   clean(a.get('NM_EMPREENDEDOR'))[:120], clean(a.get('ORG_NM_ORGANIZACAO'))[:120], clean(a.get('ING_NM_TRECHO'))[:80],
                   clean(a.get('FASE_DE_VIDA')), a.get('BAR_CD_SNISB'), clean(a.get('NIVEL_PERIGO')), clean(a.get('REGULADA_PELO_PNSB'))]
            tiles.setdefault(key(lat, lon), []).append(row)
            kept += 1
        total += len(feats)
        print(f'SNISB: {total} barragens…', flush=True)
        if len(feats) < page and not data.get('exceededTransferLimit'):
            break
        off += len(feats) or page
        if not feats:
            break
    write_tiles('snisb', tiles, {'source': 'SNISB — Agência Nacional de Águas (snirh.gov.br, camada pública)', 'count': kept,
                                 'cols': ['lat', 'lon', 'nome', 'categoria_risco', 'dano_potencial', 'altura_m', 'volume_hm3', 'uso', 'pae',
                                          'municipio', 'empreendedor', 'fiscalizador', 'curso_dagua', 'fase', 'codigo', 'nivel_perigo', 'pnsb']})
    print(f'SNISB: {kept} barragens com coordenada em {len(tiles)} blocos', flush=True)


if __name__ == '__main__':
    ok = True
    for fn in (cnes, sgb, snisb):
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            ok = False
            print(f'ERRO em {fn.__name__}: {e}', flush=True)
    sys.exit(0 if ok else 1)
