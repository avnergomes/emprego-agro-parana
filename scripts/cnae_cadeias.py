"""
Mapeamento de CNAE Subclasse para Cadeias Produtivas
Permite agregação por cadeia mantendo granularidade máxima
"""

# Mapeamento CNAE Subclasse (7 dígitos) -> Cadeia Produtiva
CNAE_CADEIA = {
    # ========================================
    # BOVINOCULTURA DE CORTE
    # ========================================
    '0151201': 'Bovinocultura de Corte',  # Criação de bovinos para corte
    '0151203': 'Bovinocultura de Corte',  # Criação de bovinos, exceto para corte e leite
    '0162801': 'Bovinocultura de Corte',  # Serviço de inseminação artificial em animais
    '0162899': 'Bovinocultura de Corte',  # Atividades de apoio à pecuária não especificadas

    # ========================================
    # BOVINOCULTURA DE LEITE
    # ========================================
    '0151202': 'Bovinocultura de Leite',  # Criação de bovinos para leite

    # ========================================
    # OVINOCULTURA (Ovinos)
    # ========================================
    '0162802': 'Ovinocaprinocultura',  # Serviço de tosquiamento de ovinos

    # ========================================
    # AVICULTURA (Frangos, Ovos, Pintos)
    # ========================================
    '0155501': 'Avicultura',  # Criação de frangos para corte
    '0155502': 'Avicultura',  # Produção de pintos de um dia
    '0155503': 'Avicultura',  # Criação de outros galináceos, exceto para corte
    '0155504': 'Avicultura',  # Criação de aves, exceto galináceos
    '0155505': 'Avicultura',  # Produção de ovos

    # ========================================
    # SUINOCULTURA
    # ========================================
    '0154700': 'Suinocultura',  # Criação de suínos

    # ========================================
    # SOJICULTURA E GRÃOS
    # ========================================
    '0115600': 'Sojicultura',  # Cultivo de soja
    '0111301': 'Grãos',  # Cultivo de arroz
    '0111302': 'Grãos',  # Cultivo de milho
    '0111303': 'Grãos',  # Cultivo de trigo
    '0111399': 'Grãos',  # Cultivo de outros cereais não especificados
    '0119901': 'Grãos',  # Cultivo de abacaxi (não, isso é fruta)
    '0119903': 'Grãos',  # Cultivo de trigo (duplicado? verificar)

    # ========================================
    # SILVICULTURA E FLORESTAS
    # ========================================
    '0210101': 'Silvicultura',  # Cultivo de eucalipto
    '0210102': 'Silvicultura',  # Cultivo de acácia-negra
    '0210103': 'Silvicultura',  # Cultivo de pinus
    '0210104': 'Silvicultura',  # Cultivo de teca
    '0210105': 'Silvicultura',  # Cultivo de espécies madeireiras, exceto eucalipto, acácia-negra, pinus e teca
    '0210106': 'Silvicultura',  # Cultivo de mudas em viveiros florestais
    '0210107': 'Silvicultura',  # Extração de madeira em florestas plantadas
    '0210108': 'Silvicultura',  # Produção de carvão vegetal - florestas plantadas
    '0210109': 'Silvicultura',  # Produção de casca de acácia-negra - florestas plantadas
    '0210199': 'Silvicultura',  # Produção de produtos não-madeireiros não especificados anteriormente em florestas plantadas
    '0220901': 'Silvicultura',  # Extração de madeira em florestas nativas
    '0220902': 'Silvicultura',  # Produção de carvão vegetal - florestas nativas
    '0220903': 'Silvicultura',  # Coleta de castanha-do-pará em florestas nativas
    '0220904': 'Silvicultura',  # Coleta de látex em florestas nativas
    '0220905': 'Silvicultura',  # Coleta de palmito em florestas nativas
    '0220906': 'Silvicultura',  # Conservação de florestas nativas
    '0220999': 'Silvicultura',  # Coleta de produtos não-madeireiros não especificados anteriormente em florestas nativas
    '0230600': 'Silvicultura',  # Atividades de apoio à produção florestal

    # ========================================
    # CAFEICULTURA
    # ========================================
    '0134200': 'Cafeicultura',  # Cultivo de café

    # ========================================
    # CANA-DE-AÇÚCAR
    # ========================================
    '0113000': 'Cana-de-açúcar',  # Cultivo de cana-de-açúcar

    # ========================================
    # FRUTICULTURA
    # ========================================
    '0131800': 'Fruticultura',  # Cultivo de laranja
    '0132600': 'Fruticultura',  # Cultivo de uva
    '0133401': 'Fruticultura',  # Cultivo de açaí
    '0133402': 'Fruticultura',  # Cultivo de banana
    '0133403': 'Fruticultura',  # Cultivo de caju
    '0133404': 'Fruticultura',  # Cultivo de cítricos, exceto laranja
    '0133405': 'Fruticultura',  # Cultivo de coco-da-baía
    '0133406': 'Fruticultura',  # Cultivo de guaraná
    '0133407': 'Fruticultura',  # Cultivo de maçã
    '0133408': 'Fruticultura',  # Cultivo de mamão
    '0133409': 'Fruticultura',  # Cultivo de maracujá
    '0133410': 'Fruticultura',  # Cultivo de manga
    '0133411': 'Fruticultura',  # Cultivo de pêssego
    '0133499': 'Fruticultura',  # Cultivo de frutas de lavoura permanente não especificadas anteriormente
    '0119901': 'Fruticultura',  # Cultivo de abacaxi
    '0119902': 'Fruticultura',  # Cultivo de alho
    '0119904': 'Fruticultura',  # Cultivo de cebola
    '0119905': 'Fruticultura',  # Cultivo de feijão
    '0119906': 'Fruticultura',  # Cultivo de mandioca
    '0119907': 'Fruticultura',  # Cultivo de melão
    '0119908': 'Fruticultura',  # Cultivo de melancia
    '0119999': 'Fruticultura',  # Cultivo de outras plantas de lavoura temporária não especificadas anteriormente

    # ========================================
    # HORTICULTURA
    # ========================================
    '0121101': 'Horticultura',  # Horticultura, exceto morango
    '0121102': 'Horticultura',  # Cultivo de morango
    '0122900': 'Horticultura',  # Cultivo de flores e plantas ornamentais

    # ========================================
    # OVINOCAPRINOCULTURA
    # ========================================
    '0152101': 'Ovinocaprinocultura',  # Criação de bufalinos
    '0152102': 'Ovinocaprinocultura',  # Criação de equinos
    '0152103': 'Ovinocaprinocultura',  # Criação de asininos e muares
    '0153901': 'Ovinocaprinocultura',  # Criação de caprinos
    '0153902': 'Ovinocaprinocultura',  # Criação de ovinos, inclusive para produção de lã

    # ========================================
    # AQUICULTURA E PESCA
    # ========================================
    '0311601': 'Aquicultura',  # Pesca de peixes em água salgada
    '0311602': 'Aquicultura',  # Pesca de crustáceos e moluscos em água salgada
    '0311603': 'Aquicultura',  # Coleta de outros produtos marinhos
    '0311604': 'Aquicultura',  # Atividades de apoio à pesca em água salgada
    '0312401': 'Aquicultura',  # Pesca de peixes em água doce
    '0312402': 'Aquicultura',  # Pesca de crustáceos e moluscos em água doce
    '0312403': 'Aquicultura',  # Coleta de outros produtos aquáticos de água doce
    '0312404': 'Aquicultura',  # Atividades de apoio à pesca em água doce
    '0321301': 'Aquicultura',  # Criação de peixes em água salgada e salobra
    '0321302': 'Aquicultura',  # Criação de camarões em água salgada e salobra
    '0321303': 'Aquicultura',  # Criação de ostras e mexilhões em água salgada e salobra
    '0321304': 'Aquicultura',  # Criação de peixes ornamentais em água salgada e salobra
    '0321305': 'Aquicultura',  # Atividades de apoio à aquicultura em água salgada e salobra
    '0321399': 'Aquicultura',  # Cultivos e semicultivos da aquicultura em água salgada e salobra não especificados anteriormente
    '0322101': 'Aquicultura',  # Criação de peixes em água doce
    '0322102': 'Aquicultura',  # Criação de camarões em água doce
    '0322103': 'Aquicultura',  # Criação de ostras e mexilhões em água doce
    '0322104': 'Aquicultura',  # Criação de peixes ornamentais em água doce
    '0322105': 'Aquicultura',  # Ranicultura
    '0322106': 'Aquicultura',  # Criação de jacaré
    '0322107': 'Aquicultura',  # Atividades de apoio à aquicultura em água doce
    '0322199': 'Aquicultura',  # Cultivos e semicultivos da aquicultura em água doce não especificados anteriormente

    # ========================================
    # APICULTURA
    # ========================================
    '0159801': 'Apicultura',  # Apicultura
    '0159802': 'Apicultura',  # Criação de animais de estimação
    '0159803': 'Apicultura',  # Criação de escargô
    '0159804': 'Apicultura',  # Criação de bicho-da-seda
    '0159899': 'Apicultura',  # Criação de outros animais não especificados anteriormente

    # ========================================
    # OUTRAS CULTURAS
    # ========================================
    '0112101': 'Algodão',  # Cultivo de algodão herbáceo
    '0112102': 'Algodão',  # Cultivo de juta
    '0112199': 'Algodão',  # Cultivo de outras fibras de lavoura temporária não especificadas anteriormente
    '0114800': 'Fumo',  # Cultivo de fumo
    '0135100': 'Cacau',  # Cultivo de cacau
    '0139301': 'Outras Culturas Permanentes',  # Cultivo de chá-da-índia
    '0139302': 'Outras Culturas Permanentes',  # Cultivo de erva-mate
    '0139303': 'Outras Culturas Permanentes',  # Cultivo de pimenta-do-reino
    '0139304': 'Outras Culturas Permanentes',  # Cultivo de plantas para condimento, exceto pimenta-do-reino
    '0139305': 'Outras Culturas Permanentes',  # Cultivo de dendê
    '0139306': 'Outras Culturas Permanentes',  # Cultivo de seringueira
    '0139399': 'Outras Culturas Permanentes',  # Cultivo de outras plantas de lavoura permanente não especificadas anteriormente

    # ========================================
    # SERVIÇOS DE APOIO AGRÍCOLA
    # ========================================
    '0161001': 'Serviços Agrícolas',  # Serviço de pulverização e controle de pragas agrícolas
    '0161002': 'Serviços Agrícolas',  # Serviço de poda de árvores para lavouras
    '0161003': 'Serviços Agrícolas',  # Serviço de preparação de terreno, cultivo e colheita
    '0161099': 'Serviços Agrícolas',  # Atividades de apoio à agricultura não especificadas anteriormente
    '0163600': 'Serviços Agrícolas',  # Atividades de pós-colheita
}

