"""
Download de dados de emprego agrícola do IBGE/SIDRA
Fonte: PNAD Contínua Trimestral - Pessoas ocupadas por atividade econômica
Tabela 5434 - Pessoas de 14 anos ou mais ocupadas por atividade econômica
"""

import os
import json
import requests
import pandas as pd
from datetime import datetime

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw')

# SIDRA API - Tabela 5434 (PNAD Contínua)
# Pessoas de 14 anos ou mais ocupadas, por grupamento de atividade
# Variável: Pessoas de 14 anos ou mais ocupadas (mil pessoas)
# Filtros: Paraná, Agricultura/pecuária/produção florestal/pesca/aquicultura

BASE_URL = "https://apisidra.ibge.gov.br/values"


def download_pnad_emprego():
    """Baixa dados de emprego do SIDRA/IBGE."""

    print("=" * 60)
    print("Download SIDRA/IBGE - Emprego Agrícola Paraná")
    print("Fonte: PNAD Contínua Trimestral")
    print("=" * 60)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Tabela 5434 - Pessoas ocupadas por grupamento de atividade
    # /t/5434 - tabela
    # /n1/all - Brasil
    # /n3/41 - Paraná (código UF)
    # /v/4090 - Variável: mil pessoas ocupadas
    # /p/all - todos os períodos
    # /c693/all - todos os grupamentos de atividade

    # Código 45599 = Agricultura, pecuária, produção florestal, pesca e aquicultura

    params = {
        't': '5434',  # Tabela
        'n3': '41',   # Paraná
        'v': '4090',  # Mil pessoas
        'p': 'all',   # Todos os períodos
        'c693': '45599',  # Agricultura, pecuária, prod florestal, pesca
    }

    url = f"{BASE_URL}/t/{params['t']}/n3/{params['n3']}/v/{params['v']}/p/{params['p']}/c693/{params['c693']}"

    print(f"\nURL: {url}")
    print("\nBaixando dados...")

    try:
        response = requests.get(url, timeout=60)
        response.raise_for_status()
        data = response.json()

        if not data:
            print("Nenhum dado retornado")
            return None

        # Converter para DataFrame
        df = pd.DataFrame(data[1:], columns=[d['id'] if isinstance(d, dict) else d for d in data[0].values()])

        # O SIDRA retorna um formato específico, vamos processar
        df_clean = pd.DataFrame(data[1:])  # Pular header

        print(f"\nDados brutos: {len(df_clean)} registros")
        print(f"Colunas: {df_clean.columns.tolist() if len(df_clean) > 0 else 'N/A'}")

        # Salvar JSON bruto
        json_path = os.path.join(OUTPUT_DIR, 'sidra_emprego_agro_pr.json')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\nSalvo: {json_path}")

        return data

    except requests.exceptions.RequestException as e:
        print(f"Erro na requisição: {e}")
        return None
    except Exception as e:
        print(f"Erro: {e}")
        return None


def download_caged_agregado():
    """
    Baixa dados agregados do CAGED do portal PDET.
    Usa tabelas já processadas disponíveis publicamente.
    """

    print("\n" + "=" * 60)
    print("Tentando download alternativo - PDET/CAGED")
    print("=" * 60)

    # URL dos dados agregados do PDET (exemplo - pode precisar ajustar)
    # Dados do Painel de Informações do Novo CAGED

    urls_to_try = [
        # Dados do Novo CAGED agregados por seção CNAE e UF
        "http://pdet.mte.gov.br/images/Novo_CAGED/Dez2024/1-apresentacao.xlsx",
    ]

    for url in urls_to_try:
        print(f"\nTentando: {url}")
        try:
            response = requests.get(url, timeout=30)
            if response.status_code == 200:
                filename = url.split('/')[-1]
                filepath = os.path.join(OUTPUT_DIR, filename)
                with open(filepath, 'wb') as f:
                    f.write(response.content)
                print(f"Salvo: {filepath}")
        except Exception as e:
            print(f"Erro: {e}")


