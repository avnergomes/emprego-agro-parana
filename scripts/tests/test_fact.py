"""
build_fact / caged_ftp: LIST do IIS, lacunas de MOV, e execução incremental ponta a ponta
com arquivos .7z sintéticos (substitui as linhas do arquivo alterado, sem duplicar).
"""

import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest import mock

import pandas as pd
import py7zr

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import build_fact as bf  # noqa: E402
import caged_ftp  # noqa: E402

CAB_MOV = ('competênciamov;região;uf;município;seção;subclasse;saldomovimentação;cbo2002ocupação;categoria;'
           'graudeinstrução;idade;horascontratuais;raçacor;sexo;tipoempregador;tipoestabelecimento;'
           'tipomovimentação;tipodedeficiência;indtrabintermitente;indtrabparcial;salário;tamestabjan;'
           'indicadoraprendiz;origemdainformação;competênciadec;indicadordeforadoprazo;'
           'unidadesaláriocódigo;valorsaláriofixo')


def linha(comp, uf='41', mun='410010', secao='A', sub='115600', saldo='1', sal='2116,82', idade='30'):
    return (f'{comp};4;{uf};{mun};{secao};{sub};{saldo};622020;101;7;{idade};44,00;1;1;0;1;97;0;0;0;'
            f'{sal};3;0;1;{comp};0;5;{sal}')


def gravar_7z(pasta, nome, linhas):
    txt = os.path.join(pasta, nome.replace('.7z', '.txt'))
    with open(txt, 'w', encoding='utf-8', newline='') as f:
        f.write(CAB_MOV + '\r\n' + '\r\n'.join(linhas) + '\r\n')
    with py7zr.SevenZipFile(os.path.join(pasta, nome), 'w') as z:
        z.write(txt, os.path.basename(txt))
    os.remove(txt)


class TestUtilitarios(unittest.TestCase):
    def test_parse_list_iis(self):
        itens = caged_ftp.parse_list([
            '09-29-26  02:42PM       <DIR>          202608',
            '09-29-26  02:42PM             50894750 CAGEDMOV202608.7z',
            '11-30-21  03:56PM                 1084 Leia-me.txt',
        ])
        self.assertEqual(itens[0], ('202608', None, '09-29-26 02:42PM'))
        self.assertEqual(itens[1], ('CAGEDMOV202608.7z', 50894750, '09-29-26 02:42PM'))

    def test_ultimo_e_lacunas(self):
        nomes = {'CAGEDMOV202001.7z', 'CAGEDMOV202003.7z', 'CAGEDFOR202004.7z'}
        self.assertEqual(caged_ftp.ultimo_publicado(dict.fromkeys(nomes)), '202003')
        self.assertEqual(bf.lacunas_mov(nomes, '202003'), ['202002'])
        self.assertEqual(bf.meses('202011', '202102'), ['202011', '202012', '202101', '202102'])

    def test_mudou(self):
        a = {'size': 10, 'date': '09-29-26 02:42PM'}
        self.assertTrue(bf.mudou(None, a))
        self.assertFalse(bf.mudou(a, dict(a)))
        self.assertTrue(bf.mudou(a, {**a, 'size': 11}))
        self.assertTrue(bf.mudou(a, {**a, 'date': '10-01-26 01:00PM'}))
        self.assertFalse(bf.mudou({'size': 10, 'date': ''}, a))  # execução offline anterior


class TestIncremental(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = self.tmp.name
        self.cache = os.path.join(base, 'cache')
        os.makedirs(self.cache)
        fact_dir = os.path.join(base, 'fact')
        self.patches = [
            mock.patch.object(bf, 'FACT_DIR', fact_dir),
            mock.patch.object(bf, 'FACT_PATH', os.path.join(fact_dir, 'f.parquet')),
            mock.patch.object(bf, 'MANIFEST_PATH', os.path.join(fact_dir, 'manifest.json')),
        ]
        for p in self.patches:
            p.start()
        # duas linhas idênticas = dois movimentos (sem drop_duplicates); filtros uf/seção
        gravar_7z(self.cache, 'CAGEDMOV202001.7z', [
            linha('202001'), linha('202001'), linha('202001', uf='35'), linha('202001', secao='C'),
            linha('202001', saldo='-1', sal='', idade=''),
        ])
        gravar_7z(self.cache, 'CAGEDMOV202002.7z', [linha('202002', mun='411570', sub='1511201')])

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def rodar(self):
        with redirect_stdout(io.StringIO()) as out, redirect_stderr(io.StringIO()):
            rc = bf.construir(bf.listar_cache(self.cache), self.cache, online=False)
        return rc, out.getvalue(), pd.read_parquet(bf.FACT_PATH)

    def test_incremental(self):
        rc, out, fato = self.rodar()
        self.assertEqual(rc, 0)
        self.assertEqual(len(fato), 4)
        self.assertEqual(fato.loc[fato['decl'] == '202001', 'mov'].tolist(), [1, 1, -1])
        r = fato.iloc[0]
        self.assertEqual((r['municipio'], r['subclasse'], r['competencia']), ('410010', '0115600', '2020-01'))
        self.assertAlmostEqual(r['salario'], 2116.82)
        self.assertTrue(pd.isna(fato.loc[fato['mov'] == -1, 'idade']).all())

        rc, out, fato2 = self.rodar()  # nada mudou: nada a processar
        self.assertIn('0 a processar', out)
        self.assertEqual(len(fato2), 4)

        gravar_7z(self.cache, 'CAGEDMOV202002.7z', [linha('202002')] * 3)  # republicação
        rc, out, fato3 = self.rodar()
        self.assertIn('1 a processar', out)
        self.assertEqual((fato3['decl'] == '202002').sum(), 3)
        self.assertEqual((fato3['decl'] == '202001').sum(), 3)

    def test_lacuna_de_mov_falha(self):
        gravar_7z(self.cache, 'CAGEDMOV202004.7z', [linha('202004')])
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            rc = bf.construir(bf.listar_cache(self.cache), self.cache, online=False)
        self.assertEqual(rc, 1)


if __name__ == '__main__':
    unittest.main()