# Descrições das cadeias produtivas
CADEIAS_DESCRICAO = {
    'Bovinocultura de Corte': 'Criação de bovinos para abate',
    'Bovinocultura de Leite': 'Criação de bovinos para produção de leite',
    'Avicultura': 'Criação de aves, frangos e produção de ovos',
    'Suinocultura': 'Criação de suínos',
    'Sojicultura': 'Cultivo de soja',
    'Grãos': 'Cultivo de cereais (milho, trigo, arroz)',
    'Silvicultura': 'Produção florestal e madeireira',
    'Cafeicultura': 'Cultivo de café',
    'Cana-de-açúcar': 'Cultivo de cana-de-açúcar',
    'Fruticultura': 'Cultivo de frutas',
    'Horticultura': 'Horticultura e floricultura',
    'Ovinocaprinocultura': 'Criação de ovinos, caprinos, equinos',
    'Aquicultura': 'Pesca e criação de peixes',
    'Apicultura': 'Apicultura e criação de outros animais',
    'Algodão': 'Cultivo de algodão e fibras',
    'Fumo': 'Cultivo de fumo/tabaco',
    'Cacau': 'Cultivo de cacau',
    'Outras Culturas Permanentes': 'Outras culturas permanentes',
    'Serviços Agrícolas': 'Serviços de apoio à agropecuária',
}

