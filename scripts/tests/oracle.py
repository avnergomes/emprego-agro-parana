"""
Oráculo independente do motor de agregação (docs/CONTRATO-DADOS.md, §1 e §6).

Reimplementa a metodologia e todas as saídas do motor diretamente sobre o FATO
(data/fact/caged_agro_pr.parquet), sem importar scripts/build_*.py nem o motor JS.
De dims.json usa só rótulos, cadeia da subclasse, município → regional/meso,
períodos e sal_edges.

Uso:
    cells = prepare(fact_df, dims)          # rotula e colapsa no grão do cubo (uma vez)
    out = compute_prepared(cells, dims, {}) # todas as saídas para um estado de filtros
    out = compute(fact_df, dims, filters)   # atalho (prepara a cada chamada)

Convenções que o contrato não fixa (reportadas como lacunas):
- kpis.periodo_referencia / ultimo_mes = último período do intervalo temporal do
  recorte (dims.periodos ∩ filtro ano/periodo), mesmo que o recorte esteja vazio nele.
- seasonality: nº de anos de cada mês = anos de dims.periodos que têm aquele mês.
- Listas são esparsas: só chaves com ao menos uma célula do cubo no recorte.
- n_subclasses / n_municipios = distintos entre as células do cubo no recorte.
- Razões (pct, indice, idade_media) com denominador zero ou negativo (ajuste EXC) → None.
- Com filtro de porte, as competências de dims.porte_indisponivel saem do recorte (§6).
"""
import numpy as np
import pandas as pd

# Salário mínimo por início de vigência (AAAA-MM), §1
SM_VIGENCIA = [
    ('2020-01', 1039), ('2020-02', 1045), ('2021-01', 1100), ('2022-01', 1212),
    ('2023-01', 1302), ('2023-05', 1320), ('2024-01', 1412), ('2025-01', 1518),
    ('2026-01', 1621),
]

# Códigos oficiais na ordem dos rótulos de dims (o último rótulo é "Não informado")
ESC_CODES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 80]
PORTE_CODES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
# limites superiores (exclusivos) das faixas etárias válidas (14..99)
FAIXA_LIMITES = [18, 25, 30, 40, 50, 65, 100]
MES_NOME = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
PCTS = [('p10', .10), ('p25', .25), ('p50', .50), ('p75', .75), ('p90', .90)]
MIN_N_SAL = 5  # LGPD: salário com n_sal < 5 vira None

FILTER_KEYS = ['meso', 'reg', 'mun', 'cadeia', 'cnae', 'ano', 'periodo',
               'sexo', 'faixa', 'escolaridade', 'porte']

# Filtros ignorados por saída (§6)
IGN = {
    'kpis': set(),
    'cadeia': {'cadeia', 'cnae'},
    'cadeia_sexo': {'cadeia', 'cnae', 'sexo'},
    'cnae': {'cnae'},
    'sexo': {'sexo'},
    'faixa': {'faixa'},
    'escolaridade': {'escolaridade'},
    'porte': {'porte'},
    'mun': {'mun'},
    'tempo': {'ano', 'periodo'},
}


def sm_de(competencia):
    """Salário mínimo vigente na competência AAAA-MM."""
    valor = None
    for inicio, sm in SM_VIGENCIA:
        if competencia >= inicio:
            valor = sm
    if valor is None:
        raise ValueError(f'competência sem SM: {competencia}')
    return valor


def _num(s):
    """Converte coluna para float aceitando vírgula decimal."""
    if s.dtype == object or pd.api.types.is_string_dtype(s):
        s = s.astype('string').str.replace(',', '.', regex=False)
    return pd.to_numeric(s, errors='coerce').astype('float64')  # Int16 com <NA> → NaN


def _idx(values, lookup, sentinela):
    """Mapeia valores para índices de dims; desconhecido → sentinela."""
    return values.map(lookup).fillna(sentinela).astype(np.int64).to_numpy()


