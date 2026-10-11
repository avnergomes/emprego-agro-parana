"""
Teste mínimo do oráculo com um fato SINTÉTICO feito à mão (resultados calculados à mão).
Cobre: pesos EXC/FOR, SM por vigência, intermitente, cross-filter, mun → reg implícito,
percentil por bins com truncamento em 0, supressão n_sal < 5, sazonalidade.

Rodar: py -3.12 -X utf8 scripts/tests/test_oracle.py   (ou pytest)
"""
import math
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oracle import compute, percentil  # noqa: E402

SAL_EDGES = [0, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2200, 2400, 2600,
             2800, 3000, 3500, 4000, 5000, 6000, 8000, 10000, 15000, 25000, 50000, 250000]

DIMS = {
    'periodos': ['2023-04', '2023-05', '2024-01'],
    'municipios': [
        {'cod': '410001', 'nome': 'Açaí', 'reg': 'R1', 'meso': 'M1'},
        {'cod': '410002', 'nome': 'Bê', 'reg': 'R1', 'meso': 'M1'},
        {'cod': '410003', 'nome': 'Cê', 'reg': 'R2', 'meso': 'M2'},
        {'cod': '410004', 'nome': 'Sem dados', 'reg': 'R2', 'meso': 'M2'},
    ],
    'regionais': [{'nome': 'R1', 'meso': 'M1'}, {'nome': 'R2', 'meso': 'M2'}],
    'mesos': ['M1', 'M2'],
    'cadeias': [{'nome': 'Grãos', 'cor': '#111', 'descricao': 'g'}, {'nome': 'Bovinocultura', 'cor': '#222', 'descricao': 'b'}],
    'subclasses': [{'cod': '0111301', 'descricao': 'Arroz', 'cadeia': 0},
                   {'cod': '0151201', 'descricao': 'Bovinos', 'cadeia': 1}],
    'sexo': ['Masculino', 'Feminino', 'Não informado'],
    'faixa': ['Menor de 18', '18 a 24 anos', '25 a 29 anos', '30 a 39 anos', '40 a 49 anos',
              '50 a 64 anos', '65 anos ou mais', 'Não informado'],
    'escolaridade': [f'E{c}' for c in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 80]] + ['Não informado'],
    'porte': [f'P{c}' for c in range(1, 11)] + ['Não informado'],
    'sal_edges': SAL_EDGES,
}

A, B, C = '410001', '410002', '410003'
X, Y = '0111301', '0151201'
COLS = ['fonte', 'decl', 'competencia', 'w', 'mov', 'municipio', 'subclasse', 'sexo', 'idade',
        'escolaridade', 'porte', 'salario', 'intermitente']
LINHAS = [
    # r1-r5: 5 admissões idênticas (bin [1000,1100))
    *[('MOV', '202305', '2023-05', 1, 1, A, X, 1, 30, 7, 2, 1050.0, 0)] * 5,
    # r6: exclusão de admissão (w=-1, mov=+1) em [2000,2200): contagem -1 truncada nos percentis
    ('EXC', '202307', '2023-05', -1, 1, A, X, 1, 30, 7, 2, 2100.0, 0),
    # r7: admissão feminina, 17 anos, escolaridade/porte não informados
    ('MOV', '202305', '2023-05', 1, 1, A, X, 3, 17, 99, 99, 1050.0, 0),
    # r8: desligamento
    ('MOV', '202305', '2023-05', 1, -1, A, X, 1, 40, 7, 2, 1500.0, 0),
    # r9: 392 em 2023-04 (SM 1302 → piso 390,6): entra na regra salarial
    ('MOV', '202304', '2023-04', 1, 1, B, Y, 1, 25, 7, 2, 392.0, 0),
    # r10: 392 em 2023-05 (SM 1320 → piso 396): fora da regra
    ('MOV', '202305', '2023-05', 1, 1, B, Y, 1, 25, 7, 2, 392.0, 0),
    # r11: intermitente: fora da regra
    ('MOV', '202305', '2023-05', 1, 1, B, Y, 1, 25, 7, 2, 1500.0, 1),
    # r12: fora do prazo (FOR) retroativo para 2023-05
    ('FOR', '202401', '2023-05', 1, 1, C, Y, 3, 50, 7, 2, 3000.0, 0),
    # r13: exclusão de desligamento em 2024-01 (demissões -1)
    ('EXC', '202402', '2024-01', -1, -1, C, X, 1, 60, 7, 2, 2000.0, 0),
    # r14: admissão sem sexo, idade inválida (10), sem salário
    ('MOV', '202401', '2024-01', 1, 1, C, X, 9, 10, 7, 2, None, 0),
]
FATO = pd.DataFrame(LINHAS, columns=COLS)