# Cores para visualização
CADEIAS_CORES = {
    'Bovinocultura de Corte': '#8B4513',  # Marrom (corte)
    'Bovinocultura de Leite': '#F5F5DC',  # Bege/Creme (leite)
    'Avicultura': '#FFD700',          # Amarelo ouro
    'Suinocultura': '#FFC0CB',        # Rosa
    'Sojicultura': '#228B22',         # Verde floresta
    'Grãos': '#DAA520',               # Dourado
    'Silvicultura': '#006400',        # Verde escuro
    'Cafeicultura': '#4A2C2A',        # Marrom café
    'Cana-de-açúcar': '#90EE90',      # Verde claro
    'Fruticultura': '#FF6347',        # Tomate
    'Horticultura': '#32CD32',        # Verde lima
    'Ovinocaprinocultura': '#D2691E', # Chocolate
    'Aquicultura': '#1E90FF',         # Azul dodger
    'Apicultura': '#FFD700',          # Dourado mel
    'Algodão': '#FFFAF0',             # Branco floral
    'Fumo': '#808000',                # Oliva
    'Cacau': '#3D2314',               # Marrom escuro
    'Outras Culturas Permanentes': '#9370DB',  # Púrpura médio
    'Serviços Agrícolas': '#708090',  # Cinza ardósia
}

