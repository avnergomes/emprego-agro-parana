"""
Dicionários oficiais do Novo CAGED (layout MTE) e taxonomia de cadeias produtivas.

Fonte única dos rótulos usados pelo pipeline v2 (ver docs/CONTRATO-DADOS.md §1, §3 e §7).
A tabela de subclasses da seção A (IBGE/CONCLA, 122 subclasses) fica em cnae_secao_a.csv.
"""

import bisect
import csv
import os
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CNAE_CSV = os.path.join(SCRIPT_DIR, 'cnae_secao_a.csv')

NAO_INFORMADO = 'Não informado'

# ---------------------------------------------------------------------------
# Dicionários oficiais (Layout Não-identificado Novo Caged Movimentação.xlsx)
# ---------------------------------------------------------------------------

# Rótulos exibidos seguem o contrato (Masculino/Feminino); códigos são os oficiais
# (1 Homem, 3 Mulher, 9 Não Identificado).
SEXO = {1: 'Masculino', 3: 'Feminino'}
SEXO_LABELS = ['Masculino', 'Feminino', NAO_INFORMADO]

RACA_COR = {
    1: 'Branca', 2: 'Preta', 3: 'Parda', 4: 'Amarela', 5: 'Indígena',
    6: 'Não informada', 9: 'Não identificado',
}

GRAU_INSTRUCAO = {
    1: 'Analfabeto',
    2: 'Até 5ª Incompleto',
    3: '5ª Completo Fundamental',
    4: '6ª a 9ª Fundamental',
    5: 'Fundamental Completo',
    6: 'Médio Incompleto',
    7: 'Médio Completo',
    8: 'Superior Incompleto',
    9: 'Superior Completo',
    10: 'Mestrado',
    11: 'Doutorado',
    80: 'Pós-Graduação completa',
}  # 99 = Não Identificado -> "Não informado"
ESCOLARIDADE_LABELS = list(GRAU_INSTRUCAO.values()) + [NAO_INFORMADO]

# tamestabjan: 90 Não Informado, 97 Não se Aplica, 98 Inválido, 99 Ignorado -> "Não informado"
PORTE = {
    1: 'Zero',
    2: 'De 1 a 4',
    3: 'De 5 a 9',
    4: 'De 10 a 19',
    5: 'De 20 a 49',
    6: 'De 50 a 99',
    7: 'De 100 a 249',
    8: 'De 250 a 499',
    9: 'De 500 a 999',
    10: '1000 ou mais',
}
PORTE_LABELS = list(PORTE.values()) + [NAO_INFORMADO]

TIPO_MOVIMENTACAO = {
    10: 'Admissão por primeiro emprego',
    20: 'Admissão por reemprego',
    25: 'Admissão por contrato trabalho prazo determinado',
    31: 'Desligamento por demissão sem justa causa',
    32: 'Desligamento por demissão com justa causa',
    33: 'Culpa Recíproca',
    35: 'Admissão por reintegração',
    40: 'Desligamento a pedido',
    43: 'Término contrato trabalho prazo determinado',
    45: 'Desligamento por Término de contrato',
    50: 'Desligamento por aposentadoria',
    60: 'Desligamento por morte',
    70: 'Admissão por transferência',
    80: 'Desligamento por transferência',
    90: 'Desligamento por Acordo entre empregado e empregador',
    97: 'Admissão de Tipo Ignorado',
    98: 'Desligamento de Tipo Ignorado',
    99: 'Não Identificado',
}

# ---------------------------------------------------------------------------
# Faixa etária e idade válida
# ---------------------------------------------------------------------------

IDADE_MIN, IDADE_MAX = 14, 99
# (limite superior inclusivo, rótulo). Idade fora de 14..99 ou ausente -> "Não informado",
# para que n_idade (faixa != Não informado) seja o mesmo denominador da idade média.
FAIXAS = [
    (17, 'Menor de 18'),
    (24, '18 a 24 anos'),
    (29, '25 a 29 anos'),
    (39, '30 a 39 anos'),
    (49, '40 a 49 anos'),
    (64, '50 a 64 anos'),
    (IDADE_MAX, '65 anos ou mais'),
]
FAIXA_LABELS = [rot for _, rot in FAIXAS] + [NAO_INFORMADO]
FAIXA_TETOS = [teto for teto, _ in FAIXAS]