def aprox(a, b, tol=1e-6):
    return a is not None and b is not None and math.isclose(a, b, abs_tol=tol)


def test_sem_filtros():
    o = compute(FATO, DIMS, {})
    k = o['kpis']
    assert k['acumulado'] == {'admissoes': 10, 'demissoes': 0, 'saldo': 10}
    assert k['periodo_referencia'] == '2024-01'
    assert k['ultimo_mes'] == {'admissoes': 1, 'demissoes': -1, 'saldo': 2}
    # n_sal = 5 - 1 + 1 (r7) + 1 (r9) + 1 (r12) = 7; Σ = 5·1050 - 2100 + 1050 + 392 + 3000
    assert k['salario']['n'] == 7
    assert aprox(k['salario']['media'], 7592 / 7)
    # bins truncados: [0,1000)=1, [1000,1100)=6, [2000,2200)=-1→0, [3000,3500)=1 → N=8; alvo 4
    assert aprox(k['salario']['mediana'], 1000 + (4 - 1) / 6 * 100)
    assert aprox(k['perfil']['pct_masculino'], 7 / 9 * 100)
    assert aprox(k['perfil']['idade_media'], 262 / 9)
    ts = {r['periodo']: r for r in o['timeseries']}
    assert (ts['2023-05']['saldo'], ts['2023-05']['saldo_acumulado']) == (7, 8)
    assert ts['2024-01']['saldo_acumulado'] == 10
    saz = {r['mes']: r for r in o['seasonality']}
    assert saz[5]['admissoes'] == 8 and saz[2]['admissoes'] == 0
    assert aprox(saz[5]['indice'], 8 / (10 / 12) * 100)
    cad = {r['cadeia']: r for r in o['byCadeia']}
    assert cad['Grãos']['admissoes'] == 6 and cad['Bovinocultura']['admissoes'] == 4
    assert cad['Grãos']['n_municipios'] == 2 and cad['Grãos']['n_subclasses'] == 1
    assert o['byCadeia'][0]['cadeia'] == 'Grãos'
    # Grãos: n_sal = 5 (bins [1000,1100)=6, [2000,2200)=-1→0); p90: alvo 5,4
    sd = {r['cadeia']: r for r in o['salaryDistribution']}
    assert sd['Grãos']['n_sal'] == 5
    assert aprox(sd['Grãos']['p90'], 1000 + 5.4 / 6 * 100)
    assert aprox(sd['Grãos']['mean'], (6 * 1050 - 2100) / 5)
    # Bovinocultura: n_sal = 2 (r9, r12) → suprimido
    assert sd['Bovinocultura']['p50'] is None and sd['Bovinocultura']['mean'] is None
    mun = {r['codigo']: r for r in o['byMunicipio']}
    assert '410004' not in mun  # sem dados: lista esparsa
    assert mun[A]['cadeia_dominante'] == 'Grãos' and mun[B]['cadeia_dominante'] == 'Bovinocultura'


