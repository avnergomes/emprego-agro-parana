# -*- coding: utf-8 -*-
"""
partition_granular.py

Particiona os 5 arquivos granulares (granular_cube.json + 4 dimensoes) em
bundles compactos colunares, ao longo de DOIS eixos:

  - granular/regiao/{slug-regidr}.json  -> um bundle por Regional IDR
  - granular/cadeia/{slug-cadeia}.json  -> um bundle por cadeia produtiva
  - granular/cube_all.json              -> cubo estadual (so o cube compacto)
  - granular/index.json                 -> roteamento (mun2reg, regioes,
                                            mesos, cadeias, cubeAll, version)

Formato compacto colunar por bundle:
  {
    "muns":     ["410010", ...],          # dicionario local
    "periodos": ["2020-01", ...],
    "cadeias":  ["Bovinocultura de Corte", ...],
    "cube":     [[mi, pi, ci, adm, dem, sal], ...],
    "bySexo":         {"values": [...], "rows": [[mi,pi,ci,vi,adm,dem], ...]},
    "byFaixa":        {"values": [...], "rows": [[mi,pi,ci,vi,adm,dem], ...]},
    "byEscolaridade": {"values": [...], "rows": [[mi,pi,ci,vi,adm,dem,sal], ...]},
    "byPorte":        {"values": [...], "rows": [[mi,pi,ci,vi,adm,dem], ...]}
  }

O cube_all.json contem apenas as chaves muns/periodos/cadeias/cube.

Reduz ~103 MB -> ~32 MB e faz o primeiro filtro baixar so o(s) bundle(s)
necessario(s) (superset dos registros selecionados client-side).

VERIFICACAO DE INTEGRIDADE ROUND-TRIP EMBUTIDA (aborta com exit!=0 em falha):
  1. Cada familia (cube + 4 dimensoes) reconstruida a partir dos bundles de
     CADA eixo (regiao e cadeia) e do cube_all deve bater EXATAMENTE com a
     fonte: mesma contagem, somas exatas de admissoes/demissoes/saldo, e
     igualdade de multiset via md5 de linhas canonicas ordenadas (valida
     acentos pt-BR e salario_medio null).
  2. Cobertura mun->regional de 100% dos municipios do cube.
  3. Cada Regional IDR pertence a exatamente 1 mesorregiao (aninhamento).
  4. Tabela de tamanhos por bundle.

Uso:
    py -3 scripts/partition_granular.py [--data DIR] [--topo ARQ] [--remove-source]
"""

import os
import re
import sys
import json
import argparse
import hashlib
import unicodedata

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA = os.path.join(SCRIPT_DIR, '..', 'dashboard', 'public', 'data')
DEFAULT_TOPO = os.path.join(
    SCRIPT_DIR, '..', '..', 'datageoparana.github.io',
    'assets', 'parana-municipalities.topojson',
)

CUBE_FILE = 'granular_cube.json'

# (chave da dimensao, arquivo fonte, nome do campo, tem_salario_medio)
DIMS = [
    ('bySexo', 'granular_bySexo.json', 'sexo', False),
    ('byFaixa', 'granular_byFaixa.json', 'faixa', False),
    ('byEscolaridade', 'granular_byEscolaridade.json', 'escolaridade', True),
    ('byPorte', 'granular_byPorte.json', 'porte', False),
]

# Ordem canonica de campos por familia (para a assinatura md5 do round-trip).
CUBE_FIELDS = ['mun', 'periodo', 'cadeia', 'admissoes', 'demissoes',
               'salario_medio', 'saldo']


def dim_fields(field, has_sal):
    base = ['mun', 'periodo', 'cadeia', field, 'admissoes', 'demissoes']
    return base + (['salario_medio'] if has_sal else [])


