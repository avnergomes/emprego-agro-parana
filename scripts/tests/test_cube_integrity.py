"""
Integridade cubo x fato (contrato §2–4):
- Σn do cubo por (competência, mov) == Σw do fato; Σsal e Σidade idem, recalculados aqui
  de forma independente pela regra salarial do MTE e pela faixa de idade válida.
- todo município/subclasse do cubo existe em dims; dims tem os 399 municípios.
- regras de linha (sbin, intermitente, EXC, omissão de linhas zeradas) num fato sintético.
"""

import json
import os
import sys
import unittest

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import cnae_cadeias as cc  # noqa: E402
from build_cube import CUBO_DIR, DIMS_PATH, linhas_do_cubo, montar_dims, carregar_regionais  # noqa: E402
from build_fact import FACT_PATH  # noqa: E402

SM = {'2026-07': 1621.0}
EXISTE = os.path.exists(FACT_PATH) and os.path.exists(DIMS_PATH)


def carregar_cubo():
    with open(DIMS_PATH, encoding='utf-8') as f:
        dims = json.load(f)
    partes = []
    for reg in dims['regionais']:
        caminho = os.path.join(CUBO_DIR, reg['file'])
        with open(caminho, encoding='utf-8') as f:
            d = json.load(f)
        assert os.path.getsize(caminho) == reg['bytes'], reg['file']
        assert d.get('version') == dims['version'], reg['file']
        df = pd.DataFrame({k: v for k, v in d.items() if k not in ('n_rows', 'version')})
        assert len(df) == d['n_rows'], reg['file']
        partes.append(df.assign(reg=reg['nome']))
    return dims, pd.concat(partes, ignore_index=True)