def test_cross_filter_sexo():
    o = compute(FATO, DIMS, {'sexo': 'Feminino'})
    assert o['kpis']['acumulado']['admissoes'] == 2
    assert o['kpis']['salario']['media'] is None  # n_sal = 2 < 5
    sexo = {r['sexo']: r for r in o['bySexo']}  # bySexo ignora o próprio filtro
    assert sexo['Masculino']['admissoes'] == 7 and sexo['Feminino']['admissoes'] == 2
    assert sexo['Não informado']['admissoes'] == 1
    assert aprox(sexo['Feminino']['pct'], 20.0)
    cs = {(r['cadeia'], r['sexo']): r for r in o['crossCadeiaSexo']}
    assert cs[('Grãos', 'Masculino')]['admissoes'] == 4  # 5 - 1


def test_cross_filter_cadeia_e_mun():
    o = compute(FATO, DIMS, {'cadeia': 'Grãos'})
    assert o['kpis']['acumulado']['admissoes'] == 6
    assert {r['cadeia'] for r in o['byCadeia']} == {'Grãos', 'Bovinocultura'}
    assert {r['cnae'] for r in o['byCnae']} == {X}  # byCnae aplica cadeia
    o = compute(FATO, DIMS, {'mun': A})
    assert o['kpis']['acumulado'] == {'admissoes': 5, 'demissoes': 1, 'saldo': 4}
    assert {r['codigo'] for r in o['byMunicipio']} == {A, B}  # regional de A, nunca o estado
    o = compute(FATO, DIMS, {'mun': A, 'reg': 'R2'})  # incoerente → vazio
    assert o['kpis']['acumulado']['admissoes'] == 0 and o['byMunicipio'] == []
    o = compute(FATO, DIMS, {'ano': '2023'})
    assert o['kpis']['periodo_referencia'] == '2023-05'
    assert len(o['timeseries']) == 3  # série ignora o ano


def test_percentil_bins():
    b = [0] * 27
    b[2], b[12] = 6, -1
    assert aprox(percentil(b, .5, SAL_EDGES), 1050)
    b = [0] * 27
    b[26] = 3  # último bin aberto: devolve E[25]
    assert percentil(b, .9, SAL_EDGES) == 50000
    assert percentil([0] * 27, .5, SAL_EDGES) is None


def test_compare():
    import copy

    from compare import Comparador
    base = compute(FATO, DIMS, {})

    def n_div(b, **tol):
        c = Comparador(tol.get('sal', 0.01), tol.get('razao', 0.05))
        c.caso('x', base, b)
        return len(c.div), c

    assert n_div(copy.deepcopy(base))[0] == 0
    b = copy.deepcopy(base)
    b['byCadeia'][0]['admissoes'] += 1
    assert n_div(b)[0] == 1
    b = copy.deepcopy(base)
    b['kpis']['salario']['media'] += 0.005  # dentro da tolerância
    b['byCadeia'].reverse()                 # ordem não importa (comparação por chave)
    assert n_div(b)[0] == 0
    b['kpis']['salario']['media'] += 0.02
    assert n_div(b)[0] == 1
    b = copy.deepcopy(base)
    b['kpis']['acumulado']['admissoes'] = '10'  # número como string é divergência
    assert n_div(b)[0] == 1
    b = copy.deepcopy(base)
    b['timeseries'].append({'periodo': '2023-06', 'admissoes': 0, 'demissoes': 0, 'saldo': 0,
                            'saldo_acumulado': 8, 'salario_medio': None, 'salario_mediana': None, 'n_sal': 0})
    n, c = n_div(b)
    assert n == 0 and c.tolerados['timeseries'] == 1  # linha zerada extra é tolerada
    b = copy.deepcopy(base)
    b['byMunicipio'] = b['byMunicipio'][1:]
    assert n_div(b)[0] >= 1


if __name__ == '__main__':
    for nome, fn in list(globals().items()):
        if nome.startswith('test_'):
            fn()
            print('ok', nome)
