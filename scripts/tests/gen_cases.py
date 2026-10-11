"""
Gera scripts/tests/cases.json (seed fixa) a partir de dims.json real e do fato.

Grupos de casos:
  a-*  cada valor de cada dimensão sozinho (municípios, subclasses e períodos amostrados)
  b-*  todos os pares de tipos de dimensão (ano×periodo excluído), 3 combinações cada;
       mun×reg/meso, reg×meso e cadeia×cnae com combinação coerente E incoerente
  c-*  300 combinações aleatórias de 3 a 7 filtros
  d-*  degenerados (recorte vazio, porte em 2026-08, município raro, todos, nenhum)

Uso: py -3.12 -X utf8 scripts/tests/gen_cases.py [--fact F] [--dims D] [--out O]
"""
import argparse
import itertools
import json
import os
import random

import pandas as pd

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
SEED = 20261011
DIMS_TIPOS = ['meso', 'reg', 'mun', 'cadeia', 'cnae', 'ano', 'periodo', 'sexo', 'faixa', 'escolaridade', 'porte']
# 411570 era tido como sem dados; no fato real tem 1 registro (FOR 2022-02). Todos os 399 têm dados.
MUN_RARO = '411570'


class Gerador:
    def __init__(self, dims, fato, rng):
        self.d, self.rng = dims, rng
        self.mun = {m['cod']: m for m in dims['municipios']}
        self.sub_cad = {s['cod']: dims['cadeias'][s['cadeia']]['nome'] for s in dims['subclasses']}
        self.valores = {
            'meso': list(dims['mesos']),
            'reg': [r['nome'] for r in dims['regionais']],
            'mun': [m['cod'] for m in dims['municipios']],
            'cadeia': [c['nome'] for c in dims['cadeias']],
            'cnae': [s['cod'] for s in dims['subclasses']],
            'ano': sorted({p[:4] for p in dims['periodos']}),
            'periodo': list(dims['periodos']),
            'sexo': list(dims['sexo']),
            'faixa': list(dims['faixa']),
            'escolaridade': list(dims['escolaridade']),
            'porte': list(dims['porte']),
        }
        mun_cod = fato['municipio'].astype('string').str.zfill(6)
        sub_cod = fato['subclasse'].astype('string').str.zfill(7)
        self.mun_freq = mun_cod.value_counts()            # registros por município
        self.sub_freq = sub_cod.value_counts()
        self.mun_com_dados = [c for c in self.mun_freq.index if c in self.mun]
        self.fato = fato.assign(municipio=mun_cod, subclasse=sub_cod)
        self.casos = []

    def add(self, cid, filtros):
        self.casos.append({'id': cid, 'filters': filtros})

    # ------------------------------------------------------------ (a)
    def singles(self):
        for dim in ['meso', 'reg', 'cadeia', 'ano', 'sexo', 'faixa', 'escolaridade', 'porte']:
            for v in self.valores[dim]:
                self.add(f'a-{dim}-{v}', {dim: v})
        for cod in self.amostra_mun():
            self.add(f'a-mun-{cod}', {'mun': cod})
        for cod in self.amostra_sub():
            self.add(f'a-cnae-{cod}', {'cnae': cod})
        pers = self.valores['periodo']
        resto = self.rng.sample([p for p in pers[1:-1]], 13)
        for p in sorted({pers[0], pers[-1], *resto}):
            self.add(f'a-periodo-{p}', {'periodo': p})

    def amostra_mun(self):
        maiores = self.mun_com_dados[:10]
        pequenos = self.mun_com_dados[-20:]
        escolhidos = list(dict.fromkeys(maiores + pequenos + [MUN_RARO]))
        resto = [c for c in self.valores['mun'] if c not in escolhidos]
        return escolhidos + self.rng.sample(resto, 60 - len(escolhidos))

    def amostra_sub(self):
        presentes = [c for c in self.sub_freq.index if c in self.sub_cad]
        ausentes = [c for c in self.valores['cnae'] if c not in self.sub_freq.index]
        escolhidos = list(dict.fromkeys(presentes[:10] + presentes[-15:] + ausentes[:3]))
        resto = [c for c in self.valores['cnae'] if c not in escolhidos]
        return escolhidos + self.rng.sample(resto, 40 - len(escolhidos))

    # ------------------------------------------------------------ (b)
    def valor(self, dim):
        if dim == 'mun' and self.rng.random() < 0.8:
            return self.rng.choice(self.mun_com_dados)
        if dim == 'cnae' and self.rng.random() < 0.8:
            return self.rng.choice([c for c in self.sub_freq.index if c in self.sub_cad])
        return self.rng.choice(self.valores[dim])

    def coerente(self, d1, d2, base, quer):
        """Ajusta o par hierárquico (d1 → d2) para ficar coerente ou incoerente."""
        if d1 == 'mun':
            alvo = self.mun[base][d2]
        elif d1 == 'reg':
            alvo = next(r['meso'] for r in self.d['regionais'] if r['nome'] == base)
        else:  # cnae → cadeia
            alvo = self.sub_cad[base]
        if quer:
            return alvo
        return self.rng.choice([v for v in self.valores[d2] if v != alvo])

    def pares(self):
        hier = {('mun', 'reg'), ('mun', 'meso'), ('reg', 'meso'), ('cnae', 'cadeia')}
        for d1, d2 in itertools.combinations(DIMS_TIPOS, 2):
            if {d1, d2} == {'ano', 'periodo'}:
                continue
            par = next(((a, b) for a, b in hier if {a, b} == {d1, d2}), None)
            for i in range(3):
                if par:
                    a, b = par
                    va = self.valor(a)
                    # 0: coerente, 1: incoerente, 2: aleatório
                    vb = self.coerente(a, b, va, i == 0) if i < 2 else self.valor(b)
                    f = {a: va, b: vb}
                else:
                    f = {d1: self.valor(d1), d2: self.valor(d2)}
                self.add(f'b-{d1}-{d2}-{i}', f)

    # ------------------------------------------------------------ (c)
    def aleatorios(self, n=300):
        for i in range(n):
            k = self.rng.randint(3, 7)
            tipos = self.rng.sample(DIMS_TIPOS, k)
            if 'ano' in tipos and 'periodo' in tipos:
                tipos.remove(self.rng.choice(['ano', 'periodo']))
            f = {t: self.valor(t) for t in tipos}
            # metade das combinações hierárquicas fica coerente (senão quase tudo seria vazio)
            if 'mun' in f and self.rng.random() < 0.5:
                for h in ('reg', 'meso'):
                    if h in f:
                        f[h] = self.mun[f['mun']][h]
            if 'cnae' in f and 'cadeia' in f and self.rng.random() < 0.5:
                f['cadeia'] = self.sub_cad[f['cnae']]
            self.add(f'c-{i:03d}', f)

    # ------------------------------------------------------------ (d)
    def degenerados(self):
        cads = self.valores['cadeia']
        sub = next(c for c in self.sub_freq.index if c in self.sub_cad)
        outra = next(c for c in cads if c != self.sub_cad[sub])
        ultimo = self.valores['periodo'][-1]
        self.add('d-vazio-cadeia-cnae', {'cadeia': outra, 'cnae': sub})
        self.add('d-porte-ultimo-nao-informado', {'porte': 'Não informado', 'periodo': ultimo})
        self.add('d-porte-ultimo-1a4', {'porte': self.valores['porte'][1], 'periodo': ultimo})
        self.add('d-porte-1a4-ano-ultimo', {'porte': self.valores['porte'][1], 'ano': ultimo[:4]})
        self.add('d-mun-raro', {'mun': MUN_RARO})
        self.add('d-mun-raro-cadeia', {'mun': MUN_RARO, 'cadeia': cads[0]})
        self.add('d-todos-coerente', self.todos_de_um_registro())
        self.add('d-todos-aleatorio', {**{t: self.valor(t) for t in DIMS_TIPOS if t != 'ano'}})
        self.add('d-nenhum', {})
        self.add('d-periodo-inicial', {'periodo': self.valores['periodo'][0]})

    def todos_de_um_registro(self):
        """Todos os filtros (com período) tirados de uma admissão real: recorte não vazio."""
        f = self.fato
        cand = f[(f['mov'].astype(int) == 1) & (f['fonte'] == 'MOV') & f['municipio'].isin(self.mun)
                 & f['subclasse'].isin(self.sub_cad)]
        r = cand.iloc[self.rng.randrange(len(cand))]
        idade = int(r['idade']) if pd.notna(r['idade']) else -1
        lim = [18, 25, 30, 40, 50, 65, 100]
        faixa = self.valores['faixa'][-1] if not 14 <= idade <= 99 else \
            self.valores['faixa'][next(i for i, x in enumerate(lim) if idade < x)]
        esc_cod = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 80]
        e = int(r['escolaridade']) if pd.notna(r['escolaridade']) else -1
        p = int(r['porte']) if pd.notna(r['porte']) else -1
        sx = int(r['sexo']) if pd.notna(r['sexo']) else 9
        m = self.mun[r['municipio']]
        return {
            'meso': m['meso'], 'reg': m['reg'], 'mun': r['municipio'],
            'cadeia': self.sub_cad[r['subclasse']], 'cnae': r['subclasse'], 'periodo': str(r['competencia']),
            'sexo': self.valores['sexo'][{1: 0, 3: 1}.get(sx, 2)], 'faixa': faixa,
            'escolaridade': self.valores['escolaridade'][esc_cod.index(e) if e in esc_cod else -1],
            'porte': self.valores['porte'][p - 1 if 1 <= p <= 10 else -1],
        }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fact', default=os.path.join(RAIZ, 'data/fact/caged_agro_pr.parquet'))
    ap.add_argument('--dims', default=os.path.join(RAIZ, 'dashboard/public/data/v2/dims.json'))
    ap.add_argument('--out', default=os.path.join(AQUI, 'cases.json'))
    a = ap.parse_args()
    with open(a.dims, encoding='utf-8') as f:
        dims = json.load(f)
    fato = pd.read_parquet(a.fact, columns=['fonte', 'competencia', 'mov', 'municipio', 'subclasse',
                                            'sexo', 'idade', 'escolaridade', 'porte'])
    g = Gerador(dims, fato, random.Random(SEED))
    g.singles()
    g.pares()
    g.aleatorios()
    g.degenerados()
    ids = [c['id'] for c in g.casos]
    assert len(ids) == len(set(ids)), 'ids duplicados'
    for c in g.casos:
        assert not ('ano' in c['filters'] and 'periodo' in c['filters']), c
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(g.casos, f, ensure_ascii=False, indent=1)
    grupos = {}
    for i in ids:
        grupos[i[0]] = grupos.get(i[0], 0) + 1
    print(f'{len(ids)} casos → {a.out} {grupos}')


if __name__ == '__main__':
    main()