def prepare(fact_df, dims):
    """Rotula cada registro do fato e colapsa no grão do cubo (§4).

    Retorna dict com arrays numpy por célula e `desconhecidos` (contagem de
    códigos de município/subclasse ausentes de dims).
    """
    # o mapeamento código → rótulo é posicional (ordem oficial dos códigos)
    assert dims['escolaridade'][-1] == 'Não informado' and len(dims['escolaridade']) == len(ESC_CODES) + 1
    assert dims['porte'][-1] == 'Não informado' and len(dims['porte']) == len(PORTE_CODES) + 1
    assert len(dims['faixa']) == len(FAIXA_LIMITES) + 1 and dims['faixa'][-1] == 'Não informado'
    f = fact_df
    n_mun, n_sub, n_per = len(dims['municipios']), len(dims['subclasses']), len(dims['periodos'])
    mun_cod = f['municipio'].astype('string').str.strip().str.zfill(6)
    sub_cod = f['subclasse'].astype('string').str.strip().str.zfill(7)
    comp = f['competencia'].astype('string')

    mun_i = _idx(mun_cod, {m['cod']: i for i, m in enumerate(dims['municipios'])}, n_mun)
    sub_i = _idx(sub_cod, {s['cod']: i for i, s in enumerate(dims['subclasses'])}, n_sub)
    per_i = _idx(comp, {p: i for i, p in enumerate(dims['periodos'])}, n_per)

    w = _num(f['w']).astype(np.int64).to_numpy()
    mov = _num(f['mov']).astype(np.int64).to_numpy()
    idade = _num(f['idade']).to_numpy()
    sal = _num(f['salario']).to_numpy()
    interm = _num(f['intermitente']).fillna(0).to_numpy()

    sexo_cod = _num(f['sexo']).fillna(9).to_numpy()
    sexo_i = np.where(sexo_cod == 1, dims['sexo'].index('Masculino'),
                      np.where(sexo_cod == 3, dims['sexo'].index('Feminino'),
                               dims['sexo'].index('Não informado')))

    valida = (idade >= 14) & (idade <= 99)  # NaN → False
    faixa_ni = dims['faixa'].index('Não informado')
    faixa_i = np.where(valida, np.searchsorted(FAIXA_LIMITES, np.nan_to_num(idade), side='right'), faixa_ni)

    esc_ni = dims['escolaridade'].index('Não informado')
    esc_cod = _num(f['escolaridade']).fillna(-1).astype(np.int64)
    esc_i = esc_cod.map({c: i for i, c in enumerate(ESC_CODES)}).fillna(esc_ni).astype(np.int64).to_numpy()

    porte_ni = dims['porte'].index('Não informado')
    porte_cod = _num(f['porte']).fillna(-1).astype(np.int64)
    porte_i = porte_cod.map({c: i for i, c in enumerate(PORTE_CODES)}).fillna(porte_ni).astype(np.int64).to_numpy()

    # regra salarial (§1): admissão, não intermitente, 0,3·SM ≤ salário ≤ 150·SM
    sm = comp.map({c: sm_de(c) for c in comp.dropna().unique()}).astype(float).to_numpy()
    ok_sal = (mov == 1) & (interm != 1) & (sal >= 0.3 * sm) & (sal <= 150 * sm)  # NaN → False
    edges = np.asarray(dims['sal_edges'], dtype=float)
    sbin = np.where(ok_sal, np.minimum(np.searchsorted(edges, np.nan_to_num(sal), side='right'), len(edges) - 1), 0)

    adm_valida = (mov == 1) & valida
    rot = pd.DataFrame({
        'mun': mun_i, 'sub': sub_i, 'per': per_i, 'mov': mov, 'sexo': sexo_i, 'faixa': faixa_i,
        'esc': esc_i, 'porte': porte_i, 'sbin': sbin,
        'n': w,
        'sal': np.where(sbin > 0, w * np.nan_to_num(sal), 0.0),
        'idade': np.where(adm_valida, w * np.nan_to_num(idade), 0.0),
    })
    grao = ['mun', 'sub', 'per', 'mov', 'sexo', 'faixa', 'esc', 'porte', 'sbin']
    c = rot.groupby(grao, sort=False, as_index=False)[['n', 'sal', 'idade']].sum()
    c = c[(c['n'] != 0) | (c['sal'].abs() > 1e-9) | (c['idade'] != 0)]
    cells = {k: c[k].to_numpy() for k in c.columns}
    cells['desconhecidos'] = {
        'municipio': sorted(set(mun_cod[mun_i == n_mun].dropna())),
        'subclasse': sorted(set(sub_cod[sub_i == n_sub].dropna())),
        'competencia': sorted(set(comp[per_i == n_per].dropna())),
    }
    return cells


# ---------------------------------------------------------------- utilidades

def _pos(vals, label):
    """Índice de um rótulo numa lista; inexistente → -2 (nunca casa)."""
    return vals.index(label) if label in vals else -2