def slugify(text):
    """ASCII sem acento, minusculo, hifens. 'Servicos Agricolas' etc."""
    norm = unicodedata.normalize('NFKD', str(text))
    ascii_txt = norm.encode('ascii', 'ignore').decode('ascii')
    ascii_txt = ascii_txt.lower()
    ascii_txt = re.sub(r'[^a-z0-9]+', '-', ascii_txt)
    return ascii_txt.strip('-')


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_mun2reg(topo_path):
    """
    Constroi mun2reg (codigo IBGE 6 digitos -> slug regional), regioes
    (slug -> {nome, meso}) e mesos (nome -> [slugs]) a partir do topojson.
    Aborta se alguma Regional IDR aparecer em mais de uma mesorregiao.
    """
    topo = load_json(topo_path)
    key = 'municipalities'
    if key not in topo.get('objects', {}):
        raise SystemExit(f"ERRO: object '{key}' ausente no topojson {topo_path}")
    geoms = topo['objects'][key]['geometries']

    mun2reg = {}
    reg_nome = {}     # slug -> nome original da RegIdr
    reg_meso = {}     # slug -> meso
    slug_por_nome = {}  # nome RegIdr -> slug (deteccao de colisao)

    for g in geoms:
        pr = g.get('properties', {})
        cod = str(pr.get('CodIbge', ''))[:6]
        reg_nome_raw = pr.get('RegIdr')
        meso = pr.get('MesoIdr')
        if not cod or not reg_nome_raw:
            continue
        slug = slugify(reg_nome_raw)
        # Colisao de slug entre nomes distintos de regional.
        if slug in slug_por_nome and slug_por_nome[slug] != reg_nome_raw:
            raise SystemExit(
                f"ERRO: colisao de slug regional '{slug}': "
                f"'{slug_por_nome[slug]}' vs '{reg_nome_raw}'")
        slug_por_nome[slug] = reg_nome_raw
        # Aninhamento: cada regional em exatamente 1 meso.
        if slug in reg_meso and reg_meso[slug] != meso:
            raise SystemExit(
                f"ERRO: Regional '{reg_nome_raw}' em duas mesorregioes: "
                f"'{reg_meso[slug]}' e '{meso}'")
        mun2reg[cod] = slug
        reg_nome[slug] = reg_nome_raw
        reg_meso[slug] = meso

    return mun2reg, reg_nome, reg_meso


def encode_bundle(cube_recs, dim_recs, include_dims=True):
    """Codifica os registros de um bundle no formato compacto colunar."""
    muns_map, periodos_map, cadeias_map = {}, {}, {}

    def gi(m, v):
        i = m.get(v)
        if i is None:
            i = len(m)
            m[v] = i
        return i

    cube_rows = []
    for r in cube_recs:
        cube_rows.append([
            gi(muns_map, r['mun']),
            gi(periodos_map, r['periodo']),
            gi(cadeias_map, r['cadeia']),
            r['admissoes'], r['demissoes'], r['salario_medio'],
        ])

    bundle = {}
    if include_dims:
        for key, _src, field, has_sal in DIMS:
            recs = dim_recs.get(key, [])
            val_map = {}
            rows = []
            for r in recs:
                row = [
                    gi(muns_map, r['mun']),
                    gi(periodos_map, r['periodo']),
                    gi(cadeias_map, r['cadeia']),
                    gi(val_map, r[field]),
                    r['admissoes'], r['demissoes'],
                ]
                if has_sal:
                    row.append(r['salario_medio'])
                rows.append(row)
            bundle[key] = {'values': list(val_map.keys()), 'rows': rows}

    bundle['muns'] = list(muns_map.keys())
    bundle['periodos'] = list(periodos_map.keys())
    bundle['cadeias'] = list(cadeias_map.keys())
    bundle['cube'] = cube_rows
    return bundle


def decode_bundle(bundle):
    """Espelha exatamente o decodeBundle do frontend (para o round-trip)."""
    muns = bundle.get('muns', [])
    periodos = bundle.get('periodos', [])
    cadeias = bundle.get('cadeias', [])

    cube = []
    for r in bundle.get('cube', []):
        adm, dem = r[3], r[4]
        cube.append({
            'mun': muns[r[0]], 'periodo': periodos[r[1]], 'cadeia': cadeias[r[2]],
            'admissoes': adm, 'demissoes': dem, 'salario_medio': r[5],
            'saldo': adm - dem,
        })

    dims = {}
    for key, _src, field, has_sal in DIMS:
        d = bundle.get(key)
        if not d:
            continue
        values = d.get('values', [])
        rows = []
        for r in d.get('rows', []):
            rec = {
                'mun': muns[r[0]], 'periodo': periodos[r[1]], 'cadeia': cadeias[r[2]],
                field: values[r[3]],
                'admissoes': r[4], 'demissoes': r[5],
            }
            if has_sal:
                rec['salario_medio'] = r[6]
            rows.append(rec)
        dims[key] = rows
    return cube, dims