def create_sample_data():
    """
    Cria dados de exemplo baseados em estatísticas reais do Paraná.
    Fonte: Valores aproximados do PDET/CAGED e PNAD.
    """

    print("\n" + "=" * 60)
    print("Criando dados de exemplo (baseados em estatísticas reais)")
    print("=" * 60)

    # Dados aproximados de emprego agrícola no PR
    # Fonte: PNAD Contínua e CAGED histórico

    data = []

    # Empregos formais na agropecuária do PR (valores aproximados em milhares)
    # Média histórica: ~150-180 mil empregos formais

    import random
    random.seed(42)  # Reprodutibilidade

    divisoes = [
        {'codigo': '01', 'nome': 'Agricultura e Pecuária', 'peso': 0.75},
        {'codigo': '02', 'nome': 'Silvicultura', 'peso': 0.20},
        {'codigo': '03', 'nome': 'Pesca e Aquicultura', 'peso': 0.05},
    ]

    # Gerar dados mensais 2020-2025
    for ano in range(2020, 2026):
        meses_disponiveis = 12 if ano < 2025 else 1

        for mes in range(1, meses_disponiveis + 1):
            # Sazonalidade: mais contratações em Mar-Jun (safra) e Set-Nov (plantio)
            sazonalidade = {
                1: 0.85, 2: 0.90, 3: 1.15, 4: 1.20, 5: 1.15, 6: 1.05,
                7: 0.90, 8: 0.85, 9: 1.00, 10: 1.10, 11: 1.05, 12: 0.80
            }

            fator_sazonal = sazonalidade[mes]

            # Tendência de crescimento ~2% ao ano
            fator_tendencia = 1 + (ano - 2020) * 0.02

            for div in divisoes:
                # Base de empregos (estoque)
                base_estoque = 150000 * div['peso'] * fator_tendencia

                # Admissões mensais (~3-5% do estoque)
                taxa_admissao = 0.035 + random.uniform(-0.01, 0.01)
                admissoes = int(base_estoque * taxa_admissao * fator_sazonal)

                # Demissões mensais (~2.5-4% do estoque)
                taxa_demissao = 0.030 + random.uniform(-0.01, 0.01)
                demissoes = int(base_estoque * taxa_demissao * (2 - fator_sazonal))

                # Saldo
                saldo = admissoes - demissoes

                # Salário médio de admissão
                salario_base = {
                    '01': 1800,  # Agricultura
                    '02': 2200,  # Silvicultura (mais qualificado)
                    '03': 1600,  # Pesca
                }
                salario = salario_base[div['codigo']] * (1 + (ano - 2020) * 0.05) + random.uniform(-100, 100)

                data.append({
                    'ano': ano,
                    'mes': mes,
                    'periodo': f"{ano}-{mes:02d}",
                    'divisao_cnae': div['codigo'],
                    'divisao_nome': div['nome'],
                    'admissoes': admissoes,
                    'demissoes': demissoes,
                    'saldo': saldo,
                    'salario_medio': round(salario, 2),
                    'estoque_estimado': int(base_estoque),
                })

    df = pd.DataFrame(data)

    # Salvar
    parquet_path = os.path.join(OUTPUT_DIR, 'caged_agro_pr_sample.parquet')
    df.to_parquet(parquet_path, index=False)
    print(f"Salvo: {parquet_path}")

    csv_path = os.path.join(OUTPUT_DIR, 'caged_agro_pr_sample.csv')
    df.to_csv(csv_path, index=False)
    print(f"Salvo: {csv_path}")

    # Resumo
    print(f"\nTotal de registros: {len(df)}")
    print(f"Período: {df['periodo'].min()} a {df['periodo'].max()}")
    print(f"\nPor divisão CNAE:")
    print(df.groupby('divisao_nome').agg({
        'admissoes': 'sum',
        'demissoes': 'sum',
        'saldo': 'sum',
        'salario_medio': 'mean'
    }).round(2))

    print(f"\nTotais:")
    print(f"  Admissões: {df['admissoes'].sum():,}")
    print(f"  Demissões: {df['demissoes'].sum():,}")
    print(f"  Saldo: {df['saldo'].sum():,}")
    print(f"  Salário médio: R$ {df['salario_medio'].mean():,.2f}")

    return df


if __name__ == '__main__':
    # Tentar SIDRA primeiro
    sidra_data = download_pnad_emprego()

    # Criar dados de exemplo para o dashboard
    sample_df = create_sample_data()

    print("\n" + "=" * 60)
    print("CONCLUSÃO")
    print("=" * 60)
    print("""
Os dados de exemplo foram criados com base em estatísticas reais.
Para dados oficiais completos, opções:

1. PDET/MTE - Microdados do Novo CAGED:
   ftp://ftp.mtps.gov.br/pdet/microdados/NOVO%20CAGED/

2. Base dos Dados (BigQuery):
   https://basedosdados.org/dataset/br_me_caged
   Requer: conta Google Cloud

3. SIDRA/IBGE - PNAD Contínua:
   https://sidra.ibge.gov.br/tabela/5434
   Dados trimestrais de ocupação

Os dados de exemplo criados são baseados em:
- Estoque médio de ~150 mil empregos formais na agropecuária do PR
- Sazonalidade típica (safra mar-jun, plantio set-nov)
- Crescimento ~2% ao ano
- Salários médios por setor
""")