def percentil(bins, p, edges):
    """Percentil por bins (§6): contagens negativas truncadas em 0; interpolação
    linear em [E[i-1], E[i]); último bin devolve E[i-1]. bins[0] é ignorado."""
    c = np.maximum(np.asarray(bins[1:], dtype=float), 0)
    total = c.sum()
    if total <= 0:
        return None
    alvo = p * total
    acum = 0.0
    for j, cnt in enumerate(c):
        i = j + 1
        if cnt > 0 and acum + cnt >= alvo:
            if i == len(edges) - 1:
                return float(edges[i - 1])
            return float(edges[i - 1] + (alvo - acum) / cnt * (edges[i] - edges[i - 1]))
        acum += cnt
    return float(edges[-2])


def _inteiro(x):
    return int(round(float(x)))


def _razao(num, den, fator=100.0):
    return None if den <= 0 else float(num) / float(den) * fator


class _Ctx:
    """Arrays do cubo + derivados e as falhas por filtro para um estado de filtros."""

    def __init__(self, cells, dims, filters):
        self.dims = dims
        self.edges = np.asarray(dims['sal_edges'], dtype=float)
        self.NB = len(self.edges)  # sbin 0..NB-1
        mun, sub, per = cells['mun'], cells['sub'], cells['per']
        munis, subs, pers = dims['municipios'], dims['subclasses'], dims['periodos']
        regs = [r['nome'] for r in dims['regionais']]
        mesos = dims['mesos']
        cads = [c['nome'] for c in dims['cadeias']]
        self.regs, self.mesos, self.cads = regs, mesos, cads
        # tabelas com posição sentinela no fim (códigos desconhecidos)
        mun_reg = np.array([_pos(regs, m['reg']) for m in munis] + [-1])
        mun_meso = np.array([_pos(mesos, m['meso']) for m in munis] + [-1])
        sub_cad = np.array([s['cadeia'] for s in subs] + [len(cads)])
        per_ano = np.array([int(p[:4]) for p in pers] + [-1])
        per_mes = np.array([int(p[5:7]) for p in pers] + [0])
        self.n_mun, self.n_sub, self.n_per, self.n_cad = len(munis) + 1, len(subs) + 1, len(pers) + 1, len(cads) + 1
        self.c = {
            'mun': mun, 'sub': sub, 'per': per, 'mov': cells['mov'], 'sexo': cells['sexo'],
            'faixa': cells['faixa'], 'esc': cells['esc'], 'porte': cells['porte'], 'sbin': cells['sbin'],
            'n': cells['n'].astype(float), 'sal': cells['sal'], 'idade': cells['idade'],
            'reg': mun_reg[mun], 'meso': mun_meso[mun], 'cad': sub_cad[sub],
            'ano': per_ano[per], 'mes': per_mes[per],
        }
        self.mun_reg = mun_reg
        self.filters = {k: v for k, v in (filters or {}).items() if v not in (None, '')}
        self.fail = {k: self._falha(k, v) for k, v in self.filters.items()}
        # com filtro de porte, competências sem porte informado (dims.porte_indisponivel)
        # saem do recorte de todas as saídas
        self.sem_porte = _sem_porte(dims, self.filters)
        if self.sem_porte:
            fora = np.array([p in self.sem_porte for p in pers] + [False])
            self.descarte = fora[per]
        else:
            self.descarte = np.zeros(len(self.c['n']), dtype=bool)

    def _falha(self, k, v):
        d, c = self.dims, self.c
        mun_idx = {m['cod']: i for i, m in enumerate(d['municipios'])}
        sub_idx = {s['cod']: i for i, s in enumerate(d['subclasses'])}
        if k == 'meso':
            return c['meso'] != _pos(self.mesos, v)
        if k == 'reg':
            return c['reg'] != _pos(self.regs, v)
        if k == 'mun':
            return c['mun'] != mun_idx.get(str(v), -2)
        if k == 'cadeia':
            return c['cad'] != _pos(self.cads, v)
        if k == 'cnae':
            return c['sub'] != sub_idx.get(str(v), -2)
        if k == 'ano':
            return c['ano'] != int(v)
        if k == 'periodo':
            return c['per'] != _pos(d['periodos'], v)
        if k == 'sexo':
            return c['sexo'] != _pos(d['sexo'], v)
        if k == 'faixa':
            return c['faixa'] != _pos(d['faixa'], v)
        if k == 'escolaridade':
            return c['esc'] != _pos(d['escolaridade'], v)
        if k == 'porte':
            return c['porte'] != _pos(d['porte'], v)
        raise ValueError(f'filtro desconhecido: {k}')

    def mask(self, ignorados):
        m = ~self.descarte
        for k, f in self.fail.items():
            if k not in ignorados:
                m &= ~f
        return m

    def grupo(self, m, key, nk):
        """Somatórios por chave inteira (0..nk-1) sobre as células da máscara."""
        c = self.c
        k, n, mov, sb = key[m], c['n'][m], c['mov'][m], c['sbin'][m]
        bc = lambda wts: np.bincount(k, weights=wts, minlength=nk)
        return {
            'cells': np.bincount(k, minlength=nk),
            'adm': bc(n * (mov == 1)),
            'dem': bc(n * (mov == -1)),
            'nsal': bc(n * (sb > 0)),
            'salsum': bc(c['sal'][m]),
            'bins': np.bincount(k * self.NB + sb, weights=n, minlength=nk * self.NB).reshape(nk, self.NB),
        }

    def distintos(self, m, key, nk, outra, no):
        """Nº de valores distintos de `outra` por chave (células presentes)."""
        par = np.bincount(key[m] * no + outra[m], minlength=nk * no).reshape(nk, no)
        return (par > 0).sum(axis=1)

    def salario(self, g, i, com_pcts=False):
        """Média e mediana (p50 por bins) com supressão n_sal < 5."""
        nsal = _inteiro(g['nsal'][i])
        ok = nsal >= MIN_N_SAL
        out = {
            'media': float(g['salsum'][i]) / nsal if ok else None,
            'mediana': percentil(g['bins'][i], .5, self.edges) if ok else None,
            'n_sal': nsal,
        }
        if com_pcts:
            for nome, p in PCTS:
                out[nome] = percentil(g['bins'][i], p, self.edges) if ok else None
        return out


