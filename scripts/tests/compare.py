"""
Compara dois arquivos de resultados (ex.: oráculo × motor JS), caso a caso e saída a saída.

Uso:
    py -3.12 -X utf8 scripts/tests/compare.py A.json B.json [--max 30] [--tol-sal 0.01] [--tol-razao 0.05]

Aceita {"results": {id: saídas}} ou {id: saídas}. Regras:
- contagens exatas; salários (média/mediana/percentis) com tolerância --tol-sal;
- razões (pct, indice, idade_media, médias da sazonalidade) com --tol-razao e None ≡ 0
  (o contrato não fixa arredondamento; a v1 arredondava para 1 casa);
- listas comparadas por chave; linha ausente de um lado é tolerada se a do outro lado for
  toda zero (contrato não define listas densas × esparsas) e entra no resumo;
- topMunicipios: compara multiconjunto de admissões, conjunto acima do empate do 20º e cada
  item contra o byMunicipio do outro lado;
- campos iniciados por "_" são metadados do oráculo (ex.: empates da cadeia dominante).
Sai com código 1 se houver divergência.
"""
import argparse
import json
import math
import os
import sys
from collections import Counter, defaultdict

CONTAGEM = {'admissoes', 'demissoes', 'saldo', 'saldo_acumulado', 'n_sal', 'n', 'n_subclasses', 'n_municipios'}
SALARIO = {'salario_medio', 'salario_mediana', 'media', 'mediana', 'mean', 'p10', 'p25', 'p50', 'p75', 'p90'}
RAZAO = {'pct', 'pct_admissoes', 'pct_masculino', 'idade_media', 'indice'}
CHAVES = {
    'timeseries': ('periodo',), 'yearly': ('ano',), 'seasonality': ('mes',),
    'byCadeia': ('cadeia',), 'byCnae': ('cnae',), 'byMunicipio': ('codigo',),
    'bySexo': ('sexo',), 'byFaixaEtaria': ('faixa',), 'byEscolaridade': ('escolaridade',),
    'byPorte': ('porte',), 'crossCadeiaSexo': ('cadeia', 'sexo'),
    'timeseriesCadeia': ('periodo', 'cadeia'), 'salaryDistribution': ('cadeia',),
}
ZERO_IGNORA = {'saldo_acumulado'}  # acumulado não é zero numa linha ausente


def _e_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