def faixa_idx(idade):
    """Índice em FAIXA_LABELS para uma idade (None/NaN/fora de 14..99 -> Não informado)."""
    if idade is None or idade != idade or not (IDADE_MIN <= idade <= IDADE_MAX):
        return len(FAIXAS)
    return bisect.bisect_left(FAIXA_TETOS, idade)


# ---------------------------------------------------------------------------
# Salário mínimo por vigência e faixas salariais
# ---------------------------------------------------------------------------

SM_VIGENCIA = [
    ('2020-01', 1039), ('2020-02', 1045), ('2021-01', 1100), ('2022-01', 1212),
    ('2023-01', 1302), ('2023-05', 1320), ('2024-01', 1412), ('2025-01', 1518),
    ('2026-01', 1621),
]
_SM_INICIOS = [ini for ini, _ in SM_VIGENCIA]


def salario_minimo(competencia):
    """SM vigente na competência 'AAAA-MM' (antes de 2020-01 usa o de 2020-01)."""
    i = bisect.bisect_right(_SM_INICIOS, competencia) - 1
    return SM_VIGENCIA[max(i, 0)][1]


SAL_EDGES = [0, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2200,
             2400, 2600, 2800, 3000, 3500, 4000, 5000, 6000, 8000, 10000, 15000, 25000,
             50000, 250000]

# ---------------------------------------------------------------------------
# Taxonomia de cadeias (contrato §7). Ordem da lista = índice em dims.cadeias.
# Regras: código de 7 dígitos ou intervalo inclusivo (inicio, fim).
# ---------------------------------------------------------------------------

CADEIAS = [
    {'nome': 'Grãos', 'cor': '#E69F00', 'descricao': 'Arroz, milho, trigo, feijão e outros cereais',
     'regras': ['0111301', '0111302', '0111303', '0111399', '0119905']},
    {'nome': 'Sojicultura', 'cor': '#8C6D00', 'descricao': 'Cultivo de soja',
     'regras': ['0115600']},
    {'nome': 'Algodão e Fibras', 'cor': '#B39B77', 'descricao': 'Algodão herbáceo, juta e outras fibras',
     'regras': [('0112101', '0112199')]},
    {'nome': 'Cana-de-açúcar', 'cor': '#C9B21E', 'descricao': 'Cultivo de cana-de-açúcar',
     'regras': ['0113000']},
    {'nome': 'Fumo', 'cor': '#8A5A2B', 'descricao': 'Cultivo de fumo',
     'regras': ['0114800']},
    {'nome': 'Outras Lavouras Temporárias', 'cor': '#D98C5F',
     'descricao': 'Oleaginosas (exceto soja), mandioca e outras temporárias',
     'regras': [('0116401', '0116499'), '0119906', '0119999']},
    {'nome': 'Horticultura', 'cor': '#56A04A', 'descricao': 'Hortaliças, flores, alho, batata, cebola, tomate e melões',
     'regras': ['0121101', '0121102', '0122900', '0119902', '0119903', '0119904', '0119907',
                '0119908', '0119909']},
    {'nome': 'Fruticultura', 'cor': '#D55E00', 'descricao': 'Laranja, uva, abacaxi e outras frutas',
     'regras': ['0131800', '0132600', ('0133401', '0133499'), '0119901']},
    {'nome': 'Cafeicultura', 'cor': '#5B3A29', 'descricao': 'Cultivo de café',
     'regras': ['0134200']},
    {'nome': 'Outras Lavouras Permanentes', 'cor': '#6B8E23', 'descricao': 'Cacau, erva-mate e outras permanentes',
     'regras': ['0135100', ('0139301', '0139399')]},
    {'nome': 'Sementes e Mudas', 'cor': '#A6D854', 'descricao': 'Produção de sementes e mudas certificadas',
     'regras': ['0141501', '0141502', '0142300']},
    {'nome': 'Bovinocultura de Corte', 'cor': '#B2182B', 'descricao': 'Criação de bovinos para corte',
     'regras': ['0151201']},
    {'nome': 'Bovinocultura de Leite', 'cor': '#56B4E9', 'descricao': 'Criação de bovinos para leite',
     'regras': ['0151202']},
    {'nome': 'Ovinocaprinocultura', 'cor': '#CC79A7', 'descricao': 'Criação de ovinos e caprinos',
     'regras': ['0153901', '0153902']},
    {'nome': 'Suinocultura', 'cor': '#E7298A', 'descricao': 'Criação de suínos',
     'regras': ['0154700']},
    {'nome': 'Avicultura', 'cor': '#F0E442', 'descricao': 'Frangos, pintos de um dia, outras aves e ovos',
     'regras': [('0155501', '0155505')]},
    {'nome': 'Apicultura', 'cor': '#FDB863', 'descricao': 'Criação de abelhas',
     'regras': ['0159801']},
    {'nome': 'Outras Criações', 'cor': '#7570B3',
     'descricao': 'Bubalinos, equinos, outros animais, caça e bovinos não especializados',
     'regras': ['0151203', '0152101', '0152102', '0152103', '0159802', '0159803', '0159804',
                '0159899', '0170900']},
    {'nome': 'Serviços Agrícolas', 'cor': '#666666', 'descricao': 'Apoio à agricultura e pós-colheita',
     'regras': ['0161001', '0161002', '0161003', '0161099', '0163600']},
    {'nome': 'Serviços à Pecuária', 'cor': '#A3A3A3', 'descricao': 'Apoio à pecuária (inseminação, tosquia etc.)',
     'regras': ['0162801', '0162802', '0162803', '0162899']},
    {'nome': 'Silvicultura', 'cor': '#009E73', 'descricao': 'Florestas plantadas e apoio à produção florestal',
     'regras': [('0210101', '0210199'), '0230600']},
    {'nome': 'Extrativismo Florestal', 'cor': '#005A3C', 'descricao': 'Produção em florestas nativas',
     'regras': [('0220901', '0220999')]},
    {'nome': 'Pesca', 'cor': '#0072B2', 'descricao': 'Pesca em água salgada e doce',
     'regras': [('0311601', '0312499')]},
    {'nome': 'Aquicultura', 'cor': '#3FC1C9', 'descricao': 'Criação de peixes, camarões e outros organismos aquáticos',
     'regras': [('0321301', '0322199')]},
]
CADEIA_NOMES = [c['nome'] for c in CADEIAS]


