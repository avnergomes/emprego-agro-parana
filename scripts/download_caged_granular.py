"""
Download de dados CAGED com granularidade máxima
Preserva todas as dimensões para análise detalhada
"""

import os
import sys
from io import BytesIO
from ftplib import FTP
import tempfile
import py7zr
import pandas as pd
import numpy as np
from datetime import datetime

# Importar mapeamentos
from cnae_cadeias import (
    get_cadeia, get_faixa_etaria,
    GRAU_INSTRUCAO, RACA_COR, SEXO, TIPO_MOVIMENTACAO, PORTE_EMPRESA
)

# Configurações
SCRIPT_DIR = os.path.dirname(__file__)
RAW_DIR = os.path.join(SCRIPT_DIR, '..', 'data', 'raw')
os.makedirs(RAW_DIR, exist_ok=True)

# CNAE Seção A - Agropecuária (divisões 01, 02, 03)
CNAE_AGRO = ['01', '02', '03']

DIVISAO_CNAE = {
    '01': 'Agricultura e Pecuária',
    '02': 'Silvicultura',
    '03': 'Pesca e Aquicultura'
}


def download_mes(ano, mes):
    """Baixa microdados de um mês específico."""
    ano_str = str(ano)
    mes_str = str(mes).zfill(2)

    ftp_path = f'/pdet/microdados/NOVO CAGED/{ano_str}/{ano_str}{mes_str}/CAGEDMOV{ano_str}{mes_str}.7z'

    print(f"  {mes_str}/{ano_str}...", end=" ", flush=True)

    try:
        # Conectar ao FTP
        ftp = FTP('ftp.mtps.gov.br', timeout=120)
        ftp.login()

        # Download
        archive_bytes = BytesIO()
        ftp.retrbinary(f'RETR {ftp_path}', archive_bytes.write)
        archive_bytes.seek(0)
        ftp.quit()

        # Extrair
        with tempfile.TemporaryDirectory() as tmpdir:
            with py7zr.SevenZipFile(archive_bytes, mode='r') as archive:
                filenames = archive.getnames()
                txt_file = [f for f in filenames if f.endswith('.txt')][0]
                archive.extractall(path=tmpdir)

            txt_path = os.path.join(tmpdir, txt_file)
            df = pd.read_csv(txt_path, sep=';', encoding='UTF-8')

        # Filtrar Paraná
        df = df[df['uf'] == 41].copy()

        if df.empty:
            print("sem dados PR")
            return None

        # Filtrar agropecuária
        df['subclasse'] = df['subclasse'].astype(str).str.zfill(7)
        df['divisao'] = df['subclasse'].str[:2]
        df = df[df['divisao'].isin(CNAE_AGRO)].copy()

        if df.empty:
            print("sem dados agro")
            return None

        print(f"OK ({len(df):,} reg)", flush=True)
        return df

    except Exception as e:
        print(f"ERRO: {e}")
        return None


def process_microdata(df, ano, mes):
    """Processa microdados adicionando dimensões derivadas."""

    mes_str = str(mes).zfill(2)

    # Dimensões temporais
    df['ano'] = ano
    df['mes'] = mes
    df['periodo'] = f"{ano}-{mes_str}"

    # Dimensões geográficas
    df['municipio_codigo'] = df['município'].astype(str)

    # Dimensões CNAE
    df['cnae_subclasse'] = df['subclasse']
    df['cnae_grupo'] = df['subclasse'].str[:4]
    df['cnae_divisao'] = df['divisao']
    df['cnae_divisao_nome'] = df['divisao'].map(DIVISAO_CNAE)

    # Cadeia produtiva
    df['cadeia_produtiva'] = df['subclasse'].apply(get_cadeia)

    # Dimensões do trabalhador
    df['sexo_codigo'] = df['sexo']
    df['sexo_nome'] = df['sexo'].map(SEXO).fillna('Não informado')

    df['idade_anos'] = df['idade']
    df['faixa_etaria'] = df['idade'].apply(get_faixa_etaria)

    df['escolaridade_codigo'] = df['graudeinstrução']
    df['escolaridade_nome'] = df['graudeinstrução'].map(GRAU_INSTRUCAO).fillna('Não informado')

    df['raca_cor_codigo'] = df['raçacor']
    df['raca_cor_nome'] = df['raçacor'].map(RACA_COR).fillna('Não informado')

    # Tipo de movimentação
    df['tipo_mov_codigo'] = df['tipomovimentação']
    df['tipo_mov_nome'] = df['tipomovimentação'].map(TIPO_MOVIMENTACAO).fillna('Não identificado')
    df['is_admissao'] = (df['saldomovimentação'] == 1).astype(int)
    df['is_demissao'] = (df['saldomovimentação'] == -1).astype(int)

    # Empresa
    df['porte_empresa_codigo'] = df['tamestabjan']
    df['porte_empresa_nome'] = df['tamestabjan'].map(PORTE_EMPRESA).fillna('Não informado')

    # Salário
    df['salario'] = df['salário'].astype(str).str.replace(',', '.', regex=False)
    df['salario'] = pd.to_numeric(df['salario'], errors='coerce')

    # Horas
    df['horas_contratuais'] = df['horascontratuais'].astype(str).str.replace(',', '.', regex=False)
    df['horas_contratuais'] = pd.to_numeric(df['horas_contratuais'], errors='coerce')

    # Indicadores
    df['is_aprendiz'] = df['indicadoraprendiz']
    df['is_intermitente'] = (df['indtrabintermitente'] == 1).astype(int)
    df['is_parcial'] = (df['indtrabparcial'] == 1).astype(int)

    # Ocupação CBO
    df['cbo_codigo'] = df['cbo2002ocupação'].astype(str).str.zfill(6)

    # Selecionar colunas finais
    colunas = [
        # Temporal
        'ano', 'mes', 'periodo',
        # Geográfico
        'municipio_codigo',
        # CNAE
        'cnae_subclasse', 'cnae_grupo', 'cnae_divisao', 'cnae_divisao_nome',
        'cadeia_produtiva',
        # Movimentação
        'saldomovimentação', 'is_admissao', 'is_demissao',
        'tipo_mov_codigo', 'tipo_mov_nome',
        # Trabalhador
        'sexo_codigo', 'sexo_nome',
        'idade_anos', 'faixa_etaria',
        'escolaridade_codigo', 'escolaridade_nome',
        'raca_cor_codigo', 'raca_cor_nome',
        # Empresa
        'porte_empresa_codigo', 'porte_empresa_nome',
        # Contrato
        'salario', 'horas_contratuais',
        'is_aprendiz', 'is_intermitente', 'is_parcial',
        # Ocupação
        'cbo_codigo',
    ]

    return df[colunas]


