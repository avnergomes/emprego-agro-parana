"""
Âncora oficial: PR, seção A, competência 2026-08, só o arquivo CAGEDMOV202608
-> saldo -73 (CNA/MTE). O PR total (todas as seções) não está no fato; só a seção A é ancorada.
"""

import os
import sys
import unittest

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

from build_fact import FACT_PATH  # noqa: E402

FATO = pd.read_parquet(FACT_PATH) if os.path.exists(FACT_PATH) else None
TEM_202608 = FATO is not None and ((FATO['fonte'] == 'MOV') & (FATO['decl'] == '202608')).any()


@unittest.skipUnless(TEM_202608, 'fato sem CAGEDMOV202608')
class TestAncora(unittest.TestCase):
    def test_saldo_pr_secao_a_202608(self):
        f = FATO[(FATO['fonte'] == 'MOV') & (FATO['decl'] == '202608') & (FATO['competencia'] == '2026-08')]
        saldo = int((f['w'] * f['mov']).sum())
        self.assertEqual(saldo, -73)

    def test_mov_so_tem_a_propria_competencia(self):
        mov = FATO[FATO['fonte'] == 'MOV']
        self.assertTrue((mov['competencia'].str.replace('-', '') == mov['decl']).all())


if __name__ == '__main__':
    unittest.main()