def _contagens(g, i):
    adm, dem = _inteiro(g['adm'][i]), _inteiro(g['dem'][i])
    return {'admissoes': adm, 'demissoes': dem, 'saldo': adm - dem}


# ---------------------------------------------------------------- saídas

def _sem_porte(dims, filters):
    return set(dims.get('porte_indisponivel', [])) if filters.get('porte') else set()


def _periodos_do_recorte(dims, filters):
    if filters.get('periodo'):  # período explícito vale mesmo sem porte informado
        return [p for p in dims['periodos'] if p == filters['periodo']]
    sem = _sem_porte(dims, filters)
    pers = [p for p in dims['periodos'] if p not in sem]
    if filters.get('ano'):
        return [p for p in pers if p[:4] == str(filters['ano'])]
    return list(pers)


def _kpis(x):
    c = x.c
    m = x.mask(IGN['kpis'])
    tot = x.grupo(m, np.zeros(len(m), dtype=np.int64), 1)
    pers = _periodos_do_recorte(x.dims, x.filters)
    ref = pers[-1] if pers else None
    ult_idx = x.dims['periodos'].index(ref) if ref else -1
    ult = x.grupo(m & (c['per'] == ult_idx), np.zeros(len(m), dtype=np.int64), 1)
    sal = x.salario(tot, 0)
    adm = m & (c['mov'] == 1)
    sexo = x.dims['sexo']
    masc = c['n'][adm & (c['sexo'] == sexo.index('Masculino'))].sum()
    inf = c['n'][adm & (c['sexo'] != sexo.index('Não informado'))].sum()
    com_idade = adm & (c['faixa'] != x.dims['faixa'].index('Não informado'))
    n_idade = c['n'][com_idade].sum()
    return {
        'periodo_referencia': ref,
        'ultimo_mes': _contagens(ult, 0),
        'acumulado': _contagens(tot, 0),
        'salario': {'media': sal['media'], 'mediana': sal['mediana'], 'n': sal['n_sal']},
        'perfil': {
            'pct_masculino': _razao(masc, inf),
            'idade_media': _razao(c['idade'][com_idade].sum(), n_idade, 1.0),
        },
    }


def _timeseries(x):
    m = x.mask(IGN['tempo'])
    g = x.grupo(m, x.c['per'], x.n_per)
    out, acum = [], 0
    for i, p in enumerate(x.dims['periodos']):
        if g['cells'][i] == 0:
            continue
        r = _contagens(g, i)
        acum += r['saldo']
        s = x.salario(g, i)
        out.append({'periodo': p, **r, 'saldo_acumulado': acum,
                    'salario_medio': s['media'], 'salario_mediana': s['mediana'], 'n_sal': s['n_sal']})
    return out