def download_all():
    """Baixa todos os microdados de 2020-2025."""

    print("=" * 70)
    print("DOWNLOAD CAGED GRANULAR - AGROPECUÁRIA PARANÁ")
    print("=" * 70)
    print(f"Início: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    all_data = []
    total_registros = 0

    for ano in range(2020, 2026):
        print(f"\n[{ano}]")

        for mes in range(1, 13):
            df = download_mes(ano, mes)

            if df is not None:
                df_processed = process_microdata(df, ano, mes)
                all_data.append(df_processed)
                total_registros += len(df_processed)

    if not all_data:
        print("\nNenhum dado obtido!")
        return None

    # Consolidar
    print("\n" + "=" * 70)
    print("CONSOLIDANDO DADOS...")
    print("=" * 70)

    df_final = pd.concat(all_data, ignore_index=True)

    # Salvar microdados completos
    micro_parquet = os.path.join(RAW_DIR, 'caged_agro_pr_microdados.parquet')
    df_final.to_parquet(micro_parquet, index=False)
    print(f"\nMicrodados salvos: {micro_parquet}")
    print(f"Total de registros: {len(df_final):,}")

    # Estatísticas
    print("\n" + "=" * 70)
    print("ESTATÍSTICAS DOS DADOS")
    print("=" * 70)

    print(f"\nPeríodo: {df_final['periodo'].min()} a {df_final['periodo'].max()}")
    print(f"Meses: {df_final['periodo'].nunique()}")

    print(f"\nMunicípios: {df_final['municipio_codigo'].nunique()}")
    print(f"CNAE Subclasses: {df_final['cnae_subclasse'].nunique()}")
    print(f"Cadeias Produtivas: {df_final['cadeia_produtiva'].nunique()}")

    print("\nPor Cadeia Produtiva:")
    cadeia_stats = df_final.groupby('cadeia_produtiva').agg({
        'is_admissao': 'sum',
        'is_demissao': 'sum'
    }).reset_index()
    cadeia_stats['saldo'] = cadeia_stats['is_admissao'] - cadeia_stats['is_demissao']
    cadeia_stats = cadeia_stats.sort_values('is_admissao', ascending=False)

    for _, row in cadeia_stats.head(10).iterrows():
        print(f"  {row['cadeia_produtiva']:25} | Adm: {row['is_admissao']:>7,} | Dem: {row['is_demissao']:>7,} | Saldo: {row['saldo']:>+6,}")

    print("\nPor Sexo:")
    sexo_stats = df_final.groupby('sexo_nome').size()
    for sexo, count in sexo_stats.items():
        pct = count / len(df_final) * 100
        print(f"  {sexo}: {count:,} ({pct:.1f}%)")

    print("\nPor Faixa Etária:")
    idade_stats = df_final.groupby('faixa_etaria').size().sort_index()
    for faixa, count in idade_stats.items():
        pct = count / len(df_final) * 100
        print(f"  {faixa}: {count:,} ({pct:.1f}%)")

    print("\nPor Escolaridade:")
    esc_stats = df_final.groupby('escolaridade_nome').size().sort_values(ascending=False)
    for esc, count in esc_stats.head(5).items():
        pct = count / len(df_final) * 100
        print(f"  {esc}: {count:,} ({pct:.1f}%)")

    print("\nSalário:")
    print(f"  Mínimo: R$ {df_final['salario'].min():,.2f}")
    print(f"  Mediana: R$ {df_final['salario'].median():,.2f}")
    print(f"  Média: R$ {df_final['salario'].mean():,.2f}")
    print(f"  Máximo: R$ {df_final['salario'].max():,.2f}")

    print(f"\nFim: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    return df_final


if __name__ == '__main__':
    download_all()