@unittest.skipUnless(EXISTE, 'fato ou dims ausentes')
class TestIntegridade(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fato = pd.read_parquet(FACT_PATH)
        cls.dims, cls.cubo = carregar_cubo()
        cls.cubo['competencia'] = np.array(cls.dims['periodos'])[cls.cubo['per']]

    def test_somas_por_competencia_e_mov(self):
        f = self.fato
        sm = f['competencia'].map(cc.salario_minimo).astype(float)
        sal = f['salario'].astype(float)
        regra = ((f['mov'] == 1) & (f['intermitente'].fillna(0) != 1)
                 & (sal >= 0.3 * sm) & (sal <= 150 * sm)).fillna(False)
        idade = f['idade'].astype(float)
        idade_ok = ((f['mov'] == 1) & (idade >= 14) & (idade <= 99)).fillna(False)
        esperado = pd.DataFrame({
            'competencia': f['competencia'], 'mov': f['mov'], 'n': f['w'].astype(int),
            'sal': np.where(regra, f['w'] * sal, 0.0),
            'idade': np.where(idade_ok, f['w'] * idade, 0.0),
        }).groupby(['competencia', 'mov'])[['n', 'sal', 'idade']].sum()
        obtido = self.cubo.groupby(['competencia', 'mov'])[['n', 'sal', 'idade']].sum()
        obtido, esperado = obtido.align(esperado, fill_value=0)
        self.assertTrue((obtido['n'] == esperado['n']).all())
        self.assertTrue((obtido['idade'] == esperado['idade']).all())
        # sal é arredondado a 2 casas por linha do cubo
        self.assertLess(float((obtido['sal'] - esperado['sal']).abs().max()), 0.01 * 1000)
        self.assertEqual(int(self.cubo['n'].sum()), int(self.fato['w'].sum()))

    def test_codigos_existem_em_dims(self):
        self.assertEqual(len(self.dims['municipios']), 399)
        self.assertIn('411570', {m['cod'] for m in self.dims['municipios']})
        self.assertTrue(self.cubo['mun'].between(0, 398).all())
        self.assertTrue(self.cubo['sub'].between(0, len(self.dims['subclasses']) - 1).all())
        self.assertTrue(self.cubo['per'].between(0, len(self.dims['periodos']) - 1).all())
        codm = {m['cod'] for m in self.dims['municipios']}
        cods = {s['cod'] for s in self.dims['subclasses']}
        self.assertTrue(set(self.fato['municipio']) <= codm)
        self.assertTrue(set(self.fato['subclasse']) <= cods)
        # município sempre no arquivo da sua regional
        reg = np.array([m['reg'] for m in self.dims['municipios']])[self.cubo['mun']]
        self.assertTrue((reg == self.cubo['reg'].to_numpy()).all())

    def test_ordem_e_sem_linhas_zeradas(self):
        self.assertFalse(((self.cubo['n'] == 0) & (self.cubo['sal'] == 0) & (self.cubo['idade'] == 0)).any())
        for _, parte in self.cubo.groupby('reg'):
            chave = parte[['mun', 'per', 'sub', 'mov', 'sexo', 'faixa', 'esc', 'porte', 'sbin']]
            self.assertTrue(chave.apply(tuple, axis=1).is_monotonic_increasing)


class TestRegrasDeLinha(unittest.TestCase):
    def test_fato_sintetico(self):
        dims = montar_dims(carregar_regionais(), ['2026-07'])
        base = dict(fonte='MOV', decl='202607', competencia='2026-07', w=1, mov=1, municipio='410010',
                    subclasse='0115600', sexo=1, idade=30, escolaridade=7, porte=3, raca_cor=1,
                    tipo_mov=97, salario=2000.0, intermitente=0, parcial=0, aprendiz=0, cbo='622020')
        linhas = [
            base,                                                # sbin 12 ([2000, 2200))
            {**base, 'salario': 1999.99, 'sexo': 3},              # sbin 11
            {**base, 'intermitente': 1, 'idade': 40},             # fora da regra salarial
            {**base, 'salario': 0.3 * 1621 - 0.01, 'idade': 50},  # abaixo de 0,3 SM
            {**base, 'idade': 13, 'salario': 1500.0},             # idade inválida -> Não informado; sbin 7
            {**base, 'mov': -1, 'tipo_mov': 31, 'idade': 25},     # desligamento: sem sal/idade
            {**base, 'fonte': 'EXC', 'w': -1, 'idade': 60, 'salario': 3000.0},  # EXC...
            {**base, 'idade': 60, 'salario': 3000.0},            # ...cancela este: linha omitida
            {**base, 'sexo': 9, 'escolaridade': 99, 'porte': 99, 'idade': None, 'salario': None},
        ]
        fato = pd.DataFrame(linhas).astype({'idade': 'Int16', 'salario': 'float64', 'intermitente': 'Int8',
                                            'sexo': 'Int16', 'escolaridade': 'Int16', 'porte': 'Int16'})
        c = linhas_do_cubo(fato, dims)
        self.assertEqual(int(c['n'].sum()), 7)
        self.assertEqual(len(c), 7)  # o par MOV/EXC idêntico some
        lab = lambda col, lista: [lista[i] for i in c[col]]  # noqa: E731
        self.assertEqual(sorted(c.loc[c['sbin'] > 0, 'sbin'].tolist()), [7, 11, 12])
        self.assertAlmostEqual(float(c['sal'].sum()), 5499.99, places=2)
        self.assertEqual(int(c['idade'].sum()), 30 + 30 + 40 + 50)
        self.assertEqual(lab('faixa', cc.FAIXA_LABELS).count('Não informado'), 2)
        self.assertIn('Não informado', lab('sexo', cc.SEXO_LABELS))
        self.assertIn('Feminino', lab('sexo', cc.SEXO_LABELS))
        ni = c[c['sexo'] == 2].iloc[0]
        self.assertEqual(cc.ESCOLARIDADE_LABELS[int(ni['esc'])], 'Não informado')
        self.assertEqual(cc.PORTE_LABELS[int(ni['porte'])], 'Não informado')
        self.assertEqual(cc.PORTE_LABELS[int(c.iloc[0]['porte'])], 'De 5 a 9')

    def test_sbin_limites(self):
        dims = montar_dims(carregar_regionais(), ['2026-07'])
        sal = [490.0, 999.99, 1000.0, 50000.0, 240000.0]
        fato = pd.DataFrame({'fonte': 'MOV', 'decl': '202607', 'competencia': '2026-07', 'w': 1, 'mov': 1,
                             'municipio': '410010', 'subclasse': '0115600', 'sexo': 1, 'idade': 30,
                             'escolaridade': 7, 'porte': 3, 'salario': sal, 'intermitente': 0})
        c = linhas_do_cubo(fato.astype({'idade': 'Int16', 'intermitente': 'Int8'}), dims)
        # mesma faixa agrega na mesma linha: [0,1000) x2, [1000,1100), aberto >= 50000 x2
        self.assertEqual(dict(zip(c['sbin'], c['n'])), {1: 2, 2: 1, 26: 2})


if __name__ == '__main__':
    unittest.main()
