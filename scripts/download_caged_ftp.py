"""
Download de dados CAGED direto do FTP do MTE
Corrige os bugs do pycaged
"""

import os
import sys
from io import BytesIO
from ftplib import FTP
import py7zr
import pandas as pd

# Configurações
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw')
os.makedirs(OUTPUT_DIR, exist_ok=True)

# CNAE Seção A - Agropecuária (divisões 01, 02, 03)
CNAE_AGRO = ['01', '02', '03']

DIVISAO_CNAE = {
    '01': 'Agricultura e Pecuária',
    '02': 'Silvicultura',
    '03': 'Pesca e Aquicultura'
}


def download_novo_caged(ano, mes, uf='PR'):
    """
    Baixa microdados do Novo CAGED (2020+) do FTP do MTE.
    """
    ano_str = str(ano)
    mes_str = str(mes).zfill(2)

    # Caminho no FTP
    ftp_path = f'/pdet/microdados/NOVO CAGED/{ano_str}/{ano_str}{mes_str}/CAGEDMOV{ano_str}{mes_str}.7z'
    filename = f'CAGEDMOV{ano_str}{mes_str}.7z'

    print(f"Baixando {mes_str}/{ano_str}...", end=" ", flush=True)

    try:
        # Conectar ao FTP
        ftp = FTP('ftp.mtps.gov.br', timeout=120)
        ftp.login()

        # Download do arquivo 7z
        archive_bytes = BytesIO()
        ftp.retrbinary(f'RETR {ftp_path}', archive_bytes.write)
        archive_bytes.seek(0)
        ftp.quit()

        # Extrair o arquivo txt para diretório temporário
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            with py7zr.SevenZipFile(archive_bytes, mode='r') as archive:
                filenames = archive.getnames()
                txt_file = [f for f in filenames if f.endswith('.txt')][0]
                archive.extractall(path=tmpdir)

            # Ler o arquivo extraído
            txt_path = os.path.join(tmpdir, txt_file)
            df = pd.read_csv(txt_path, sep=';', encoding='UTF-8')

        # Filtrar por UF (código do Paraná = 41)
        if 'uf' in df.columns:
            # A coluna uf pode ter código numérico
            pr_code = 41  # Código IBGE do Paraná
            df = df[df['uf'] == pr_code].copy()
        else:
            print("Coluna 'uf' não encontrada")
            return None

        if df.empty:
            print(f"Sem dados para {uf}")
            return None

        # Filtrar por CNAE Seção A (agropecuária)
        # A coluna 'subclasse' tem o código CNAE completo (7 dígitos)
        # Os primeiros 2 dígitos indicam a divisão
        df['subclasse'] = df['subclasse'].astype(str).str.zfill(7)
        df['divisao'] = df['subclasse'].str[:2]
        df_agro = df[df['divisao'].isin(CNAE_AGRO)].copy()

        if df_agro.empty:
            print("Sem dados agropecuários")
            return None

        # Adicionar metadados
        df_agro['ano'] = ano
        df_agro['mes'] = mes
        df_agro['periodo'] = f"{ano}-{mes_str}"
        df_agro['divisao_nome'] = df_agro['divisao'].map(DIVISAO_CNAE)

        print(f"OK - {len(df_agro)} registros")
        return df_agro

    except Exception as e:
        print(f"Erro: {e}")
        return None


def download_all_data():
    """Baixa todos os dados de 2020 a 2025."""

    print("=" * 60)
    print("Download CAGED - Agropecuária Paraná")
    print("Fonte: FTP MTE - Microdados Novo CAGED")
    print("=" * 60)

    all_data = []

    for ano in range(2020, 2026):
        # Determinar meses disponíveis
        if ano == 2025:
            # Verificar até qual mês está disponível
            meses = range(1, 13)
        else:
            meses = range(1, 13)

        for mes in meses:
            df = download_novo_caged(ano, mes, 'PR')
            if df is not None:
                all_data.append(df)

    if not all_data:
        print("\nNenhum dado obtido!")
        return None

    # Consolidar
    print(f"\n{'=' * 60}")
    print("Consolidando dados...")

    df_final = pd.concat(all_data, ignore_index=True)

    # Agregar por período e divisão
    # Colunas importantes: saldomovimentação (1=admissão, -1=demissão), salário

    # Converter salário para numérico (formato brasileiro usa vírgula)
    df_final['salário'] = df_final['salário'].astype(str).str.replace(',', '.', regex=False)
    df_final['salário'] = pd.to_numeric(df_final['salário'], errors='coerce')

    # Criar colunas de admissões e demissões
    df_final['admissao'] = (df_final['saldomovimentação'] == 1).astype(int)
    df_final['demissao'] = (df_final['saldomovimentação'] == -1).astype(int)

    # Agregar
    agregado = df_final.groupby(['ano', 'mes', 'periodo', 'divisao', 'divisao_nome']).agg({
        'admissao': 'sum',
        'demissao': 'sum',
        'salário': 'mean'
    }).reset_index()

    agregado.columns = ['ano', 'mes', 'periodo', 'divisao_cnae', 'divisao_nome',
                        'admissoes', 'demissoes', 'salario_medio']
    agregado['saldo'] = agregado['admissoes'] - agregado['demissoes']
    agregado['salario_medio'] = agregado['salario_medio'].round(2)

    # Salvar
    parquet_path = os.path.join(OUTPUT_DIR, 'caged_agro_pr_real.parquet')
    agregado.to_parquet(parquet_path, index=False)
    print(f"Salvo: {parquet_path}")

    csv_path = os.path.join(OUTPUT_DIR, 'caged_agro_pr_real.csv')
    agregado.to_csv(csv_path, index=False)
    print(f"Salvo: {csv_path}")

    # Resumo
    print(f"\n{'=' * 60}")
    print("RESUMO")
    print(f"{'=' * 60}")
    print(f"Total de registros: {len(agregado)}")
    print(f"Período: {agregado['periodo'].min()} a {agregado['periodo'].max()}")
    print(f"\nPor divisão CNAE:")
    print(agregado.groupby('divisao_nome').agg({
        'admissoes': 'sum',
        'demissoes': 'sum',
        'saldo': 'sum'
    }))

    print(f"\nTotais:")
    print(f"  Admissões: {agregado['admissoes'].sum():,}")
    print(f"  Demissões: {agregado['demissoes'].sum():,}")
    print(f"  Saldo: {agregado['saldo'].sum():,}")

    return agregado


if __name__ == '__main__':
    download_all_data()
