"""
Fato -> dashboard/public/data/v2/dims.json e dashboard/public/data/v2/cubo/{slug}.json
(contrato §3 e §4). Um arquivo de cubo por regional IDR, em formato colunar.

Grão: (mun, sub, per, mov, sexo, faixa, esc, porte, sbin); medidas n = Σw,
sal = Σw·salário (só sbin > 0), idade = Σw·idade (só admissões com idade 14..99).
Linhas ordenadas por (mun, per, sub, ...) para comprimir bem; linhas todas zero omitidas.

Uso: python scripts/build_cube.py
"""

import datetime as dt
import gzip
import json
import os
import sys
import unicodedata

import numpy as np
import pandas as pd

import cnae_cadeias as cc
from build_fact import FACT_PATH, meses

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REGIONAIS_PATH = os.path.join(SCRIPT_DIR, 'regionais_pr.json')
OUT_DIR = os.path.join(SCRIPT_DIR, '..', 'dashboard', 'public', 'data', 'v2')
CUBO_DIR = os.path.join(OUT_DIR, 'cubo')
DIMS_PATH = os.path.join(OUT_DIR, 'dims.json')

GRAO = ['mun', 'per', 'sub', 'mov', 'sexo', 'faixa', 'esc', 'porte', 'sbin']
PORTE_NI_MAX = 0.95
COLS_SAIDA = ['mun', 'sub', 'per', 'mov', 'sexo', 'faixa', 'esc', 'porte', 'sbin', 'n', 'sal', 'idade']


def slug(texto):
    s = unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode().lower()
    return '-'.join(''.join(ch if ch.isalnum() else ' ' for ch in s).split())


def carregar_regionais():
    with open(REGIONAIS_PATH, encoding='utf-8') as f:
        return json.load(f)


def montar_dims(municipios, periodos):
    regs = {}
    for m in municipios:
        regs.setdefault(m['reg'], m['meso'])
    regionais = [{'nome': r, 'slug': slug(r), 'meso': regs[r], 'file': f'{slug(r)}.json', 'bytes': 0}
                 for r in sorted(regs, key=slug)]
    return {
        'version': dt.date.today().isoformat(),
        'periodos': periodos,
        'municipios': [{'cod': m['cod6'], 'nome': m['nome'], 'reg': m['reg'], 'meso': m['meso']}
                       for m in municipios],
        'regionais': regionais,
        'mesos': sorted({m['meso'] for m in municipios}, key=slug),
        'cadeias': [{'nome': c['nome'], 'cor': c['cor'], 'descricao': c['descricao']} for c in cc.CADEIAS],
        'subclasses': [{'cod': s['cod'], 'descricao': s['descricao'], 'cadeia': cc.CNAE_CADEIA[s['cod']]}
                       for s in cc.SUBCLASSES],
        'sexo': cc.SEXO_LABELS,
        'faixa': cc.FAIXA_LABELS,
        'escolaridade': cc.ESCOLARIDADE_LABELS,
        'porte': cc.PORTE_LABELS,
        'sal_edges': cc.SAL_EDGES,
    }


def _indice(serie, mapa, nome):
    idx = serie.map(mapa)
    faltando = sorted(set(serie[idx.isna()].astype(str)))
    if faltando:
        raise ValueError(f'{nome} sem entrada em dims: {faltando[:20]} ({len(faltando)} códigos)')
    return idx.astype('int32').to_numpy()


def _codigo(serie, mapa, padrao):
    """Código oficial (Int nullable) -> índice do rótulo; ausente/desconhecido -> padrao."""
    return serie.astype('float64').map(mapa).fillna(padrao).astype('int16').to_numpy()