class Comparador:
    def __init__(self, tol_sal, tol_razao):
        self.tol_sal, self.tol_razao = tol_sal, tol_razao
        self.div = []                      # (caso, saída, chave, campo, a, b)
        self.tolerados = Counter()         # linhas ausentes toleradas por saída

    def classe(self, saida, campo):
        if saida == 'seasonality' and campo in ('admissoes', 'demissoes', 'saldo'):
            return 'razao'  # médias mensais (não inteiras)
        if campo in CONTAGEM:
            return 'contagem'
        if campo in SALARIO:
            return 'salario'
        if campo in RAZAO:
            return 'razao'
        return 'exato'

    def igual(self, cls, a, b):
        if cls == 'contagem':
            return _e_num(a) and _e_num(b) and a == b
        if cls == 'razao':
            a, b = (0 if a is None else a), (0 if b is None else b)
            return _e_num(a) and _e_num(b) and math.isclose(a, b, abs_tol=self.tol_razao + 1e-9)
        if cls == 'salario':
            if a is None or b is None:
                return a is None and b is None
            return _e_num(a) and _e_num(b) and math.isclose(a, b, abs_tol=self.tol_sal + 1e-9)
        return a == b

    def linha(self, caso, saida, chave, ra, rb):
        for campo in sorted(set(ra) | set(rb)):
            if campo.startswith('_'):
                continue
            a, b = ra.get(campo), rb.get(campo)
            if campo == 'cadeia_dominante':
                emp = ra.get('_cadeia_dominante_empates', rb.get('_cadeia_dominante_empates', 'x'))
                if emp is None or (isinstance(emp, list) and (a in emp and b in emp)):
                    continue
            if campo not in ra or campo not in rb or not self.igual(self.classe(saida, campo), a, b):
                self.div.append((caso, saida, chave, campo, a, b))

    def zerada(self, saida, r):
        for campo, v in r.items():
            cls = self.classe(saida, campo)
            if campo in ZERO_IGNORA:
                continue
            if cls in ('contagem', 'razao') and v not in (0, None):
                return False
            if cls == 'salario' and v is not None:
                return False
        return True

    def lista(self, caso, saida, la, lb):
        ks = CHAVES[saida]
        da = {tuple(r.get(k) for k in ks): r for r in la}
        db = {tuple(r.get(k) for k in ks): r for r in lb}
        if len(da) != len(la) or len(db) != len(lb):
            self.div.append((caso, saida, None, 'chave duplicada', len(la) - len(da), len(lb) - len(db)))
        for chave in sorted(set(da) | set(db), key=str):
            ra, rb = da.get(chave), db.get(chave)
            if ra is None or rb is None:
                presente = ra if rb is None else rb
                if self.zerada(saida, presente):
                    self.tolerados[saida] += 1
                else:
                    self.div.append((caso, saida, chave, 'linha ausente', ra is not None, rb is not None))
                continue
            self.linha(caso, saida, chave, ra, rb)

    def top(self, caso, oa, ob):
        ta, tb = oa.get('topMunicipios', []), ob.get('topMunicipios', [])
        adm_a = sorted((r['admissoes'] for r in ta), reverse=True)
        adm_b = sorted((r['admissoes'] for r in tb), reverse=True)
        if adm_a != adm_b:
            self.div.append((caso, 'topMunicipios', None, 'admissoes (multiconjunto)', adm_a, adm_b))
            return
        corte = adm_a[-1] if adm_a else None
        acima = lambda t: {r['codigo'] for r in t if r['admissoes'] != corte}
        if acima(ta) != acima(tb):
            self.div.append((caso, 'topMunicipios', None, 'conjunto acima do empate', sorted(acima(ta)), sorted(acima(tb))))
        mun_a = {r['codigo']: r for r in oa.get('byMunicipio', [])}
        mun_b = {r['codigo']: r for r in ob.get('byMunicipio', [])}
        for r in tb:  # itens de B batem com o byMunicipio de A, e vice-versa
            if r['codigo'] in mun_a:
                self.linha(caso, 'topMunicipios', (r['codigo'],), mun_a[r['codigo']], r)
            else:
                self.div.append((caso, 'topMunicipios', (r['codigo'],), 'fora do byMunicipio de A', None, r))
        for r in ta:
            if r['codigo'] not in mun_b:
                self.div.append((caso, 'topMunicipios', (r['codigo'],), 'fora do byMunicipio de B', r, None))

    def objeto(self, caso, saida, a, b, prefixo=''):
        for campo in sorted(set(a) | set(b)):
            va, vb = a.get(campo), b.get(campo)
            nome = prefixo + campo
            if isinstance(va, dict) and isinstance(vb, dict):
                self.objeto(caso, saida, va, vb, nome + '.')
            elif campo not in a or campo not in b or not self.igual(self.classe(saida, campo), va, vb):
                self.div.append((caso, saida, None, nome, va, vb))

    def caso(self, caso, oa, ob):
        for saida in sorted(set(oa) | set(ob)):
            if saida not in oa or saida not in ob:
                self.div.append((caso, saida, None, 'saída ausente', saida in oa, saida in ob))
            elif saida == 'topMunicipios':
                self.top(caso, oa, ob)
            elif saida in CHAVES:
                self.lista(caso, saida, oa[saida], ob[saida])
            elif isinstance(oa[saida], dict):
                self.objeto(caso, saida, oa[saida], ob[saida])
            elif oa[saida] != ob[saida]:
                self.div.append((caso, saida, None, '(valor)', oa[saida], ob[saida]))


def _carrega(caminho):
    with open(caminho, encoding='utf-8') as f:
        d = json.load(f)
    return d.get('results', d)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('a')
    ap.add_argument('b')
    ap.add_argument('--max', type=int, default=30)
    ap.add_argument('--tol-sal', type=float, default=0.01)
    ap.add_argument('--tol-razao', type=float, default=0.05)
    ap.add_argument('--cases', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cases.json'))
    a = ap.parse_args()

    ra, rb = _carrega(a.a), _carrega(a.b)
    filtros = {}
    if os.path.exists(a.cases):
        with open(a.cases, encoding='utf-8') as f:
            filtros = {c['id']: c['filters'] for c in json.load(f)}
    cmp = Comparador(a.tol_sal, a.tol_razao)
    for caso in sorted(set(ra) | set(rb)):
        if caso not in ra or caso not in rb:
            cmp.div.append((caso, '*', None, 'caso ausente', caso in ra, caso in rb))
        else:
            cmp.caso(caso, ra[caso], rb[caso])

    por_saida = defaultdict(set)
    for caso, saida, *_ in cmp.div:
        por_saida[saida].add(caso)
    for caso, saida, chave, campo, va, vb in cmp.div[:a.max]:
        print(f'[{caso}] filtros={json.dumps(filtros.get(caso), ensure_ascii=False)} '
              f'{saida} chave={chave} {campo}: A={va!r} B={vb!r}')
    n_casos = len(set(ra) | set(rb))
    print(f'\nResumo: {n_casos} casos, {len(cmp.div)} divergências em '
          f'{len({d[0] for d in cmp.div})} casos')
    for saida in sorted(set(por_saida) | set(cmp.tolerados)):
        print(f'  {saida:20s} casos divergentes={len(por_saida.get(saida, ())):4d} '
              f'linhas ausentes toleradas (zeradas)={cmp.tolerados.get(saida, 0)}')
    sys.exit(1 if cmp.div else 0)


if __name__ == '__main__':
    main()
