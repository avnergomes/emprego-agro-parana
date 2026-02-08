"""
Download de dados CAGED - Emprego Agropecuário do Paraná
Fonte: Novo CAGED (2020-2025)
Filtro: CNAE Seção A (01-03) - Agricultura, Pecuária, Silvicultura
"""

import os
import sys
from datetime import datetime

import pandas as pd

# Tentar importar pycaged
try:
    import pycaged
except ImportError:
    print("Erro: pycaged não instalado. Execute: pip install pycaged")
    sys.exit(1)

# Configurações
ANOS = range(2020, 2026)
UF = 'PR'
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw')

# CNAE Seção A - Agropecuária
CNAE_AGRO = ['01', '02', '03']

# Mapeamento de divisões CNAE
DIVISAO_CNAE = {
    '01': 'Agricultura e Pecuária',
    '02': 'Silvicultura',
    '03': 'Pesca e Aquicultura'
}

# Subclasses relevantes para o Paraná
SUBCLASSES_DESTAQUE = {
    '01156': 'Cultivo de soja',
    '01113': 'Cultivo de cereais',
    '01512': 'Criação de bovinos',
    '01555': 'Criação de aves',
    '02101': 'Produção florestal - plantadas',
    '02209': 'Extração florestal - nativas',
    '01342': 'Cultivo de café',
    '01415': 'Criação de suínos',
}


def download_caged_pr():
    """Baixa dados do CAGED para o Paraná, filtrando agropecuária."""

    print(f"=" * 60)
    print(f"Download CAGED - Agropecuária Paraná")
    print(f"Período: 2020-2025")
    print(f"=" * 60)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_data = []
    errors = []

    for ano in ANOS:
        # Determinar meses disponíveis
        if ano == 2025:
            meses = range(1, 2)  # Janeiro 2025 (ajustar conforme disponibilidade)
        else:
            meses = range(1, 13)

        for mes in meses:
            print(f"\nBaixando {mes:02d}/{ano}...", end=" ")

            try:
                # Usar pycaged para baixar dados
                # SubclasseMunicipios retorna movimentações por subclasse CNAE e município
                df = pycaged.SubclasseMunicipios(ano, mes, UF)

                if df is None or df.empty:
                    print("Sem dados")
                    continue

                # Normalizar nomes das colunas
                df.columns = df.columns.str.lower().str.strip()

                # Identificar coluna CNAE
                cnae_col = None
                for col in ['cnae', 'subclasse', 'cnae_2', 'cnae2']:
                    if col in df.columns:
                        cnae_col = col
                        break

                if cnae_col is None:
                    print(f"Colunas disponíveis: {df.columns.tolist()}")
                    print("Coluna CNAE não encontrada")
                    continue

                # Converter CNAE para string
                df[cnae_col] = df[cnae_col].astype(str).str.zfill(5)

                # Filtrar Seção A (CNAE 01-03)
                df_agro = df[df[cnae_col].str[:2].isin(CNAE_AGRO)].copy()

                if df_agro.empty:
                    print("Sem dados agro")
                    continue

                # Adicionar colunas de referência
                df_agro['ano'] = ano
                df_agro['mes'] = mes
                df_agro['divisao_cnae'] = df_agro[cnae_col].str[:2].map(DIVISAO_CNAE)

                all_data.append(df_agro)
                print(f"OK - {len(df_agro)} registros")

            except Exception as e:
                error_msg = f"{mes:02d}/{ano}: {str(e)}"
                errors.append(error_msg)
                print(f"Erro: {e}")

    if not all_data:
        print("\nNenhum dado obtido!")
        if errors:
            print("\nErros encontrados:")
            for e in errors:
                print(f"  - {e}")
        return None

    # Consolidar todos os dados
    print(f"\n{'=' * 60}")
    print("Consolidando dados...")

    df_final = pd.concat(all_data, ignore_index=True)

    # Salvar em parquet
    output_path = os.path.join(OUTPUT_DIR, 'caged_agro_pr_2020_2025.parquet')
    df_final.to_parquet(output_path, index=False)
    print(f"Salvo: {output_path}")

    # Salvar também em CSV para inspeção
    csv_path = os.path.join(OUTPUT_DIR, 'caged_agro_pr_2020_2025.csv')
    df_final.to_csv(csv_path, index=False)
    print(f"Salvo: {csv_path}")

    # Resumo
    print(f"\n{'=' * 60}")
    print("RESUMO")
    print(f"{'=' * 60}")
    print(f"Total de registros: {len(df_final):,}")
    print(f"Período: {df_final['ano'].min()}-{df_final['mes'].min():02d} a {df_final['ano'].max()}-{df_final['mes'].max():02d}")
    print(f"Colunas: {df_final.columns.tolist()}")

    if 'divisao_cnae' in df_final.columns:
        print(f"\nPor divisão CNAE:")
        print(df_final['divisao_cnae'].value_counts())

    if errors:
        print(f"\nErros ({len(errors)}):")
        for e in errors[:5]:
            print(f"  - {e}")

    return df_final


if __name__ == '__main__':
    download_caged_pr()