def _yearly(x):
    m = x.mask(IGN['tempo'])
    anos = sorted({int(p[:4]) for p in x.dims['periodos']})
    a0 = anos[0]
    key = np.where(x.c['ano'] >= a0, x.c['ano'] - a0, len(anos))
    g = x.grupo(m, key, len(anos) + 1)
    out = []
    for i, a in enumerate(anos):
        if g['cells'][i] == 0:
            continue
        s = x.salario(g, i)
        out.append({'ano': a, **_contagens(g, i), 'salario_medio': s['media'], 'n_sal': s['n_sal']})
    return out


def _seasonality(x):
    m = x.mask(IGN['tempo'])
    g = x.grupo(m, x.c['mes'], 13)  # 0 = período desconhecido
    n_anos = [len({p[:4] for p in x.dims['periodos'] if int(p[5:7]) == mes and p not in x.sem_porte})
              for mes in range(13)]
    linhas = []
    for mes in range(1, 13):
        div = n_anos[mes]
        adm = g['adm'][mes] / div if div else 0.0
        dem = g['dem'][mes] / div if div else 0.0
        linhas.append({'mes': mes, 'mes_nome': MES_NOME[mes - 1],
                       'admissoes': float(adm), 'demissoes': float(dem), 'saldo': float(adm - dem)})
    media = sum(r['admissoes'] for r in linhas) / 12
    for r in linhas:
        r['indice'] = _razao(r['admissoes'], media)
    return linhas


def _by_cadeia(x):
    c = x.c
    m = x.mask(IGN['cadeia'])
    g = x.grupo(m, c['cad'], x.n_cad)
    n_sub = x.distintos(m, c['cad'], x.n_cad, c['sub'], x.n_sub)
    n_mun = x.distintos(m, c['cad'], x.n_cad, c['mun'], x.n_mun)
    total_adm = g['adm'][:-1].sum()
    out = []
    for i, cad in enumerate(x.dims['cadeias']):
        if g['cells'][i] == 0:
            continue
        s, r = x.salario(g, i), _contagens(g, i)
        out.append({'cadeia': cad['nome'], 'cor': cad.get('cor'), 'descricao': cad.get('descricao'), **r,
                    'salario_medio': s['media'], 'salario_mediana': s['mediana'], 'n_sal': s['n_sal'],
                    'n_subclasses': int(n_sub[i]), 'n_municipios': int(n_mun[i]),
                    'pct_admissoes': _razao(r['admissoes'], total_adm)})
    idx = {c['nome']: i for i, c in enumerate(x.dims['cadeias'])}
    return sorted(out, key=lambda r: (-r['admissoes'], idx[r['cadeia']]))


def _salary_distribution(x):
    m = x.mask(IGN['cadeia'])
    g = x.grupo(m, x.c['cad'], x.n_cad)
    out = []
    for i, cad in enumerate(x.dims['cadeias']):
        if g['cells'][i] == 0:
            continue
        s = x.salario(g, i, com_pcts=True)
        out.append({'cadeia': cad['nome'], **{k: s[k] for k, _ in PCTS}, 'mean': s['media'], 'n_sal': s['n_sal']})
    return out


def _by_cnae(x):
    c = x.c
    m = x.mask(IGN['cnae'])
    g = x.grupo(m, c['sub'], x.n_sub)
    n_mun = x.distintos(m, c['sub'], x.n_sub, c['mun'], x.n_mun)
    out = []
    for i, sub in enumerate(x.dims['subclasses']):
        if g['cells'][i] == 0:
            continue
        s = x.salario(g, i)
        out.append({'cnae': sub['cod'], 'descricao': sub.get('descricao'), 'cadeia': x.cads[sub['cadeia']],
                    **_contagens(g, i), 'salario_medio': s['media'], 'salario_mediana': s['mediana'],
                    'n_sal': s['n_sal'], 'n_municipios': int(n_mun[i])})
    return out