def _casa(regra, cod):
    if isinstance(regra, tuple):
        return regra[0] <= cod <= regra[1]
    return regra == cod


# Topônimos que o lower() da descrição oficial (CAIXA ALTA) estraga
_NOMES_PROPRIOS = {'índia': 'Índia', 'pará': 'Pará'}


def carregar_subclasses(caminho=CNAE_CSV):
    """Lê a tabela oficial: lista de dicts {cod, descricao} ordenada por código."""
    with open(caminho, encoding='utf-8', newline='') as f:
        linhas = list(csv.DictReader(f))
    subs = []
    for r in linhas:
        d = r['subclasse_desc'].strip()
        desc = d[:1].upper() + d[1:].lower()
        desc = re.sub(r'\b(' + '|'.join(_NOMES_PROPRIOS) + r')\b',lambda m: _NOMES_PROPRIOS[m.group(1)], desc)
        subs.append({'cod': r['subclasse'].strip().zfill(7), 'descricao': desc})
    return sorted(subs, key=lambda s: s['cod'])


def mapear_cadeias(codigos):
    """
    Mapeia cada subclasse para o índice da cadeia.
    Ordem: regra explícita; senão, a cadeia única do grupo (prefixo de 4 dígitos) entre
    as subclasses já mapeadas. Levanta ValueError se sobrar subclasse sem cadeia ou se uma
    subclasse casar com mais de uma cadeia.
    """
    mapa = {}
    for cod in codigos:
        hits = [i for i, c in enumerate(CADEIAS) if any(_casa(r, cod) for r in c['regras'])]
        if len(hits) > 1:
            raise ValueError(f'subclasse {cod} em mais de uma cadeia: {hits}')
        if hits:
            mapa[cod] = hits[0]
    for cod in codigos:
        if cod in mapa:
            continue
        grupo = {i for c, i in mapa.items() if c[:4] == cod[:4]}
        if len(grupo) != 1:
            raise ValueError(f'subclasse {cod} sem cadeia (grupo {cod[:4]} -> {sorted(grupo)})')
        mapa[cod] = grupo.pop()
    return mapa


SUBCLASSES = carregar_subclasses()
CNAE_CADEIA = mapear_cadeias([s['cod'] for s in SUBCLASSES])