def linhas_do_cubo(fato, dims):
    """Fato -> DataFrame no grão do cubo, já agregado, sem linhas zeradas e ordenado."""
    per = _indice(fato['competencia'], {p: i for i, p in enumerate(dims['periodos'])}, 'competência')
    mov = fato['mov'].to_numpy().astype('int8')
    w = fato['w'].to_numpy().astype('int64')
    idade = fato['idade'].astype('float64').to_numpy()
    idade_ok = (idade >= cc.IDADE_MIN) & (idade <= cc.IDADE_MAX)  # NaN -> False

    faixa = np.where(idade_ok, np.searchsorted(cc.FAIXA_TETOS, np.nan_to_num(idade), side='left'),
                     len(cc.FAIXAS))

    sm = np.array([cc.salario_minimo(p) for p in dims['periodos']], dtype='float64')[per]
    sal = fato['salario'].to_numpy(dtype='float64', na_value=np.nan)
    intermitente = fato['intermitente'].fillna(0).to_numpy() == 1
    sal_ok = (mov == 1) & ~intermitente & (sal >= 0.3 * sm) & (sal <= 150 * sm)  # NaN -> False
    bins = np.clip(np.searchsorted(cc.SAL_EDGES, np.nan_to_num(sal), side='right'), 1,
                   len(cc.SAL_EDGES) - 1)

    df = pd.DataFrame({
        'mun': _indice(fato['municipio'], {m['cod']: i for i, m in enumerate(dims['municipios'])},
                       'município'),
        'per': per,
        'sub': _indice(fato['subclasse'], {s['cod']: i for i, s in enumerate(dims['subclasses'])},
                       'subclasse'),
        'mov': mov,
        'sexo': _codigo(fato['sexo'], {k: cc.SEXO_LABELS.index(v) for k, v in cc.SEXO.items()},
                        len(cc.SEXO_LABELS) - 1),
        'faixa': faixa.astype('int16'),
        'esc': _codigo(fato['escolaridade'], {k: i for i, k in enumerate(cc.GRAU_INSTRUCAO)},
                       len(cc.ESCOLARIDADE_LABELS) - 1),
        'porte': _codigo(fato['porte'], {k: i for i, k in enumerate(cc.PORTE)}, len(cc.PORTE_LABELS) - 1),
        'sbin': np.where(sal_ok, bins, 0).astype('int16'),
        'n': w,
        'sal': np.where(sal_ok, w * np.nan_to_num(sal), 0.0),
        'idade': np.where((mov == 1) & idade_ok, w * np.nan_to_num(idade), 0).astype('int64'),
    })
    cubo = df.groupby(GRAO, sort=True, as_index=False)[['n', 'sal', 'idade']].sum()
    cubo['sal'] = cubo['sal'].round(2)
    vazia = (cubo['n'] == 0) & (cubo['sal'].abs() < 0.005) & (cubo['idade'] == 0)
    return cubo[~vazia].reset_index(drop=True)


def porte_indisponivel(cubo, dims):
    """Competências em que o MTE não preencheu o porte (tamestabjan): > PORTE_NI_MAX das
    movimentações (|n|) caem em "Não informado". Com filtro de porte, o motor as tira do recorte."""
    peso = cubo['n'].abs()
    ni = peso.where(cubo['porte'] == len(cc.PORTE_LABELS) - 1, 0).groupby(cubo['per']).sum()
    frac = ni / peso.groupby(cubo['per']).sum()
    return [dims['periodos'][p] for p in sorted(frac[frac > PORTE_NI_MAX].index)]


def _num(x):
    return int(x) if float(x).is_integer() else float(x)


def serializar(parte, version):
    out = {'version': version, 'n_rows': len(parte)}
    for c in COLS_SAIDA:
        col = parte[c]
        out[c] = [_num(v) for v in col.tolist()] if c == 'sal' else col.astype('int64').tolist()
    return json.dumps(out, separators=(',', ':'))


def construir():
    fato = pd.read_parquet(FACT_PATH)
    ultimo = fato.loc[fato['fonte'] == 'MOV', 'decl'].max()
    periodos = [f'{m[:4]}-{m[4:]}' for m in meses('202001', ultimo)]
    municipios = carregar_regionais()
    dims = montar_dims(municipios, periodos)
    cubo = linhas_do_cubo(fato, dims)
    dims['porte_indisponivel'] = porte_indisponivel(cubo, dims)

    reg_do_mun = np.array([next(i for i, r in enumerate(dims['regionais']) if r['nome'] == m['reg'])
                           for m in dims['municipios']])
    os.makedirs(CUBO_DIR, exist_ok=True)
    for antigo in os.listdir(CUBO_DIR):
        if antigo.endswith('.json'):
            os.remove(os.path.join(CUBO_DIR, antigo))

    tot_raw = tot_gz = 0
    print(f'{"partição":<34}{"linhas":>9}{"bytes":>12}{"gzip":>10}')
    reg_linha = reg_do_mun[cubo['mun'].to_numpy()]
    for i, reg in enumerate(dims['regionais']):
        corpo = serializar(cubo[reg_linha == i], dims['version']).encode('utf-8')
        with open(os.path.join(CUBO_DIR, reg['file']), 'wb') as f:
            f.write(corpo)
        gz = len(gzip.compress(corpo, 9))
        reg['bytes'] = len(corpo)
        tot_raw, tot_gz = tot_raw + len(corpo), tot_gz + gz
        print(f'{reg["file"]:<34}{int((reg_linha == i).sum()):>9,}{len(corpo):>12,}{gz:>10,}')
    print(f'{"TOTAL":<34}{len(cubo):>9,}{tot_raw:>12,}{tot_gz:>10,}')

    with open(DIMS_PATH, 'w', encoding='utf-8') as f:
        json.dump(dims, f, ensure_ascii=False, separators=(',', ':'))
    print(f'dims: {os.path.getsize(DIMS_PATH):,} bytes; períodos {periodos[0]}..{periodos[-1]}; '
          f'fato {len(fato):,} linhas -> cubo {len(cubo):,} linhas')
    return 0


if __name__ == '__main__':
    sys.exit(construir())