def _by_municipio(x):
    """byMunicipio ignora `mun`, mas aplica reg = reg(mun) implicitamente (§6)."""
    c = x.c
    m = x.mask(IGN['mun'])
    mun_f = x.filters.get('mun')
    if mun_f is not None:
        cods = [mm['cod'] for mm in x.dims['municipios']]
        reg_do_mun = x.mun_reg[cods.index(str(mun_f))] if str(mun_f) in cods else -2
        m &= c['reg'] == reg_do_mun
    g = x.grupo(m, c['mun'], x.n_mun)
    # admissões por (município, cadeia) para a cadeia dominante
    mc = np.bincount(c['mun'][m] * x.n_cad + c['cad'][m], weights=c['n'][m] * (c['mov'][m] == 1),
                     minlength=x.n_mun * x.n_cad).reshape(x.n_mun, x.n_cad)[:, :-1]
    mc = np.rint(mc)
    out = []
    for i, mm in enumerate(x.dims['municipios']):
        if g['cells'][i] == 0:
            continue
        s = x.salario(g, i)
        mx = mc[i].max()
        dom = [x.cads[j] for j in np.flatnonzero(mc[i] == mx)] if mx > 0 else []
        out.append({'codigo': mm['cod'], 'nome': mm['nome'], 'reg': mm['reg'], 'meso': mm['meso'],
                    **_contagens(g, i), 'salario_medio': s['media'], 'n_sal': s['n_sal'],
                    'cadeia_dominante': dom[0] if dom else None,
                    # empates aceitáveis (None = qualquer valor, sem admissões positivas)
                    '_cadeia_dominante_empates': dom or None})
    return out


def _by_dim(x, ign, key_arr, labels, campo):
    m = x.mask(IGN[ign])
    nk = len(labels)
    g = x.grupo(m, key_arr, nk)
    total = g['adm'].sum()
    out = []
    for i, lab in enumerate(labels):
        if g['cells'][i] == 0:
            continue
        s, r = x.salario(g, i), _contagens(g, i)
        out.append({campo: lab, **r, 'salario_medio': s['media'], 'salario_mediana': s['mediana'],
                    'n_sal': s['n_sal'], 'pct': _razao(r['admissoes'], total)})
    return out


def _cross_cadeia_sexo(x):
    c = x.c
    m = x.mask(IGN['cadeia_sexo'])
    ns = len(x.dims['sexo'])
    g = x.grupo(m, c['cad'] * ns + c['sexo'], x.n_cad * ns)
    out = []
    for i, cad in enumerate(x.cads):
        for j, sx in enumerate(x.dims['sexo']):
            k = i * ns + j
            if g['cells'][k] == 0:
                continue
            s = x.salario(g, k)
            out.append({'cadeia': cad, 'sexo': sx, **_contagens(g, k),
                        'salario_medio': s['media'], 'n_sal': s['n_sal']})
    return out


def _timeseries_cadeia(x):
    c = x.c
    m = x.mask(IGN['tempo'])
    g = x.grupo(m, c['per'] * x.n_cad + c['cad'], x.n_per * x.n_cad)
    out = []
    for i, p in enumerate(x.dims['periodos']):
        for j, cad in enumerate(x.cads):
            k = i * x.n_cad + j
            if g['cells'][k]:
                out.append({'periodo': p, 'cadeia': cad, **_contagens(g, k)})
    return out


def compute_prepared(cells, dims, filters):
    """Todas as saídas do §6 para um estado de filtros, a partir de prepare()."""
    x = _Ctx(cells, dims, filters)
    c, d = x.c, dims
    by_mun = _by_municipio(x)
    top = sorted(by_mun, key=lambda r: (-r['admissoes'], r['codigo']))[:20]
    return {
        'kpis': _kpis(x),
        'timeseries': _timeseries(x),
        'yearly': _yearly(x),
        'seasonality': _seasonality(x),
        'byCadeia': _by_cadeia(x),
        'byCnae': _by_cnae(x),
        'byMunicipio': by_mun,
        'topMunicipios': top,
        'bySexo': _by_dim(x, 'sexo', c['sexo'], d['sexo'], 'sexo'),
        'byFaixaEtaria': _by_dim(x, 'faixa', c['faixa'], d['faixa'], 'faixa'),
        'byEscolaridade': _by_dim(x, 'escolaridade', c['esc'], d['escolaridade'], 'escolaridade'),
        'byPorte': _by_dim(x, 'porte', c['porte'], d['porte'], 'porte'),
        'crossCadeiaSexo': _cross_cadeia_sexo(x),
        'timeseriesCadeia': _timeseries_cadeia(x),
        'salaryDistribution': _salary_distribution(x),
    }


def compute(fact_df, dims, filters):
    """Atalho: prepara o fato e calcula as saídas (use prepare() uma vez em lote)."""
    return compute_prepared(prepare(fact_df, dims), dims, filters)