def get_cadeia(cnae_subclasse):
    """Retorna a cadeia produtiva para um código CNAE."""
    cnae = str(cnae_subclasse).zfill(7)
    return CNAE_CADEIA.get(cnae, 'Outros')

def get_cadeia_cor(cadeia):
    """Retorna a cor da cadeia produtiva."""
    return CADEIAS_CORES.get(cadeia, '#808080')

def get_cadeia_descricao(cadeia):
    """Retorna a descrição da cadeia produtiva."""
    return CADEIAS_DESCRICAO.get(cadeia, 'Outras atividades agropecuárias')


# Mapeamento de códigos auxiliares
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
}

RACA_COR = {
    1: 'Indígena',
    2: 'Branca',
    3: 'Preta',
    4: 'Amarela',
    5: 'Parda',
    6: 'Não informado',
    9: 'Não identificado',
}

SEXO = {
    1: 'Masculino',
    3: 'Feminino',
}

TIPO_MOVIMENTACAO = {
    10: 'Admissão por primeiro emprego',
    20: 'Admissão por reemprego',
    25: 'Admissão por contrato trabalho prazo determinado',
    31: 'Admissão por transferência',
    32: 'Admissão por transferência (mesmo grupo)',
    35: 'Admissão por transferência (mesmo CNPJ)',
    40: 'Reintegração',
    43: 'Admissão de empregado convertido de intermitente',
    50: 'Admissão por substituição de aprendiz',
    60: 'Admissão por nova contratação',
    70: 'Desligamento por demissão sem justa causa',
    71: 'Desligamento por demissão por justa causa',
    72: 'Desligamento a pedido',
    73: 'Desligamento por aposentadoria',
    74: 'Desligamento por término de contrato',
    75: 'Desligamento por término de contrato prazo determinado',
    76: 'Desligamento por transferência',
    77: 'Desligamento por transferência (mesmo grupo)',
    78: 'Desligamento por falecimento',
    79: 'Desligamento por falecimento decorrente de acidente de trabalho',
    80: 'Desligamento por rescisão com justa causa por iniciativa do empregado',
    90: 'Desligamento por acordo entre empregado e empregador',
    97: 'Admissão',
    98: 'Desligamento',
    99: 'Não identificado',
}

PORTE_EMPRESA = {
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

FAIXA_ETARIA = {
    (0, 17): 'Menor de 18',
    (18, 24): '18 a 24 anos',
    (25, 29): '25 a 29 anos',
    (30, 39): '30 a 39 anos',
    (40, 49): '40 a 49 anos',
    (50, 64): '50 a 64 anos',
    (65, 200): '65 anos ou mais',
}

def get_faixa_etaria(idade):
    """Retorna a faixa etária para uma idade."""
    if pd.isna(idade):
        return 'Não informado'
    idade = int(idade)
    for (min_idade, max_idade), faixa in FAIXA_ETARIA.items():
        if min_idade <= idade <= max_idade:
            return faixa
    return 'Não informado'

import pandas as pd