def signature(records, fields):
    """(count, sum_adm, sum_dem, md5) sobre multiset canonico ordenado."""
    lines = []
    sadm = sdem = 0
    for r in records:
        sadm += r['admissoes']
        sdem += r['demissoes']
        lines.append(repr(tuple(r[k] for k in fields)))
    lines.sort()
    h = hashlib.md5()
    for ln in lines:
        h.update(ln.encode('utf-8'))
        h.update(b'\n')
    return len(records), sadm, sdem, h.hexdigest()


def run(data_dir, topo_path, remove_source=False):
    data_dir = os.path.abspath(data_dir)
    topo_path = os.path.abspath(topo_path)
    out_dir = os.path.join(data_dir, 'granular')
    reg_dir = os.path.join(out_dir, 'regiao')
    cad_dir = os.path.join(out_dir, 'cadeia')
    os.makedirs(reg_dir, exist_ok=True)
    os.makedirs(cad_dir, exist_ok=True)

    print('=' * 70)
    print('PARTICIONAMENTO DOS CUBOS GRANULARES')
    print('=' * 70)
    print(f'Fonte : {data_dir}')
    print(f'Topo  : {topo_path}')

    # 1) Mapeamento municipio -> regional a partir do topojson
    print('\nLendo topojson e montando mun2reg...')
    mun2reg, reg_nome, reg_meso = build_mun2reg(topo_path)
    print(f'  Regionais: {len(reg_nome)} | Mesorregioes: {len(set(reg_meso.values()))}')

    # 2) Carregar as 5 fontes granulares
    print('\nCarregando arquivos granulares fonte...')
    cube_src = load_json(os.path.join(data_dir, CUBE_FILE))
    print(f'  {CUBE_FILE}: {len(cube_src):,} registros')
    dim_src = {}
    for key, src, _field, _has in DIMS:
        dim_src[key] = load_json(os.path.join(data_dir, src))
        print(f'  {src}: {len(dim_src[key]):,} registros')

    # Cobertura mun -> regional (100% dos muns do cube)
    cube_muns = set(r['mun'] for r in cube_src)
    faltantes = sorted(m for m in cube_muns if m not in mun2reg)
    if faltantes:
        raise SystemExit(
            f'ERRO: {len(faltantes)} municipios do cube sem regional no '
            f'topojson (cobertura incompleta): {faltantes[:10]}')
    print(f'  Cobertura mun->regional: {len(cube_muns)}/{len(cube_muns)} (100%)')

    # 3) Buckets por regiao (slug) e por cadeia (nome)
    def new_bucket():
        b = {'cube': []}
        for key, _s, _f, _h in DIMS:
            b[key] = []
        return b

    reg_buckets = {}
    cad_buckets = {}

    def bucket_reg(slug):
        if slug not in reg_buckets:
            reg_buckets[slug] = new_bucket()
        return reg_buckets[slug]

    def bucket_cad(nome):
        if nome not in cad_buckets:
            cad_buckets[nome] = new_bucket()
        return cad_buckets[nome]

    print('\nDistribuindo registros nos buckets (regiao e cadeia)...')
    for r in cube_src:
        bucket_reg(mun2reg[r['mun']])['cube'].append(r)
        bucket_cad(r['cadeia'])['cube'].append(r)
    for key, _s, _f, _h in DIMS:
        for r in dim_src[key]:
            slug = mun2reg.get(r['mun'])
            if slug is None:
                raise SystemExit(
                    f"ERRO: municipio '{r['mun']}' em {key} sem regional")
            bucket_reg(slug)[key].append(r)
            bucket_cad(r['cadeia'])[key].append(r)

    # 4) Escrever bundles e coletar metadados de tamanho
    def write_json(path, obj):
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False)
        return os.path.getsize(path)

    sizes = []  # (rotulo, bytes)

    print('\nGravando bundles por regiao...')
    regioes_index = {}
    for slug in sorted(reg_buckets):
        b = reg_buckets[slug]
        bundle = encode_bundle(b['cube'], b, include_dims=True)
        rel = f'regiao/{slug}.json'
        nbytes = write_json(os.path.join(out_dir, rel), bundle)
        regioes_index[slug] = {
            'nome': reg_nome[slug], 'meso': reg_meso[slug],
            'file': rel, 'bytes': nbytes,
        }
        sizes.append((rel, nbytes))

    print('Gravando bundles por cadeia...')
    cadeias_index = {}
    cad_slug_por_nome = {}
    for nome in sorted(cad_buckets):
        slug = slugify(nome)
        if slug in cad_slug_por_nome and cad_slug_por_nome[slug] != nome:
            raise SystemExit(
                f"ERRO: colisao de slug de cadeia '{slug}': "
                f"'{cad_slug_por_nome[slug]}' vs '{nome}'")
        cad_slug_por_nome[slug] = nome
        b = cad_buckets[nome]
        bundle = encode_bundle(b['cube'], b, include_dims=True)
        rel = f'cadeia/{slug}.json'
        nbytes = write_json(os.path.join(out_dir, rel), bundle)
        cadeias_index[nome] = {'file': rel, 'bytes': nbytes}
        sizes.append((rel, nbytes))

    print('Gravando cube_all (estadual)...')
    cube_all_bundle = encode_bundle(cube_src, {}, include_dims=False)
    cube_all_bytes = write_json(os.path.join(out_dir, 'cube_all.json'), cube_all_bundle)
    sizes.append(('cube_all.json', cube_all_bytes))

    # mesos: nome -> [slugs]
    mesos_index = {}
    for slug, meso in reg_meso.items():
        mesos_index.setdefault(meso, []).append(slug)
    for meso in mesos_index:
        mesos_index[meso].sort()

    # reg por nome -> slug (o frontend recebe regIdrFilter como nome)
    reg_by_name = {info['nome']: slug for slug, info in regioes_index.items()}

    version = None
    meta_path = os.path.join(data_dir, 'metadata.json')
    if os.path.exists(meta_path):
        version = load_json(meta_path).get('atualizacao')

    index = {
        'version': version,
        'mun2reg': mun2reg,
        'regioes': regioes_index,
        'regByName': reg_by_name,
        'mesos': mesos_index,
        'cadeias': cadeias_index,
        'cubeAll': {'file': 'cube_all.json', 'bytes': cube_all_bytes},
    }
    index_bytes = write_json(os.path.join(out_dir, 'index.json'), index)
    sizes.append(('index.json', index_bytes))

    # 5) VERIFICACAO DE INTEGRIDADE ROUND-TRIP
    print('\n' + '=' * 70)
    print('VERIFICACAO DE INTEGRIDADE ROUND-TRIP')
    print('=' * 70)

    ok = True
    report_lines = []

    def check_family(nome, source_recs, fields, regiao_recs, cadeia_recs,
                     cube_all_recs=None):
        nonlocal ok
        src_sig = signature(source_recs, fields)
        reg_sig = signature(regiao_recs, fields)
        cad_sig = signature(cadeia_recs, fields)
        saldo = src_sig[1] - src_sig[2]
        line = (f'  {nome:16s} n={src_sig[0]:>7,} adm={src_sig[1]:>9,} '
                f'dem={src_sig[2]:>9,} saldo={saldo:>+9,}')
        report_lines.append(line)
        checks = [('regiao', reg_sig), ('cadeia', cad_sig)]
        if cube_all_recs is not None:
            checks.append(('cube_all', signature(cube_all_recs, fields)))
        for axis, sig in checks:
            same = sig == src_sig
            status = 'OK' if same else 'FALHOU'
            report_lines.append(
                f'      round-trip {axis:9s}: {status} '
                f'(n={sig[0]:,} md5={sig[3][:8]})')
            if not same:
                ok = False
                report_lines.append(
                    f'        ESPERADO n={src_sig[0]:,} adm={src_sig[1]:,} '
                    f'dem={src_sig[2]:,} md5={src_sig[3][:8]}')
        return src_sig

    # Reconstruir por eixo, relendo os bundles gravados do disco.
    print('  Relendo bundles do disco e decodificando...')
    reg_dec = {'cube': []}
    for key, _s, _f, _h in DIMS:
        reg_dec[key] = []
    for slug, info in regioes_index.items():
        cube, dims = decode_bundle(load_json(os.path.join(out_dir, info['file'])))
        reg_dec['cube'].extend(cube)
        for key in dims:
            reg_dec[key].extend(dims[key])

    cad_dec = {'cube': []}
    for key, _s, _f, _h in DIMS:
        cad_dec[key] = []
    for nome, info in cadeias_index.items():
        cube, dims = decode_bundle(load_json(os.path.join(out_dir, info['file'])))
        cad_dec['cube'].extend(cube)
        for key in dims:
            cad_dec[key].extend(dims[key])

    cube_all_cube, _ = decode_bundle(load_json(os.path.join(out_dir, 'cube_all.json')))

    print('  Comparando multisets (contagem, somas, md5)...\n')
    check_family('cube', cube_src, CUBE_FIELDS,
                 reg_dec['cube'], cad_dec['cube'], cube_all_cube)
    for key, _src, field, has_sal in DIMS:
        check_family(key, dim_src[key], dim_fields(field, has_sal),
                     reg_dec[key], cad_dec[key])

    # Aninhamento regional -> meso (re-assercao)
    nested_ok = all(len(set(reg_meso[s] for s in slugs)) == 1
                    for slugs in mesos_index.values())
    # (trivialmente verdadeiro; o build ja abortaria em conflito)
    report_lines.append(
        f'  aninhamento regional->meso: {"OK" if nested_ok else "FALHOU"} '
        f'({len(reg_nome)} regionais em {len(mesos_index)} mesorregioes)')
    report_lines.append(
        f'  cobertura mun->regional: OK ({len(cube_muns)}/{len(cube_muns)})')

    for ln in report_lines:
        print(ln)

    # 6) Tabela de tamanhos
    total_new = sum(b for _n, b in sizes)
    total_old = 0
    for f in [CUBE_FILE] + [d[1] for d in DIMS]:
        p = os.path.join(data_dir, f)
        if os.path.exists(p):
            total_old += os.path.getsize(p)

    print('\n' + '=' * 70)
    print('TAMANHOS')
    print('=' * 70)
    mb = lambda b: b / (1024 * 1024)
    for label, b in sorted(sizes, key=lambda x: -x[1]):
        print(f'  {label:34s} {mb(b):7.3f} MB')
    print('  ' + '-' * 44)
    print(f'  {"TOTAL novo (regiao+cadeia+cube_all+index)":34s} {mb(total_new):7.3f} MB')
    print(f'  {"TOTAL antigo (5 granular_*.json)":34s} {mb(total_old):7.3f} MB')
    if total_old:
        print(f'  Reducao: {(1 - total_new / total_old) * 100:.1f}%')

    # 7) Resultado
    print('\n' + '=' * 70)
    if not ok:
        print('INTEGRIDADE: FALHOU  -> bundles NAO confiaveis, abortando.')
        print('=' * 70)
        raise SystemExit(2)
    print('INTEGRIDADE: OK  -> round-trip exato em todas as familias e eixos.')
    print('=' * 70)

    # 8) Remocao opcional das fontes (so apos integridade OK)
    if remove_source:
        print('\nRemovendo arquivos granulares fonte (--remove-source)...')
        for f in [CUBE_FILE] + [d[1] for d in DIMS]:
            p = os.path.join(data_dir, f)
            if os.path.exists(p):
                os.remove(p)
                print(f'  removido {f}')

    return out_dir


def main():
    ap = argparse.ArgumentParser(description='Particiona os cubos granulares.')
    ap.add_argument('--data', default=DEFAULT_DATA,
                    help='Diretorio dashboard/public/data')
    ap.add_argument('--topo', default=DEFAULT_TOPO,
                    help='Caminho do topojson municipal (props RegIdr/MesoIdr)')
    ap.add_argument('--remove-source', action='store_true',
                    help='Apaga os 5 granular_*.json APOS integridade OK')
    args = ap.parse_args()

    if not os.path.exists(args.topo):
        raise SystemExit(f'ERRO: topojson nao encontrado: {args.topo}')

    run(args.data, args.topo, remove_source=args.remove_source)


if __name__ == '__main__':
    main()
