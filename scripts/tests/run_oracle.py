"""
Roda o oráculo em todos os casos de scripts/tests/cases.json e grava os resultados.

Uso:
    py -3.12 -X utf8 scripts/tests/run_oracle.py [saida.json] [--fact F] [--dims D] [--cases C] [--check]

Formato de saída: {"meta": {...}, "results": {"<id>": {saídas do §6}}}.
--check também confere âncoras independentes no fato (ver checar_ancoras).
"""
import argparse
import json
import math
import os
import sys
import time

import numpy as np
import pandas as pd

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
sys.path.insert(0, AQUI)
from oracle import compute_prepared, prepare  # noqa: E402

SAIDA_PADRAO = os.path.join(RAIZ, 'data', 'cache', 'oracle.json')  # fora do git (data/cache)


def _json_default(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return None if math.isnan(o) else float(o)
    raise TypeError(type(o))


def _sem_nan(o):
    """NaN/inf nunca vão para o JSON (viram null)."""
    if isinstance(o, float) and not math.isfinite(o):
        return None
    if isinstance(o, dict):
        return {k: _sem_nan(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_sem_nan(v) for v in o]
    return o


def checar_ancoras(fato, dims, cells):
    """Âncoras independentes do oráculo: somas manuais no fato vs compute()."""
    msgs = []
    adm = fato['mov'].astype(int) == 1
    w = fato['w'].astype(int)
    ultimo = dims['periodos'][-1]
    # 1) último mês só tem MOV (FOR traz meses anteriores; EXC não traz o próprio mês)
    um = fato['competencia'] == ultimo
    fontes = sorted(fato.loc[um, 'fonte'].unique())
    saldo_mov = int(w[um & adm].sum() - w[um & ~adm].sum())
    o = compute_prepared(cells, dims, {})
    k = o['kpis']['ultimo_mes']
    msgs.append((k['saldo'] == saldo_mov and fontes == ['MOV'],
                 f'{ultimo}: fontes={fontes} saldo fato={saldo_mov} oráculo={k}'))
    if ultimo == '2026-08':
        msgs.append((k['saldo'] == -73, f'2026-08 saldo oficial MTE -73 vs oráculo {k["saldo"]}'))
        # CAGEDMOV202608.txt bruto (uf 41, seção A), regra MTE com SM 1621, calculado à parte:
        # n_sal 4339, média 2329.639359, idade média 33.317084, % masculino 77.211191
        a = compute_prepared(cells, dims, {'periodo': '2026-08'})['kpis']
        esperado = (4339, 2329.639359, 33.317084, 77.211191)
        obtido = (a['salario']['n'], a['salario']['media'], a['perfil']['idade_media'], a['perfil']['pct_masculino'])
        ok = obtido[0] == esperado[0] and all(abs(x - y) < 1e-5 for x, y in zip(obtido[1:], esperado[1:]))
        msgs.append((ok, f'2026-08 salário/perfil bruto {esperado} vs oráculo {obtido}'))
    # 2) mês com ajustes: soma manual por competência com pesos w
    ajust = fato[fato['fonte'] != 'MOV'].groupby('competencia').size()
    mes = ajust.idxmax() if len(ajust) else ultimo
    m = fato['competencia'] == mes
    manual = (int(w[m & adm].sum()), int(w[m & ~adm].sum()))
    ts = {r['periodo']: r for r in o['timeseries']}
    r = ts[mes]
    msgs.append(((r['admissoes'], r['demissoes']) == manual,
                 f'{mes} ({int(ajust.get(mes, 0))} registros FOR/EXC): manual adm/dem={manual} '
                 f'oráculo={r["admissoes"]}/{r["demissoes"]}'))
    if '2026-07' in ts and ultimo == '2026-08':
        # CSVs brutos: MOV202607 4387/4903 + FOR202608 26/36 − EXC202608 0/3
        r = ts['2026-07']
        msgs.append(((r['admissoes'], r['demissoes']) == (4413, 4936),
                     f'2026-07 bruto 4413/4936 vs oráculo {r["admissoes"]}/{r["demissoes"]}'))
    # 3) totais gerais
    tot = o['kpis']['acumulado']
    msgs.append(((tot['admissoes'], tot['demissoes']) == (int(w[adm].sum()), int(w[~adm].sum())),
                 f'acumulado {tot}'))
    return msgs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('saida', nargs='?', default=SAIDA_PADRAO)
    ap.add_argument('--fact', default=os.path.join(RAIZ, 'data/fact/caged_agro_pr.parquet'))
    ap.add_argument('--dims', default=os.path.join(RAIZ, 'dashboard/public/data/v2/dims.json'))
    ap.add_argument('--cases', default=os.path.join(AQUI, 'cases.json'))
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()

    t0 = time.perf_counter()
    with open(a.dims, encoding='utf-8') as f:
        dims = json.load(f)
    with open(a.cases, encoding='utf-8') as f:
        casos = json.load(f)
    fato = pd.read_parquet(a.fact)
    cells = prepare(fato, dims)
    t_prep = time.perf_counter() - t0
    desc = cells['desconhecidos']
    print(f'fato: {len(fato)} linhas → {len(cells["n"])} células; preparo {t_prep:.1f}s; '
          f'códigos fora de dims: {desc}')
    falhas = 0
    if a.check:
        for ok, msg in checar_ancoras(fato, dims, cells):
            print('OK  ' if ok else 'FALHA', msg)
            falhas += not ok

    res = {}
    t1 = time.perf_counter()
    for c in casos:
        res[c['id']] = _sem_nan(compute_prepared(cells, dims, c['filters']))
    t_casos = time.perf_counter() - t1

    os.makedirs(os.path.dirname(os.path.abspath(a.saida)), exist_ok=True)
    meta = {'fact': a.fact, 'dims_version': dims.get('version'), 'n_casos': len(casos),
            'segundos_preparo': round(t_prep, 2), 'segundos_casos': round(t_casos, 2),
            'desconhecidos': desc}
    with open(a.saida, 'w', encoding='utf-8') as f:
        json.dump({'meta': meta, 'results': res}, f, ensure_ascii=False, default=_json_default, allow_nan=False)
    tam = os.path.getsize(a.saida)
    print(f'{len(casos)} casos em {t_casos:.1f}s (total {time.perf_counter() - t0:.1f}s); '
          f'{a.saida} ({tam / 1e6:.1f} MB)')
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
