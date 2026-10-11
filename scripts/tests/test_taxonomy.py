"""Taxonomia de cadeias e dicionários (contrato §1 e §7)."""

import os
import re
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

import cnae_cadeias as cc  # noqa: E402


class TestTaxonomia(unittest.TestCase):
    def test_cobertura_122_subclasses(self):
        cods = [s['cod'] for s in cc.SUBCLASSES]
        self.assertEqual(len(cods), 122)
        self.assertEqual(len(set(cods)), 122, 'chaves duplicadas na tabela CNAE')
        self.assertTrue(all(re.fullmatch(r'0[123]\d{5}', c) for c in cods))
        self.assertEqual(set(cc.CNAE_CADEIA), set(cods))
        self.assertEqual(set(cc.CNAE_CADEIA.values()), set(range(len(cc.CADEIAS))),
                         'toda cadeia deve ter ao menos uma subclasse')

    def test_regras_sem_sobreposicao_nem_codigo_fantasma(self):
        cods = {s['cod'] for s in cc.SUBCLASSES}
        vistos = set()
        for c in cc.CADEIAS:
            for r in c['regras']:
                if isinstance(r, str):
                    self.assertIn(r, cods, f'{r} ({c["nome"]}) não existe na tabela oficial')
                    self.assertNotIn(r, vistos)
                    vistos.add(r)

    def test_cadeias_com_cor_e_descricao(self):
        nomes = cc.CADEIA_NOMES
        self.assertEqual(len(nomes), 24)
        self.assertEqual(len(set(nomes)), len(nomes))
        cores = [c['cor'].upper() for c in cc.CADEIAS]
        self.assertEqual(len(set(cores)), len(cores), 'cores repetidas')
        for c in cc.CADEIAS:
            self.assertRegex(c['cor'], r'^#[0-9A-Fa-f]{6}$')
            self.assertTrue(c['descricao'].strip())

    def test_amostras_do_contrato(self):
        nome = lambda cod: cc.CADEIA_NOMES[cc.CNAE_CADEIA[cod]]  # noqa: E731
        casos = {
            '0119905': 'Grãos', '0115600': 'Sojicultura', '0119906': 'Outras Lavouras Temporárias',
            '0119903': 'Horticultura', '0119901': 'Fruticultura', '0135100': 'Outras Lavouras Permanentes',
            '0151203': 'Outras Criações', '0170900': 'Outras Criações', '0162801': 'Serviços à Pecuária',
            '0220906': 'Extrativismo Florestal', '0230600': 'Silvicultura', '0312404': 'Pesca',
            '0322199': 'Aquicultura', '0155505': 'Avicultura',
        }
        for cod, esperado in casos.items():
            self.assertEqual(nome(cod), esperado, cod)

    def test_acentos_utf8(self):
        descs = {s['cod']: s['descricao'] for s in cc.SUBCLASSES}
        self.assertEqual(descs['0111301'], 'Cultivo de arroz')
        self.assertIn('ç', descs['0161003'])  # "Serviço de preparação de terreno..."
        self.assertIn('Grãos', cc.CADEIA_NOMES)

    def test_dicionarios_oficiais(self):
        self.assertEqual(cc.RACA_COR[1], 'Branca')
        self.assertEqual(cc.RACA_COR[5], 'Indígena')
        self.assertTrue(cc.TIPO_MOVIMENTACAO[31].startswith('Desligamento'))
        self.assertEqual(len(cc.ESCOLARIDADE_LABELS), 13)
        self.assertEqual(cc.PORTE_LABELS[-2:], ['1000 ou mais', 'Não informado'])

    def test_faixa_e_sm(self):
        f = lambda i: cc.FAIXA_LABELS[cc.faixa_idx(i)]  # noqa: E731
        self.assertEqual(f(13), 'Não informado')
        self.assertEqual(f(14), 'Menor de 18')
        self.assertEqual(f(18), '18 a 24 anos')
        self.assertEqual(f(64), '50 a 64 anos')
        self.assertEqual(f(99), '65 anos ou mais')
        self.assertEqual(f(100), 'Não informado')
        self.assertEqual(f(float('nan')), 'Não informado')
        self.assertEqual(cc.salario_minimo('2020-01'), 1039)
        self.assertEqual(cc.salario_minimo('2023-04'), 1302)
        self.assertEqual(cc.salario_minimo('2023-05'), 1320)
        self.assertEqual(cc.salario_minimo('2026-08'), 1621)


if __name__ == '__main__':
    unittest.main()
